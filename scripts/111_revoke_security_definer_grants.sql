-- 111_revoke_security_definer_grants.sql
--
-- SECURITY FIX. Eight SECURITY DEFINER functions were granted EXECUTE to the
-- `anon` and `authenticated` roles. All eight take their scope as a
-- caller-supplied parameter and none checks auth.uid(), so PostgREST exposed
-- them at /rest/v1/rpc/<name> to anyone holding the public anon key --
-- including bm25_chat_memories(match_user_id, query_text, match_count), which
-- needs no embedding: a user id and a search string read that user's private
-- chat memories.
--
-- SECURITY DEFINER means RLS is bypassed (owner is postgres), so the correct
-- RLS policies on chat_memories / chat_episode_summaries / chat_procedures
-- provided no protection here.
--
-- Safe to revoke: Catalyst calls all eight through the SERVICE ROLE client
-- (AI/catalyst/config/settings.py -> core/memory/store.py). The Notes9
-- frontend never calls them. service_role retains EXECUTE.
--
-- This matches the pattern migrations 080 and 081 already use (service_role
-- only); it was never back-applied to the functions defined in 071/074/075/078.

BEGIN;

-- Memory recall: cross-user read of chat memories, episodes, procedures, entities.
REVOKE EXECUTE ON FUNCTION public.match_chat_memories(uuid, extensions.vector, integer, double precision)     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_episode_summaries(uuid, extensions.vector, integer, double precision) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_chat_procedures(uuid, extensions.vector, integer, double precision)   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_chat_entities(uuid, extensions.vector, integer, double precision)     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bm25_chat_memories(uuid, text, integer)                                    FROM anon, authenticated;

-- Job control: unauthenticated writes / queue corruption.
REVOKE EXECUTE ON FUNCTION public.claim_due_consolidations(integer, integer, integer)  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finish_consolidation(uuid, boolean)                  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chunk_jobs_delete_pending_for_source(text, uuid)     FROM anon, authenticated;

COMMIT;

-- DELIBERATELY NOT REVOKED -- these are RLS policy helpers. A policy expression
-- only evaluates if the invoking role holds EXECUTE on the functions it calls,
-- so revoking these would break RLS across most of the schema. Measured
-- dependencies (pg_policies, 2026-08-02):
--
--   my_org_id()                        57 policies
--   get_user_organization_id(uuid)     30 policies
--   is_org_admin(uuid, uuid)            9 policies
--   can_access_sample(uuid)             4 policies
--   is_active_org_member(uuid, uuid)    3 policies
--
-- my_org_id() already guards on auth.uid(). The other four take caller-supplied
-- uuids and return only a boolean or an org id -- a low-value probe, not a data
-- read. Harden them with an internal auth.uid() check, never by revoking.
--
-- ALSO NOT REVOKED: nine trigger functions (handle_new_user,
-- queue_semantic_chunk_job, enqueue_protocol_chunk_job,
-- queue_experiment_summary_chunk_job, enqueue_literature_review_chunk_job,
-- add_creator_to_project_members, sync_experiment_data_project_id,
-- trg_write_document_version, _enforce_org_invitation_user_update). PostgREST
-- does not expose trigger-returning functions as RPCs, so their grants are
-- inert. Left alone on purpose -- revoking them risks breaking the triggers.

-- Rollback (only if a client genuinely needs direct RPC access, which would
-- itself be the bug):
--   GRANT EXECUTE ON FUNCTION public.match_chat_memories(uuid, extensions.vector, integer, double precision) TO authenticated;
