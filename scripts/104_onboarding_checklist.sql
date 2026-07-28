-- Onboarding checklist state + which demo pack a user was seeded with.
--
-- `onboarding_checklist` holds only what cannot be derived from the workspace
-- itself: manual "Mark as done" overrides and whether the panel was dismissed.
-- Actual task completion is computed from real rows (projects, literature,
-- chats, data files) at render time, so the checklist can never disagree with
-- what the user has actually built.
--
--   { "done": ["create_project"], "dismissed": true }
--
-- `demo_pack` records which field-matched starter pack was seeded, so the UI can
-- label the demo project and we can tell seeded content from the user's own.
--
-- Existing users are backfilled to dismissed so the checklist does not suddenly
-- appear on established workspaces — same pattern as the notes9_welcome_seen_at
-- backfill in scripts/066 and demo_seeded_at in scripts/102.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_checklist jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS demo_pack text;

UPDATE public.profiles
  SET onboarding_checklist = '{"dismissed": true}'::jsonb
  WHERE onboarding_checklist = '{}'::jsonb
    AND notes9_welcome_seen_at IS NOT NULL;
