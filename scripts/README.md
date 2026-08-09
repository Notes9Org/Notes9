# scripts/ — Supabase migration index

Definitive index of the SQL migration folder. What has actually been applied to the live
database is `public.schema_migrations` — the only migration tracker
([ADR-006](../docs/arch/context-activation/ADR-006-the-ledger-is-the-only-migration-tracker.md)).
Query it, don't infer it from this file or hand-maintain a marker here:

```sql
SELECT filename, applied_at FROM public.schema_migrations ORDER BY 1;
```

## How this folder works

- **`000_full_script.sql` is a live-schema snapshot, tables only, context only — never run it.** Its header says so explicitly: table order/constraints may not be executable. It is the authoritative reference for table and column names ("never infer column names"). Functions, triggers, RLS policies, indexes and RPCs are NOT in it — their source of truth is the numbered migration that created them.
- **Numbered files are append-only migrations**, applied in ascending order by pasting into the Supabase SQL editor (no migration runner). Very large files can hit the editor's connection timeout — 053 and 057 instruct running in parts / one statement at a time.
- **Conventions** (established over time, mandatory for new files):
  - Additive-only and idempotent: `IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP POLICY IF EXISTS` then `CREATE` — every file must be safe to re-run.
  - RLS perf: always wrap `auth.uid()` / `auth.jwt()` as `(select auth.uid())` inside USING/WITH CHECK so it becomes a one-time InitPlan, not per-row (migration 058 retrofitted this everywhere).
  - Background enqueue pattern: trigger functions that INSERT into `chunk_jobs` are `SECURITY DEFINER` so the queue write bypasses the end-user's RLS (068). RPCs use `SECURITY DEFINER + SET search_path = ''`; functions that `SET LOCAL` must be `VOLATILE` (078, 080 house style).
  - Agent/quota tables (`agent_runs`, `ai_usage_*`) have **no per-request RLS** — service-role writes only; per-request RLS on write-hot tables previously caused a connection-pool outage (095 header).
- `001_create_tables.sql` and `051_storage_privacy.sql` are **empty (1-byte) placeholder files** — the numbers are burned, the content lives in the live DB / later migrations.
- Numbering is not gapless and some numbers are shared by two files (collision table at the bottom).
- `utilities/` holds non-migration helper scripts (screenshots, mascot build, desktop data inventory) — not part of the chain.

## Migration index

