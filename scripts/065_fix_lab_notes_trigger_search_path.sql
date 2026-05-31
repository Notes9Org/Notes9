-- Fix: "function digest(bytea, unknown) does not exist" on every lab_notes write.
--
-- Root cause: the live DB has trigger functions on public.lab_notes (notably
-- trg_write_document_version, which hash-chains content into document_versions)
-- that call pgcrypto's digest(). pgcrypto is installed in the `extensions`
-- schema, which is NOT on those functions' search_path → digest can't resolve →
-- the trigger raises → the whole INSERT/UPDATE to lab_notes is rolled back, so
-- autosave and Save both fail (and the app then falls back to an INSERT, tripping
-- the (experiment_id, title) unique constraint → "title already exists").
--
-- Fix: pin `extensions` onto the search_path of every trigger function attached
-- to public.lab_notes. Targets them by introspection (no hardcoded names), is
-- idempotent, and modifies no data.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_trigger t
    JOIN pg_class     c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc      p ON p.oid = t.tgfoid
    JOIN pg_namespace pn ON pn.oid = p.pronamespace
    WHERE c.relname = 'lab_notes'
      AND n.nspname = 'public'
      AND pn.nspname = 'public'
      AND NOT t.tgisinternal
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public, extensions, pg_temp',
      r.proname, r.args
    );
    RAISE NOTICE 'Pinned extensions onto search_path of public.%(%)', r.proname, r.args;
  END LOOP;
END
$$;
