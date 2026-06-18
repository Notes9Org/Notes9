-- 086_query_classification.sql
--
-- Adds query classification metadata columns to agent_runs (Workstream A).
--
-- Baseline verification
-- ---------------------
-- public.agent_runs exists in 000_full_script.sql (line 32):
--
--   CREATE TABLE public.agent_runs (
--     run_id uuid NOT NULL,
--     ...
--     CONSTRAINT agent_runs_pkey PRIMARY KEY (run_id)
--   );
--
-- Additional columns from migrations 069/079/082 are confirmed in those files.
-- No query_category or query_intent column exists yet (checked against all
-- 0*.sql files through 085).
--
-- Design
-- ------
-- * ADD COLUMN IF NOT EXISTS — additive and idempotent, safe on a live table.
-- * Both columns are nullable: existing rows are unaffected. Classification is
--   populated ASYNCHRONOUSLY after the run completes by the Python enricher
--   (agents/core/query_classifier.py), not during the request.
-- * query_category (text): a single label from the fixed taxonomy defined in
--   the Python enricher. Kept as text (not an enum) so the taxonomy can evolve
--   without an ALTER TYPE migration.
-- * query_intent (jsonb): structured metadata from the LLM classification call,
--   e.g. { "sub_intent": "...", "confidence": 0.9, "model": "..." }.
-- * No RLS changes. agent_runs already has no RLS enabled on its policy-set
--   (per 056_agent_least_privilege_role.sql which grants reads to the agent
--   role, not user-facing RLS). This migration adds no policies.
-- * This migration is NOT applied automatically — a Supabase operator applies
--   it after review.

ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS query_category text,
  ADD COLUMN IF NOT EXISTS query_intent   jsonb;

COMMENT ON COLUMN public.agent_runs.query_category IS
  'LLM-assigned query category from the fixed taxonomy: data_retrieval, '
  'literature_search, analysis, protocol_help, writing, troubleshooting, other. '
  'Populated asynchronously after run completion when NOTES9_QUERY_CLASSIFY=true.';

COMMENT ON COLUMN public.agent_runs.query_intent IS
  'Structured intent metadata from the classification LLM call, e.g. '
  '{"sub_intent":"...", "confidence":0.9, "model":"..."}. Nullable.';

-- Optional index for the rollup MV and dashboard GROUP BY queries.
-- IF NOT EXISTS → idempotent.
CREATE INDEX IF NOT EXISTS agent_runs_query_category_idx
  ON public.agent_runs (query_category, created_at DESC)
  WHERE query_category IS NOT NULL;
