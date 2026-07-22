-- 104: per-user serialization for consolidation claims (context backend, Slice 5)
--
-- Two workers consolidating two sessions of the SAME user concurrently can both
-- miss the reconcile match and write near-duplicate facts (the 073 content-hash
-- index only blocks exact duplicates). Cheapest correct guard over PostgREST
-- (advisory xact locks can't span pooled requests): claim at most ONE session
-- per user per batch, and skip users with an in-flight consolidation.
-- ponytail: a same-instant claim by two workers on different sessions of one
-- user remains theoretically possible; the next reconcile pass repairs it.

CREATE OR REPLACE FUNCTION public.claim_due_consolidations(
  p_max           integer DEFAULT 5,
  p_stale_seconds integer DEFAULT 900,
  p_max_attempts  integer DEFAULT 5
)
RETURNS TABLE (session_id uuid, user_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT s.id, s.user_id AS uid,
           row_number() OVER (
             PARTITION BY s.user_id
             ORDER BY s.consolidate_due_at NULLS LAST, s.id
           ) AS rn
    FROM public.chat_sessions s
    WHERE (
        -- fresh, user-driven due: always eligible
        (s.consolidate_due_at IS NOT NULL AND s.consolidate_due_at <= now())
        -- crash recovery: only while under the attempt cap
        OR (s.consolidate_started_at IS NOT NULL
            AND s.consolidate_started_at <= now() - make_interval(secs => p_stale_seconds)
            AND s.consolidation_attempts < p_max_attempts)
      )
      -- skip users with an in-flight (non-stale) consolidation on another session
      AND NOT EXISTS (
        SELECT 1 FROM public.chat_sessions x
        WHERE x.user_id = s.user_id
          AND x.id <> s.id
          AND x.consolidate_started_at IS NOT NULL
          AND x.consolidate_started_at > now() - make_interval(secs => p_stale_seconds)
      )
  ),
  due AS (
    SELECT c.id
    FROM public.chat_sessions c
    JOIN ranked r ON r.id = c.id AND r.rn = 1   -- one session per user per batch
    ORDER BY c.consolidate_due_at NULLS LAST
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(p_max, 1)
  )
  UPDATE public.chat_sessions s
     SET consolidate_started_at = now(),
         consolidate_due_at     = NULL,
         consolidation_attempts = s.consolidation_attempts + 1
    FROM due
   WHERE s.id = due.id
  RETURNING s.id, s.user_id;
END;
$$;
