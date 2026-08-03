-- 112_revoke_public_execute_chunk_jobs_delete.sql
--
-- Follow-up to 111. That migration revoked EXECUTE from the named roles
-- `anon` and `authenticated`, which cleared 7 of the 8 targets. It did NOT
-- clear `chunk_jobs_delete_pending_for_source`, because that function's grant
-- is to **PUBLIC**, not to a named role:
--
--   chunk_jobs_delete_pending_for_source(text,uuid)
--     acl = "=X/postgres | postgres=X/postgres | service_role=X/postgres"
--            ^^ bare grantee == PUBLIC
--
-- `anon` and `authenticated` inherit PUBLIC, and REVOKE ... FROM <role> does
-- not remove a PUBLIC grant. Postgres also grants EXECUTE to PUBLIC by default
-- on every new function, so this is the shape any future SECURITY DEFINER
-- function will have unless it is explicitly revoked.
--
-- This function is SECURITY DEFINER, takes its target as caller-supplied
-- parameters, has no auth.uid() check, and deletes rows. Left as-is, anyone
-- with the public anon key can delete pending chunk_jobs for any source —
-- silently starving documents of their embeddings.
--
-- The worker calls it with the service role, which is unaffected.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.chunk_jobs_delete_pending_for_source(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.chunk_jobs_delete_pending_for_source(text, uuid) FROM anon, authenticated;

COMMIT;

-- Audited at the same time: every other SECURITY DEFINER function carrying a
-- PUBLIC grant is either a trigger function (prorettype = trigger, never
-- exposed by PostgREST, grant is inert) or one of the five RLS policy helpers
-- that must keep EXECUTE or policies stop evaluating:
--   my_org_id() [57 policies, already guards auth.uid()],
--   get_user_organization_id(uuid) [30], is_org_admin(uuid,uuid) [9],
--   can_access_sample(uuid) [4], is_active_org_member(uuid,uuid) [3].
-- Those four unguarded helpers return only a boolean or an org id. Harden them
-- with an internal auth.uid() check, never by revoking.

-- Verify:
--   SELECT has_function_privilege('anon',
--     'public.chunk_jobs_delete_pending_for_source(text,uuid)'::regprocedure,
--     'EXECUTE');   -- must be false
