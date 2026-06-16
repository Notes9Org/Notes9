-- 078_fix_match_rpcs_volatile.sql
--
-- CRITICAL recall fix. Two production faults observed in the live logs:
--
--   1. match_chat_memories / match_episode_summaries each have TWO overloads
--      with the SAME arg TYPES but different arg ORDER:
--        (match_user_id uuid, query_embedding vector, ...)         ← 071/073 canonical
--        (query_embedding vector, match_user_id uuid, ...)         ← stale hand-created
--      supabase-py calls by NAMED args, so PostgREST matches both and refuses:
--        PGRST203 "Could not choose the best candidate function".
--      Result: fact + episode recall silently return [] on every turn.
--
--   2. ALL of these functions were declared STABLE but their body runs
--        SET LOCAL hnsw.ef_search = 100;
--      Postgres forbids SET inside a non-VOLATILE function:
--        0A000 "SET is not allowed in a non-volatile function".
--      match_chat_procedures (077) hits this on every call today; the memory /
--      episode functions would hit it too the moment the overload ambiguity
--      above is resolved. Net: ALL THREE memory recall RPCs are broken.
--
-- This migration DROPS every overload of the three functions and recreates ONE
-- canonical VOLATILE definition of each (VOLATILE is the only volatility class
-- that may execute SET; these are SECURITY DEFINER RPCs called once per query,
-- so VOLATILE has no planner downside). Return shapes are unchanged from
-- 071/073/077 — supabase-py reads columns by name. Supersedes the function
-- bodies in 071, 073, and 077.
--
-- Idempotent; modifies no row data.

-- ─── Drop EVERY overload of all three functions (signature-agnostic) ─────────
-- A plain DROP FUNCTION with an explicit arg signature can silently miss an
-- overload if the type name (extensions.vector) doesn't resolve in the editor's
-- search_path — leaving the duplicate behind and making the CREATE below fail
-- with "function already exists", which rolls the whole script back. This DO
-- block drops by name via the function's own regprocedure identity, so it
-- removes both arg-order overloads no matter how the type resolves.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('match_chat_memories', 'match_episode_summaries', 'match_chat_procedures')
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig::text;
  END LOOP;
END $$;

-- ─── match_chat_memories ─────────────────────────────────────────────────────
CREATE FUNCTION public.match_chat_memories(
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
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  SET LOCAL hnsw.ef_search = 100;
  RETURN QUERY
  SELECT
    cm.id, cm.content, cm.memory_type, cm.entities, cm.importance,
    cm.source_message_id, cm.created_at,
    (1.0 - (cm.embedding <=> query_embedding))::double precision AS similarity
  FROM public.chat_memories cm
  WHERE cm.user_id = match_user_id
    AND cm.is_invalidated = false
    AND (1.0 - (cm.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY cm.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.match_chat_memories(uuid, extensions.vector, integer, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_chat_memories(uuid, extensions.vector, integer, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_chat_memories(uuid, extensions.vector, integer, double precision) TO authenticated;

-- ─── match_episode_summaries ─────────────────────────────────────────────────
CREATE FUNCTION public.match_episode_summaries(
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
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  SET LOCAL hnsw.ef_search = 100;
  RETURN QUERY
  SELECT
    ces.session_id, ces.summary_text,
    (1.0 - (ces.embedding <=> query_embedding))::double precision AS similarity,
    ces.updated_at
  FROM public.chat_episode_summaries ces
  WHERE ces.user_id = match_user_id
    AND (1.0 - (ces.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY ces.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.match_episode_summaries(uuid, extensions.vector, integer, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_episode_summaries(uuid, extensions.vector, integer, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_episode_summaries(uuid, extensions.vector, integer, double precision) TO authenticated;

-- ─── match_chat_procedures ───────────────────────────────────────────────────
CREATE FUNCTION public.match_chat_procedures(
  match_user_id        uuid,
  query_embedding      extensions.vector,
  match_count          integer          DEFAULT 3,
  similarity_threshold double precision DEFAULT 0.70
)
RETURNS TABLE (
  id              uuid,
  title           text,
  content         text,
  trigger_context text,
  entities        text[],
  importance      double precision,
  created_at      timestamptz,
  similarity      double precision
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  SET LOCAL hnsw.ef_search = 100;
  RETURN QUERY
  SELECT
    cp.id, cp.title, cp.content, cp.trigger_context, cp.entities, cp.importance,
    cp.created_at,
    (1.0 - (cp.embedding <=> query_embedding))::double precision AS similarity
  FROM public.chat_procedures cp
  WHERE cp.user_id = match_user_id
    AND cp.is_invalidated = false
    AND (1.0 - (cp.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY cp.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.match_chat_procedures(uuid, extensions.vector, integer, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_chat_procedures(uuid, extensions.vector, integer, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_chat_procedures(uuid, extensions.vector, integer, double precision) TO authenticated;
