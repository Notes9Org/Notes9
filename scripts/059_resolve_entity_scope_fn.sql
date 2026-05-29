-- Collapses the multi-step entity→scope cascade that previously required
-- 2–4 separate API round-trips (each hitting RLS → my_org_id() → profiles)
-- into a single Postgres function call.
--
-- Handles: projects, experiments, lab-notes, protocols, samples,
--          data (experiment_data), reports, papers, literature-reviews.
-- equipment has no project_id/experiment_id columns and returns nulls.
--
-- SECURITY INVOKER: runs with the calling user's role so existing RLS
-- policies enforce org-boundary scoping automatically.

CREATE OR REPLACE FUNCTION public.resolve_entity_scope(
  p_type text,
  p_id   uuid
)
RETURNS TABLE(
  project_id      uuid,
  project_name    text,
  experiment_id   uuid,
  experiment_name text
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_project_id      uuid;
  v_experiment_id   uuid;
  v_project_name    text;
  v_experiment_name text;
  v_eid             uuid;
  v_pid             uuid;
BEGIN
  IF p_type = 'projects' THEN
    SELECT p.id, p.name
      INTO v_project_id, v_project_name
      FROM public.projects p
     WHERE p.id = p_id;

  ELSIF p_type = 'experiments' THEN
    SELECT e.id, e.name, e.project_id
      INTO v_experiment_id, v_experiment_name, v_project_id
      FROM public.experiments e
     WHERE e.id = p_id;

  ELSIF p_type = 'lab-notes' THEN
    SELECT ln.experiment_id, ln.project_id
      INTO v_eid, v_pid
      FROM public.lab_notes ln
     WHERE ln.id = p_id;
    IF v_eid IS NOT NULL THEN
      v_experiment_id := v_eid;
      SELECT e.name, e.project_id
        INTO v_experiment_name, v_project_id
        FROM public.experiments e
       WHERE e.id = v_eid;
    ELSE
      v_project_id := v_pid;
    END IF;

  ELSIF p_type = 'protocols' THEN
    SELECT pr.experiment_id, pr.project_id
      INTO v_eid, v_pid
      FROM public.protocols pr
     WHERE pr.id = p_id;
    IF v_eid IS NOT NULL THEN
      v_experiment_id := v_eid;
      SELECT e.name, e.project_id
        INTO v_experiment_name, v_project_id
        FROM public.experiments e
       WHERE e.id = v_eid;
      IF v_project_id IS NULL THEN v_project_id := v_pid; END IF;
    ELSIF v_pid IS NOT NULL THEN
      v_project_id := v_pid;
    ELSE
      -- Fallback: first experiment_protocols link
      SELECT ep.experiment_id
        INTO v_experiment_id
        FROM public.experiment_protocols ep
       WHERE ep.protocol_id = p_id
       LIMIT 1;
      IF v_experiment_id IS NOT NULL THEN
        SELECT e.name, e.project_id
          INTO v_experiment_name, v_project_id
          FROM public.experiments e
         WHERE e.id = v_experiment_id;
      END IF;
    END IF;

  ELSIF p_type = 'samples' THEN
    SELECT s.experiment_id, s.project_id
      INTO v_eid, v_pid
      FROM public.samples s
     WHERE s.id = p_id;
    IF v_eid IS NOT NULL THEN
      v_experiment_id := v_eid;
      SELECT e.name, e.project_id
        INTO v_experiment_name, v_project_id
        FROM public.experiments e
       WHERE e.id = v_eid;
      IF v_project_id IS NULL THEN v_project_id := v_pid; END IF;
    ELSIF v_pid IS NOT NULL THEN
      v_project_id := v_pid;
    ELSE
      -- Fallback: most-recent sample_experiments link
      SELECT se.experiment_id
        INTO v_experiment_id
        FROM public.sample_experiments se
       WHERE se.sample_id = p_id
       ORDER BY se.linked_at DESC
       LIMIT 1;
      IF v_experiment_id IS NOT NULL THEN
        SELECT e.name, e.project_id
          INTO v_experiment_name, v_project_id
          FROM public.experiments e
         WHERE e.id = v_experiment_id;
      ELSE
        -- Final fallback: sample_projects
        SELECT sp.project_id
          INTO v_project_id
          FROM public.sample_projects sp
         WHERE sp.sample_id = p_id
         LIMIT 1;
      END IF;
    END IF;

  ELSIF p_type = 'data' THEN
    SELECT ed.experiment_id, ed.project_id
      INTO v_eid, v_pid
      FROM public.experiment_data ed
     WHERE ed.id = p_id;
    IF v_eid IS NOT NULL THEN
      v_experiment_id := v_eid;
      SELECT e.name, e.project_id
        INTO v_experiment_name, v_project_id
        FROM public.experiments e
       WHERE e.id = v_eid;
      IF v_project_id IS NULL THEN v_project_id := v_pid; END IF;
    ELSE
      v_project_id := v_pid;
    END IF;

  ELSIF p_type = 'reports' THEN
    SELECT r.experiment_id, r.project_id
      INTO v_eid, v_pid
      FROM public.reports r
     WHERE r.id = p_id;
    IF v_eid IS NOT NULL THEN
      v_experiment_id := v_eid;
      SELECT e.name, e.project_id
        INTO v_experiment_name, v_project_id
        FROM public.experiments e
       WHERE e.id = v_eid;
      IF v_project_id IS NULL THEN v_project_id := v_pid; END IF;
    ELSE
      v_project_id := v_pid;
    END IF;

  ELSIF p_type = 'papers' THEN
    -- papers has project_id but no experiment_id
    SELECT pa.project_id
      INTO v_project_id
      FROM public.papers pa
     WHERE pa.id = p_id;

  ELSIF p_type = 'literature-reviews' THEN
    SELECT lr.experiment_id, lr.project_id
      INTO v_eid, v_pid
      FROM public.literature_reviews lr
     WHERE lr.id = p_id;
    IF v_eid IS NOT NULL THEN
      v_experiment_id := v_eid;
      SELECT e.name, e.project_id
        INTO v_experiment_name, v_project_id
        FROM public.experiments e
       WHERE e.id = v_eid;
      IF v_project_id IS NULL THEN v_project_id := v_pid; END IF;
    ELSE
      v_project_id := v_pid;
    END IF;

  -- equipment has no project_id/experiment_id; returns all nulls
  END IF;

  -- Resolve project name once (covers cases where we got project_id but not name)
  IF v_project_id IS NOT NULL AND v_project_name IS NULL THEN
    SELECT p.name
      INTO v_project_name
      FROM public.projects p
     WHERE p.id = v_project_id;
  END IF;

  RETURN QUERY
    SELECT v_project_id, v_project_name, v_experiment_id, v_experiment_name;
END;
$$;

-- Grant execute to authenticated users (anon cannot call this — auth check
-- is enforced in the API route before the RPC is called).
GRANT EXECUTE ON FUNCTION public.resolve_entity_scope(text, uuid) TO authenticated;
