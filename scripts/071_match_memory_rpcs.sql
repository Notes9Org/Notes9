-- 071_match_memory_rpcs.sql
--
-- Brings the two agent-memory vector-search RPCs into version control.
--
-- Root cause / why this migration exists:
--   match_chat_memories and match_episode_summaries are called from the
--   Catalyst backend (AI/catalyst/agents/core/memory/store.py:174,286 and
--   AI/catalyst/context_management/long_term.py:29) but their CREATE FUNCTION
--   definitions exist ONLY in the live database — they were created by hand and
--   never committed. On any environment reset the functions vanish and recall
--   fails SILENTLY (the client swallows the error and returns []). This file
--   makes the definition reproducible.
--
-- ⚠️ VERIFY-AGAINST-LIVE BEFORE APPLYING (mandatory):
--   These bodies are the *intended canonical* definitions. Two consumers depend
--   on the exact column NAMES and the ranking semantics, so before you apply
--   this to an environment that already has the hand-created functions, dump the
--   live bodies and diff them:
--       SELECT pg_get_functiondef(oid)
--       FROM pg_proc
--       WHERE proname IN ('match_chat_memories','match_episode_summaries');
--   This file uses CREATE OR REPLACE *without* a DROP on purpose: if the live
--   return shape differs, Postgres raises "cannot change return type of existing
--   function" and the apply FAILS LOUDLY — reconcile the diff rather than letting
--   a silent body-swap change recall. (A blind DROP+CREATE would hide that.)
--   If the live ranking math (similarity formula, ORDER BY direction, threshold
--   comparison) differs from below, make THIS file match live verbatim and change
--   behaviour in a separate, separately-reviewed migration.
--
-- Scope of this migration: reproducibility + recall-parity only. It deliberately
--   does NOT add the `is_invalidated = false` filter to match_chat_memories —
--   that filter only becomes load-bearing once a memory-invalidation writer
--   exists, so it ships in its own migration alongside that feature (keeps the
--   one behaviour-changing diff isolated and reviewable).
--
-- supabase-py calls these by NAMED args; the parameter names below
--   (match_user_id, query_embedding, match_count, similarity_threshold) must
--   match the dict keys passed from store.py exactly.
--
-- SECURITY DEFINER + pinned search_path follows the house pattern from
--   068_chunk_enqueue_security_definer.sql. The agent backend uses the service
--   role (bypasses RLS) but DEFINER keeps recall working for any caller and
--   prevents search-path injection.
--
-- Idempotent; modifies no data.

-- ────────────────────────────────────────────────────────────────────────────
-- match_chat_memories — granular long-term facts
--   Consumed by store.search_memory_facts (store.py:286-307): reads
--   content, memory_type, entities, importance, source_message_id.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_chat_memories(
  match_user_id        uuid,
  query_embedding      extensions.vector,
  match_count          integer          DEFAULT 4,
  similarity_threshold double precision DEFAULT 0.75
)
RETURNS TABLE (
  content           text,
  memory_type       text,
  entities          text[],
  importance        double precision,
  source_message_id uuid,
  similarity        double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  -- HNSW recall knob: high enough that the indexed top-k matches the old exact
  -- seq-scan at the small match_count these callers use.
  SET LOCAL hnsw.ef_search = 100;

  RETURN QUERY
  SELECT
    cm.content,
    cm.memory_type,
    cm.entities,
    cm.importance,
    cm.source_message_id,
    (1.0 - (cm.embedding <=> query_embedding))::double precision AS similarity
  FROM public.chat_memories cm
  WHERE cm.user_id = match_user_id
    AND (1.0 - (cm.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY cm.embedding <=> query_embedding   -- ascending distance = descending similarity
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

-- ────────────────────────────────────────────────────────────────────────────
-- match_episode_summaries — per-session episodic summaries
--   Consumed by store.match_episode_summaries (store.py:174-194): reads
--   session_id, summary_text, similarity, updated_at. ALSO consumed by
--   context_management/long_term.py:29 (reads session_id, summary_text) — keep
--   both column names stable.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_episode_summaries(
  match_user_id        uuid,
  query_embedding      extensions.vector,
  match_count          integer          DEFAULT 3,
  similarity_threshold double precision DEFAULT 0.72
)
RETURNS TABLE (
  session_id   uuid,
  summary_text text,
  similarity   double precision,
  updated_at   timestamptz
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
    ces.session_id,
    ces.summary_text,
    (1.0 - (ces.embedding <=> query_embedding))::double precision AS similarity,
    ces.updated_at
  FROM public.chat_episode_summaries ces
  WHERE ces.user_id = match_user_id
    AND (1.0 - (ces.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY ces.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.match_episode_summaries(
  uuid, extensions.vector, integer, double precision
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_episode_summaries(
  uuid, extensions.vector, integer, double precision
) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_episode_summaries(
  uuid, extensions.vector, integer, double precision
) TO authenticated;
