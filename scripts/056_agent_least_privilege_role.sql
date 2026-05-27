-- 056 — Least-privilege database role for the Catalyst AI agent
-- =============================================================
-- WHY: The agent currently connects as `postgres` (DB_USER default in
-- AI/catalyst/services/config.py), which bypasses RLS and can read auth/vault
-- and WRITE every table. The LLM-generated-SQL guards are the only barrier.
-- This role removes WRITE capability and sensitive-schema access entirely, so
-- even a total guard bypass cannot modify data or read secrets.
--
-- The agent only ever runs SELECTs and relies on `created_by`/scope filters it
-- injects itself (verified by the sqlglot validator in sql_service.generate_sql).
-- It does NOT set a JWT, so it cannot satisfy RLS policies that call auth.uid().
-- Therefore the role is granted BYPASSRLS *but only SELECT* — reads keep working
-- under the existing created_by-filter model, writes are impossible.
--
-- NOTE (Supabase): BYPASSRLS requires a superuser to set. On Supabase the
-- `postgres` role can usually do this from the SQL editor. If `CREATE ROLE ...
-- BYPASSRLS` errors with "must be superuser", use Option B at the bottom.

-- Replace 'CHANGE_ME_STRONG_PASSWORD' below with a strong password, then put
-- the SAME value in AI/catalyst/.env as DB_PASSWORD (and set
-- DB_USER=catalyst_agent). Do NOT commit the real password.
-- NOTE: the Supabase SQL editor runs plain SQL — psql meta-commands like
-- `\set` are NOT supported, so the password is inlined via format(%L).

-- ── Option A (recommended): dedicated SELECT-only, RLS-bypassing role ─────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'catalyst_agent') THEN
    EXECUTE format('CREATE ROLE catalyst_agent WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS', 'CHANGE_ME_STRONG_PASSWORD');
  END IF;
END$$;

-- Read-only by default at the session level (defence-in-depth on top of the
-- code-level `SET default_transaction_read_only = on`).
ALTER ROLE catalyst_agent SET default_transaction_read_only = on;

-- Only the public schema, only SELECT. No INSERT/UPDATE/DELETE anywhere.
GRANT USAGE ON SCHEMA public TO catalyst_agent;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO catalyst_agent;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO catalyst_agent;

-- Belt-and-suspenders: ensure no access to sensitive schemas (not granted by
-- default, but make it explicit so a future blanket GRANT can't leak them).
REVOKE ALL ON ALL TABLES IN SCHEMA auth FROM catalyst_agent;
REVOKE ALL ON ALL TABLES IN SCHEMA storage FROM catalyst_agent;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'vault') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA vault FROM catalyst_agent';
  END IF;
END$$;

-- Verify (should list SELECT only, no write privileges):
--   SELECT grantee, table_name, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE grantee = 'catalyst_agent' AND table_schema = 'public'
--   ORDER BY table_name, privilege_type;

-- After running: set in AI/catalyst/.env →
--   DB_USER=catalyst_agent
--   DB_PASSWORD=<the password above>
-- (or update DATABASE_URL's user:password). Then restart the catalyst backend
-- and confirm the agent can still answer a "list my notes" query (reads work)
-- and that any write attempt fails. The SERVICE_ROLE Supabase client used by
-- fetch_full_records is unaffected — this only changes the psycopg pool.

-- ── Option B: if BYPASSRLS is not permitted on your Supabase instance ─────────
-- Keep DB_USER=postgres but rely on the code-level read-only enforcement
-- (already added in sql_service._get_pg_connection). You still lose the
-- write-bypass class via read-only, but the connection keeps superuser read
-- reach. Less ideal than Option A but requires no role management.
