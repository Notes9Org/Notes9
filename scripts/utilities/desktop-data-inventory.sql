-- desktop-data-inventory.sql — READ-ONLY audit of how user data is shaped,
-- to scope the desktop (local-first) data layer. Safe to run on prod: catalog
-- queries + row estimates only, no table scans except the two footnoted ones.
--
-- Usage:
--   psql "$DATABASE_URL" -v user_id="'<a-real-user-uuid>'" -f scripts/utilities/desktop-data-inventory.sql
--   (use the SESSION POOLER connection string, port 5432/6543 — one connection, not many)
--
-- ponytail: plain psql + catalogs; no tooling to install.

\set ON_ERROR_STOP off
SET statement_timeout = '10s';
SET default_transaction_read_only = on;

\echo '=== 1. Table inventory: rows (estimate) + size ==='
SELECT relname AS table,
       n_live_tup AS approx_rows,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(relid) DESC;

\echo '=== 2. Ownership matrix: which scope column each table carries ==='
-- Feeds the sync-rules design: org-bucket vs user-bucket vs derived-scope tables.
SELECT table_name,
       bool_or(column_name = 'organization_id') AS has_org_id,
       bool_or(column_name = 'user_id')         AS has_user_id,
       bool_or(column_name = 'created_by')      AS has_created_by,
       bool_or(column_name = 'project_id')      AS has_project_id,
       bool_or(column_name = 'experiment_id')   AS has_experiment_id
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;

\echo '=== 3. RLS policy inventory (what sync rules must reproduce) ==='
SELECT tablename, count(*) AS policies,
       string_agg(DISTINCT cmd, ',') AS commands
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
-- Detail per policy when you need it:
-- SELECT tablename, policyname, cmd, qual FROM pg_policies WHERE schemaname='public' AND tablename='<t>';

\echo '=== 4. RPCs / functions the clients may call (auth.uid() dependents) ==='
SELECT p.proname AS function,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer,
       (pg_get_functiondef(p.oid) ILIKE '%auth.uid()%') AS uses_auth_uid
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY uses_auth_uid DESC, p.proname;

\echo '=== 5. One user''s data graph (set -v user_id) ==='
SELECT om.organization_id, o.name, om.role
FROM org_members om JOIN organizations o ON o.id = om.organization_id
WHERE om.user_id = :user_id;

SELECT 'projects' AS entity, count(*) FROM projects p
  WHERE p.organization_id IN (SELECT organization_id FROM org_members WHERE user_id = :user_id)
UNION ALL
SELECT 'experiments', count(*) FROM experiments e
  WHERE e.project_id IN (SELECT id FROM projects WHERE organization_id IN
    (SELECT organization_id FROM org_members WHERE user_id = :user_id))
UNION ALL
SELECT 'lab_notes', count(*) FROM lab_notes ln
  WHERE ln.experiment_id IN (SELECT id FROM experiments WHERE project_id IN
    (SELECT id FROM projects WHERE organization_id IN
      (SELECT organization_id FROM org_members WHERE user_id = :user_id)))
UNION ALL
SELECT 'samples', count(*) FROM samples s
  WHERE s.organization_id IN (SELECT organization_id FROM org_members WHERE user_id = :user_id)
UNION ALL
SELECT 'papers', count(*) FROM papers pa
  WHERE pa.organization_id IN (SELECT organization_id FROM org_members WHERE user_id = :user_id)
UNION ALL
SELECT 'chat_sessions', count(*) FROM chat_sessions cs WHERE cs.user_id = :user_id;

\echo '=== 6. Storage footprint per scope (bucket "user": org/scope/resource/file) ==='
-- Footnote: scans storage.objects; fine unless you have millions of objects.
SELECT (string_to_array(name, '/'))[2] AS scope,
       count(*) AS files,
       pg_size_pretty(sum(coalesce((metadata->>'size')::bigint, 0))) AS bytes
FROM storage.objects
WHERE bucket_id = 'user'
GROUP BY 1 ORDER BY sum(coalesce((metadata->>'size')::bigint, 0)) DESC;

\echo '=== 7. Vector / AI footprint (candidates to keep cloud-only) ==='
-- Footnote: size lookups only, no scan.
SELECT 'semantic_chunks' AS table,
       (SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'semantic_chunks') AS approx_rows,
       pg_size_pretty(pg_total_relation_size('semantic_chunks')) AS size;

\echo '=== 8. Replication readiness (needed for PowerSync/Electric read path) ==='
SHOW wal_level;
SELECT pubname FROM pg_publication;
SELECT slot_name, active FROM pg_replication_slots;
