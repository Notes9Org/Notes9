-- Read-side enablement for lab-note version history (document_versions).
--
-- NOTE: This project's LIVE database already versions lab notes via the trigger
-- `trg_lab_notes_audit_version` -> `trg_write_document_version`, which writes the
-- immutable, hash-chained rows on every committed content change (and captures
-- client metadata from GUCs). That trigger is the single source of truth for
-- versioning — the application must NOT create versions itself.
--
-- Earlier drafts of this file added a `commit_lab_note_version` RPC and a v1
-- backfill. Both are REMOVED: they duplicated the trigger and the backfill's
-- hand-rolled row_hash would not match the trigger's chain. If a prior run
-- created the RPC, drop it.
--
-- What remains here is only what the client needs to *read* versions: indexes
-- and a SELECT-only RLS policy (org members or the author). Idempotent.

DROP FUNCTION IF EXISTS public.commit_lab_note_version(uuid, text, text, text, text, integer, integer, text);

CREATE INDEX IF NOT EXISTS idx_document_versions_record
  ON public.document_versions (record_type, record_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_document_versions_author
  ON public.document_versions (author_id, created_at DESC);

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

-- SELECT only — versions are append-only and written solely by the (definer-owned)
-- trigger, so no INSERT/UPDATE/DELETE policy is granted to clients.
DROP POLICY IF EXISTS document_versions_select ON public.document_versions;
CREATE POLICY document_versions_select
  ON public.document_versions
  FOR SELECT
  USING (
    author_id = auth.uid()
    OR (organization_id IS NOT NULL AND organization_id = public.my_org_id())
  );
