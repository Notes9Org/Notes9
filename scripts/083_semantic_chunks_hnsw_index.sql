-- 083_semantic_chunks_hnsw_index.sql
--
-- Adds an ANN (HNSW) vector index on public.semantic_chunks.embedding so the
-- agent's passage retrieval (find_passages -> RAGService.hybrid_search_chunks /
-- search_chunks) stops doing an exact, sequential-scan KNN on every query.
--
-- Root cause / why this is needed (audit H-9):
--   Both the dense path (`ORDER BY embedding <=> %s`) and the hybrid path
--   (`1 - (embedding <=> %s)` inside the scored CTE) rank rows by cosine
--   distance against the query vector. With NO vector index on
--   semantic_chunks.embedding, PostgreSQL must compute that distance for EVERY
--   scoped row before LIMIT — a sequential scan that grows with the table and
--   burns CPU on every agent turn. semantic_chunks already has btree indexes on
--   (source_type, source_id) / (project_id) / (experiment_id) and a GIN index on
--   the `fts` column (migration 001), plus the FTS leg used by the hybrid query
--   — but the vector leg has no ANN index. HNSW with vector_cosine_ops turns the
--   distance ranking into an approximate-nearest-neighbour probe.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ‼ PREREQUISITE / COORDINATION ITEM — embedding column must be a FIXED-dim vector
-- ─────────────────────────────────────────────────────────────────────────────
--   pgvector can only build an HNSW index on a vector column whose dimension is
--   known at build time. Migration 001 created the column as bare
--   `embedding vector` (NO dimension). A plain `CREATE INDEX ... USING hnsw`
--   against an un-dimensioned vector column fails with:
--       ERROR: column does not have dimensions
--   So this migration first pins the column to a fixed dimension, then builds
--   the index. The agent embeds with Cohere embed-v4 and every other embedding
--   column in this schema is `extensions.vector(1536)` (chat_memories [047],
--   chat_episode_summaries [077], chat_entities [080]) — so 1536 is the
--   established dimension. The ALTER below is wrapped in a guard that skips when
--   the column already carries a dimension (i.e. it is idempotent and a no-op if
--   a prior step already typed it).
--
--   >>> BEFORE APPLYING, CONFIRM AGAINST PRODUCTION DATA <<<
--   Run:
--       SELECT DISTINCT vector_dims(embedding) FROM public.semantic_chunks
--       WHERE embedding IS NOT NULL LIMIT 5;
--   If that returns anything other than a single value of 1536, STOP and adjust
--   the dimension literal in BOTH the ALTER and the index op-class below — do not
--   apply with a mismatched dimension (the ALTER would error on the first row
--   whose stored vector has a different length).
--
-- BUILD COST / LOCK WARNING:
--   A plain CREATE INDEX takes a SHARE lock that blocks writes to semantic_chunks
--   for the duration of the build, and the ALTER ... TYPE takes an ACCESS
--   EXCLUSIVE lock that rewrites the table. If semantic_chunks is large, apply
--   during a low-traffic window, or use the ZERO-DOWNTIME ALTERNATIVE at the
--   bottom (CONCURRENTLY — cannot run inside a transaction block, so it must run
--   statement-by-statement in a direct psql session, NOT through a runner that
--   wraps the file in a transaction).
--
-- This DB has previously suffered connection-slot exhaustion. These statements
-- add NO RLS, NO auth checks, and NO per-request queries — the only pressure is
-- the one-time build/rewrite locks above.
--
-- Idempotent: the ALTER is guarded (skips when already dimensioned) and the
-- index uses IF NOT EXISTS. Modifies no row data.

SET maintenance_work_mem = '256MB';

-- 1) Pin the embedding column to a fixed dimension if it isn't already. Guarded
--    so re-runs (and a column that was already typed out-of-band) are no-ops.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'semantic_chunks'
      AND column_name = 'embedding'
      AND udt_name = 'vector'
      AND character_maximum_length IS NULL  -- un-dimensioned vector
  ) THEN
    -- COORDINATION: dimension literal (1536) must match production data — see
    -- the vector_dims() check above.
    ALTER TABLE public.semantic_chunks
      ALTER COLUMN embedding TYPE extensions.vector(1536);
  END IF;
END
$$;

-- 2) HNSW ANN index on semantic_chunks.embedding (cosine, Cohere embed-v4 / 1536-dim).
--    Mirrors the build params used for the memory-layer HNSW indexes in 070
--    (m=16, ef_construction=64), which keep recall ~1.0 at the small k these
--    searches use when the query sets hnsw.ef_search appropriately.
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_embedding_hnsw
  ON public.semantic_chunks
  USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ---------------------------------------------------------------------------
-- ZERO-DOWNTIME ALTERNATIVE (run manually in a direct psql session, NOT via a
-- transaction-wrapping migration runner; CONCURRENTLY must be its own
-- transaction). After it succeeds, the plain statement above becomes a no-op
-- thanks to IF NOT EXISTS. The ALTER ... TYPE step cannot be done CONCURRENTLY —
-- if the table is large, plan a maintenance window for step 1, or add the
-- dimension via a validated new column + backfill + swap (out of scope here).
--
--   SET maintenance_work_mem = '256MB';
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_semantic_chunks_embedding_hnsw
--     ON public.semantic_chunks
--     USING hnsw (embedding extensions.vector_cosine_ops)
--     WITH (m = 16, ef_construction = 64);
-- ---------------------------------------------------------------------------
