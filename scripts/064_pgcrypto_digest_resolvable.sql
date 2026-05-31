-- Fix: "function digest(bytea, unknown) does not exist"
--
-- pgcrypto's digest()/gen_random_bytes() live in whatever schema the extension
-- was installed into. On Supabase that's `extensions`, which is NOT on the
-- default search_path of most functions/triggers. Any object that calls bare
-- digest(...) therefore fails to resolve it. This includes 063's
-- commit_lab_note_version RPC and any trigger on lab_notes that hashes content.
--
-- Rather than chase every caller's search_path, expose schema-stable forwarders
-- in `public` (always on the search_path) that delegate to the real pgcrypto
-- functions. Idempotent and safe to re-run. No data is modified.
--
-- It also RAISES NOTICE listing pgcrypto's schema and any user triggers on
-- public.lab_notes, so we can see whether a hidden versioning trigger exists.

DO $do$
DECLARE
  v_schema text;
  v_trg    record;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgcrypto';

  IF v_schema IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    SELECT n.nspname INTO v_schema
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pgcrypto';
  END IF;

  RAISE NOTICE 'pgcrypto is installed in schema: %', v_schema;

  -- Expose forwarders in public when pgcrypto lives elsewhere (e.g. extensions).
  IF v_schema IS DISTINCT FROM 'public' THEN
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.digest(text, text) RETURNS bytea '
      'LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $b$ SELECT %I.digest($1, $2) $b$;',
      v_schema);
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.digest(bytea, text) RETURNS bytea '
      'LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $b$ SELECT %I.digest($1, $2) $b$;',
      v_schema);
    RAISE NOTICE 'Created public.digest(text,text) and public.digest(bytea,text) forwarders → %', v_schema;
  ELSE
    RAISE NOTICE 'pgcrypto already in public; no forwarder needed.';
  END IF;

  -- Diagnostic: list user triggers on lab_notes (helps confirm a hidden
  -- versioning trigger that may also be calling digest).
  FOR v_trg IN
    SELECT t.tgname, p.proname AS function_name
    FROM pg_trigger t
    JOIN pg_class c   ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p    ON p.oid = t.tgfoid
    WHERE n.nspname = 'public'
      AND c.relname = 'lab_notes'
      AND NOT t.tgisinternal
  LOOP
    RAISE NOTICE 'lab_notes trigger: % -> %()', v_trg.tgname, v_trg.function_name;
  END LOOP;
END
$do$;
