-- commit_lab_note: the explicit "Save" path for a lab note.
--
-- The live DB versions lab notes via trg_write_document_version, which THROTTLES
-- update-versions to one per 3 minutes unless the transaction-local GUC
-- `app.force_version` = 'on'. A deliberate Save should always be auditable, so
-- this RPC sets that flag and then updates the committed content in the SAME
-- transaction — the trigger fires, sees the flag, and writes a version (bypassing
-- the throttle but still honoring its content-unchanged dedup).
--
-- It does NOT touch document_versions itself (the trigger owns that — no double
-- write). SECURITY INVOKER so the caller's RLS (lab_notes_update) is enforced.
-- Optionally records the client user agent for the audit row via app.user_agent.
-- Idempotent.

-- SECURITY DEFINER: the lab_notes UPDATE fires other pre-existing triggers
-- (e.g. the semantic-chunk enqueue that INSERTs into chunk_jobs). Those job-queue
-- tables are writable only by privileged roles, so running the update as the end
-- user (INVOKER) trips their RLS. As DEFINER the whole chain runs as the function
-- owner and bypasses that — DEFINER also bypasses lab_notes RLS, so access is
-- enforced manually below (creator or same-org member, mirroring lab_notes_update).
CREATE OR REPLACE FUNCTION public.commit_lab_note(
  p_id         uuid,
  p_content    text,
  p_title      text DEFAULT NULL,
  p_note_type  text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.lab_notes n
    WHERE n.id = p_id
      AND (
        n.created_by = v_uid
        OR n.project_id IN (
          SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
        )
        OR n.experiment_id IN (
          SELECT e.id FROM public.experiments e
          JOIN public.projects p ON p.id = e.project_id
          WHERE p.organization_id = public.my_org_id()
        )
      )
  ) THEN
    RAISE EXCEPTION 'lab note % not found or not permitted', p_id;
  END IF;

  -- Transaction-local (is_local = true): cleared automatically at commit.
  PERFORM set_config('app.force_version', 'on', true);
  IF p_user_agent IS NOT NULL THEN
    PERFORM set_config('app.user_agent', p_user_agent, true);
  END IF;

  UPDATE public.lab_notes
     SET content          = p_content,
         title            = COALESCE(p_title, title),
         note_type        = COALESCE(p_note_type, note_type),
         draft_content    = NULL,
         draft_updated_at = NULL,
         draft_author_id  = NULL,
         updated_at       = now()
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_lab_note(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_lab_note(uuid, text, text, text, text) TO authenticated;
