-- Guard column so the ready-made demo project is seeded exactly once per user.
-- New users get NULL (→ they will be seeded on first authenticated app load);
-- existing users are backfilled to now() so a demo project is NOT retroactively
-- dumped into workspaces that already have real content (same pattern as the
-- notes9_welcome_seen_at backfill in scripts/066).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS demo_seeded_at timestamptz;

UPDATE public.profiles
  SET demo_seeded_at = now()
  WHERE demo_seeded_at IS NULL;
