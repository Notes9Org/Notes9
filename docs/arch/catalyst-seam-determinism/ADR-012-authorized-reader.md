# ADR-012: One AuthorizedReader owns the service-role path, and its scope rule is tested against RLS

- Status: accepted
- Date: 2026-08-15
- Feature: [[projects/catalyst-seam-determinism]]
- Supersedes: resolves the open item in `AI/catalyst/docs/adr/0002-dual-db-access-model.md`

## Context

The HTTP contract substantially understates the real data flow. Notes9 sends `{kind, id}`
tags over HTTP; the AI service then reads the full rows itself over a `service_role`
Postgres connection with RLS bypassed, across 26 tables and three access paths — PostgREST,
a raw psycopg2 pool used for pgvector that bypasses PostgREST *and* RLS, and httpx to
Storage. **Ids cross HTTP; rows cross the database.**

Row authorisation is consequently implemented three times: Postgres RLS on the Notes9 path,
Python membership logic at `catalyst/core/retriever.py:196-212`, and a `created_by`-only
filter at `catalyst/infra/rag.py:210-250`. The AI repo's own `ADR-0002` states that two of
them already disagree — a collaborator sees narrower RAG results than direct fetches for the
same record — and lists it as **open**.

A third implementation is not a bug to fix once. It is a bug that regenerates, because
nothing structurally prevents a fourth.

Separately, a live `service_role` JWT for the production project is committed to
`AI/worker/.env.example`, which is tracked in git and pushed. Rotation is an operator action
and a precondition, not part of this decision. What *is* part of this decision is where a
service credential lives afterwards.

## Decision

Exactly one module in the AI repo may import the service credential or the psycopg2 pool:
`AuthorizedReader`. Every row read and every vector search goes through it. It exposes
`scope_predicate(table) -> str` returning the same SQL the RLS policy uses, and that is the
single definition of scope. A conformance test runs a matrix of four roles (owner,
collaborator, org peer, outsider) against four row classes (own, project, org, foreign)
through both real RLS and `scope_predicate`, asserting identical row sets.

The credential is injected at runtime, held by that one module, and never written to a file
tracked by git — which specifically excludes `.env.example`, a file that is committed by
definition.

Enforcement is the existing package-layering test, which already proves this exact pattern
for the LLM gateway: no module outside `llm/` may import a provider SDK.

## Consequences

Scope stops being three opinions and becomes one, checked against the authority rather than
against itself. The seam that today is invisible to the Notes9 repo becomes a named module
with a test, which is what "close the invisible seam" concretely means.

It costs a refactor of every current call site of the Supabase client and the pool, and the
conformance test needs a seeded fixture database, which the repo does not have today.

It does **not** remove `service_role`. Running the AI service on the user's JWT so RLS
applies natively is the stronger answer and is a larger change with real questions about
pgvector performance under RLS. This ADR makes that a single-module change later instead of
a 26-table change, which is the point.

## Alternatives rejected

**Drop `service_role`, use the user JWT via PostgREST.** Architecturally cleanest and
defers on performance evidence nobody has gathered. Made cheap by this ADR rather than
blocked by it.

**Fix the two divergent implementations and keep three code paths.** Fixes the instance,
not the class. `ADR-0002` has had this open long enough to demonstrate that.

**Push scope into the SQL by always joining membership tables.** Correct for PostgREST and
unavailable to the raw pool used for pgvector, which is where one of the two divergent
filters already lives.
