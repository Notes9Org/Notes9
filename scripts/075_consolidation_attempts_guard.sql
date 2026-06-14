-- 075_consolidation_attempts_guard.sql
--
-- Stops a permanently-failing ("poison") session from being reclaimed forever
-- by the stale-claim path in claim_due_consolidations (074).
--
-- Adds a per-session attempt counter: each claim increments it; a successful
-- consolidation resets it to 0; the STALE reclaim path ignores sessions that
-- have exceeded p_max_attempts (so they park until real user activity re-marks
-- them due, which goes through the fresh "due" path with no cap). Transient
-- failures (e.g. Bedrock throttle) still retry; only consistently-failing
-- idle sessions are parked.
--
-- Supersedes the claim/finish functions from 074 (signatures change, so DROP +
-- CREATE). Idempotent.

ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS consolidation_attempts integer NOT NULL DEFAULT 0;

-- ---- claim (now attempt-aware) --------------------------------------------
DROP FUNCTION IF EXISTS public.claim_due_consolidations(integer, integer);
DROP FUNCTION IF EXISTS public.claim_due_consolidations(integer, integer, integer);

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
  WITH due AS (
    SELECT s.id
    FROM public.chat_sessions s
    WHERE
      -- fresh, user-driven due: always eligible
      (s.consolidate_due_at IS NOT NULL AND s.consolidate_due_at <= now())
      -- crash recovery: only while under the attempt cap
      OR (s.consolidate_started_at IS NOT NULL
          AND s.consolidate_started_at <= now() - make_interval(secs => p_stale_seconds)
          AND s.consolidation_attempts < p_max_attempts)
    ORDER BY s.consolidate_due_at NULLS LAST
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

-- ---- finish (resets the counter only on success) --------------------------
DROP FUNCTION IF EXISTS public.finish_consolidation(uuid);
DROP FUNCTION IF EXISTS public.finish_consolidation(uuid, boolean);

CREATE OR REPLACE FUNCTION public.finish_consolidation(
  p_session_id uuid,
  p_succeeded  boolean DEFAULT true
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  UPDATE public.chat_sessions
     SET consolidate_started_at = NULL,
         consolidation_attempts = CASE WHEN p_succeeded THEN 0 ELSE consolidation_attempts END
   WHERE id = p_session_id;
$$;

REVOKE ALL ON FUNCTION public.claim_due_consolidations(integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_consolidation(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_consolidations(integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_consolidation(uuid, boolean) TO service_role;
