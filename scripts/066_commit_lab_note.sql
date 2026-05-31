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

CREATE OR REPLACE FUNCTION public.commit_lab_note(
  p_id         uuid,
  p_content    text,
  p_title      text DEFAULT NULL,
  p_note_type  text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lab note % not found or not permitted', p_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_lab_note(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_lab_note(uuid, text, text, text, text) TO authenticated;
