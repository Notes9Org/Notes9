-- Replace full snapshot columns with compact diff_segments JSON (run in Supabase SQL editor after deploying app that reads/writes segments).
-- Safe to run once on DBs created from scripts/039_content_diffs.sql before it stored only diff_segments.

ALTER TABLE public.content_diffs
  ADD COLUMN IF NOT EXISTS diff_segments JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.content_diffs
  DROP COLUMN IF EXISTS previous_content;

ALTER TABLE public.content_diffs
  DROP COLUMN IF EXISTS new_content;
