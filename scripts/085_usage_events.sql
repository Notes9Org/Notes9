-- 085_usage_events.sql
--
-- Product telemetry event store (Workstream A).
--
-- Stores product-analytics events from client surfaces: page views, feature
-- dwell time, key user actions. This is SEPARATE from the agent-run telemetry
-- in agent_runs / agent_llm_calls / agent_usage_daily, which covers the AI
-- pipeline. These events back the "Nani" usage dashboard (Workstream B).
--
-- Design choices
-- --------------
-- * bigint GENERATED ALWAYS AS IDENTITY for pk — cheaper and faster than
--   gen_random_uuid() on a high-write append table, matching the Notes9 pattern
--   used in audit_log (see 000_full_script.sql). The table is append-only.
--
-- * NO RLS, NO ROW-LEVEL POLICY: following the explicit Notes9 constraint
--   (connection-pool exhaustion incident from per-request auth checks).
--   The ingest route uses the service-role client; the dashboard queries via
--   service-role. Admin-only surface — users never query this table directly.
--   All other product tables DO have RLS (002_enable_rls.sql); this table is
--   intentionally excluded because it is a write-hot internal analytics store.
--
-- * PII discipline: only opaque UUIDs (user_id, organization_id) and a
--   per-tab client_session_id are stored. NO email, NO free text the user
--   typed, NO message content. The ingest route derives user_id server-side
--   from the auth token; the client never sends user_id.
--
-- * No monthly partitioning: no other Notes9 table is partitioned. To keep
--   the schema consistent we use composite indexes instead. If the table
--   grows beyond ~50 M rows, a DBA can add range partitioning by occurred_at
--   at that time without changing the application layer.
--
-- * Additive + idempotent: every statement uses IF NOT EXISTS so re-running is
--   safe.
--
-- How to apply
-- ------------
-- This file is NOT applied automatically. A Supabase operator reviews and
-- applies it via the Supabase dashboard or supabase db push.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.usage_events (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_name          text        NOT NULL,
  feature             text,
  surface             text,
  -- Opaque UUIDs only — no PII
  user_id             uuid,
  organization_id     uuid,
  client_session_id   text,
  -- Structured metadata: enums/counts/ids only (no free text the user typed)
  properties          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  duration_ms         integer     CHECK (duration_ms IS NULL OR duration_ms >= 0),
  occurred_at         timestamptz NOT NULL,
  received_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.usage_events IS
  'Product-analytics event store (Workstream A). Write via service-role ingest '
  'route only. Read from service-role dashboard queries (Nani). No RLS — see '
  'migration header for rationale.';

-- ---------------------------------------------------------------------------
-- Indexes (IF NOT EXISTS → idempotent)
-- ---------------------------------------------------------------------------

-- Per-user time series (user engagement, session-level queries)
CREATE INDEX IF NOT EXISTS usage_events_user_occurred_idx
  ON public.usage_events (user_id, occurred_at DESC);

-- Per-feature time series (feature adoption over time)
CREATE INDEX IF NOT EXISTS usage_events_feature_occurred_idx
  ON public.usage_events (feature, occurred_at DESC);

-- Per-org time series (org-level dashboard, billing context)
CREATE INDEX IF NOT EXISTS usage_events_org_occurred_idx
  ON public.usage_events (organization_id, occurred_at DESC);

-- Per-event-name time series (funnel + event-type rollups)
CREATE INDEX IF NOT EXISTS usage_events_name_occurred_idx
  ON public.usage_events (event_name, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- Refresh / maintenance note
-- ---------------------------------------------------------------------------
--
-- This table has no materialized view itself; the rollup MVs are in
-- 087_usage_rollups.sql. A periodic VACUUM / ANALYZE is handled by
-- Supabase's default autovacuum configuration. For very high write volumes
-- consider setting fillfactor=90 on this table.
