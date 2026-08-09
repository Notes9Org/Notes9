# ADR-005: Repair the corpus before tuning the ranking

- Status: accepted
- Date: 2026-08-08
- Supersedes: the activation order in `AI/catalyst/docs/ROLLOUT_2026-08-04_context_flags.md`

## Context

The 2026-08-04 rollout plan sequences activation by risk of the code change: flip
`WORKER_CONTENT_ADDRESSED`, then `NOTES9_RETRIEVER`, gated on a recall@context eval. That
ordering assumes the corpus underneath is sound and only the ranking over it is in
question.

Measurement on 2026-08-08 shows it is not. 453 of 823 enqueued sources have zero chunks,
a 55% coverage gap, with `literature_review` at 67.9%. Migration 108's alert threshold is
2%; the monitor has never run because pg_cron is not installed.

The unified retriever changes how results are **ranked**: RRF fusion at k=60 replacing a
0.7/0.3 weighted blend, Cohere rerank, HNSW `ef_search` control. None of that retrieves a
document that was never chunked.

Two consequences follow. First, the expected value is lopsided: recovering 453 documents
dominates any reordering of the 370 already present. Second, and more decisive, the
ranking change is **unmeasurable** in the current state. A recall@context comparison
between legacy and unified cannot separate "unified ranks better" from "the answer
happened to be among the 45% that got chunked", because gold queries are drawn from a
corpus whose absences are non-random. `literature_review` is missing two thirds of its
sources, so any gold set built today is silently biased toward the source types that
happen to be healthy.

A further ordering constraint sits inside the repair itself. The legacy ingest path
deletes a source's existing chunks and then inserts replacements in non-transactional
batches of 100. A failure mid-loop leaves the source with fewer chunks than it started
with. Re-driving 453 sources through that path can make coverage worse than doing nothing.
`replace_chunks` (migration 107, gated by `WORKER_CONTENT_ADDRESSED`) performs the same
operation as a single atomic RPC.

## Decision

Activation proceeds in three strictly ordered phases: **See, Repair, Activate.** Each is a
precondition for the next, not a preference.

Observability lands first because the repair cannot be verified without it, and because
the absence of observability is what let a 55% gap persist unnoticed for months.

Within the repair, `WORKER_CONTENT_ADDRESSED` is flipped **before** the bulk re-drive. It
is promoted out of the retrieval rollout and treated as a data-safety prerequisite: it is
what makes re-ingestion atomic and idempotent, and therefore what makes a 453-source
re-drive safe to retry. It is no longer sequenced by its risk as a code change.

The retrieval flags (`NOTES9_RETRIEVER`, `NOTES9_CONTEXT_ROUTER`, `NOTES9_RAG_RERANK`) do
not move until the measured coverage gap is under 2% for every source type.

## Consequences

Buys: the repair is verifiable, retryable, and cannot silently reduce coverage. The eval
that gates the retrieval swap runs against a corpus that actually contains the documents,
so its verdict means something. The largest available quality win is taken first.

Costs: the retrieval work stays dead code for longer, on the order of days to weeks
depending on how the re-drive goes. Six merged work packages continue to earn nothing in
the meantime. That is a real cost and it is accepted, because activating them now would
produce an unmeasurable change on a broken substrate.

Forecloses: nothing structurally. Every flag remains independently reversible by restart.
If the coverage gap turns out to be unfixable for some source types, Phase C can proceed on
the healthy ones with the limitation written down, rather than being blocked forever.

## Alternatives rejected

**Keep the risk-ordered rollout and flip the retrieval flags now.** Lost because the gate
it depends on cannot produce a trustworthy verdict against a corpus missing 55% of its
documents. Flipping on that evidence is a coin toss dressed as a measurement.

**Run repair and activation in parallel to save time.** Lost because they share a
dependency: the eval reads the corpus the repair is mutating. Concurrent execution means
every eval result is against an unknown corpus state and none of them are comparable.

**Revert the unified path and keep only the corpus repair.** A serious option, since the
repair carries nearly all the measurable value and the legacy retriever works. Rejected
because the legacy 0.7/0.3 blend breaks silently whenever the embedding model changes,
which is a live risk in a model-agnostic codebase, and because the work is already merged
and tested. Deleting it would be discarding a real asset to avoid a sequencing problem
that ordering solves.
