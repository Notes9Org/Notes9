-- Migration 081: BM25 leg for chat_memories
--   * generated tsvector column content_tsv (to_tsvector('english', content))
--   * GIN index on content_tsv
--   * bm25_chat_memories(match_user_id, query_text, match_count) SECURITY DEFINER RPC
--
-- Implements Tier 2.3 "BM25 leg" from
-- AI/catalyst/docs/AGENT_GAP_IMPLEMENTATION_PLAN.md §2.3.
--
-- Rationale: pure-vector recall blurs exact tokens (gene names, catalog numbers,
-- assay identifiers).  A BM25/ts_rank leg surface-complements vector hits;
-- the caller (MemoryStore.search_memory_bm25) RRF-fuses them in Python.
--
-- House style:
--   * SECURITY DEFINER + search_path = '' on RPC
--   * is_invalidated = false filter (mirrors vector leg behaviour)
--   * Idempotent: IF NOT EXISTS on column/index, OR REPLACE on function
--   * NOT APPLIED — write-only migration file.

-- ── 1. Add generated tsvector column (idempotent via DO block) ────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'chat_memories'
          AND column_name  = 'content_tsv'
    ) THEN
        ALTER TABLE public.chat_memories
            ADD COLUMN content_tsv tsvector
                GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
    END IF;
END;
$$;

-- ── 2. GIN index on content_tsv ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chat_memories_content_tsv_gin
    ON public.chat_memories
    USING GIN (content_tsv);

-- ── 3. bm25_chat_memories RPC ─────────────────────────────────────────────────
-- Accepts free-form query text; uses websearch_to_tsquery for safe, expressive
-- parsing (handles phrases, negation, OR) without risk of tsquery syntax errors.
-- Returns (id, content, memory_type, entities, importance, source_message_id,
--          created_at, rank) ordered by ts_rank DESC, limited to match_count rows.
-- Only active (is_invalidated = false) facts are returned, matching the vector
-- leg's behaviour.
--
-- SECURITY DEFINER so the agent backend (service_role) can read across RLS.
-- search_path = '' prevents search-path injection.
-- No SET LOCAL needed (no GUC tuning), so STABLE would be correct — but we
-- declare VOLATILE to stay consistent with the rest of the match_* family and
-- to leave room for future GUC tuning without a signature change.
CREATE OR REPLACE FUNCTION public.bm25_chat_memories(
    match_user_id  uuid,
    query_text     text,
    match_count    int
)
RETURNS TABLE (
    id                uuid,
    content           text,
    memory_type       text,
    entities          text[],
    importance        float8,
    source_message_id uuid,
    created_at        timestamptz,
    rank              float4
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    _tsq tsquery;
BEGIN
    -- websearch_to_tsquery returns NULL for blank/unsearchable input; guard
    -- here so we return an empty result set rather than a runtime error.
    _tsq := websearch_to_tsquery('english', query_text);
    IF _tsq IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        m.id,
        m.content,
        m.memory_type,
        m.entities,
        m.importance,
        m.source_message_id,
        m.created_at,
        ts_rank(m.content_tsv, _tsq) AS rank
    FROM public.chat_memories m
    WHERE
        m.user_id       = match_user_id
        AND m.is_invalidated = false
        AND m.content_tsv @@ _tsq
    ORDER BY rank DESC
    LIMIT match_count;
END;
$$;

-- Revoke public execute; only service_role (the agent backend) should call this.
REVOKE ALL ON FUNCTION public.bm25_chat_memories(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bm25_chat_memories(uuid, text, int) TO service_role;
