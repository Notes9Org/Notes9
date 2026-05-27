# ADR-0004: Access Scope Enforced in Python, Not Supabase RLS

**Date**: 2026-05-27
**Status**: accepted
**Deciders**: Notes9 engineering

## Context

The agent service uses the service-role Supabase key (see ADR-0001). With RLS bypassed, a separate access control layer is needed. Two design options: (a) encode scope as SQL predicates injected by Python, or (b) rely on the LLM to include `created_by = user_id` in generated SQL.

## Decision

`agents/core/scope.py::AccessScope` is the single source of truth for what a user can access. It computes `project_ids` and `experiment_ids` at request time. All tools inject these as hard SQL predicates. The LLM is told only the *counts* of accessible entities, never the raw IDs — UUIDs are kept in Python and injected server-side.

## Alternatives Considered

### Alternative 1: Tell the LLM to filter by user_id
- **Pros**: Simpler — no scope computation, just pass user_id to the prompt
- **Cons**: String-match filtering ("filter by created_by") is not a security boundary; a jailbreak or prompt-injection could produce SQL without the predicate; misses `project_members` rows (was the root cause of QUERY_FAILURE bug)
- **Why not**: Was the original design. Failed in production because it missed shared-project membership. Replaced by AccessScope.

### Alternative 2: Reuse Supabase RLS (pass user JWT to agent queries)
- **Pros**: No separate layer; RLS is already correct
- **Cons**: Each tool call adds multi-hop join latency; RLS policy errors produce empty results not explicit errors; harder to compose cross-entity queries
- **Why not**: See ADR-0001

## Consequences

### Positive
- sqlglot validation (`agents/core/sql_validator.py`) can confirm the scope predicate exists in every generated SELECT — a hard validation failure if missing
- LLM never needs to know UUIDs, so the system prompt stays compact and cache-stable
- One Python function to audit for access control correctness

### Negative
- Must stay in sync with RLS policies (which govern frontend access)
- Scope is cached 60 s — permission changes propagate with a delay

### Risks
- A bug that returns an empty scope (instead of raising) would silently serve zero results rather than cross-user data. The current implementation raises on failure and never caches partial scopes (comment in scope.py: "NEVER cache or return a partial scope").
