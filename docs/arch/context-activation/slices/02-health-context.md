# Slice 02: health-context

Repo: **AI** (`/Users/ramanareddy/Desktop/ELN/AI`). Branch target: `dev`. Wave 2, parallel
with 03 and 04.

## Goal

When this is done, one authenticated request answers "what is applied, what is switched on,
and how complete is the corpus" without anyone hand-querying production. It reports flag
state by **calling the application's own predicate functions**, so it cannot drift from the
code the way a document can.

## Owns (you may write ONLY these)

- `catalyst/api/health_context.py`  (new file, all the logic)
- `catalyst/tests/test_health_context.py`  (new file)
- `catalyst/main.py`  (route registration only, keep the edit to a few lines)

Touching anything outside this list is a bug. Slices 03 and 04 are editing `worker/` and
`catalyst/core/memory/` right now; do not touch either.

## Context

This endpoint exists because the state it reports was invisible for months. Six work
packages were merged, deployed, and inert; 453 of 823 sources had zero chunks; the monitor
built to catch that had never run; and the migration ledger was silently missing a row.
Confirming any of it required hand-querying production.

There is a specific failure this design is built against.
`catalyst/docs/ROLLOUT_2026-08-04_context_flags.md` asserts the literature and
notes_copilot router recipes ship "with no flag on this". They do not; both are gated
behind `NOTES9_CONTEXT_ROUTER`, default off (`catalyst/api/chat.py:412`,
`catalyst/api/literature_biomni.py:360`). A document describing flag state drifted from the
code within days.

**So the rule for this slice is absolute: never read an environment variable directly.**
Call the same predicate the application calls. `unified_retriever_enabled()` from
`catalyst/infra/rag.py:105`, `router_enabled()` from `catalyst/core/context_router.py:93`,
`rerank_enabled()`, and the resolved `ef_search` integer from `rag.py:725-726` which falls
back to `_DEFAULT_EF_SEARCH = 100` at `rag.py:114`. If a predicate is not importable
without side effects, import it lazily inside the handler rather than re-implementing its
parsing. Re-implementing the parsing recreates the exact drift this endpoint exists to
prevent.

**Auth (ADR revision, read this carefully).** Unlike `/health` and `/health/ready`, which
are unauthenticated because they return a fixed liveness shape, this endpoint returns
migration filenames, corpus size, queue depth, and which code paths are live. That is an
infrastructure map. It requires the same service bearer token the agent API uses and
returns `401` without it. Do not copy the auth posture of the neighbouring health routes.

Follow the aggregate-checks-and-report shape of `readiness_check()` at
`catalyst/main.py:351`. Reuse `infra.db.SupabaseService` for database access; do not open a
new client.

## Interfaces you must honor

Copy this response shape verbatim. Nothing else consumes it yet, but it is the contract.

```jsonc
{
  "flags": {
    "unified_retriever": false,   // infra.rag.unified_retriever_enabled()
    "context_router":   false,    // core.context_router.router_enabled()
    "focus_envelope":   false,    // core.focus, NOTES9_FOCUS_ENVELOPE
    "rag_rerank":       false,    // infra.rag.rerank_enabled()
    "hnsw_ef_search":   100       // int, resolved default
  },
  "migrations": {
    "ledger_rows":    109,
    "missing":        [],         // expected-but-absent filenames
    "ledger_present": true
  },
  "corpus": {
    "total_chunks":     4866,
    "chunks_with_hash": 0,
    "jobs": { "completed": 1899, "failed": 396, "processing": 15, "pending": 0, "skipped": 0 },
    "stuck_unclaimed":  15,       // processing AND claimed_at IS NULL
    "coverage": [
      { "source_type": "literature_review",
        "enqueued": 489, "chunked": 157, "gap_pct": 67.9, "alert": true }
    ],
    "worst_gap_pct":       67.9,
    "last_coverage_check": "2026-08-08T02:30:00Z",  // null if never run
    "alert":               true   // any gap_pct > 2.0 OR last_coverage_check older than 48h
  },
  "checked_at": "2026-08-08T00:00:00Z"
}
```

Contract rules, all of which are testable:

- **Additive only.** Consumers tolerate unknown keys. No key is renamed; a retired key
  returns `null` for one release before removal.
- **Idempotent and side-effect free.** It must **not** call `run_chunk_coverage_check()`,
  which writes rows. Read the last result from `chunk_coverage_gaps` and compute the live
  gap separately with a read-only aggregate.
