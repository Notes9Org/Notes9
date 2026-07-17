-- 101_semantic_chunks_chat_attachment_type.sql
-- Phase 5 (chat-attachment parity): allow 'chat_attachment' as a chunk source_type
-- so uploaded chat files can be chunked into the same store, carrying an expires_at
-- (migration 099) for their existing 7-day TTL. Widening-only.
--
-- Conservative: DROP + ADD ... NOT VALID (no rewrite/scan while holding the lock)
-- then VALIDATE separately. Widening keeps every existing row valid, so VALIDATE is
-- a fast non-blocking scan. The inline CHECK from the original CREATE TABLE is
-- auto-named <table>_<column>_check by Postgres; verify that name on the live DB
-- before running (per the "never infer DB names" rule) — adjust DROP if it differs.

ALTER TABLE public.semantic_chunks
  DROP CONSTRAINT IF EXISTS semantic_chunks_source_type_check;

ALTER TABLE public.semantic_chunks
  ADD CONSTRAINT semantic_chunks_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'lab_note'::text,
    'literature_review'::text,
    'protocol'::text,
    'report'::text,
    'experiment_summary'::text,
    'chat_attachment'::text
  ])) NOT VALID;

ALTER TABLE public.semantic_chunks
  VALIDATE CONSTRAINT semantic_chunks_source_type_check;
