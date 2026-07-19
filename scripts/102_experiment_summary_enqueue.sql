-- 102: experiment_summary chunk producer (context backend, Slice 1)
--
-- Gap: 'experiment_summary' is in semantic_chunks' source_type CHECK and in all
-- catalyst read paths, but nothing has ever produced those chunks. This adds a
-- deterministic producer: a trigger on experiments composes the summary text in
-- SQL (experiment fields + titles of linked protocols/notes/samples — no LLM)
-- and enqueues it via chunk_jobs with the standard worker payload shape
-- {content, title, organization_id, project_id, experiment_id, created_by},
-- so the AI worker processes it like any other source, unchanged.
--
-- Note: the summary refreshes when the EXPERIMENT row changes. Linked-entity
-- title changes alone don't re-trigger; the periodic backfill (§3, re-runnable)
-- or the next experiment edit picks them up.

-- 1) Deterministic payload builder (also used by the backfill).
CREATE OR REPLACE FUNCTION public.experiment_summary_payload(e public.experiments)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT jsonb_build_object(
    'title', e.name,
    'organization_id', (SELECT p.organization_id FROM public.projects p WHERE p.id = e.project_id),
    'project_id', e.project_id,
    'experiment_id', e.id,
    'created_by', e.created_by,
    'content',
      'Experiment: ' || coalesce(e.name, '(untitled)')
      || E'\nStatus: ' || coalesce(e.status, 'unknown')
      || coalesce(E'\nHypothesis: ' || nullif(e.hypothesis, ''), '')
      || coalesce(E'\nDescription: ' || nullif(e.description, ''), '')
      || coalesce(E'\nProtocols: ' || nullif((
           SELECT string_agg(pr.name, '; ' ORDER BY pr.name)
           FROM public.experiment_protocols ep
           JOIN public.protocols pr ON pr.id = ep.protocol_id
           WHERE ep.experiment_id = e.id), ''), '')
      || coalesce(E'\nLab notes: ' || nullif((
           SELECT string_agg(t.title, '; ')
           FROM (
             SELECT ln.title FROM public.lab_notes ln
             WHERE ln.experiment_id = e.id AND ln.title IS NOT NULL
             ORDER BY ln.updated_at DESC LIMIT 15
           ) t), ''), '')
      || coalesce(E'\nSamples: ' || nullif((
           SELECT string_agg(t.label, '; ')
           FROM (
             SELECT s.sample_code || coalesce(' (' || nullif(s.sample_type, '') || ')', '') AS label
             FROM public.samples s
             WHERE s.experiment_id = e.id
             ORDER BY s.updated_at DESC LIMIT 15
           ) t), ''), '')
      || coalesce(E'\nLinked papers: ' || nullif((
           SELECT string_agg(t.title, '; ')
           FROM (
             SELECT lr.title FROM public.literature_reviews lr
             WHERE lr.experiment_id = e.id AND lr.title IS NOT NULL
             ORDER BY lr.updated_at DESC LIMIT 10
           ) t), ''), '')
  );
$$;

-- 2) Enqueue trigger: SECURITY DEFINER so member writes on experiments can
--    enqueue without a direct grant on chunk_jobs (068 pattern).
CREATE OR REPLACE FUNCTION public.queue_experiment_summary_chunk_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.chunk_jobs (source_type, source_id, operation, created_by)
    VALUES ('experiment_summary', OLD.id, 'delete', OLD.created_by);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.name IS NOT DISTINCT FROM OLD.name
     AND NEW.description IS NOT DISTINCT FROM OLD.description
     AND NEW.hypothesis IS NOT DISTINCT FROM OLD.hypothesis
     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;  -- no text-bearing change; skip enqueue
  END IF;

  INSERT INTO public.chunk_jobs (source_type, source_id, operation, payload, created_by)
  VALUES (
    'experiment_summary',
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN 'create' ELSE 'update' END,
    public.experiment_summary_payload(NEW),
    NEW.created_by
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_experiment_summary_chunk_job() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_experiment_summary_chunk ON public.experiments;
CREATE TRIGGER trg_experiment_summary_chunk
AFTER INSERT OR UPDATE OR DELETE ON public.experiments
FOR EACH ROW EXECUTE FUNCTION public.queue_experiment_summary_chunk_job();

-- 3) Backfill (re-runnable): enqueue experiments with no summary chunks and no
--    pending job. Safe to re-execute any time to pick up linked-title drift.
-- operation='update' (NOT 'create'): the worker deletes existing chunks first,
-- so partial rows from an interrupted run never collide with a retry —
-- backfills must be idempotent.
INSERT INTO public.chunk_jobs (source_type, source_id, operation, payload, created_by)
SELECT 'experiment_summary', e.id, 'update', public.experiment_summary_payload(e), e.created_by
FROM public.experiments e
WHERE NOT EXISTS (
  SELECT 1 FROM public.semantic_chunks sc
  WHERE sc.source_type = 'experiment_summary' AND sc.source_id = e.id
)
AND NOT EXISTS (
  SELECT 1 FROM public.chunk_jobs cj
  WHERE cj.source_type = 'experiment_summary' AND cj.source_id = e.id
    AND cj.status IN ('pending', 'processing')
);
