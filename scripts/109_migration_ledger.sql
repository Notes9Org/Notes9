-- 109_migration_ledger.sql
--
-- Migration ledger for hand-run scripts. There is no migration runner here;
-- scripts in scripts/ are applied by hand, so the database itself must record
-- what has been applied. This creates that record and establishes the
-- convention:
--
--   EVERY future hand-run script MUST end with its own ledger row:
--
--     INSERT INTO public.schema_migrations (filename, checksum, applied_by)
--     VALUES ('NNN_name.sql', '<sha256 of the file, or ''manual''>', current_user)
--     ON CONFLICT (filename) DO NOTHING;
--
-- Then `SELECT filename FROM public.schema_migrations ORDER BY filename`
-- answers "what has been run against this database".
--
-- The backfill below records every .sql file present in scripts/ as of
-- 2026-08-04 with checksum 'backfill' (their content at apply time is
-- unknowable after the fact). Idempotent: CREATE TABLE IF NOT EXISTS +
-- ON CONFLICT DO NOTHING throughout.

BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename   text PRIMARY KEY,
  checksum   text,
  applied_at timestamptz DEFAULT now(),
  applied_by text
);

-- Ops-only table: same posture as scripts/111-112. RLS on with no policies
-- plus revoked grants keeps it invisible to anon/authenticated via PostgREST;
-- postgres/service_role are unaffected.
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.schema_migrations FROM PUBLIC, anon, authenticated;

-- Backfill: every .sql file in scripts/ at ledger creation.
INSERT INTO public.schema_migrations (filename, checksum, applied_by)
SELECT f, 'backfill', current_user
FROM unnest(ARRAY[
  '001_create_tables.sql',
  '002_enable_rls.sql',
  '003_seed_data.sql',
  '003_setup_storage.sql',
  '004_create_literature_reviews.sql',
  '004_create_profile_trigger.sql',
  '005_fix_organization_isolation.sql',
  '009_fix_samples_rls.sql',
  '010_auto_add_project_members.sql',
  '011_complete_samples_rls.sql',
  '012_complete_protocols_rls.sql',
  '012_protocols_update_delete_rls.sql',
  '013_complete_equipment_rls.sql',
  '014_storage_bucket_setup.sql',
  '015_fix_update_policies.sql',
  '016_add_experiments_delete_policy.sql',
  '018_create_votes_table.sql',
  '019_chat_sessions.sql',
  '019_experiment_protocols_rls.sql',
  '020_chat_messages.sql',
  '021_lab_note_protocols.sql',
  '023_fix_experiment_protocols_rls.sql',
  '024_unique_names_constraints.sql',
  '025_avatars_bucket.sql',
  '025_fix_samples_select_project_members.sql',
  '026_dashboard_tasks.sql',
  '027_literature_pdf_support_down.sql',
  '027_literature_pdf_support.sql',
  '028_profile_tour_status.sql',
  '030_papers_writing.sql',
  '030_protocols_add_project_experiment.sql',
  '036_literature_catalog_placement.sql',
  '037_chat_sessions_protocol_id.sql',
  '038_chat_sessions_messages_rls.sql',
  '039_content_diffs.sql',
  '040_protocol_document_templates.sql',
  '041_protocol_templates_user_bucket.sql',
  '042_content_diffs_diff_segments.sql',
  '043_content_diffs_structure_hints.sql',
  '044_experiment_data_workbook_links_chat_metadata.sql',
  '045_user_bucket_experiment_and_profile_rls.sql',
  '046_chat_researcher_profiles.sql',
  '046_sample_molecular_files_and_links.sql',
  '047_chat_memories.sql',
  '047_repair_sample_primary_experiment_function.sql',
  '048_sample_history_and_qc.sql',
  '049_experiment_steps.sql',
  '050_rls_lockdown.sql',
  '051_storage_privacy.sql',
  '052_dashboard_surfaces.sql',
  '053_supabase_rls_migration.sql',
  '056_agent_least_privilege_role.sql',
  '057_security_hardening.sql',
  '058_rls_perf_uid_wrap.sql',
  '059_resolve_entity_scope_fn.sql',
  '060_sample_files_ensure.sql',
  '061_sample_children_org_rls.sql',
  '062_lab_note_drafts.sql',
  '063_lab_note_versions.sql',
  '064_pgcrypto_digest_resolvable.sql',
  '065_fix_lab_notes_trigger_search_path.sql',
  '066_commit_lab_note.sql',
  '066_profile_onboarding.sql',
  '067_protocol_versions.sql',
  '068_chunk_enqueue_security_definer.sql',
  '069_agent_runs_org_index.sql',
  '070_chat_memory_vector_indexes.sql',
  '071_match_memory_rpcs.sql',
  '072_chat_researcher_profiles_jsonb.sql',
  '073_chat_memory_invalidation.sql',
  '074_consolidation_queue.sql',
  '075_consolidation_attempts_guard.sql',
  '076_agent_artifact_drafts.sql',
  '077_chat_procedures.sql',
  '078_fix_match_rpcs_volatile.sql',
  '079_agent_trace_capture.sql',
  '080_chat_entities.sql',
  '081_chat_memories_bm25.sql',
  '082_agent_telemetry_indexes_and_usage_view.sql',
  '083_semantic_chunks_hnsw_index.sql',
  '084_chat_attachments_capture.sql',
  '085_usage_events.sql',
  '086_query_classification.sql',
  '087_usage_rollups.sql',
  '088_plans_and_quotas.sql',
  '089_session_rolling_summary.sql',
  '090_chat_attachments_insert_policy.sql',
  '091_chat_sessions_kind_metadata.sql',
  '092_chat_folders.sql',
  '092_literature_staging_ttl.sql',
  '093_session_active_attachments.sql',
  '094_artifact_sources.sql',
  '095_free_tier_ai_quotas.sql',
  '096_drop_dead_telemetry.sql',
  '097_user_ai_permissions.sql',
  '098_papers_experiment_id.sql',
  '099_semantic_chunks_expires_at.sql',
  '100_semantic_chunks_context.sql',
  '101_semantic_chunks_chat_attachment_type.sql',
  '102_experiment_summary_enqueue.sql',
  '103_recently_touched.sql',
  '104_claim_consolidations_per_user.sql',
  '105_experiment_summary_org_fallback.sql',
  '107_content_addressed_chunks.sql',
  '111_revoke_security_definer_grants.sql',
  '112_revoke_public_execute_chunk_jobs_delete.sql'
]) AS f
ON CONFLICT (filename) DO NOTHING;

-- This script records itself — the pattern every future script copies.
INSERT INTO public.schema_migrations (filename, checksum, applied_by)
VALUES ('109_migration_ledger.sql', 'backfill', current_user)
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- Verify:
--   SELECT count(*) FROM public.schema_migrations;  -- 107 on first run
--   SELECT has_table_privilege('anon', 'public.schema_migrations', 'SELECT');  -- false
