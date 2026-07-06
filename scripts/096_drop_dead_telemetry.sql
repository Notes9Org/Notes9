-- 096_drop_dead_telemetry.sql
--
-- Drop the write-only AI telemetry surface (2026-07-05 cleanup).
--
-- WHY: these tables/views were written on every chat turn, tool call and
-- agent-loop event but had ZERO readers in the application. Product
-- analytics now live in PostHog (frontend events + backend
-- `ai_agent_run_completed` / `ai_call_metered` from
-- AI/catalyst/services/product_analytics.py).
--
-- WHAT STAYS (quota enforcement — do NOT drop):
--   * public.agent_runs                (read by the Redis quota reconciler;
--                                       keeps prompt_version from 079)
--   * public.ai_usage_counters         (095 — $5/month budget admission check)
--   * public.ai_usage_ledger           (095 — quota audit ground truth)
--   * increment_usage_counter RPC      (095)
--   * public.plans / organization_plan (095)
--
-- APPLY: manually via the supabase operator/agent AFTER the matching backend
-- deploy (the code no longer writes to any object dropped here; all old
-- writes were fail-open, so ordering is safety, not correctness).

-- 1) Unschedule the hourly materialized-view refreshes (registered manually
--    per the comments in 082/087; guard for environments without pg_cron
--    or without the jobs).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
      FROM cron.job
     WHERE jobname IN (
       'refresh_agent_usage_daily',
       'refresh_feature_usage_daily',
       'refresh_question_categories_daily'
     );
  END IF;
END $$;

-- 2) Materialized views (before their source tables/columns).
DROP MATERIALIZED VIEW IF EXISTS public.agent_usage_daily;          -- 082
DROP MATERIALIZED VIEW IF EXISTS public.feature_usage_daily;        -- 087 (reads usage_events)
DROP MATERIALIZED VIEW IF EXISTS public.question_categories_daily;  -- 087 (reads agent_runs.query_category)

-- 3) Write-only telemetry tables. Indexes, policies and identity sequences
--    are owned by the tables and drop with them.
DROP TABLE IF EXISTS public.agent_llm_calls;             -- 000 baseline + 079 columns
DROP TABLE IF EXISTS public.agent_tool_calls;            -- 000 baseline + 079 column
DROP TABLE IF EXISTS public.agent_trace_events;          -- 000 baseline
DROP TABLE IF EXISTS public.literature_search_telemetry; -- 000 baseline
DROP TABLE IF EXISTS public.usage_events;                -- 000 baseline / 085 (dead since PostHog pivot)

-- 4) Query-classification columns (086): their only consumer was the
--    question_categories_daily MV dropped above; the LLM classifier that
--    populated them (agents/core/query_classifier.py) is deleted.
DROP INDEX IF EXISTS public.agent_runs_query_category_idx;
ALTER TABLE public.agent_runs
  DROP COLUMN IF EXISTS query_category,
  DROP COLUMN IF EXISTS query_intent;
