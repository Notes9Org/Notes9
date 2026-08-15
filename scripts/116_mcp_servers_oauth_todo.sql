-- 116_mcp_servers_oauth_todo.sql
--
-- N9-12 (SEC-005): `mcp_servers` stores per-user MCP server connection config,
-- including OAuth token columns. 050_rls_lockdown.sql already scopes row
-- access via RLS (`user_id = auth.uid()`) and its header already flags that
-- encrypting the secret columns at rest is a separate hardening step -- but
-- names no mechanism. This is dead code today (no committed app-code path
-- writes a real OAuth token to this table yet; docs/DATA_MODEL.md describes
-- it as "for future agent tool integrations"), so this migration does NOT
-- implement column encryption. It records the gap as a durable, queryable
-- TODO (via COMMENT ON TABLE, visible in \d+ and pg_description) so it isn't
-- lost before a real token is ever written.
--
-- TODO(security): before any real OAuth token is written to mcp_servers,
-- encrypt the secret columns at rest with pgsodium / Supabase Vault
-- (https://supabase.com/docs/guides/database/vault) instead of storing
-- plaintext access/refresh tokens. Do not implement this speculatively --
-- land it when the OAuth columns get a real writer.
--
-- Idempotent; comment-only, no schema or data change.

COMMENT ON TABLE public.mcp_servers IS
  'Per-user MCP server connection config, including OAuth token columns. '
  'TODO(security): OAuth secrets are stored plaintext today -- encrypt at '
  'rest with pgsodium/Supabase Vault before this table holds a real token '
  '(dead code as of 116_mcp_servers_oauth_todo.sql). RLS is owner-only, see '
  '050_rls_lockdown.sql.';

-- Verify:
--   SELECT obj_description('public.mcp_servers'::regclass, 'pg_class');

-- DOWN (rollback):
-- COMMENT ON TABLE public.mcp_servers IS NULL;
