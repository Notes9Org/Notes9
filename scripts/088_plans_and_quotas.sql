-- 088_plans_and_quotas.sql
--
-- TIER-READY QUOTA SCHEMA — additive, idempotent, no RLS, NOT applied yet.
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ARCHITECTURE NOTE — READ BEFORE WIRING ANY APPLICATION CODE            ║
-- ║                                                                          ║
-- ║  This schema is intentionally OFF the request hot path in v1.           ║
-- ║  v1 enforcement uses static config constants:                            ║
-- ║    • AI/catalyst/agents/core/quota.py  (RPM / concurrency / daily token ║
-- ║      limits, read from env vars, enforced via Redis sliding windows)     ║
-- ║    • Notes9/lib/limits/config.ts       (body / upload / array caps,     ║
-- ║      enforced by Edge middleware guards)                                 ║
-- ║                                                                          ║
-- ║  When paid tiers activate, reads of public.plans and                    ║
-- ║  public.organization_plan MUST be Redis-cached (5–15 min TTL,           ║
-- ║  single-flight on miss, cache busted on admin write).  NEVER query       ║
-- ║  these tables per request — that would reintroduce the connection-slot   ║
-- ║  exhaustion issue that caused the prior production outage.               ║
-- ║                                                                          ║
-- ║  Intended read path for paid tier enforcement:                           ║
-- ║    1. On request: read Redis cache key "plan:<org_id>"                  ║
-- ║    2. Cache miss: single-flight DB read of organization_plan + plans,    ║
-- ║       populate cache, return result                                      ║
-- ║    3. On admin plan change: invalidate "plan:<org_id>" in Redis          ║
-- ║    Per-request JOIN to these tables is FORBIDDEN.                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Tables created:
--   public.plans              — tier catalogue (free / pro / team / …)
--   public.organization_plan  — maps each org to exactly one plan
--
-- Indexes created:
--   organization_plan_plan_id_idx  — reverse lookup (all orgs on a plan)
--   (PKs on both tables provide the primary index)
--
-- Seed rows:
--   INSERT INTO public.plans (id='free') ON CONFLICT (id) DO NOTHING
--
-- Safety guarantees:
--   • Additive only — no DROP, no ALTER TYPE, no column renames, no data loss.
--   • Idempotent — every statement uses IF NOT EXISTS or ON CONFLICT DO NOTHING;
--     safe to re-run on a live database.
--   • No RLS — these tables are service-role reads only.  RLS is NOT enabled.
--     Do not add RLS policies here (prior auth-path RLS caused connection exhaustion).
--   • No auth-checking functions — no calls to auth.uid(), auth.getUser(), or
--     any Supabase auth helper inside this file.
--
-- Applied: NOT YET — to be applied by the dedicated Supabase operator agent
-- after human review.
--

-- ---------------------------------------------------------------------------
-- 1.  public.plans — tier catalogue
--
--     id:      short slug, e.g. 'free', 'pro', 'team'.  Human-readable PK so
--              application code can branch on it without joining back.
--     limits:  jsonb envelope of per-tier ceiling values.  Keys intentionally
--              mirror the env-var-driven constants in quota.py / config.ts so
--              the future cached-read path can overlay these values over the
--              static defaults with zero schema changes.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.plans (
  id          text        NOT NULL,
  name        text        NOT NULL,
  limits      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plans_pkey PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- 2.  public.organization_plan — per-org plan assignment
--
--     organization_id:  FK to public.organizations(id) — uuid, confirmed from
--                       000_full_script.sql line 627-637 (PK constraint
--                       organizations_pkey PRIMARY KEY (id), type uuid).
--     plan_id:          FK to public.plans(id).
--     status:           'active' | 'trialing' | 'past_due' | 'canceled'
--                       — kept open-ended in text so future billing states
--                       do not require a migration.
--     effective_at:     when this plan assignment took effect; useful for
--                       auditing and pro-rating calculations.
--     updated_at:       last mutation timestamp; bumped on every admin write
--                       so the Redis cache bust knows the row changed.
--
--     One row per org enforced by PRIMARY KEY on organization_id.
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 3.  Indexes
--
--     The PKs already provide an index on organization_id (for the common
--     "what plan is this org on?" lookup) and on plans.id.
--     The one additional index covers the reverse direction: "which orgs are
--     on a given plan?" — needed for admin dashboards and bulk plan migration.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS organization_plan_plan_id_idx
  ON public.organization_plan (plan_id);

-- ---------------------------------------------------------------------------
-- 4.  Seed: 'free' plan
--
--     Limit values are taken verbatim from the v1 static constants so the
--     future DB-driven enforcement path is consistent with today's behaviour
--     without requiring any code change.
--
--     Source for each field:
--       rpm              20           quota.py line 60: RPM_LIMIT = int(os.getenv("QUOTA_RPM_LIMIT", "20"))
--       concurrency      3            quota.py line 63: CONCURRENCY_LIMIT = int(os.getenv("QUOTA_CONCURRENCY_LIMIT", "3"))
--       daily_tokens     5000000      quota.py line 66: DAILY_TOKEN_LIMIT = int(os.getenv("QUOTA_DAILY_TOKEN_LIMIT", "5000000"))
--       daily_cost_usd   null         quota.py line 70: DAILY_COST_LIMIT_USD = None when QUOTA_DAILY_COST_USD unset (disabled)
--       run_token_ceiling 300000      limits.py line 62: RUN_TOKEN_CEILING = int(os.getenv("NOTES9_MAX_RUN_TOKENS", "300000"))
--       max_uploads      50           config.ts line 33: ATTACHMENTS_ITEMS_MAX = 50
--       body_bytes_max   26214400     config.ts line 18: BODY_BYTES_MAX = 25 * 1024 * 1024 (= 26 214 400)
--       history_items_max 400         config.ts line 23: HISTORY_ITEMS_MAX = 400
--       query_chars_max  100000       config.ts line 26: QUERY_CHARS_MAX = 100_000
--
--     NOTE: pro/team rows are intentionally omitted — those tiers are not yet
--     defined.  Add them in a future migration once pricing is confirmed.
--     The commented-out block below is a placeholder for reviewers.
--
--       -- TODO: seed 'pro' plan when pricing is confirmed
--       -- INSERT INTO public.plans (id, name, limits)
--       -- VALUES (
--       --   'pro',
--       --   'Pro',
--       --   '{
--       --     "rpm": <TBD>,
--       --     "concurrency": <TBD>,
--       --     "daily_tokens": <TBD>,
--       --     "daily_cost_usd": <TBD>,
--       --     "run_token_ceiling": <TBD>,
--       --     "max_uploads": <TBD>,
--       --     "body_bytes_max": <TBD>,
--       --     "history_items_max": <TBD>,
--       --     "query_chars_max": <TBD>
--       --   }'::jsonb
--       -- )
--       -- ON CONFLICT (id) DO NOTHING;
--
--       -- TODO: seed 'team' plan when pricing is confirmed
--       -- INSERT INTO public.plans (id, name, limits)
--       -- VALUES (
--       --   'team',
--       --   'Team',
--       --   '{...}'::jsonb
--       -- )
--       -- ON CONFLICT (id) DO NOTHING;
-- ---------------------------------------------------------------------------

INSERT INTO public.plans (id, name, limits)
VALUES (
  'free',
  'Free',
  '{
    "rpm": 20,
    "concurrency": 3,
    "daily_tokens": 5000000,
    "daily_cost_usd": null,
    "run_token_ceiling": 300000,
    "max_uploads": 50,
    "body_bytes_max": 26214400,
    "history_items_max": 400,
    "query_chars_max": 100000
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;
