# ADR-0005: NL-to-SQL with sqlglot AST Validation

**Date**: 2026-05-27
**Status**: accepted
**Deciders**: Notes9 engineering

## Context

Users ask questions like "how many experiments did I run last month?" or "list all samples with status=depleted". These are best answered by running SQL against Postgres rather than semantic search. Letting an LLM generate arbitrary SQL against a production database is risky: it could generate DDL, access system tables, or omit user-scoping predicates.

## Decision

`agents/services/sql_service.py` generates SQL via Claude (Haiku), then validates the AST with `sqlglot` before execution. Validation enforces: (1) no DDL, (2) no system table access (`pg_*`, `information_schema`), (3) every SELECT branch in a UNION must contain the user-scoping predicate, (4) hard cap of 6 SELECT statements per query.

## Alternatives Considered

### Alternative 1: Raw LLM SQL with no validation
- **Pros**: Simpler pipeline
- **Cons**: LLM can generate `DROP TABLE`, access `pg_user`, or omit `WHERE user_id = ...`
- **Why not**: Unacceptable security risk on a production database

### Alternative 2: ORM-based query builder (SQLAlchemy)
- **Pros**: Type-safe; no injection risk; ORM enforces schema
- **Cons**: Natural language queries don't map cleanly to ORM calls; much harder to express cross-entity aggregations
- **Why not**: NL-to-ORM is harder than NL-to-SQL and less expressive for the analytics queries users ask

### Alternative 3: Supabase RPC / stored procedures only
- **Pros**: Pre-approved query surface; no dynamic SQL
- **Cons**: Can't cover the long tail of ad-hoc analytical questions; every new query type requires a migration
- **Why not**: Too rigid for an ELN where users ask novel questions

## Consequences

### Positive
- Flexible enough to answer arbitrary analytical questions
- sqlglot AST validation provides a hard security boundary regardless of what the LLM generates
- SELECT_LIMIT = 6 prevents runaway UNION ALL attacks while still covering the common 4-way cross-entity query pattern

### Negative
- sqlglot may reject valid SQL dialects that differ from Postgres — requires ongoing maintenance as query patterns evolve
- 6-SELECT cap could reject a legitimate complex query

### Risks
- sqlglot version updates can change parsing behaviour. Pin the version in requirements.txt and test before upgrading.
