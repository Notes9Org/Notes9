-- 070_chat_memory_vector_indexes.sql
--
-- Adds ANN (HNSW) vector indexes for the agent memory layer, plus the btree
-- indexes that migration 047 forgot for chat_episode_summaries.
--
-- Root cause / why this is needed:
--   match_chat_memories and match_episode_summaries (see 071_match_memory_rpcs)
--   rank rows by cosine distance: `embedding <=> query_embedding`. With NO
--   vector index, PostgreSQL must compute that distance for EVERY row of the
--   user before applying LIMIT — a sequential scan that grows with the table
--   and burns CPU on every agent turn. HNSW with vector_cosine_ops turns that
--   into an approximate-nearest-neighbour probe.
--   Separately, chat_episode_summaries has no index on (session_id) or
--   (user_id), so load_session_summary() and the per-user RPC filter also
--   sequential-scan. 047 created those indexes only for chat_memories.
--
-- Recall parity note (important for "behaviour-neutral"):
--   HNSW is APPROXIMATE. To keep the indexed top-k effectively identical to
--   the old exact seq-scan, the match RPCs set `hnsw.ef_search = 100` at query
--   time (see 071). Build quality here (m=16, ef_construction=64) plus that
--   ef_search keeps recall ~1.0 at the small k (3-6) these RPCs use.
--
-- BUILD COST / LOCK WARNING:
--   A plain CREATE INDEX takes a SHARE lock that blocks writes to the table for
--   the duration of the build. The memory tables are young (low row counts) so
--   the build window is short. `maintenance_work_mem` is raised (session-local)
--   to speed it up. If either table has grown large by the time you apply this,
--   build the HNSW indexes with the CONCURRENTLY variant documented at the
--   bottom INSTEAD — but note CONCURRENTLY cannot run inside a transaction
--   block, so it must be run statement-by-statement in a direct psql session,
--   NOT through a runner that wraps the file in a transaction.
--
-- This DB has previously suffered connection-slot exhaustion. These statements
-- add NO RLS, NO auth checks, and NO per-request queries — the only pressure is
-- the one-time build lock above. Apply during a low-traffic window if the
-- tables are large.
--
-- Idempotent (IF NOT EXISTS); modifies no data.

SET maintenance_work_mem = '256MB';

-- HNSW ANN index on chat_memories.embedding (cosine, Cohere embed-v4 / 1536-dim)
CREATE INDEX IF NOT EXISTS idx_chat_memories_embedding_hnsw
  ON public.chat_memories
  USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- HNSW ANN index on chat_episode_summaries.embedding
CREATE INDEX IF NOT EXISTS idx_chat_episode_summaries_embedding_hnsw
  ON public.chat_episode_summaries
  USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- btree indexes missing from 047 — used by load_session_summary() and the
-- per-user WHERE clause in match_episode_summaries.
CREATE INDEX IF NOT EXISTS idx_chat_episode_summaries_session_id
  ON public.chat_episode_summaries (session_id);

CREATE INDEX IF NOT EXISTS idx_chat_episode_summaries_user_id
  ON public.chat_episode_summaries (user_id);

-- ---------------------------------------------------------------------------
-- ZERO-DOWNTIME ALTERNATIVE (run manually in a direct psql session, NOT via a
-- transaction-wrapping migration runner; each CONCURRENTLY statement must be
-- its own transaction). After these succeed, the plain statements above become
-- no-ops thanks to IF NOT EXISTS.
--
--   SET maintenance_work_mem = '256MB';
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_memories_embedding_hnsw
--     ON public.chat_memories
--     USING hnsw (embedding extensions.vector_cosine_ops)
--     WITH (m = 16, ef_construction = 64);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_episode_summaries_embedding_hnsw
--     ON public.chat_episode_summaries
--     USING hnsw (embedding extensions.vector_cosine_ops)
--     WITH (m = 16, ef_construction = 64);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_episode_summaries_session_id
--     ON public.chat_episode_summaries (session_id);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_episode_summaries_user_id
--     ON public.chat_episode_summaries (user_id);
-- ---------------------------------------------------------------------------
