-- 074_consolidation_queue.sql
--
-- Makes end-of-session memory consolidation DURABLE.
--
-- Before: the API process armed an in-memory asyncio.sleep(60) timer per
-- session. That state is lost on restart/deploy, and with multiple uvicorn
-- workers each worker armed its own timer, so the same session could be
-- consolidated N times concurrently (N LLM pipelines racing on the same rows).
--
-- After: each turn stamps chat_sessions.consolidate_due_at = now() + idle. A
-- single sweeper (any process) atomically CLAIMS due sessions with
-- FOR UPDATE SKIP LOCKED, so exactly one worker runs each session's
-- consolidation, survives restarts, and never multiplies. A new turn just
-- pushes consolidate_due_at further out (debounce) via a plain UPDATE from the
-- service role.
--
-- Load note: the sweeper is one indexed query per poll; the partial index keeps
-- it cheap. No new RLS, no auth.uid() calls — safe on a connection-constrained
-- DB.
--
-- Idempotent; modifies no existing row data.

ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS consolidate_due_at     timestamptz,
  ADD COLUMN IF NOT EXISTS consolidate_started_at timestamptz;

-- Only "due" rows are scanned by the sweeper.
CREATE INDEX IF NOT EXISTS idx_chat_sessions_consolidate_due
  ON public.chat_sessions (consolidate_due_at)
  WHERE consolidate_due_at IS NOT NULL;

-- ---- atomic claim ----------------------------------------------------------
-- Claims up to p_max sessions whose consolidate_due_at has passed, OR whose
-- claim went stale (consolidate_started_at older than p_stale_seconds — a worker
-- crashed mid-consolidation). Marks them started + clears due_at so no other
-- worker picks them up. FOR UPDATE SKIP LOCKED = exactly-once across workers.
CREATE OR REPLACE FUNCTION public.claim_due_consolidations(
  p_max           integer DEFAULT 5,
  p_stale_seconds integer DEFAULT 900
)
RETURNS TABLE (session_id uuid, user_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT s.id
    FROM public.chat_sessions s
    WHERE
      (s.consolidate_due_at IS NOT NULL AND s.consolidate_due_at <= now())
      OR (s.consolidate_started_at IS NOT NULL
          AND s.consolidate_started_at <= now() - make_interval(secs => p_stale_seconds))
    ORDER BY s.consolidate_due_at NULLS LAST
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(p_max, 1)
  )
  UPDATE public.chat_sessions s
     SET consolidate_started_at = now(),
         consolidate_due_at     = NULL
    FROM due
   WHERE s.id = due.id
  RETURNING s.id, s.user_id;
END;
$$;

------- clear a finished claim ------------------------------------------------
CREATE OR REPLACE FUNCTION public.finish_consolidation(p_session_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  UPDATE public.chat_sessions
     SET consolidate_started_at = NULL
   WHERE id = p_session_id;
$$;

REVOKE ALL ON FUNCTION public.claim_due_consolidations(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_consolidation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_consolidations(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_consolidation(uuid) TO service_role;
