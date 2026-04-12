-- Append-only change log for protocol and lab note content diffs
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.content_diffs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'protocol' or 'lab_note'
  record_type      TEXT NOT NULL CHECK (record_type IN ('protocol', 'lab_note')),
  record_id        UUID NOT NULL,
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Short human-readable summary (e.g. first 120 chars of added text)
  change_summary   TEXT,
  -- Compact word-level change log: +/- fragments and "_" entries for unchanged run lengths (see app `buildStoredSegments`).
  diff_segments    JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- JSON `{ "document_title": string|null, "sections": string[] }` — compact; legacy `{ "section_trails": [] }` supported on read
  structure_hints    JSONB NOT NULL DEFAULT '{}'::jsonb,
  words_added      INTEGER NOT NULL DEFAULT 0,
  words_removed    INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by record
CREATE INDEX IF NOT EXISTS idx_content_diffs_record
  ON public.content_diffs (record_type, record_id, created_at DESC);

-- Fast lookup by user
CREATE INDEX IF NOT EXISTS idx_content_diffs_user
  ON public.content_diffs (user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.content_diffs ENABLE ROW LEVEL SECURITY;

-- Policies (drop first so this script is safe to re-run)
DROP POLICY IF EXISTS "content_diffs_insert_own" ON public.content_diffs;
DROP POLICY IF EXISTS "content_diffs_select_org" ON public.content_diffs;

-- Users can insert their own diff entries
CREATE POLICY "content_diffs_insert_own"
  ON public.content_diffs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can read diffs where they created it, or where they are in the same org as the creator
CREATE POLICY "content_diffs_select_org"
  ON public.content_diffs
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.profiles me
      JOIN public.profiles creator ON creator.organization_id = me.organization_id
      WHERE me.id = auth.uid()
        AND creator.id = content_diffs.user_id
    )
  );

-- No UPDATE or DELETE — this table is append-only
