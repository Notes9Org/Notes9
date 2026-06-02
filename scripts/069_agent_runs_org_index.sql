-- 069_agent_runs_org_index.sql
--
-- agent_runs is the only high-traffic table found WITHOUT an index on its
-- organization_id scoping column (verified against 000_full_script.sql and all
-- existing migrations — content_diffs, document_versions and literature_reviews
-- already have their record/org indexes from migrations 039/063/001/004, so they
-- are intentionally NOT touched here).
--
-- This index is purely additive and load-REDUCING: it lets org-scoped lookups
-- (and any RLS policy filtering on organization_id) use an index seek instead of
-- a sequential scan as the table grows. It changes no policies, adds no auth
-- checks, and is safe to run on a live database.
--
-- NOTE: a plain CREATE INDEX takes a brief write lock on agent_runs. If the table
-- is already large and write-hot, run the CONCURRENTLY variant below INSTEAD,
-- OUTSIDE a transaction block (CONCURRENTLY cannot run inside one):
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_runs_org_created
--     ON public.agent_runs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_org_created
  ON public.agent_runs (organization_id, created_at DESC);
