-- Onboarding profile fields for the redesigned welcome wizard + product tour.
--
-- `notes9_welcome_seen_at` gates the first-login welcome modal independently of
-- the tour completion flags (a user can skip the tour but should not see the
-- welcome again). The remaining columns capture the onboarding questionnaire.
--
-- NOTE: `profiles.role` already exists (CHECK admin/researcher/technician/
-- analyst/viewer) and is a *permission* role, so we do NOT overload it for the
-- onboarding "what is your role" question — that lives in `job_title`.
-- Likewise `organization_id` is the FK to the org entity; `organization_name`
-- here is the free-text "place of work" the user types during onboarding.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS research_field text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS organization_name text,
  ADD COLUMN IF NOT EXISTS primary_goal text,
  ADD COLUMN IF NOT EXISTS notes9_welcome_seen_at timestamptz;

-- Backfill existing users so the welcome modal only ever shows to genuinely new
-- accounts created after this migration. Without this, every legacy user would
-- be prompted on their next login.
UPDATE public.profiles
  SET notes9_welcome_seen_at = now()
  WHERE notes9_welcome_seen_at IS NULL;