| # | File | What it does | Key objects |
|---|------|--------------|-------------|
| **— Foundation (000–016)** | | | |
| 000 | `000_full_script.sql` | Live-schema snapshot, tables only. Context only — **never run** | every `public.*` table (orgs → audit_log → chat/agent/semantic tables) |
| 001 | `001_create_tables.sql` | Empty placeholder (1 byte) | — |
| 002 | `002_enable_rls.sql` | Enable RLS on all core tables + first org-scoped policies | `ALTER TABLE … ENABLE ROW LEVEL SECURITY` across core schema |
| 003 | `003_seed_data.sql` | Test seed: default org, protocols, assays, equipment | `INSERT` seed rows |
| 003 | `003_setup_storage.sql` | Public `lab_notes_public` storage bucket + object policies | storage bucket + policies |
| 004 | `004_create_literature_reviews.sql` | Literature citations table + indexes + RLS | `literature_reviews`, org policies, updated_at trigger |
| 004 | `004_create_profile_trigger.sql` | Auto-create profile row on signup | `handle_new_user()`, trigger on `auth.users` |
| 005 | `005_fix_organization_isolation.sql` | Each new user gets their OWN organization (single-user MVP isolation) | rewritten `handle_new_user()` |
| 009 | `009_fix_samples_rls.sql` | Allow standalone samples (no experiment yet) | samples INSERT/SELECT policies |
| 010 | `010_auto_add_project_members.sql` | Project creator auto-added as lead member | `add_creator_to_project_members()` + trigger |
| 011 | `011_complete_samples_rls.sql` | Full CRUD policies for samples | samples policies |
| 012 | `012_complete_protocols_rls.sql` | Protocol INSERT/UPDATE/DELETE policies | protocols policies |
| 012 | `012_protocols_update_delete_rls.sql` | Same content as its 012 twin (duplicate) | protocols policies |
| 013 | `013_complete_equipment_rls.sql` | Equipment module policies | `equipment`, `equipment_usage`, `equipment_maintenance` policies |
| 014 | `014_storage_bucket_setup.sql` | Documents `experiment-files` bucket (create in Dashboard) + object policies | storage policies |
| 015 | `015_fix_update_policies.sql` | UPDATE policies need USING **and** WITH CHECK | projects/experiments UPDATE policies |
| 016 | `016_add_experiments_delete_policy.sql` | Missing DELETE policy for experiments | experiments DELETE policy |
| **— Chat & workspace surfaces (018–052)** | | | |
| 018 | `018_create_votes_table.sql` | Message feedback votes | `message_votes` + RLS |
| 019 | `019_chat_sessions.sql` | Chat sessions table | `chat_sessions` + indexes + updated_at trigger |
| 019 | `019_experiment_protocols_rls.sql` | Policies for experiment↔protocol links | `experiment_protocols` policies |
| 020 | `020_chat_messages.sql` | Chat messages table | `chat_messages` + indexes |
| 021 | `021_lab_note_protocols.sql` | Lab-note↔protocol junction | `lab_note_protocols` + RLS |
| 023 | `023_fix_experiment_protocols_rls.sql` | Relax too-strict 019 policies | experiment_protocols policies |
| 024 | `024_unique_names_constraints.sql` | Unique names (project/org, experiment/project, note title/experiment), dedupes first | unique constraints + `lab_notes_experiment_title_unique` |
| 025 | `025_avatars_bucket.sql` | Public `avatars` bucket policies | storage policies |
| 025 | `025_fix_samples_select_project_members.sql` | Samples SELECT aligned with project_members visibility | samples SELECT policy |
| 026 | `026_dashboard_tasks.sql` | Dashboard To-Do panel | `dashboard_tasks` + RLS |
| 027 | `027_literature_pdf_support.sql` | Literature PDF columns + annotations | `literature_reviews.pdf_*`, `literature_pdf_annotations` + RLS |
| 027 | `027_literature_pdf_support_down.sql` | Rollback for 027 (drops annotation data) | drops table/columns |
| 028 | `028_profile_tour_status.sql` | Onboarding tour flags on profiles | `notes9_tour_completed_at/_skipped_at` |
| 030 | `030_papers_writing.sql` | Writing workspace docs | `papers` + RLS |
| 030 | `030_protocols_add_project_experiment.sql` | Protocols get project/experiment context links | `protocols.project_id/experiment_id` |
| 036 | `036_literature_catalog_placement.sql` | Shared `user` bucket; literature staging vs repository + PDF import status/extracted text | bucket `user`, `catalog_placement`, `pdf_import_status`, `pdf_extracted_text` |
| 037 | `037_chat_sessions_protocol_id.sql` | Scope chats to a protocol (Protocol AI) | `chat_sessions.protocol_id` |
| 038 | `038_chat_sessions_messages_rls.sql` | Owner-only RLS for chat tables | chat_sessions/chat_messages policies |
| 039 | `039_content_diffs.sql` | Append-only content change log (protocol/lab note) | `content_diffs` + RLS |
| 040 | `040_protocol_document_templates.sql` | Uploaded DOCX/PDF protocol templates | `protocol_document_templates` + RLS, `protocols.document_template_id` |
| 041 | `041_protocol_templates_user_bucket.sql` | Move template files into shared `user` bucket | storage policies |
| 042 | `042_content_diffs_diff_segments.sql` | Replace full snapshots with compact diff segments | `content_diffs.diff_segments`, drops snapshot cols |
| 043 | `043_content_diffs_structure_hints.sql` | Structural audit hints (heading trails) | `content_diffs.structure_hints` |
| 044 | `044_experiment_data_workbook_links_chat_metadata.sql` | Workbook snapshots, entity links, chat msg metadata, experiment_data policies | `experiment_data.workbook_snapshot…`, `experiment_data_entity_links`, `chat_messages.metadata` |
| 045 | `045_user_bucket_experiment_and_profile_rls.sql` | `user`-bucket policies for experiment files + avatars | storage policies |
| 046 | `046_chat_researcher_profiles.sql` | Aggregated researcher context for dashboard | `chat_researcher_profiles` + own-read RLS |
| 046 | `046_sample_molecular_files_and_links.sql` | Rich samples, molecular files, many-to-many links | sample columns, `sample_projects/_experiments/_lab_notes/_files`, sync trigger, RLS |
| 047 | `047_chat_memories.sql` | Long-term memory with pgvector embeddings | `chat_memories` (vector 1536) + RLS |
| 047 | `047_repair_sample_primary_experiment_function.sql` | Repair for partial 046 run (dollar-quote failure) | `sync_sample_primary_experiment()` + triggers |
| 048 | `048_sample_history_and_qc.sql` | Sample transfer history + QC records | `sample_transfers`, `sample_qc_records`, `touch_updated_at()`, RLS |
| 049 | `049_experiment_steps.sql` | Ordered workflow steps per experiment | `experiment_steps` + RLS |
| 050 | `050_rls_lockdown.sql` | Audit fix: RLS for tables that had none / no policies | policies on `agent_runs`, `agent_trace_events`, `agent_sessions/_messages`, `mcp_servers`, `semantic_chunks`, `chunk_jobs`, `message_votes` |
| 051 | `051_storage_privacy.sql` | Empty placeholder (1 byte) | — |
| 052 | `052_dashboard_surfaces.sql` | Dashboard whiteboard + calendar | `whiteboard_notes`, `calendar_events` + RLS |
| **— RLS & security era (053–061)** | | | |
| 053 | `053_supabase_rls_migration.sql` | THE org-scoped RLS migration (~765 lines; header says run via `053_supabase_rls_parts/` 01→05 — **that directory is not in this repo**) | `my_org_id()` helper, RLS enabled + policies on ~40 tables |
| 056 | `056_agent_least_privilege_role.sql` | SELECT-only BYPASSRLS role for the Catalyst agent (stops writes even on guard bypass) | role `catalyst_agent` |
| 057 | `057_security_hardening.sql` | 2026-05-27 audit fixes; run statements one at a time | annotation org-isolation, owner-only storage update/delete, experiment-files bucket policies |
| 058 | `058_rls_perf_uid_wrap.sql` | Wrap `auth.uid()` in `(SELECT …)` everywhere (per-row → InitPlan); logic identical to 050/053/057 | recreated policies + `idx_samples_created_by` |
| 059 | `059_resolve_entity_scope_fn.sql` | Entity→org/project scope in one call (was 2–4 API round-trips) | `resolve_entity_scope(text, uuid)` SECURITY INVOKER |
| 060 | `060_sample_files_ensure.sql` | Idempotent catch-up for DBs that missed 046 | sample tables/indexes/trigger/policies re-ensured |
| 061 | `061_sample_children_org_rls.sql` | Sample child tables aligned to 053's org model | `can_access_sample()`, transfers/QC org policies |
| **— Lab-note draft/commit & versions (062–068)** | | | |
| 062 | `062_lab_note_drafts.sql` | Draft/commit split: autosave buffer vs committed audited content | `lab_notes.draft_content/draft_updated_at/draft_author_id` |
| 063 | `063_lab_note_versions.sql` | Read-side enablement for version history (live trigger `trg_write_document_version` owns writes) | `document_versions` indexes + SELECT-only RLS |
| 064 | `064_pgcrypto_digest_resolvable.sql` | Fix `digest()` not resolving (pgcrypto lives in `extensions`) | `public.digest(text/bytea, text)` forwarders |
| 065 | `065_fix_lab_notes_trigger_search_path.sql` | Pin `extensions` onto every lab_notes trigger fn's search_path (autosave/save failures) | ALTER FUNCTION search_path via introspection |
| 066 | `066_commit_lab_note.sql` | Explicit "Save" RPC — sets `app.force_version` so the version trigger always writes | `commit_lab_note()` |
| 066 | `066_profile_onboarding.sql` | Welcome wizard/questionnaire fields | `profiles.notes9_welcome_seen_at`, `research_field`, `job_title`, … |
| 067 | `067_protocol_versions.sql` | Protocol versioning = same hash-chained history as lab notes | trigger attach on `protocols`, `commit_protocol()` |
| 068 | `068_chunk_enqueue_security_definer.sql` | Fix chunk_jobs RLS violation on protocol save — enqueue trigger fns become SECURITY DEFINER | `queue_semantic_chunk_job`, `enqueue_protocol_chunk_job`, … |
| **— Agent memory & telemetry (069–090)** | | | |
| 069 | `069_agent_runs_org_index.sql` | Only high-traffic table missing an org index | `idx_agent_runs_org_created` |
| 070 | `070_chat_memory_vector_indexes.sql` | HNSW ANN indexes for memory recall + btree 047 forgot | HNSW on `chat_memories`/`chat_episode_summaries` embeddings |
| 071 | `071_match_memory_rpcs.sql` | Brings hand-created vector-search RPCs into version control | `match_chat_memories()`, `match_episode_summaries()` |
| 072 | `072_chat_researcher_profiles_jsonb.sql` | Commit hand-created column so migration chain matches live DB | `chat_researcher_profiles.research_user_profile` |
| 073 | `073_chat_memory_invalidation.sql` | Memories go supersede-on-write (contradicted facts stop being recalled) | `invalidated_at`, `superseded_by`, `content_hash` + partial unique index, rewritten `match_chat_memories` |
| 074 | `074_consolidation_queue.sql` | Durable end-of-session consolidation (replaces in-process timers) | `chat_sessions.consolidate_due_at`, `claim_due_consolidations()` (SKIP LOCKED), `finish_consolidation()` |
| 075 | `075_consolidation_attempts_guard.sql` | Park "poison" sessions after N failed claims | attempt counter, replaced claim/finish fns |
| 076 | `076_agent_artifact_drafts.sql` | Draft-first flow for AI-generated files (24 h expiry until saved) | `agent_artifact_drafts` + RLS |
| 077 | `077_chat_procedures.sql` | Procedural memory — 5th memory layer ("HOW the researcher works") | `chat_procedures` + HNSW + `match_chat_procedures()` |
| 078 | `078_fix_match_rpcs_volatile.sql` | CRITICAL recall fix: drop duplicate arg-order overloads (PGRST203) + STABLE→VOLATILE for `SET LOCAL` | recreated match_* functions |
| 079 | `079_agent_trace_capture.sql` | Opt-in observability: prompt-version stamping + sampled replay capture | `agent_runs.prompt_version`, `agent_llm_calls.request_messages`, … |
| 080 | `080_chat_entities.sql` | Cross-session entity linking (header notes it was written before being applied) | `chat_entities`, `memory_entity`, HNSW, `match_chat_entities()`, deny-all RLS |
| 081 | `081_chat_memories_bm25.sql` | BM25 leg to complement vector recall (exact gene names/catalog numbers) | `content_tsv` generated column + GIN, `bm25_chat_memories()` |
| 082 | `082_agent_telemetry_indexes_and_usage_view.sql` | Telemetry indexes + daily usage MV (later dropped by 096) | agent_* indexes, `agent_usage_daily` MV |
| 083 | `083_semantic_chunks_hnsw_index.sql` | ANN index for RAG passage retrieval (fixes seq-scan KNN; sets embedding dim first) | `idx_semantic_chunks_embedding_hnsw` |
| 084 | `084_chat_attachments_capture.sql` | Capture out-of-band `chat_attachments` table into VCS (safe no-op on live) | `chat_attachments` + indexes + RLS |
| 085 | `085_usage_events.sql` | Product telemetry event store — **no writers since the PostHog pivot; dropped by 096** | `usage_events` + indexes |
| 086 | `086_query_classification.sql` | Query category/intent columns on agent_runs (index dropped by 096) | `agent_runs.query_category/query_intent` |
| 087 | `087_usage_rollups.sql` | Daily MV rollups for product telemetry (dropped by 096) | `feature_usage_daily`, `question_categories_daily` MVs |
| 088 | `088_plans_and_quotas.sql` | Tier-ready quota schema, intentionally OFF the hot path (header: "NOT applied yet" at time of writing) | `plans`, `organization_plan` |
| 089 | `089_session_rolling_summary.sql` | Rolling summary of turns aged out of the verbatim window | `chat_sessions.rolling_summary` (+ meta cols) |
| 090 | `090_chat_attachments_insert_policy.sql` | Browser-client INSERT/UPDATE own attachments (routes use anon client, not service role) | chat_attachments insert/update policies |
| **— Sessions, literature & context backend (091–105)** | | | |
| 091 | `091_chat_sessions_kind_metadata.sql` | Literature searches unified onto chat sessions | `chat_sessions.kind` (default 'chat') + `metadata` jsonb |
| 092 | `092_chat_folders.sql` | User folders for organising chats | `chat_folders` + `chat_sessions.folder_id`, owner RLS |
| 092 | `092_literature_staging_ttl.sql` | Staged ("read without saving") papers expire after 7 days | `literature_reviews.staged_expires_at` + partial index |
| 093 | `093_session_active_attachments.sql` | Persist session "focus" refs so follow-up turns keep the attachment | `chat_sessions` active-attachments column |
| 094 | `094_artifact_sources.sql` | Persist the recipe (code/spec) behind each artifact + version lineage | `agent_artifact_drafts.source_kind/source` + root index |
| 095 | `095_free_tier_ai_quotas.sql` | Free-tier metering: Postgres is source of truth, Redis a cache; no RLS (service-role writes) | `ai_usage_ledger`, `ai_usage_counters`, `increment_usage_counter()`, `plans`/`organization_plan` |
| 096 | `096_drop_dead_telemetry.sql` | Drop write-only telemetry (analytics moved to PostHog); keeps quota tables + `agent_runs` | drops `agent_llm_calls`, `agent_tool_calls`, `agent_trace_events`, `usage_events`, `literature_search_telemetry`, 3 MVs |
| 097 | `097_user_ai_permissions.sql` | Per-user consent for the agent reading private lab data (ask/always/never) | `user_ai_permissions` + owner RLS |
| 098 | `098_papers_experiment_id.sql` | Writing docs optionally link to an experiment | `papers.experiment_id` + index |
| 099 | `099_semantic_chunks_expires_at.sql` | Staged-literature chunks self-expire with the paper's 7-day TTL | `semantic_chunks.expires_at` + partial index |
| 100 | `100_semantic_chunks_context.sql` | Contextual Retrieval blurb stored per chunk (prepended before embedding) | `semantic_chunks.context` |
| 101 | `101_semantic_chunks_chat_attachment_type.sql` | Allow `chat_attachment` as chunk source_type (widening CHECK, NOT VALID→VALIDATE) | `semantic_chunks_source_type_check` |
| 102 | `102_experiment_summary_enqueue.sql` | Deterministic `experiment_summary` chunk producer (SQL-composed, no LLM) + backfill | `experiment_summary_payload()`, `queue_experiment_summary_chunk_job()`, `trg_experiment_summary_chunk` |
| 103 | `103_recently_touched.sql` | Recency half of the focus signal: last-write-wins (user, entity) register | `recently_touched` + owner RLS (FORCE) |
| 104 | `104_claim_consolidations_per_user.sql` | At most one consolidation claim per user per batch (near-duplicate facts guard) | replaced `claim_due_consolidations()` |
| 105 | `105_experiment_summary_org_fallback.sql` | Fix 102 backfill: org fallback via creator's profile + re-enqueue failed jobs | patched `experiment_summary_payload()` |

