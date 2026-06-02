-- Protocol versioning — the same immutable, hash-chained history as lab notes.
--
-- The trg_write_document_version() trigger function ALREADY handles protocols
-- (record_type = 'protocol', using NEW.name / NEW.version / NEW.content). This
-- migration just makes sure that function is (a) attached to public.protocols and
-- (b) able to resolve pgcrypto's digest() (extensions schema) — mirroring 065 for
-- lab notes — and adds commit_protocol, the force-a-version "Save/Accept" path.
--
-- Idempotent; modifies no data.

-- (a) digest() resolves from this function regardless of where pgcrypto lives.
ALTER FUNCTION public.trg_write_document_version()
  SET search_path = public, extensions, pg_temp;

-- (b) Attach the versioning trigger to protocols only if it isn't already (so we
--     never create a duplicate that would double-version).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class     c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc      p ON p.oid = t.tgfoid
    WHERE n.nspname = 'public'
      AND c.relname = 'protocols'
      AND p.proname = 'trg_write_document_version'
      AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER trg_protocols_audit_version
      AFTER INSERT OR UPDATE OR DELETE ON public.protocols
      FOR EACH ROW EXECUTE FUNCTION public.trg_write_document_version();
    RAISE NOTICE 'Created trg_protocols_audit_version on public.protocols';
  ELSE
    RAISE NOTICE 'protocols already has a trg_write_document_version trigger; left as-is';
  END IF;
END
$$;

-- commit_protocol: the explicit "Accept & Save / new version" path. Sets
-- app.force_version so the trigger writes a version even inside its 3-minute
-- throttle window, then updates the protocol — all one transaction.
--
-- SECURITY DEFINER: the protocol UPDATE fires other pre-existing triggers
-- (e.g. the semantic-chunk enqueue that INSERTs into chunk_jobs). Those job-queue
-- tables are writable only by privileged roles, so running the update as the end
-- user (INVOKER) trips their RLS. As DEFINER the whole chain runs as the function
-- owner and bypasses that — but DEFINER also bypasses the protocols RLS, so we
-- enforce access manually below (creator or same-org member).
CREATE OR REPLACE FUNCTION public.commit_protocol(
  p_id                   uuid,
  p_content              text,
  p_version              text DEFAULT NULL,
  p_name                 text DEFAULT NULL,
  p_document_template_id uuid DEFAULT NULL,
  p_user_agent           text DEFAULT NULL
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

  -- Manual access check (DEFINER bypasses RLS): caller must own the protocol or
  -- be a member of its organization.
  IF NOT EXISTS (
    SELECT 1 FROM public.protocols p
    WHERE p.id = p_id
      AND (
        p.created_by = v_uid
        OR (p.organization_id IS NOT NULL AND p.organization_id = public.my_org_id())
      )
  ) THEN
    RAISE EXCEPTION 'protocol % not found or not permitted', p_id;
  END IF;

  PERFORM set_config('app.force_version', 'on', true);
  IF p_user_agent IS NOT NULL THEN
    PERFORM set_config('app.user_agent', p_user_agent, true);
  END IF;

  UPDATE public.protocols
     SET content              = p_content,
         version              = COALESCE(p_version, version),
         name                 = COALESCE(p_name, name),
         document_template_id = p_document_template_id
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_protocol(uuid, text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_protocol(uuid, text, text, text, uuid, text) TO authenticated;
