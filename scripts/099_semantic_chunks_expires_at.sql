-- 099_semantic_chunks_expires_at.sql
-- Phase 3: transient (staged) literature chunks self-expire with the paper's
-- 7-day staging TTL. Saved (repository) chunks leave expires_at NULL = permanent.
-- Additive + idempotent; safe to run on the live DB.

ALTER TABLE public.semantic_chunks
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN public.semantic_chunks.expires_at IS
  'When set, this chunk is transient (a staged/read-but-not-saved paper, matching '
  'literature_reviews.staged_expires_at) and is deleted after this time by the '
  'cleanup-staged-literature cron. NULL = permanent (saved to repository).';

-- Drives the cron sweep of expired transient chunks (only indexes transient rows).
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_expires_at
  ON public.semantic_chunks (expires_at)
  WHERE expires_at IS NOT NULL;
