# ADR-0001: AI Agent Uses Service-Role Key with Python-Layer Scope Enforcement

**Date**: 2026-05-27
**Status**: accepted
**Deciders**: Notes9 engineering

## Context

The Catalyst AI agent (FastAPI on ECS) needs to read lab notes, experiments, protocols, literature reviews, and samples on behalf of a user. Supabase RLS policies are written for the anon/user-JWT client path used by the Next.js frontend. The agent runs server-side with a verified user identity but needs to read across entity types in a single request, sometimes joining tables that the user's JWT would not efficiently traverse under RLS.

## Decision

The Catalyst service uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses all RLS) and enforces access control in Python via `agents/core/scope.py::AccessScope`. Before any data is fetched, `compute_scope(user_id)` resolves the complete set of project and experiment IDs the user may access. All tool calls and generated SQL are constrained to those IDs in Python before hitting the database.

## Alternatives Considered

### Alternative 1: Use user JWT on the server (same as frontend)
- **Pros**: RLS enforces policy automatically; no separate access layer to maintain
- **Cons**: RLS policies involve multi-hop joins (experiments → projects → org); under load these add latency on every tool call; policy logic is split between SQL and Python
- **Why not**: The agent makes 4–8 Supabase calls per turn; the extra join overhead compounds; RLS errors also produce confusing empty results rather than explicit failures

### Alternative 2: Service-role with no scope check (trust the LLM to filter)
- **Pros**: Simpler code — just pass user_id to the prompt
- **Cons**: LLM-based filtering is not a security boundary; a prompt-injection or jailbreak could expose other users' data
- **Why not**: Rejected explicitly after security review (was the original design; replaced by AccessScope)

## Consequences

### Positive
- Fast, predictable data access; no surprise empty results from RLS policy mismatches
- Single Python source of truth for "what can this user see"
- sqlglot can validate that scope predicates are present in generated SQL

### Negative
- Access control logic lives in two places: RLS (for the frontend) and AccessScope (for the agent); they must stay in sync when schema changes
- Service-role key has full DB access — a bug in scope computation could leak cross-user data

### Risks
- Scope cache TTL of 60 seconds means a permission revocation takes up to 60 seconds to propagate to the agent. Acceptable for an ELN; would not be acceptable for a financial system.