## Subsystem guides

### Core domain
`000` (snapshot) shows the full entity model: `organizations → profiles → projects/project_members → experiments → protocols / assays / samples / equipment / experiment_data / lab_notes / reports / quality_control / audit_log`. The early chain built onto it: signup wiring (004/005), project membership (010), junctions (019/021/023), unique names (024), samples enrichment (046/048/060/061), experiment steps (049), papers (030/098), dashboard surfaces (026/052).

### RLS & security
002 enabled RLS; 009–025 iterated per-table policies. The modern model: **050** (lockdown of policy-less tables) → **053** (`my_org_id()` + org-scoped policy set across ~40 tables — the reference file for "who can see what") → **056** (SELECT-only agent DB role) → **057** (audit hardening, storage policies) → **058** (perf rewrite: `(select auth.uid())` wrap, same logic) → **059** (`resolve_entity_scope`) → **061** (sample children join the org model). New tables since then ship owner-only RLS in their own file (090/092/097/103).

### Lab-note draft/commit/versions
**062** splits `lab_notes.content` (committed, audited) from `draft_content` (autosave buffer). Version history rows live in `document_versions`, written ONLY by the live DB trigger `trg_write_document_version` (hash-chained); **063** adds read indexes + SELECT RLS and explicitly removes an earlier duplicate RPC/backfill. **064/065** fix pgcrypto `digest()` resolution so that trigger stops failing; **066** `commit_lab_note()` is the explicit Save (forces a version past the 3-minute throttle); **067** extends the identical model to protocols (`commit_protocol`). The `content_diffs` audit log (039/042/043) records word-level diffs per Save.

