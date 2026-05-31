-- Draft / commit split for lab notes.
--
-- Problem this solves: autosave and the "Accept & Save" approval bar both wrote
-- to lab_notes.content, so the explicit Save was a no-op and the content_diffs
-- audit log was polluted with one row per autosave keystroke burst.
--
-- New model:
--   * lab_notes.content        = the COMMITTED, audited record. Only an explicit
--                                Save writes it, and each Save records exactly one
--                                content_diffs row (the audit diff).
--   * lab_notes.draft_content  = the live autosave buffer. Continuously persisted
--                                so nothing the user types is ever lost, but it is
--                                NOT the official record and produces no audit row.
--                                NULL means "no uncommitted draft" (draft == content).
--
-- Discard clears draft_content (revert to the committed body). Save copies
-- draft_content into content, records the diff, then clears draft_content.
--
-- Idempotent; safe to re-run. Existing UPDATE RLS on lab_notes already governs
-- these columns (same row), so no policy changes are required.

ALTER TABLE public.lab_notes
  ADD COLUMN IF NOT EXISTS draft_content    text,
  ADD COLUMN IF NOT EXISTS draft_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS draft_author_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.lab_notes.draft_content IS
  'Live autosave buffer; NULL when there is no uncommitted draft. Not the official record — see content.';
COMMENT ON COLUMN public.lab_notes.draft_updated_at IS
  'When draft_content was last autosaved.';
COMMENT ON COLUMN public.lab_notes.draft_author_id IS
  'Who last autosaved the draft (attribution for the pending-changes bar).';