- **Partial failure never 500s.** A failed sub-check sets that section to
  `{"error": "<message>"}` and leaves every other section populated. Partial truth beats no
  truth, and this endpoint is most needed exactly when something is broken.
- **Cost.** Aggregates over `chunk_jobs` (2310 rows) and `semantic_chunks` (4866 rows).
  Budget one round trip and under 200ms. Mark the coverage query with a `ponytail:` comment
  naming the ceiling: past roughly 1M chunks, read `chunk_coverage_gaps` only.

`chunk_coverage_gaps` columns you may read, from migration 108, unchanged by slice 01:
`id, checked_at, source_type, expected_sources, covered_sources, missing_sources, gap_pct,
alert_threshold_pct, alert`.

## Depends on

**Slice 01** (Notes9), which must be merged and applied first. It gives you the missing
`108_chunk_coverage_monitor.sql` ledger row, so `migrations.missing` can legitimately be
empty, and it adds `skipped` to the `chunk_jobs` status domain, which your `jobs` counts
must include.

## Done when

- [ ] `GET /health/context` without a bearer token returns `401` and no body content
      beyond the error.
- [ ] With a valid token it returns `200` and the exact shape above.
- [ ] Every value in `flags` is produced by calling the application predicate. A test
      monkeypatches `NOTES9_RETRIEVER=unified` and asserts the endpoint reports
      `unified_retriever: true` without the test knowing how the flag is parsed.
- [ ] No write occurs. A test asserts `run_chunk_coverage_check` is never called and row
      counts in `chunk_coverage_gaps` are unchanged across a request.
- [ ] Against production data today it reports `worst_gap_pct` near 67.9 and
      `alert: true`. A green result today would mean the endpoint is wrong.
- [ ] The existing `catalyst/tests/test_chunk_scope_sql.py` suite (19 tests) still passes.

## Edge cases to test

Rows from the Failure modes table in `../ARCHITECTURE.md`, quoted with the guaranteed
behaviour. Assert on behaviour.

- **Observability** the monitor itself stops running. Guarantee: `/health/context` reports
  `last_coverage_check` age, and staleness beyond 48h is itself an alert. This is the exact
  failure that produced this whole feature, so it must be tested, not assumed. Assert that
  a `chunk_coverage_gaps` whose newest `checked_at` is 3 days old yields `alert: true` even
  when every `gap_pct` is 0.
- **Boundaries** another tenant's data. Guarantee: `organization_id` and `created_by` are
  both ANDed into every chunk filter, asserted by the 19 tests in
  `catalyst/tests/test_chunk_scope_sql.py`, which must stay green. This endpoint reports
  only global aggregates and must expose no per-tenant or per-user rows, no source ids, no
  document titles, and no user identifiers. Assert the serialized response contains no
  UUID-shaped values other than none at all.
- **Partial failure, one dependency down.** Guarantee: a failed sub-check degrades that
  section to `{"error": ...}` and the endpoint still returns 200 with the rest populated.
  Assert with the database mocked to raise: `flags` must still be fully populated, because
  flag resolution needs no database.
- **Boundaries, empty database.** Zero chunks and zero jobs must return zeroes and
  `alert: true` on staleness, not a division-by-zero or a 500.

## Out of scope

- Any UI. Notes9 has no admin routes and no CI; one JSON endpoint answers the question.
- Reporting `MEMORY_BM25_ENABLED` or any memory-subsystem flag. Slice 04 is repairing that
  flag's parsing right now and reporting it mid-repair would report a value that is about
  to change. Add it in a follow-up once 04 has merged.
- Fixing the false "no flag on this" claim in
  `catalyst/docs/ROLLOUT_2026-08-04_context_flags.md`. Slice 04 owns that file.
- Alerting, paging, or dashboards. This slice exposes the truth; routing it somewhere is a
  separate decision.

### Failure modes deferred out of this slice

These rows of the Failure modes table in `../ARCHITECTURE.md` describe retrieval-time and
backfill-time behaviour. This slice only reports state; it does not retrieve and does not
ingest, so none of them are reachable from the code it adds. They are owned by
**PHASE-C-2 in `DEFERRED.md`**, which carries each one with its guaranteed behaviour, and
they become testable once the activation gate runs.

- **Cost** contextual blurbs at backfill scale
- **Cost/latency** rerank on every query
- **Partial failure** Supabase down mid-retrieval
- **Boundaries** empty corpus, new user
