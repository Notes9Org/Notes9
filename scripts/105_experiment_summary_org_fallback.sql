-- 105: experiment_summary payload — organization fallback + failed-job retry
--
-- Backfill 102 failed for 44 experiments with "Failed to insert chunks":
-- experiments without a project (or whose project lacks an org) produced
-- payload.organization_id = NULL, violating semantic_chunks' constraint.
-- Fallback: the creator's profile organization. Also re-enqueues both failure
-- classes with freshly built payloads (embedding failures were burst
-- rate-limiting — a plain retry now that the queue is quiet).

-- 1) Patch the payload builder (same signature — CREATE OR REPLACE safe).
CREATE OR REPLACE FUNCTION public.experiment_summary_payload(e public.experiments)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT jsonb_build_object(
    'title', e.name,
    'organization_id', coalesce(
      (SELECT p.organization_id FROM public.projects p WHERE p.id = e.project_id),
      (SELECT pr.organization_id FROM public.profiles pr WHERE pr.id = e.created_by)
    ),
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

-- 2) Diagnostic (informational): failed inserts still unresolvable after fallback.
SELECT cj.source_id AS experiment_id, e.name
FROM public.chunk_jobs cj
JOIN public.experiments e ON e.id = cj.source_id
LEFT JOIN public.projects p ON p.id = e.project_id
LEFT JOIN public.profiles pr ON pr.id = e.created_by
WHERE cj.source_type = 'experiment_summary' AND cj.status = 'failed'
  AND p.organization_id IS NULL AND pr.organization_id IS NULL;

-- 3) Re-enqueue every failed experiment_summary job with a freshly built
--    payload (covers both failure classes), skipping truly orgless ones.
UPDATE public.chunk_jobs cj
   SET status = 'pending',
       retry_count = 0,
       error_message = NULL,
       processed_at = NULL,
       payload = public.experiment_summary_payload(e)
  FROM public.experiments e
 WHERE e.id = cj.source_id
   AND cj.source_type = 'experiment_summary'
   AND cj.status = 'failed'
   AND (public.experiment_summary_payload(e) ->> 'organization_id') IS NOT NULL;
