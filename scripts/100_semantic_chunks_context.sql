-- 100_semantic_chunks_context.sql
-- Phase 2 (Contextual Retrieval): store the short LLM-written context blurb that
-- is prepended to a chunk BEFORE embedding (Anthropic's technique — cuts failed
-- retrievals). `content` stays the display/citation text; `context` + content is
-- what gets embedded. NULL when contextual retrieval was not run for the chunk.
-- Additive + idempotent; safe to run on the live DB.

ALTER TABLE public.semantic_chunks
  ADD COLUMN IF NOT EXISTS context text;

COMMENT ON COLUMN public.semantic_chunks.context IS
  'Contextual Retrieval blurb prepended to content before embedding (situates the '
  'chunk in its document). Display/citation still uses content. NULL = not run.';
