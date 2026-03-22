-- Persist user onboarding/tour completion state on profiles.
-- Apply this after the base profile schema so the first-run tour can be tracked server-side.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notes9_tour_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes9_tour_skipped_at TIMESTAMPTZ;