### Chunking & RAG pipeline
Flow: record saved → enqueue trigger writes a `chunk_jobs` row (SECURITY DEFINER per **068**) → Python worker chunks/embeds → rows land in `semantic_chunks` → agent retrieval (`find_passages` hybrid dense+FTS). Migrations: **083** HNSW index on embeddings (fixes sequential KNN), **099** `expires_at` TTL for staged-literature chunks, **100** contextual-retrieval `context` column, **101** `chat_attachment` source type, **102/105** the `experiment_summary` producer (trigger + deterministic SQL payload + backfill, org fallback fix).

### Memory & consolidation
Five layers (077's header): `chat_messages` (short-term) → `chat_episode_summaries` (episodic) → `chat_memories` (semantic facts, 047) → `chat_researcher_profiles` (standing profile, 046/072) → `chat_procedures` (procedural, 077). Recall RPCs: 071 (into VCS) → 073 (invalidation/supersede) → 078 (overload + VOLATILE fix), plus 080 entity linking and 081 BM25 leg; HNSW indexes in 070. Consolidation is queue-driven: **074** (`consolidate_due_at` + SKIP LOCKED claim) → **075** (poison-session guard) → **104** (per-user serialization). **089** adds the rolling session summary.

### Chat sessions & literature
Sessions/messages from 019/020/037/038; attachments 084/090, folders 092. **091** gives sessions a `kind` ('chat' vs literature) + `metadata` so literature searches are real, resumable sessions. Literature staging: 036 (`catalog_placement` staging/repository) → **092** (7-day `staged_expires_at` TTL) → 099 (chunks expire with the paper). **093** persists the session's active attachments so "now expand section 3" keeps focus.

### Context backend additions (102–105)
Two signals feed the agent's context: **focus/recency** — a frontend beacon upserts into `recently_touched` (103) on view/edit; the agent reads top-10 by `touched_at` and falls back to workspace search when an entity is unresolvable — and **experiment summaries** — editing an experiment fires `trg_experiment_summary_chunk` (102) → `chunk_jobs` → worker → `semantic_chunks` rows of `source_type='experiment_summary'` (org fallback + retry in 105). 104 keeps consolidation single-flight per user.

### Quota / usage / telemetry
**095** is the live metering core: `ai_usage_ledger` + `ai_usage_counters` (+ atomic `increment_usage_counter`), Postgres-durable, Redis as rebuildable cache, service-role writes only. **088** is the tier-ready plans schema (off the hot path by design). The 082/085/086/087 telemetry surface (**085 `usage_events` never got readers after the PostHog pivot**) was dropped by **096**, which keeps only `agent_runs` (quota reconciler + prompt_version) and the 095 tables.

## Operational notes

- **Backfills must enqueue with `operation='update'`.** The 102 backfill inserts `chunk_jobs` rows with `'update'` so the worker treats them as idempotent upserts; 105 re-enqueues failures the same way. A backfill enqueued as an insert-type operation would duplicate chunks on re-run.
- **Refreshing `000`**: regenerate the tables-only dump from the live database (it is a snapshot, not a migration) and keep its header warning intact; update its "notable migrations" pointers if a new subsystem lands.
- **Migration ledger**: `public.schema_migrations` is the single source of truth for what
  is applied (ADR-006) — query `SELECT filename, applied_at FROM public.schema_migrations
  ORDER BY 1;` rather than hand-maintaining a marker in this file. Its 109 backfill omits
  five filenames present in this folder: `102_profile_demo_seeded.sql`,
  `103_data_analysis_templates.sql`, `104_onboarding_checklist.sql`,
  `105_saved_analyses.sql`, `106_analyses.sql`. Real, but cosmetic; not yet backfilled.
- **Large files time out in the SQL editor**: 053 must be run in parts (header references `scripts/053_supabase_rls_parts/` 01→05, but that directory is not present in this repo — reconstruct by splitting the file at its section dividers); 057 says run statements one at a time (storage.objects DDL can time out).
- **Known number collisions** (both files of a pair are applied): 003, 004, 012 (twins with identical content), 019, 025, 027 (+`_down` rollback), 030, 046, 047, 066, 092.
- **Numbering gaps** (numbers never used): 006–008, 017, 022, 029, 031–035, 054, 055 (a "055 README" is referenced by 057's header but no 055 file exists here).
- **Empty placeholders**: 001, 051.
