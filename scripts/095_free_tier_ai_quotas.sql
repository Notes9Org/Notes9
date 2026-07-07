-- ===========================================================================
-- 095_free_tier_ai_quotas.sql
--
-- FREE-TIER AI METERING — durable usage ledger + quota counters.
--
-- Purpose: back the free-trial limits (20 literature AI searches per ISO week
-- + $5 of AI usage per calendar month, per USER) with Postgres as the source
-- of truth. Redis/in-process counters are rebuildable caches only — they
-- reset on deploy and must never be authoritative for billing-adjacent state.
--
-- Additive, idempotent, safe to re-run. NO RLS on these tables: they are
-- written exclusively by the Python agent backend through the service-role
-- key (same convention as agent_runs / 085 usage_events) — per-request RLS
-- policies on write-hot tables caused the prior connection-pool outage.
--
-- Hot-path contract (mirrors 088's mandate):
--   * Enforcement WRITES: one single-row upsert per AI action via the
--     increment_usage_counter() RPC — atomic, no read-modify-write.
--   * Enforcement READS: single-row PK lookups, optionally cached in-process
--     for 30-60s. NEVER a per-request JOIN or aggregate.
--   * The ai_usage_ledger is append-only audit ground truth; aggregates over
--     it run only in the nightly reconciler / v1.1 usage-breakdown cache.
--
-- Depends on: 088_plans_and_quotas.sql (plans / organization_plan). Its DDL
-- is idempotent, so it is INCLUDED below (section 4) to remove the ordering
-- footgun — applying 095 alone yields a complete, consistent state whether
-- or not 088 was applied first.
--
-- Applied: NOT YET — to be applied by the dedicated Supabase operator agent
-- after human review.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1.  public.ai_usage_ledger — append-only record of every metered AI call
--
--     One row per LLM/embedding call attributed to a user (chat, literature
--     search pipeline, biomni, embeddings-estimate, …). Agent runs remain
--     ledgered in agent_runs; they are NOT duplicated here. The reconciler
--     therefore sums BOTH sources for the monthly $ budget.
--
--     counted_search: true only on the single row that represents a
--     completed, non-cached, non-continuation literature search run — the
--     rows for that search's internal LLM calls carry counted_search=false,
--     so COUNT(*) WHERE counted_search never over-counts the 20/week quota.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_usage_ledger (
  id               uuid          NOT NULL DEFAULT gen_random_uuid(),
  user_id          uuid          NOT NULL,
  organization_id  uuid          NULL,
  feature          text          NOT NULL,
  model_id         text          NULL,
  tokens_in        bigint        NOT NULL DEFAULT 0,
  tokens_out       bigint        NOT NULL DEFAULT 0,
  cache_read       bigint        NOT NULL DEFAULT 0,
  cache_write      bigint        NOT NULL DEFAULT 0,
  cost_usd         numeric(12,6) NOT NULL DEFAULT 0,
  web_searches     integer       NOT NULL DEFAULT 0,
  estimated        boolean       NOT NULL DEFAULT false,
  counted_search   boolean       NOT NULL DEFAULT false,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_ledger_pkey PRIMARY KEY (id)
);

-- Idempotent add for databases where ai_usage_ledger already existed before the
-- web_searches column (CREATE TABLE IF NOT EXISTS above skips such tables).
ALTER TABLE public.ai_usage_ledger
  ADD COLUMN IF NOT EXISTS web_searches integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ai_usage_ledger_user_created_idx
  ON public.ai_usage_ledger (user_id, created_at);

CREATE INDEX IF NOT EXISTS ai_usage_ledger_feature_created_idx
  ON public.ai_usage_ledger (feature, created_at);


-- ---------------------------------------------------------------------------
-- 2.  public.ai_usage_counters — durable, atomic quota counters
--
--     kind:        'lit_search_week'       (value = searches this ISO week)
--                  'cost_usd_micro_month'  (value = micro-dollars this month;
--                                           1 USD = 100000, matching the
--                                           quota.py micro-dollar convention)
--     window_key:  'YYYY-Www' (ISO week, UTC) or 'YYYY-MM' (calendar month,
--                  UTC). Old windows become inert rows; a periodic cleanup
--                  may delete rows older than ~3 months.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_usage_counters (
  user_id     uuid        NOT NULL,
  kind        text        NOT NULL,
  window_key  text        NOT NULL,
  value       bigint      NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_counters_pkey PRIMARY KEY (user_id, kind, window_key)
);


-- ---------------------------------------------------------------------------
-- 3.  increment_usage_counter() — the ONLY write path for counters
--
--     Single-statement atomic upsert; returns the post-increment value so
--     enforcement can piggyback on the write without a second round trip.
--     SECURITY DEFINER + service-role-only EXECUTE: browser/authenticated
--     roles can neither read nor forge usage.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.increment_usage_counter(
  p_user_id     uuid,
  p_kind        text,
  p_window_key  text,
  p_amount      bigint
) RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.ai_usage_counters AS c (user_id, kind, window_key, value, updated_at)
  VALUES (p_user_id, p_kind, p_window_key, GREATEST(p_amount, 0), now())
  ON CONFLICT (user_id, kind, window_key)
  DO UPDATE SET value = c.value + GREATEST(p_amount, 0), updated_at = now()
  RETURNING value;
$$;

REVOKE ALL ON FUNCTION public.increment_usage_counter(uuid, text, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_usage_counter(uuid, text, text, bigint) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_usage_counter(uuid, text, text, bigint) TO service_role;

REVOKE ALL ON TABLE public.ai_usage_ledger  FROM anon, authenticated;
REVOKE ALL ON TABLE public.ai_usage_counters FROM anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4.  Plans catalogue (folded from unapplied 088 — idempotent) + free-tier
--     limits for the two new quotas.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.plans (
  id          text        NOT NULL,
  name        text        NOT NULL,
  limits      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plans_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.organization_plan (
  organization_id  uuid        NOT NULL,
  plan_id          text        NOT NULL,
  status           text        NOT NULL DEFAULT 'active',
  effective_at     timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_plan_pkey
    PRIMARY KEY (organization_id),
  CONSTRAINT organization_plan_organization_id_fkey
    FOREIGN KEY (organization_id)
    REFERENCES public.organizations (id)
    ON DELETE CASCADE,
  CONSTRAINT organization_plan_plan_id_fkey
    FOREIGN KEY (plan_id)
    REFERENCES public.plans (id)
);

CREATE INDEX IF NOT EXISTS organization_plan_plan_id_idx
  ON public.organization_plan (plan_id);

-- Ensure the free plan exists (values copied from 088's seed intent), then
-- overlay ONLY the two new free-tier quota keys so re-running never clobbers
-- other limits an admin may have tuned.
INSERT INTO public.plans (id, name, limits)
VALUES ('free', 'Free', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

UPDATE public.plans
SET limits = limits
      || jsonb_build_object(
           'monthly_ai_cost_usd', 5,
           'weekly_lit_searches', 20
         ),
    updated_at = now()
WHERE id = 'free';
