-- 082_agent_telemetry_indexes_and_usage_view.sql
--
-- Completes step 0a of AGENT_OVERHAUL_PLAN.md. Migrations 069 and 079, plus the
-- baseline schema (001_create_tables.sql / 000_full_script.sql context), already
-- created the agent_runs telemetry columns and the agent_llm_calls /
-- agent_tool_calls tables that step 0b writes to. What was still missing:
--
--   * the per-table indexes the plan specified (only idx_agent_runs_org_created
--     from 069 had been created),
--   * the agent_usage_daily materialized view that the admin/cost dashboards and
--     the step 0c baseline measurement aggregate over.
--
-- This migration is purely additive and load-REDUCING: indexes turn the
-- analytics scans into index seeks, and the materialized view moves the daily
-- roll-up off the hot path. It changes no policies, adds no auth checks, and is
-- safe to run on a live database.
--
-- NOTE on locking: a plain CREATE INDEX takes a brief write lock. If a table is
-- already large and write-hot, run the CONCURRENTLY variant of each statement
-- INSTEAD, OUTSIDE a transaction block (CONCURRENTLY cannot run inside one).
-- All statements use IF NOT EXISTS so re-running is safe.

-- ---------------------------------------------------------------------------
-- 0a.1  agent_runs — per-user run listing (org index already exists from 069)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS agent_runs_created_by_created_at_idx
  ON public.agent_runs (created_by, created_at DESC);

-- ---------------------------------------------------------------------------
-- 0a.2  agent_llm_calls — FK lookups, time scans, per-model analytics
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS agent_llm_calls_run_id_idx
  ON public.agent_llm_calls (run_id);
CREATE INDEX IF NOT EXISTS agent_llm_calls_created_at_idx
  ON public.agent_llm_calls (created_at DESC);
CREATE INDEX IF NOT EXISTS agent_llm_calls_model_created_at_idx
  ON public.agent_llm_calls (model_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 0a.3  agent_tool_calls — FK lookups, per-tool analytics
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS agent_tool_calls_run_id_idx
  ON public.agent_tool_calls (run_id);
CREATE INDEX IF NOT EXISTS agent_tool_calls_tool_created_at_idx
  ON public.agent_tool_calls (tool_name, created_at DESC);

-- ---------------------------------------------------------------------------
-- 0a.4  agent_usage_daily — daily roll-up for cost/usage dashboards
--
-- Grain: one row per (day, user, org, model). Source columns verified against
-- the live agent_runs definition: created_by, organization_id, model_id,
-- turn_count, input/output/cache tokens, cost_usd, total_latency_ms,
-- final_confidence, error_kind, attachments_count, web_search_used.
--
-- Admin-only surface: per project convention, token usage / cost / model
-- attribution are NEVER sent on the user-facing SSE stream. Dashboards query
-- this view directly.
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS public.agent_usage_daily AS
SELECT
  date_trunc('day', created_at)::date AS day,
  created_by                          AS user_id,
  organization_id,
  model_id,
  count(*)                            AS run_count,
  sum(turn_count)                     AS turn_count,
  sum(input_tokens)                   AS input_tokens,
  sum(output_tokens)                  AS output_tokens,
  sum(cache_read_tokens)              AS cache_read_tokens,
  sum(cache_creation_tokens)          AS cache_creation_tokens,
  sum(cost_usd)                       AS cost_usd,
  sum(total_latency_ms)               AS total_latency_ms,
  avg(final_confidence)               AS avg_confidence,
  sum((error_kind IS NOT NULL)::int)  AS error_count,
  sum(attachments_count)              AS attachments_count,
  sum((web_search_used)::int)         AS web_search_runs
FROM public.agent_runs
WHERE status IN ('completed', 'failed')
GROUP BY 1, 2, 3, 4
WITH NO DATA;

-- Unique index is REQUIRED for REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS agent_usage_daily_pk
  ON public.agent_usage_daily (day, user_id, organization_id, model_id);

-- Populate once now that the unique index exists.
REFRESH MATERIALIZED VIEW public.agent_usage_daily;

-- ---------------------------------------------------------------------------
-- Refresh cadence
--
-- Hourly is enough for a cost dashboard. After this migration applies and the
-- unique index exists, refresh CONCURRENTLY so readers are never blocked:
--
--   REFRESH MATERIALIZED VIEW CONCURRENTLY public.agent_usage_daily;
--
-- If pg_cron is available, schedule it (run once, not part of this migration so
-- the file stays idempotent and environment-agnostic):
--
--   SELECT cron.schedule(
--     'refresh_agent_usage_daily', '0 * * * *',
--     $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.agent_usage_daily$$
--   );
-- ---------------------------------------------------------------------------
