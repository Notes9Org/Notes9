-- 072_chat_researcher_profiles_jsonb.sql
--
-- Adds the research_user_profile jsonb column to chat_researcher_profiles.
--
-- Root cause / why this migration exists:
--   The live DB and the schema dump (000_full_script.sql:197) both have
--   `research_user_profile jsonb NOT NULL DEFAULT '{}'::jsonb`, but migration
--   046_chat_researcher_profiles.sql never adds it — it was created by hand.
--   A fresh build from the migration chain alone is therefore missing the
--   column, and the Catalyst store would crash on it:
--     - AI/catalyst/agents/core/memory/store.py:215  reads research_user_profile
--     - AI/catalyst/agents/core/memory/store.py:235  writes research_user_profile
--   This commits the column so the migration chain matches reality.
--
-- Lock safety:
--   ADD COLUMN with a constant DEFAULT uses the Postgres 11+ fast-default path
--   (default stored in catalog, no table rewrite) and takes only a brief
--   catalog lock. Where the column already exists (live/prod), IF NOT EXISTS
--   makes this a metadata no-op. Safe on a connection-constrained DB.
--
-- Idempotent; modifies no data in existing rows.

ALTER TABLE public.chat_researcher_profiles
  ADD COLUMN IF NOT EXISTS research_user_profile jsonb NOT NULL DEFAULT '{}'::jsonb;
