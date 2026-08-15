-- 114_rls_helper_functions_reconstruction.sql
--
-- N9-7 (SEC-005): get_user_organization_id(uuid), is_org_admin(uuid,uuid) and
-- is_active_org_member(uuid,uuid) are SECURITY DEFINER RLS-policy helpers with
-- NO committed CREATE FUNCTION body anywhere in scripts/*.sql -- they exist
-- only in the live database. 111_revoke_security_definer_grants.sql and
-- 112_revoke_public_execute_chunk_jobs_delete.sql both document (from
-- pg_policies, 2026-08-02) that ~42 RLS policies call them:
--   get_user_organization_id(uuid)     30 policies
--   is_org_admin(uuid, uuid)            9 policies
--   is_active_org_member(uuid, uuid)    3 policies
-- A fresh/DR/staging environment built from tracked SQL alone never gets
-- these functions at all, so every policy that calls them fails closed (the
-- function doesn't exist) or, if this file is skipped and someone hand-adds a
-- permissive stub, fails open. This migration reproduces them.
--
-- ⚠️ RECONSTRUCTED, NOT DUMPED -- reconcile against live via
--   SELECT pg_get_functiondef(oid) FROM pg_proc
--   WHERE proname IN ('get_user_organization_id','is_org_admin','is_active_org_member');
--   before deploying to any environment that already has these functions
--   hand-created live. CREATE OR REPLACE will silently overwrite whatever is
--   there -- diff first, don't trust this file blind.
--
-- Contract inferred from committed callers, not from the live source:
--   get_user_organization_id(uuid) -- used as
--     `organization_id = get_user_organization_id(auth.uid())` in
--     004_create_literature_reviews.sql, 012_protocols_update_delete_rls.sql,
--     012_complete_protocols_rls.sql, 019_experiment_protocols_rls.sql,
--     013_complete_equipment_rls.sql, 023_fix_experiment_protocols_rls.sql,
--     027_literature_pdf_support.sql, 040_protocol_document_templates.sql --
--     takes a user id, returns that user's organization_id. Same shape as
--     053_supabase_rls_migration.sql's committed my_org_id(), which reads
--     `SELECT organization_id FROM public.profiles WHERE id = auth.uid()`,
--     except this variant takes the user id as a parameter instead of always
--     using the caller.
--   is_org_admin(uuid, uuid) / is_active_org_member(uuid, uuid) -- no committed
--     caller exists (their referencing policies were themselves never
--     committed -- that gap is exactly what this migration and N9-7 close for
--     get_user_organization_id; these two are reconstructed by name and by
--     the 111/112 comment describing them as low-value boolean probes over
--     caller-supplied uuids, matching the (p_user_id, p_organization_id)
--     argument order the guard clause below implies). Reconcile these two
--     against live especially carefully.
--
-- Security fix applied here (the actual point of N9-7): each function now
-- guards on the caller's own identity, so probing with someone else's user id
-- returns NULL instead of leaking another user's admin/membership status or
-- organization id.
--
-- Idempotent (CREATE OR REPLACE); no data change.

-- ────────────────────────────────────────────────────────────────────────────
-- get_user_organization_id(p_user_id uuid) -> the organization_id of that user,
-- but only when the caller is asking about themselves.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_organization_id(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id <> auth.uid() THEN
    RETURN NULL;
  END IF;

  RETURN (SELECT organization_id FROM public.profiles WHERE id = p_user_id);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- is_org_admin(p_user_id uuid, p_organization_id uuid) -> true if p_user_id is
-- an admin of p_organization_id, but only when the caller is asking about
-- themselves.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_org_admin(p_user_id uuid, p_organization_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id <> auth.uid() THEN
    RETURN NULL;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_user_id
      AND organization_id = p_organization_id
      AND role = 'admin'
  );
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- is_active_org_member(p_user_id uuid, p_organization_id uuid) -> true if
-- p_user_id is a member of p_organization_id, but only when the caller is
-- asking about themselves.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_active_org_member(p_user_id uuid, p_organization_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id <> auth.uid() THEN
    RETURN NULL;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_user_id
      AND organization_id = p_organization_id
  );
END;
$$;

-- Verify:
--   SELECT public.get_user_organization_id(auth.uid());        -- your own org id
--   SELECT public.get_user_organization_id(gen_random_uuid());  -- NULL
--   SELECT public.is_org_admin(gen_random_uuid(), gen_random_uuid());        -- NULL
--   SELECT public.is_active_org_member(gen_random_uuid(), gen_random_uuid()); -- NULL

-- DOWN (rollback -- fresh/empty environments only; on an environment that
-- already has these functions live with ~42 policies depending on them,
-- dropping breaks every one of those policies. Do not run against a live
-- environment without confirming no policy still references these names):
-- DROP FUNCTION IF EXISTS public.get_user_organization_id(uuid);
-- DROP FUNCTION IF EXISTS public.is_org_admin(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.is_active_org_member(uuid, uuid);
