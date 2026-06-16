-- Migration 080: chat_entities + memory_entity join table + HNSW index +
--   match_chat_entities VOLATILE SECURITY DEFINER RPC
--
-- Implements Tier 2.3 "cross-session entity linking" from
-- AI/catalyst/docs/AGENT_GAP_IMPLEMENTATION_PLAN.md §2.3.
--
-- House style:
--   * extensions.vector(1536) for all embedding columns
--   * SECURITY DEFINER + search_path = '' on every RPC
--   * VOLATILE (not STABLE) on functions that SET LOCAL
--   * Deny-all RLS — service_role bypasses for agent writes
--   * IF NOT EXISTS / IF EXISTS everywhere for idempotency
--
-- NOT APPLIED — write-only migration file.

-- ── 1. Enable pgvector if not already present ────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ── 2. chat_entities ─────────────────────────────────────────────────────────
-- Each row is one canonical entity (gene, compound, assay name …) for a user.
-- canonical_name is the normalised form (e.g. "KRAS G12C", not "that oncogene").
CREATE TABLE IF NOT EXISTS public.chat_entities (
    id            uuid                     NOT NULL DEFAULT gen_random_uuid(),
    user_id       uuid                     NOT NULL,
    canonical_name text                   NOT NULL,
    embedding     extensions.vector(1536) NOT NULL,
    created_at    timestamptz             NOT NULL DEFAULT now(),
    CONSTRAINT chat_entities_pkey            PRIMARY KEY (id),
    CONSTRAINT chat_entities_user_id_fkey    FOREIGN KEY (user_id)
        REFERENCES public.profiles(id) ON DELETE CASCADE,
    -- One canonical name per user (case-sensitive; normalisation is caller's
    -- responsibility so we keep the index simple).
    CONSTRAINT chat_entities_user_canonical_uniq UNIQUE (user_id, canonical_name)
);

-- ── 3. memory_entity join table ───────────────────────────────────────────────
-- Links a stored memory fact to the entities it mentions so contradictions about
-- the same entity co-retrieve during reconcile.
CREATE TABLE IF NOT EXISTS public.memory_entity (
    memory_id   uuid NOT NULL,
    entity_id   uuid NOT NULL,
    CONSTRAINT memory_entity_pkey              PRIMARY KEY (memory_id, entity_id),
    CONSTRAINT memory_entity_memory_id_fkey    FOREIGN KEY (memory_id)
        REFERENCES public.chat_memories(id) ON DELETE CASCADE,
    CONSTRAINT memory_entity_entity_id_fkey    FOREIGN KEY (entity_id)
        REFERENCES public.chat_entities(id)  ON DELETE CASCADE
);

-- Index the reverse direction (all memories for a given entity).
CREATE INDEX IF NOT EXISTS idx_memory_entity_entity_id
    ON public.memory_entity (entity_id);

-- ── 4. HNSW index on chat_entities.embedding ─────────────────────────────────
-- cosine distance mirrors the operator used in match_chat_entities below.
-- CONCURRENTLY cannot be used inside a transaction block; run standalone.
CREATE INDEX IF NOT EXISTS idx_chat_entities_embedding_hnsw
    ON public.chat_entities
    USING hnsw (embedding extensions.vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ── 5. Row-Level Security: deny-all (service_role bypasses automatically) ─────
ALTER TABLE public.chat_entities  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_entity  ENABLE ROW LEVEL SECURITY;

-- Drop before recreating so re-runs are idempotent.
DROP POLICY IF EXISTS deny_all ON public.chat_entities;
DROP POLICY IF EXISTS deny_all ON public.memory_entity;

CREATE POLICY deny_all ON public.chat_entities  AS RESTRICTIVE USING (false);
CREATE POLICY deny_all ON public.memory_entity  AS RESTRICTIVE USING (false);

-- ── 6. match_chat_entities RPC ───────────────────────────────────────────────
-- Mirrors 078 match_chat_memories / match_chat_procedures shape exactly:
--   (match_user_id, query_embedding, match_count, similarity_threshold)
-- Returns (id, canonical_name, similarity) ordered by similarity DESC.
--
-- VOLATILE because it executes SET LOCAL hnsw.ef_search.
-- SECURITY DEFINER so the agent (service_role caller) can read across RLS.
-- search_path = '' prevents search-path injection.
CREATE OR REPLACE FUNCTION public.match_chat_entities(
    match_user_id      uuid,
    query_embedding    extensions.vector(1536),
    match_count        int,
    similarity_threshold float8
)
RETURNS TABLE (
    id             uuid,
    canonical_name text,
    similarity     float8
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
-- Must include `extensions` so the bare pgvector `<=>` operator (defined in the
-- extensions schema) resolves — an empty search_path makes `<=>` "does not
-- exist" at runtime. Mirrors the applied 078 match_* functions exactly.
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
    -- Widen the HNSW dynamic candidate list for better recall at query time.
    SET LOCAL hnsw.ef_search = 100;

    RETURN QUERY
    SELECT
        e.id,
        e.canonical_name,
        1.0 - (e.embedding <=> query_embedding) AS similarity
    FROM public.chat_entities e
    WHERE
        e.user_id = match_user_id
        AND 1.0 - (e.embedding <=> query_embedding) >= similarity_threshold
    ORDER BY e.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Revoke public execute; only service_role (the agent backend) should call this.
REVOKE ALL ON FUNCTION public.match_chat_entities(
    uuid, extensions.vector(1536), int, float8
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_chat_entities(
    uuid, extensions.vector(1536), int, float8
) TO service_role;
