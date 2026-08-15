-- 115_revoke_plans_and_organization_plan.sql
--
-- N9-10 (SEC-005): `plans` and `organization_plan`
-- (088_plans_and_quotas.sql) ship with no RLS and no REVOKE, so Postgres's
-- default table-owner/schema grants leave them reachable by anon and
-- authenticated via PostgREST. 088's header notes the tier-quota feature is
-- "NOT applied yet" / intentionally off the hot path, so there is no
-- legitimate anon/authenticated reader today; service_role (the quota
-- reconciler, per 095_free_tier_ai_quotas.sql) keeps full access -- REVOKE
-- does not touch role grants other than the two named here.
--
-- Idempotent; safe to re-run.

BEGIN;

REVOKE ALL ON TABLE public.plans, public.organization_plan FROM anon, authenticated;

COMMIT;

-- Verify:
--   SELECT has_table_privilege('authenticated', 'public.plans', 'SELECT');            -- expect false
--   SELECT has_table_privilege('authenticated', 'public.organization_plan', 'SELECT'); -- expect false
--   SELECT has_table_privilege('service_role', 'public.plans', 'SELECT');              -- expect true (unaffected)

-- DOWN (rollback -- exact inverse of REVOKE ALL; only run if a verified
-- regression requires reverting):
-- BEGIN;
-- GRANT ALL ON TABLE public.plans, public.organization_plan TO anon, authenticated;
-- COMMIT;
