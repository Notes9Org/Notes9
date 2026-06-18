-- 087_usage_rollups.sql
--
-- Daily materialized-view rollups for product telemetry (Workstream A).
-- Mirrors the pattern from 082_agent_telemetry_indexes_and_usage_view.sql:
--   CREATE MATERIALIZED VIEW IF NOT EXISTS ... WITH NO DATA
--   + UNIQUE index (required for REFRESH CONCURRENTLY)
--   + initial REFRESH
--   + pg_cron schedule comment
--
-- Sources
-- -------
--   public.usage_events  — created by 085_usage_events.sql
--   public.agent_runs    — baseline 000_full_script.sql (line 32);
--                          query_category/query_intent added by 086_query_classification.sql
--
-- Design
-- ------
-- * Additive + idempotent: IF NOT EXISTS on all DDL.
-- * NO RLS, no new policies (same rationale as usage_events — admin-only surfaces).
-- * No partitioning: consistent with the rest of the Notes9 schema.
-- * UNIQUE indexes are REQUIRED for REFRESH MATERIALIZED VIEW CONCURRENTLY so
--   readers are never blocked during refresh.
-- * pg_cron schedule is documented in a comment (not executed here) so this
--   file stays idempotent and environment-agnostic, matching 082's approach.
-- * This migration is NOT applied automatically — a Supabase operator applies
--   it after both 085 and 086 have been applied.

-- ---------------------------------------------------------------------------
-- 1. feature_usage_daily
--    Grain: one row per (day, user_id, organization_id, feature).
--    Aggregates feature dwell time and event counts from usage_events.
-- ---------------------------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS public.feature_usage_daily AS
SELECT
  date_trunc('day', occurred_at)::date  AS day,
  user_id,
  organization_id,
  feature,
  count(*)                               AS event_count,
  -- Sum dwell time; NULL duration_ms rows (non-dwell events) contribute 0.
  sum(coalesce(duration_ms, 0))          AS total_duration_ms,
  -- Count distinct client sessions as a proxy for visit count.
  count(DISTINCT client_session_id)      AS session_count
FROM public.usage_events
WHERE event_name = 'feature_view'
  AND feature IS NOT NULL
GROUP BY 1, 2, 3, 4
WITH NO DATA;

-- UNIQUE index is REQUIRED for REFRESH MATERIALIZED VIEW CONCURRENTLY.
-- NULL organization_id rows are allowed (pre-org or anonymous sessions).
CREATE UNIQUE INDEX IF NOT EXISTS feature_usage_daily_pk
  ON public.feature_usage_daily (day, user_id, organization_id, feature)
  WHERE user_id IS NOT NULL;

-- Separate partial index to handle rows where user_id is null (anonymous).
-- Two partial unique indexes cover the full space without a composite that
-- would reject NULLs (PostgreSQL NULLs are not equal in unique constraints).
CREATE UNIQUE INDEX IF NOT EXISTS feature_usage_daily_anon_pk
  ON public.feature_usage_daily (day, client_session_id, feature)
  WHERE user_id IS NULL;

-- Populate once (requires the unique index above to exist first).
REFRESH MATERIALIZED VIEW public.feature_usage_daily;

-- ---------------------------------------------------------------------------
-- 2. question_categories_daily
--    Grain: one row per (day, organization_id, query_category).
--    Aggregates query classification counts and cost/token totals from
--    agent_runs (query_category column added by 086_query_classification.sql).
-- ---------------------------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS public.question_categories_daily AS
SELECT
  date_trunc('day', ar.created_at)::date   AS day,
  ar.organization_id,
  -- Runs not yet classified land in 'unclassified' so the MV is complete.
  coalesce(ar.query_category, 'unclassified') AS query_category,
  count(*)                                   AS run_count,
  -- Token and cost totals for cost-per-category analytics.
  sum(coalesce(ar.input_tokens, 0))          AS input_tokens,
  sum(coalesce(ar.output_tokens, 0))         AS output_tokens,
  sum(coalesce(ar.cost_usd, 0))              AS cost_usd,
  -- Average confidence from the classification model (null when unclassified).
  avg((ar.query_intent->>'confidence')::numeric) AS avg_classify_confidence
FROM public.agent_runs AS ar
WHERE ar.status IN ('completed', 'failed')
GROUP BY 1, 2, 3
WITH NO DATA;

-- UNIQUE index required for REFRESH CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS question_categories_daily_pk
  ON public.question_categories_daily (day, organization_id, query_category);

-- Populate once.
REFRESH MATERIALIZED VIEW public.question_categories_daily;

-- ---------------------------------------------------------------------------
-- Refresh cadence
--
-- 082 already registered a pg_cron job for agent_usage_daily at '0 * * * *'
-- (hourly). These two MVs are lower-priority (daily dashboards) so an hourly
-- or 6-hourly refresh is sufficient.
--
-- If 082's cron job is already registered, add two more schedules:
--
--   SELECT cron.schedule(
--     'refresh_feature_usage_daily',
--     '15 * * * *',   -- :15 past each hour, staggered from agent_usage_daily
--     $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.feature_usage_daily$$
--   );
--
--   SELECT cron.schedule(
--     'refresh_question_categories_daily',
--     '30 * * * *',   -- :30 past each hour
--     $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.question_categories_daily$$
--   );
--
-- Run these once manually after this migration applies (not part of this file
-- to preserve idempotency, matching 082's convention).
-- ---------------------------------------------------------------------------
