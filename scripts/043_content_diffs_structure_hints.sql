-- Optional: add structural audit hints (heading trails, block paths) to existing content_diffs tables.

ALTER TABLE public.content_diffs
  ADD COLUMN IF NOT EXISTS structure_hints JSONB NOT NULL DEFAULT '{}'::jsonb;
