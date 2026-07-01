-- scripts/092_literature_staging_ttl.sql
-- Additive: give STAGED (read-without-saving) literature_reviews rows a 7-day TTL.
--
-- Why: "Read paper" stages a paper into literature_reviews with
-- catalog_placement='staging' so the user can read it inline WITHOUT adding it to
-- their library. Today those staged rows are permanent and accumulate silently —
-- contrary to the "temporary read" mental model. This column marks a staged row for
-- auto-removal after 7 days unless the user promotes it to the repository (Save to
-- library), which clears the expiry. Repository (library) rows are never expired.
--
-- Purely additive — no RLS / policy changes. Existing rows get NULL (never expire)
-- until re-staged; the app sets the timestamp on new stage actions.

ALTER TABLE public.literature_reviews
  ADD COLUMN IF NOT EXISTS staged_expires_at timestamptz;

COMMENT ON COLUMN public.literature_reviews.staged_expires_at IS
  'For catalog_placement=''staging'' only: when this un-saved read auto-expires (now()+7d at stage time). NULL = never expires (library rows, or legacy staged rows). Cleared on promotion to repository.';

-- Cleanup cron scans by this timestamp; partial index keeps it cheap (only staged,
-- only rows that actually carry an expiry).
CREATE INDEX IF NOT EXISTS idx_literature_reviews_staged_expiry
  ON public.literature_reviews (staged_expires_at)
  WHERE catalog_placement = 'staging' AND staged_expires_at IS NOT NULL;
