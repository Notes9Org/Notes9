# Deferred: work in this architecture that is not a slice

Not everything in `../ARCHITECTURE.md` can be built by a worktree agent. `/fleet` opens
pull requests; it cannot mutate production data, flip a production environment variable, or
author gold labels against a corpus that does not exist yet. Pretending otherwise would
produce slices that cannot pass their own done-criteria.

This file exists so that nothing silently falls out of the plan, and so the Failure-modes
rows owned by these items have a documented home rather than reaching no brief at all.

---

## OPS-1: Execute the corpus re-drive (Phase B, operator action)

**Not a slice.** It mutates production data through hand-run SQL. The runbook
`scripts/runbooks/2026-08-04_redrive.md` (342 lines) states it directly at `:3-6`:
`HAND-RUN ONLY. DO NOT AUTO-RUN.` It was written on 2026-08-04 and, judging by unchanged
job counts on 2026-08-08, has never been executed.

**Ordering, and why each step is where it is:**

1. Slice 03 merges and the worker deploys. The re-drive must run against a worker that
   re-raises real errors. `insert_chunks` returning a bool is what left 304 rows carrying
   the identical undiagnosable string `"Failed to insert chunks into database"`. Re-driving
   before that deploy manufactures 304 more of them.
2. Set `WORKER_CONTENT_ADDRESSED=true`. **Before** the bulk re-drive, not after, and for
   data safety rather than performance (ADR-005). `replace_chunks` from migration 107 is a
   single atomic RPC. The legacy path deletes a source's chunks and then inserts
   replacements in non-transactional batches of 100, so a failure mid-loop leaves the
   source with fewer chunks than it started with. Re-driving 453 sources through the legacy
   path can make coverage worse than doing nothing.
3. Run the runbook: debris deletion, failed-to-pending reset in batches of 50, requeue of
   zero-chunk sources.
4. Reset the 15 jobs stuck in `processing` since 2026-03-18. They all have
   `claimed_at IS NULL` and `claim_chunk_jobs` excludes that population by design, so they
   will never self-heal. One targeted `UPDATE`, once.
5. Watch `/health/context` (slice 02) until `worst_gap_pct` is under 2.0.

**Batching is mandatory, not stylistic.** `retry_failed_jobs` with no limit builds a single
`.in_("id", [...])` over 400+ UUIDs, roughly a 15KB URL, which risks an HTTP 414 from
PostgREST. Use `--retry-limit`. The collision between "414 failed jobs" and "HTTP 414" is a
coincidence and an easy one to misread in a log.

**Failure modes owned here** (from `../ARCHITECTURE.md`):

| Mode | Guaranteed behaviour |
|---|---|
| **Volume** re-drive of 4k failed rows | Reset batches at 50 (runbook §3). A single `.in_(id)` over 400+ UUIDs risks PostgREST HTTP 414. |
| **Volume** 10x concurrent writers on one source | `replace_chunks` is one atomic RPC per source. Last writer wins; `source_hash` makes a no-op re-ingest free. |
| **Size** 10k-chunk document | Legacy path: 100 non-transactional batches, partial write possible. Content-addressed: one RPC, all or nothing. This is why step 2 precedes step 3. |
| **Shape** source row deleted between enqueue and process | Job is debris. Runbook §2 deletes non-`delete` jobs in `pending`/`failed` whose source is gone, leaving `processing` untouched. |
| **Partial failure** retry arrives twice | `replace_chunks` is idempotent on `source_hash`. The legacy delete-then-insert is not, protected only by the unique constraint on `(source_type, source_id, chunk_index)`. |
| **Partial failure** re-drive interrupted halfway | Runbook steps are individually idempotent and re-runnable. Reset is `.eq("status","failed")`-scoped, so a partial run cannot promote a `completed` job. |

**Done when** every source type reports `gap_pct` under 2.0 through `/health/context`, and
the nightly `run_chunk_coverage_check()` has produced at least two consecutive green runs.

---

## PHASE-C-1: Drop the redundant ivfflat index (ADR-008)

**A slice, but not yet.** It is one `DROP INDEX` and belongs in a migration, so it is
mechanically trivial. It is deferred on purpose: ADR-008 places it after the corpus settles,
because the re-drive is the heaviest write period this system will see and dropping an
index mid-write means changing a moving target. One variable moves at a time.

`semantic_chunks` carries two ANN indexes on the same `embedding` column:
`idx_semantic_chunks_embedding` (ivfflat, `lists=100`, badly mistuned for 4866 rows where
the guidance is roughly `rows/1000`) and `idx_semantic_chunks_embedding_hnsw`. If the
planner picks ivfflat, `NOTES9_HNSW_EF_SEARCH` does nothing at all, which makes any
retrieval measurement partly a record of planner choice.

Becomes migration 114 once OPS-1 is green. Same agents as slice 01.

---

## PHASE-C-2: Build the production gold set and run the activation gate (ADR-009)

**Not a slice, and the largest piece of human work in this plan.** It cannot start until
OPS-1 is green, because a gold set built against today's corpus bakes in absences that are
non-random by source type: `literature_review` is missing 67.9% of its sources while
`experiment_summary` is missing 11.1%, so the set would be silently biased toward whichever
types happen to be healthy.

30 to 50 queries, stratified across all six source types in rough proportion to their
post-repair share, with expected `source_id`s recorded from real documents. Extends the
existing `catalyst/eval/gold/` convention; adds no harness code, since
`catalyst/eval/retrieval_eval.py` already compares legacy and unified side by side.

Queries are authored against documents, never by inspecting retriever output, or the gold
set encodes the behaviour of whichever path produced it. An LLM may draft candidate queries
for human verification; it may not own the expected answers, because its errors correlate
with the retriever's own failure modes, particularly vocabulary mismatch, which is exactly
what the eval exists to test.

**Gate:** unified `recall@context` at least legacy, with no single source type regressing
more than 5 points. The per-type floor exists because an aggregate mean hides one category
of document becoming unfindable.

A failed gate produces a written finding naming which source type regressed and why.
"The eval was inconclusive so we did nothing" is how six work packages reached the state
that started all of this.

**Failure modes owned here:**

| Mode | Guaranteed behaviour |
|---|---|
| **Cost** contextual blurbs at backfill scale | `WORKER_CONTEXTUAL_RETRIEVAL` calls Haiku once per chunk; backfilling 4866 chunks is 4866 LLM calls. Flag stays off through Phases A and B and is not part of this rollout. |
| **Cost/latency** rerank on every query | Cohere on Bedrock over the top 50 fused results, only when `NOTES9_RAG_RERANK` is on. Last flag flipped, first reverted. |
| **Partial failure** Supabase down mid-retrieval | `psycopg2.OperationalError` re-raises deliberately; any other exception degrades to the legacy blend. Preserved as-is. |
| **Boundaries** empty corpus, new user | Retrieval returns zero results and the agent states it found nothing rather than answering unsourced. Existing behaviour, and worth an explicit test given 55% of sources currently return nothing. |

---

## PHASE-C-3: Flip the retrieval flags

One at a time, each confirmed through `/health/context` before the next:
`NOTES9_RETRIEVER=unified`, then `NOTES9_CONTEXT_ROUTER`, then optionally
`NOTES9_RAG_RERANK`. Every one is reversible by restart.

Gated on PHASE-C-2 passing. Not gated on anything else, and specifically not on further
code changes: the code has been merged and deployed since 2026-08-04.
