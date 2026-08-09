# ADR-008: One ANN index on semantic_chunks, drop the ivfflat

- Status: accepted
- Date: 2026-08-08
- Supersedes: none

## Context

`public.semantic_chunks` carries two approximate-nearest-neighbour indexes on the same
`embedding` column:

```
idx_semantic_chunks_embedding       USING ivfflat (embedding vector_cosine_ops) WITH (lists='100')
idx_semantic_chunks_embedding_hnsw  USING hnsw    (embedding vector_cosine_ops) WITH (m='16', ef_construction='64')
```

Postgres picks one per query. Which one it picks is a planner decision that nothing in the
application controls, and the two behave differently in ways that matter.

The unified retriever sets `SET LOCAL hnsw.ef_search = %s` per transaction
(`AI/catalyst/infra/rag.py:280`), resolved from `NOTES9_HNSW_EF_SEARCH` with a default of
100. The code comments explain the choice: pgvector's own default of 40 is too tight once
RRF rather than a threshold decides what survives. That knob has no effect on an ivfflat
scan. If the planner chooses ivfflat, the tuning silently does nothing.

The ivfflat index is also mistuned for the table. `lists=100` against 4866 rows gives
roughly 49 rows per list, where the usual guidance is around `rows/1000`, so approximately
5. Over-partitioning at this size means each probe covers a small fraction of the vector
space and recall degrades. An ivfflat index built before the table had meaningful data
never got revisited.

Two ANN indexes on one column also means every chunk insert maintains both. During a
453-source re-drive that write amplification is paid on every row, for an index that should
not be serving queries.

The immediate consequence is for measurement. ADR-009 gates activation on a recall@context
comparison between the legacy and unified retrieval paths. If the planner can choose
between a tuned HNSW and a mistuned ivfflat, that comparison measures planner choice as
much as retrieval strategy, and a rerun can produce a different verdict with no code
change.

## Decision

Drop `idx_semantic_chunks_embedding`. HNSW is the single ANN index on
`semantic_chunks.embedding`.

HNSW is kept rather than ivfflat because it is the index the application actually tunes,
it needs no `lists` parameter to re-tune as the table grows, and its recall/latency
trade-off is controllable at query time through the existing `ef_search` knob.

This lands in Phase C before any eval run, so every measurement is taken against one index.
It is deliberately not done during Phase B: the re-drive is the heaviest write period, and
dropping an index mid-write is a change to a moving target. Ordering it after the corpus
settles keeps one variable moving at a time.

## Consequences

Buys: retrieval behaviour becomes deterministic and the `ef_search` knob is guaranteed to
apply. Chunk inserts maintain one ANN index instead of two, which matters most during the
re-drive that immediately precedes this. Eval results become reproducible.

Costs: recreating the ivfflat index later requires a full rebuild. At current scale that is
seconds; the cost grows with the table. Dropping an index is a brief lock on
`semantic_chunks`, which is why it is scheduled outside the re-drive window.

Forecloses: little in practice. HNSW dominates ivfflat on recall at this scale, and its
main disadvantages, build time and memory, are not binding at 4866 rows or at ten times
that. If the table reaches a scale where HNSW build cost becomes a problem, that is a
re-evaluation with real numbers, not a reason to keep a mistuned second index now.

## Alternatives rejected

**Keep both and force the planner toward HNSW.** Lost because there is no clean way to do
it. Disabling scan types per query is a session-level hack, and index hints do not exist in
Postgres. The reliable way to stop the planner choosing an index is to remove it.

**Keep ivfflat and retune `lists` to about 5.** Lost because it keeps two indexes to
maintain, keeps the planner ambiguity, and `lists` needs revisiting on every significant
change in table size. HNSW needs no equivalent maintenance.

**Drop HNSW and keep a retuned ivfflat.** Lost because the application code is written
around `hnsw.ef_search`, with the default and the reasoning documented at
`rag.py:111-114`. Choosing ivfflat means deleting that control and the tuning behind it to
keep the older index.

**Defer the decision until after activation.** Lost because it makes the activation gate
untrustworthy. The gate is a retrieval measurement, and this is an uncontrolled variable
inside it.
