# ADR-0007: Row-Level Security Enabled on All Public Supabase Tables

**Date**: 2026-05-27
**Status**: accepted
**Deciders**: Notes9 engineering

## Context

Supabase received a security warning (2026-05-25) that RLS was disabled on tables in the `public` schema. With RLS disabled, any client holding the anon key — which is public by design — can read, write, and delete every row in every table. The Notes9 schema has 56 tables including sensitive lab data, chat histories, and OAuth tokens stored in `mcp_servers`.

## Decision

RLS was enabled on all 56 public tables. Policies follow four patterns:
- **User-scoped**: `user_id = auth.uid()` for personal data (chat, tasks, calendar, MCP servers)
- **Org-scoped**: `organization_id = my_org_id()` for shared lab data (projects, protocols, equipment, literature)
- **Join-through-parent**: for tables without a direct org FK (experiments → projects → org; samples via creator's org)
- **Service-role only** (no user policies): `agent_runs`, `agent_llm_calls`, `agent_tool_calls`, `agent_trace_events`, `chunk_jobs` — written only by backend services using the service-role key

A helper function `public.my_org_id()` (SECURITY DEFINER) resolves the calling user's organization from `profiles` without requiring the caller to pass it explicitly.

## Alternatives Considered

### Alternative 1: Leave RLS disabled, rely on application-layer auth
- **Pros**: No policy maintenance; simpler queries
- **Cons**: Any leak of the anon key (e.g. in a public GitHub repo, browser devtools) gives full read/write/delete access to all data
- **Why not**: The anon key is intentionally public — it is embedded in the Next.js bundle. RLS is the intended security boundary for Supabase.

### Alternative 2: Enable RLS only on sensitive tables
- **Pros**: Lower risk of breaking existing queries
- **Cons**: Hard to define "sensitive"; leaves audit trail, chat history, and sample data unprotected; Supabase security scanner flags any unprotected table
- **Why not**: All-or-nothing is easier to reason about and audit

## Consequences

### Positive
- Anon key exposure no longer means data exposure
- Supabase security warning cleared
- `mcp_servers` (contains OAuth tokens), `chat_memories`, `chat_researcher_profiles` now user-scoped — no cross-user leakage possible

### Negative
- Server-side Next.js routes that previously used the anon client for admin operations (e.g. writing to `audit_log`) now require either a service-role client or an explicit INSERT policy
- `audit_log` INSERT policy added: users can insert their own entries but cannot SELECT them (SELECT is service-role only). This means audit entries are not tamper-proof from the application layer; a database trigger would be needed for full audit integrity.

### Risks
- Scope mismatch between RLS policies (frontend path) and AccessScope (agent path) must be kept in sync. As of this ADR, they are consistent: both derive access from `org_members` / `project_members` membership.
