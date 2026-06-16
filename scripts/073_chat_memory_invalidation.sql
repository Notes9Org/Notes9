-- 073_chat_memory_invalidation.sql
--
-- Turns chat_memories from append-only into supersede-on-write, so contradicted
-- or duplicated facts stop being recalled (e.g. a target changed KRAS -> EGFR:
-- both used to be returned at equal weight).
--
-- What this adds:
--   * invalidated_at timestamptz  — when a fact was soft-invalidated (audit kept)
--   * superseded_by uuid          — the newer fact that replaced it (nullable)
--   * content_hash (generated)    — cheap exact-duplicate backstop per user
--   * a partial unique index on (user_id, content_hash) for active rows
--   * a partial index on active rows for the ANN scan domain
--   * match_chat_memories REWRITTEN to (a) return id + created_at so the app can
--     supersede/rerank, and (b) filter is_invalidated = false. The filter is a
--     no-op on today's data (nothing has ever set is_invalidated = true) and
--     becomes load-bearing the moment the reconcile-on-write path ships with
--     this migration.
--
-- The existing is_invalidated / derived_from_vote columns (047) are reused; this
-- migration only adds the audit/link columns and the dedup backstop.
--
-- ⚠️ match_chat_memories RETURN SHAPE CHANGES (adds id, created_at), so this uses
--    DROP + CREATE (CREATE OR REPLACE cannot change a function's return type).
--    Superion of 071. supabase-py reads columns by name, so the two extra
--    columns are backward-compatible with existing callers.
--
-- Idempotent; modifies no existing row data.

-- ---- audit / supersession columns -----------------------------------------
ALTER TABLE public.chat_memories
  ADD COLUMN IF NOT EXISTS invalidated_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by  uuid
    REFERENCES public.chat_memories(id) ON DELETE SET NULL;

-- ---- exact-duplicate backstop ---------------------------------------------
-- Generated column is deterministic and STORED so it can be indexed. This is an
-- EXACT-text guard only (not a semantic judgment) — semantic dedup is the LLM's
-- job in the reconcile-on-write path.
ALTER TABLE public.chat_memories
  ADD COLUMN IF NOT EXISTS content_hash text
    GENERATED ALWAYS AS (encode(extensions.digest(content, 'sha256'), 'hex')) STORED;

-- Backfill: the live table already contains exact-duplicate active facts (the
-- pre-073 append-only path let note_turn AND consolidate_session save the same
-- fact). Collapse each duplicate group to a single active row BEFORE adding the
-- unique index, keeping the most recent and superseding the rest. Idempotent:
-- once collapsed, only one active row per group remains so re-runs are no-ops.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, content_hash
      ORDER BY created_at DESC, id DESC
    ) AS rn,
    first_value(id) OVER (
      PARTITION BY user_id, content_hash
      ORDER BY created_at DESC, id DESC
    ) AS keep_id
  FROM public.chat_memories
  WHERE is_invalidated = false
)
UPDATE public.chat_memories cm
   SET is_invalidated = true,
       invalidated_at = now(),
       superseded_by  = ranked.keep_id
  FROM ranked
 WHERE cm.id = ranked.id
   AND ranked.rn > 1;

-- One active row per (user, exact content). Invalidated rows are excluded so a
-- re-stated fact can supersede an old one without colliding.
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_memories_user_content_active
  ON public.chat_memories (user_id, content_hash)
  WHERE is_invalidated = false;

-- ANN/scan domain shrinks as rows are invalidated.
CREATE INDEX IF NOT EXISTS idx_chat_memories_active
  ON public.chat_memories (user_id, created_at DESC)
  WHERE is_invalidated = false;

-- ---- match_chat_memories: add id + created_at, filter invalidated ----------
DROP FUNCTION IF EXISTS public.match_chat_memories(
  uuid, extensions.vector, integer, double precision
);

CREATE OR REPLACE FUNCTION public.match_chat_memories(
  match_user_id        uuid,
  query_embedding      extensions.vector,
  match_count          integer          DEFAULT 4,
  similarity_threshold double precision DEFAULT 0.75
)
RETURNS TABLE (
  id                uuid,
  content           text,
  memory_type       text,
  entities          text[],
  importance        double precision,
  source_message_id uuid,
  created_at        timestamptz,
  similarity        double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  SET LOCAL hnsw.ef_search = 100;

  RETURN QUERY
  SELECT
    cm.id,
    cm.content,
    cm.memory_type,
    cm.entities,
    cm.importance,
    cm.source_message_id,
    cm.created_at,
    (1.0 - (cm.embedding <=> query_embedding))::double precision AS similarity
  FROM public.chat_memories cm
  WHERE cm.user_id = match_user_id
    AND cm.is_invalidated = false
    AND (1.0 - (cm.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY cm.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.match_chat_memories(
  uuid, extensions.vector, integer, double precision
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_chat_memories(
  uuid, extensions.vector, integer, double precision
) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_chat_memories(
  uuid, extensions.vector, integer, double precision
) TO authenticated;
