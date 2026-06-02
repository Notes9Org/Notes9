-- Fix: "new row violates row-level security policy for table chunk_jobs" when
-- saving a protocol (and a latent risk for lab notes / any chunked record).
--
-- Root cause (confirmed by introspection):
--   * chunk_jobs RLS is ENABLED, the writable policy (chunk_jobs_own) requires
--     created_by = auth.uid(), and chunk_jobs is NOT force-RLS.
--   * The enqueue TRIGGER functions (queue_semantic_chunk_job,
--     enqueue_protocol_chunk_job, …) are SECURITY INVOKER, so they run as the
--     end user. The protocol enqueue doesn't set created_by = auth.uid(), so its
--     chunk_jobs INSERT fails the policy. (Lab notes pass only because their
--     enqueue happens to set created_by.)
--   * Those functions are owned by `postgres`, which has BYPASSRLS — so simply
--     marking them SECURITY DEFINER makes the queue insert run as the owner and
--     bypass RLS, which is exactly how a background-job enqueue should behave.
--
-- This hardens EVERY trigger function that writes chunk_jobs (introspected, no
-- hardcoded names), and only trigger functions (returns trigger) — never plain
-- read/RPC functions — so no SELECT-side data is unintentionally elevated.
-- Idempotent; modifies no data.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prorettype = 'pg_catalog.trigger'::regtype          -- trigger functions only
      AND pg_get_functiondef(p.oid) ILIKE '%chunk_jobs%'        -- that write the queue
  LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SECURITY DEFINER', r.proname, r.args);
    -- SECURITY DEFINER best practice: pin a safe search_path.
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public, extensions, pg_temp',
      r.proname, r.args
    );
    RAISE NOTICE 'Hardened %(%) to SECURITY DEFINER', r.proname, r.args;
  END LOOP;
END
$$;
