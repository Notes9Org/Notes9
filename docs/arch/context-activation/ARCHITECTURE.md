# Context activation and corpus repair

- Status: proposed
- Date: 2026-08-08
- Target branch: `dev` (Notes9), `dev` (AI)
- Supersedes the activation sequence in `AI/catalyst/docs/ROLLOUT_2026-08-04_context_flags.md`

## Context

Six work packages for the unified context backend are merged and deployed across both
repos (Notes9 PR #226 = migrations 107/108/109; AI PRs #71/#73/#74/#75). Migrations are
applied to the live database. Every one of the six is inert in production, and the
observability built to detect that is itself inert.

That was known. What was not known, and what reorders the whole plan, is the state of the
corpus underneath it.

### Measured live state, 2026-08-08 (Supabase `rutcjpugsrfoobsrufnn`, read-only)

**453 of 823 enqueued sources have zero chunks. That is 55% of the workspace invisible to
retrieval.**

| source_type | enqueued | chunked | missing | gap |
|---|---|---|---|---|
| literature_review | 489 | 157 | 332 | 67.9% |
| protocol | 54 | 26 | 28 | 51.9% |
| lab_note | 153 | 79 | 74 | 48.4% |
| report | 32 | 23 | 9 | 28.1% |
| experiment_summary | 90 | 80 | 10 | 11.1% |
| chat_attachment | 5 | 5 | 0 | 0.0% |
| **total** | **823** | **370** | **453** | **55.0%** |

Migration 108's own alert threshold is 2%. Every source type is between 5x and 34x over
it. The monitor has run zero times.

Supporting state:

- `chunk_jobs`: 1899 completed, 396 failed, 15 processing. Of the failures, 304 carry the
  generic constant `"Failed to insert chunks into database"` that commit `b2b5e9a` was
  written to eliminate; the code fix landed, the historical rows were never re-driven.
  91 carry `"Failed to generate embeddings for any chunks"`.
- The 15 `processing` jobs have been stuck since 2026-03-18 and all have
  `claimed_at IS NULL`. `claim_chunk_jobs` (migration 107) reclaims only stale rows with a
  non-null `claimed_at`, so flipping `WORKER_CONTENT_ADDRESSED` will never rescue them.
- `chat_attachment` fails 57 of 72 jobs (79%) yet reaches 0% coverage gap, because retries
  eventually succeed. Job failure rate and coverage gap measure different things; only the
  second one matters to the user.
- 0 of 4866 chunks have a `chunk_hash`, confirming `WORKER_CONTENT_ADDRESSED` has never
  been on.
- `chunk_coverage_gaps` has 0 rows. pg_cron is not installed, so 108's schedule block
  (wrapped in `IF EXISTS (cron namespace)`) silently skipped.
- `schema_migrations` holds 107 rows and is missing 108, which was applied before 109
  created the table; its `to_regclass`-guarded self-record skipped without complaint.
- `scripts/README.md` still says "live DB applied through 105", dated 2026-07-18. Two
  migration trackers, both wrong, disagreeing with each other.
- `semantic_chunks` carries two ANN indexes on the same `embedding` column:
  `idx_semantic_chunks_embedding` (ivfflat, `lists=100`) and
  `idx_semantic_chunks_embedding_hnsw` (hnsw, `m=16`, `ef_construction=64`).

Not a problem: enqueue is healthy. No content has been created since 2026-07-28, so the
absence of new jobs is low activity, not a broken pipeline.

### Why this changes the plan

The existing rollout sequence leads with flipping `NOTES9_RETRIEVER` to activate the
unified retriever: RRF fusion, Cohere rerank, HNSW `ef_search` tuning. All of that improves
**ranking**. None of it improves **recall of a document that was never chunked**.

Optimising ranking over a corpus missing 55% of its documents is spending effort on the
wrong axis. Worse, it is unmeasurable: the recall@context eval that gates the flip cannot
distinguish "unified ranks better" from "the corpus happens to contain the answer this
time" while more than half the corpus is absent.

The sequence is therefore forced, and the gate changes. See ADR-005.

## Recommended design

Three phases, strictly ordered. Each phase is a prerequisite for the next, not a
preference.

### Phase A — See (make state observable)

Nothing here changes behaviour. It makes the next two phases verifiable.

**A1. `GET /health/context` on the existing Catalyst FastAPI app.**
Add beside `/health/ready` (`AI/catalyst/main.py:351`), reusing that endpoint's
aggregate-checks-and-report shape. Read-only, no auth change, no new service.

The endpoint reports resolved flag state by **calling the same predicate functions the
application calls**, never by re-reading environment strings. This is the property that
matters: a document describing flag state can drift from the code, and
`ROLLOUT_2026-08-04_context_flags.md` already has (it claims the router recipes ship with
"no flag on this"; both surfaces are gated behind `NOTES9_CONTEXT_ROUTER`, default off).
An endpoint that calls `unified_retriever_enabled()` cannot drift, because it is the code.

**A2. One migration truth.** Insert the missing 108 ledger row. Delete the
"applied through 105" marker from `scripts/README.md` and replace it with a pointer to the
ledger. Drop the `to_regclass` guard from the self-record block in future migrations now
that the table exists. See ADR-006.

**A3. Enable pg_cron and re-run 108's schedule block** so `run_chunk_coverage_check()`
fires nightly at 02:30 UTC as already written. The 2% threshold is correct and needs no
change; it will alert immediately and correctly on day one.

### Phase B — Repair (the actual value)

**B1. Zero chunks is a failure, not a completion.** Root-cause fix at the shared status
path, not at the one call site. `worker.py:112-119` records zero-chunk results as
`status='completed'`, and the two short-content branches (`:77-83`, `:88-94`) do the same.
All three pass a human-readable string as `error_message`, which trips the
`if error_message:` branch at `db.py:119` and increments `retry_count` on a supposedly
successful job. See ADR-007.

**B2. Deploy the worker carrying `b2b5e9a` first, then execute the existing runbook.**
Order matters: `b2b5e9a` makes `insert_chunks` re-raise instead of returning a bool, so a
re-driven job records the real error. Re-driving before that deploy reproduces 304 more
undiagnosable rows. The runbook (`scripts/runbooks/2026-08-04_redrive.md`, 342 lines)
already covers debris deletion, failed-to-pending reset in batches of 50, and requeue of
zero-chunk sources. Run it, do not rewrite it.

**B3. Reset the 15 zombies explicitly.** They are excluded from `claim_chunk_jobs` by
design and will not self-heal. One targeted `UPDATE` inside the runbook run.

**B4. Turn on `WORKER_CONTENT_ADDRESSED` before the bulk re-drive.** This is the one flag
that flips early, and it flips for safety rather than for performance: `replace_chunks`
(migration 107) makes re-ingestion a single atomic RPC. The legacy path deletes existing
chunks and then inserts in non-transactional batches of 100, so a mid-loop failure leaves
a source with fewer chunks than it started with. Re-driving 453 sources through that path
can make coverage worse. See ADR-005.

**B5. Triage by measured gap, not by job failure rate.** `literature_review` is 332 of the
453 missing sources and is where the work is. `chat_attachment`, despite a 79% job failure
rate, has zero coverage gap and needs nothing.

### Phase C — Activate (only once coverage is green)

**C1. Drop `idx_semantic_chunks_embedding` (ivfflat).** Two ANN indexes on one column means
the planner may choose ivfflat, where `NOTES9_HNSW_EF_SEARCH` has no effect and
`lists=100` is badly mistuned for the row count. Retrieval measurement is meaningless until
there is exactly one index. See ADR-008.

**C2. Build a real gold set from the repaired production corpus**, extending the existing
`AI/catalyst/eval/gold/` convention rather than adding a harness. The current
`retrieval_recall.json` is 4 queries over a 6-chunk fixture, which cannot authorise a
production retrieval swap. Target 30 to 50 queries with known-correct `source_id`s.

**C3. Gate on `recall@context`, unified must be at least legacy**, measured by the existing
`catalyst/eval/retrieval_eval.py`, which already compares both paths side by side. See
ADR-009.

**C4. Flip one flag at a time**, confirming each through `/health/context`:
`NOTES9_RETRIEVER=unified`, then `NOTES9_CONTEXT_ROUTER`, then optionally
`NOTES9_RAG_RERANK`.

**C5. Fix `MEMORY_BM25_ENABLED` before anyone flips it.** It is parsed strictly
(`== "true"`) at `core/memory/store.py:52` and loosely (`1/true/yes/on`) at
`core/memory/context_builder.py:414,479`, so `=1` yields a half-on state. `store.py` also
reads it at import time, so a late environment change does not take.

**C6. Correct `ROLLOUT_2026-08-04_context_flags.md`**, which asserts the router recipes
ship unflagged. They do not.

## Interfaces

These are the only contracts between slices. Parallel worktree agents cannot see each
other's code; anything not written here will not be compatible.

### `GET /health/context` (AI, new)

Unauthenticated, read-only, same posture as `/health` and `/health/ready`.
Always returns `200`; degradation is expressed in the body, not the status code, so a
monitoring probe never confuses "context is degraded" with "service is down".

```jsonc
{
  "flags": {                        // resolved by CALLING the predicate, not reading env
    "unified_retriever": false,     // infra.rag.unified_retriever_enabled()
    "context_router":   false,      // core.context_router.router_enabled()
    "focus_envelope":   false,      // core.focus (NOTES9_FOCUS_ENVELOPE)
    "rag_rerank":       false,      // infra.rag.rerank_enabled()
    "hnsw_ef_search":   100         // int, resolved default
  },
  "migrations": {
    "ledger_rows":  108,
    "missing":      [],             // expected-but-absent filenames
    "ledger_present": true
  },
  "corpus": {
    "total_chunks":       4866,
    "chunks_with_hash":   0,
    "jobs": { "completed": 1899, "failed": 396, "processing": 15, "pending": 0 },
    "stuck_unclaimed":    15,       // processing AND claimed_at IS NULL
    "coverage": [
      { "source_type": "literature_review",
        "enqueued": 489, "chunked": 157, "gap_pct": 67.9, "alert": true }
    ],
    "worst_gap_pct":      67.9,
    "alert":              true      // any gap_pct > 2.0
  },
  "checked_at": "2026-08-08T00:00:00Z"
}
```

Contract rules:

- **Additive only.** Consumers must tolerate unknown keys. No key is ever renamed; a
  retired key returns `null` for one release before removal.
- **Idempotent and side-effect free.** It must not call `run_chunk_coverage_check()`, which
  writes rows. It reads `chunk_coverage_gaps` for the last result and computes the live gap
  separately.
- **Errors.** A failed sub-check sets that section to
  `{"error": "<message>"}` and leaves the rest populated. The endpoint never 500s on a
  partial failure; partial truth beats no truth.
- **Cost.** All queries are aggregates over `chunk_jobs` (2310 rows) and
  `semantic_chunks` (4866 rows). Budget one round trip and under 200ms. If the corpus grows
  past roughly 1M chunks, the coverage query reads from the `chunk_coverage_gaps` table
  only. Mark with `ponytail:` naming that ceiling.

### Worker status contract (AI, changed)

`process_job` outcomes become exhaustive and mutually exclusive:

| Outcome | `status` | `error_message` | `retry_count` |
|---|---|---|---|
| chunks written | `completed` | `NULL` | unchanged |
| zero chunks produced | `failed` | `"no chunks generated: <reason>"` | incremented |
| content below threshold | `skipped` | `NULL` | unchanged |
| exception | `failed` | `str(e)` verbatim | incremented |

`skipped` is a new terminal status. It exists so that "legitimately too short to chunk"
stops being counted as a coverage gap forever. Migration 108's coverage query must exclude
`skipped` sources from `expected_sources`, otherwise the gap never reaches 0% and the
alert becomes noise that gets ignored, which is how this failed the first time.

`error_message` is never used to carry a success message. That is what caused
`retry_count` to increment on completed jobs.

### `schema_migrations` (Notes9, unchanged shape)

Primary key stays `filename`. Filenames are unique even though numbers are duplicated
(two each of 102, 103, 104, 105), so the key is sound and needs no migration. Every new
migration self-records unconditionally as its final statement.

## Failure modes

| Mode | Guaranteed behaviour | Owned by |
|---|---|---|
| **Volume** 10x corpus (48k chunks, 23k jobs) | `claim_chunk_jobs` uses `FOR UPDATE SKIP LOCKED`, so N workers never double-claim. HNSW is fine at 48k. Coverage query stays an aggregate. | 107 / A3 |
| **Volume** re-drive of 4k failed rows | Reset batches at 50 (runbook §3). A single `.in_(id)` over 400+ UUIDs builds a ~15KB URL and risks PostgREST HTTP 414. Batching is mandatory, not stylistic. | B2 |
| **Volume** 10x concurrent writers on one source | `replace_chunks` is one atomic RPC per source. Last writer wins; `source_hash` makes a no-op re-ingest free. | B4 |
| **Size** 10k-chunk document | Legacy path: 100 non-transactional batches, partial write possible. Content-addressed path: one RPC, all or nothing. This is why B4 precedes B2. | B4 |
| **Size** one chunk over the embedding token limit | Embedding call fails, job fails with the real Bedrock error (post-`b2b5e9a`), never a generic constant. No partial chunk set is left behind. | B1 |
| **Shape** source row deleted between enqueue and process | Job is debris. Runbook §2 deletes non-`delete` jobs in `pending`/`failed` whose source is gone, leaving `processing` untouched. | B2 |
| **Shape** unknown `source_type` | Coverage check enumerates 6 known types explicitly; an unknown type is absent from the report rather than counted as 0% gap. Adding a type requires editing 108. Documented limit, not a bug. | A3 |
| **Shape** null or sub-threshold content | Terminal `skipped`, excluded from `expected_sources`. Never `completed`, never a permanent gap. | B1 |
| **Cost** contextual blurbs at backfill scale | `WORKER_CONTEXTUAL_RETRIEVAL` calls Haiku once per chunk. Backfilling 4866 chunks is 4866 LLM calls. Flag stays **off** through Phases A and B; it is not part of this rollout. | C |
| **Cost/latency** rerank on every query | Cohere on Bedrock over the top 50 fused results, only when `NOTES9_RAG_RERANK` is on. Last flag flipped, first reverted. | C4 |
| **Partial failure** timeout mid-ingest | Job stays `processing` with `claimed_at` set; reclaimed after 900s by `claim_chunk_jobs`. On the legacy path `claimed_at` is never set, so it is stuck forever. This is exactly how the 15 zombies were created. | B4 |
| **Partial failure** Supabase down mid-retrieval | `psycopg2.OperationalError` re-raises deliberately; any other exception degrades to the legacy blend. Preserved as-is. | C4 |
| **Partial failure** retry arrives twice | `replace_chunks` is idempotent on `source_hash`. The legacy delete-then-insert is not, and is protected only by the unique constraint on `(source_type, source_id, chunk_index)`. | B4 |
| **Partial failure** re-drive interrupted halfway | Runbook steps are individually idempotent and re-runnable. Reset is `.eq("status","failed")`-scoped, so a partial run cannot promote a `completed` job. | B2 |
| **Boundaries** empty corpus, new user | Retrieval returns zero results. The agent must state it found nothing rather than answer unsourced. Existing behaviour, unchanged, and worth an explicit test given 55% of sources currently return nothing. | C3 |
| **Boundaries** another tenant's data | `organization_id` and `created_by` are both ANDed into every chunk filter, asserted by 19 tests in `catalyst/tests/test_chunk_scope_sql.py`. That suite must stay green through every phase. Non-negotiable. | all |
| **Boundaries** zero gap | Coverage of 0% must be reachable, or the alert is permanent and gets muted. Requires `skipped` to be excluded from `expected_sources`. | B1 / A3 |
| **Observability** the monitor itself stops running | pg_cron job absent or failing means `chunk_coverage_gaps` stops gaining rows. `/health/context` reports `last_coverage_check` age; stale beyond 48h is itself an alert. This is the failure that produced this document. | A1 |

## Decisions

- [ADR-005](ADR-005-repair-the-corpus-before-tuning-the-ranking.md) — sequence is forced
- [ADR-006](ADR-006-the-ledger-is-the-only-migration-tracker.md) — one migration truth
- [ADR-007](ADR-007-zero-chunks-is-a-failure-not-a-completion.md) — root-cause status fix
- [ADR-008](ADR-008-one-ann-index-on-semantic-chunks.md) — drop ivfflat
- [ADR-009](ADR-009-gate-activation-on-production-corpus-recall.md) — honest gate

## What this deliberately does not do

- No admin UI. Notes9 has no admin routes and no CI; a dashboard is a new surface to
  maintain when one JSON endpoint answers the question. Add one when a non-engineer needs
  to read it.
- No new migration tooling. The ledger works; it was applied out of order once.
- No rewrite of the redrive runbook. It is correct and already batched.
- No new eval harness. `retrieval_eval.py` already compares both paths; it needs a real
  corpus, not more code.
- `WORKER_CONTEXTUAL_RETRIEVAL` stays off. It is a per-chunk LLM cost with no bearing on
  the 55% gap.
