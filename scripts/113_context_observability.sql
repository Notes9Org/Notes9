-- 113_context_observability.sql
--
-- Phase A ("See") of the context-activation rollout
-- (docs/arch/context-activation/ARCHITECTURE.md, A2/A3). Makes three things
-- true that were silently false in production:
--
--   1. The migration ledger tells the truth. 108 was applied before 109
--      created public.schema_migrations, and its to_regclass-guarded
--      self-record skipped without complaint -- the ledger under-reported by
--      one row. Backfilled here, per ADR-006
--      (docs/arch/context-activation/ADR-006-the-ledger-is-the-only-migration-tracker.md).
--   2. The nightly coverage monitor actually runs. 108's schedule block is
--      guarded on `pg_namespace WHERE nspname = 'cron'`, and pg_cron was
--      never installed on this project, so it skipped silently and
--      chunk_coverage_gaps has stayed empty since 108 shipped. pg_cron is
--      available (default_version 1.6.4); this installs it and re-registers
--      'chunk_coverage_nightly' at 30 2 * * *.
--   3. 'skipped' becomes a legal terminal chunk_jobs status, and the coverage
--      check stops counting a skipped source as a permanent gap. Per ADR-007
--      (docs/arch/context-activation/ADR-007-zero-chunks-is-a-failure-not-a-completion.md):
--      a twelve-character note is correctly never chunked, and if that counts
--      against expected_sources forever, the gap can never reach 0%, the 2%
--      alert fires forever, and it gets muted -- which is how this failed the
--      first time. The 6 source types, the 2.00 alert threshold, SECURITY
--      DEFINER, and the revoke/grant posture of run_chunk_coverage_check()
--      are otherwise unchanged; slice 02 reads chunk_coverage_gaps and its
--      column set does not move.
--
-- Idempotent: safe to re-run end to end (backfill/constraint/function are
-- ON CONFLICT/IF EXISTS/CREATE OR REPLACE; the cron job is
-- unschedule-then-schedule, matching 108's own re-run precedent).

BEGIN;

-- ---- 1. backfill the missing 108 ledger row ---------------------------------
-- Same shape as 109's own backfill: checksum = 'backfill' (content at apply
-- time is unknowable after the fact).
INSERT INTO public.schema_migrations (filename, checksum, applied_by)
VALUES ('108_chunk_coverage_monitor.sql', 'backfill', current_user)
ON CONFLICT (filename) DO NOTHING;

-- ---- 2. widen chunk_jobs status to accept 'skipped' -------------------------
-- chunk_jobs_operation_check (the 'create'/'update'/'delete' constraint on the
-- operation column) is untouched -- only the status constraint moves.
ALTER TABLE public.chunk_jobs
  DROP CONSTRAINT IF EXISTS chunk_jobs_status_check;

ALTER TABLE public.chunk_jobs
  ADD CONSTRAINT chunk_jobs_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'processing'::text, 'completed'::text,
    'failed'::text, 'skipped'::text
  ]));

-- ---- 3. amend run_chunk_coverage_check() to exclude skipped sources ---------
-- Identical to 108 except: (a) the new latest_job_status / expected split
-- below, which drops a source from "expected" when its most recent job is
-- 'skipped', and (b) a NULLIF guard on the two divisions, needed only because
-- expected_sources can now legitimately be 0 for a source type that is
-- currently 100% skipped (previously impossible, since nothing was ever
-- excluded from "expected"). Everything else -- the 6 source-type queries,
-- the exclusions describing legitimately-empty content, the 2.00 threshold,
-- SECURITY DEFINER, search_path -- is copied verbatim from 108.
CREATE OR REPLACE FUNCTION public.run_chunk_coverage_check()
RETURNS SETOF public.chunk_coverage_gaps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH expected_raw AS (
    -- SOURCE MAP (source_type -> content table.id), unchanged from 108:
    --   lab_note -> lab_notes, protocol -> protocols,
    --   literature_review -> literature_reviews, report -> reports,
    --   experiment_summary -> experiments, chat_attachment -> chat_attachments.
    -- LEGITIMATELY-EMPTY EXCLUSIONS (kept out of "expected" so they never
    -- alert): draft-only/empty content rows, citation-only literature rows
    -- with no abstract/notes/PDF, and chat attachments the worker cannot
    -- extract text from (soft-deleted, TTL-expired, or an unsupported MIME
    -- type). Full rationale: 108_chunk_coverage_monitor.sql.
    SELECT 'lab_note'::text AS source_type, n.id
    FROM public.lab_notes n
    WHERE coalesce(n.content, '') <> ''
    UNION ALL
    SELECT 'protocol', p.id
    FROM public.protocols p
    WHERE coalesce(p.content, '') <> ''
    UNION ALL
    SELECT 'literature_review', lr.id
    FROM public.literature_reviews lr
    WHERE coalesce(lr.abstract, '') <> ''
       OR coalesce(lr.personal_notes, '') <> ''
       OR lr.pdf_storage_path IS NOT NULL
    UNION ALL
    SELECT 'report', r.id
    FROM public.reports r
    WHERE coalesce(r.content, '') <> ''
    UNION ALL
    SELECT 'experiment_summary', e.id
    FROM public.experiments e
    UNION ALL
    SELECT 'chat_attachment', ca.id
    FROM public.chat_attachments ca
    WHERE ca.deleted_at IS NULL
      AND ca.expires_at > now()
      AND (
        lower(split_part(ca.mime_type, ';', 1)) = 'application/pdf'
        OR lower(ca.file_name) LIKE '%.pdf'
        OR lower(split_part(ca.mime_type, ';', 1)) LIKE 'text/%'
        OR lower(split_part(ca.mime_type, ';', 1)) IN
             ('application/json', 'application/xml', 'application/x-ndjson')
      )
  ),
  -- ADR-007: the most recent chunk_jobs row per (source_type, source_id).
  -- DISTINCT ON + ORDER BY is one sort/dedup pass over chunk_jobs as a whole
  -- -- a grouped scan, not a correlated subquery re-run per source, so this
  -- stays an aggregate at 10x volume (23k chunk_jobs rows).
  latest_job_status AS (
    SELECT DISTINCT ON (j.source_type, j.source_id)
           j.source_type, j.source_id, j.status
    FROM public.chunk_jobs j
    ORDER BY j.source_type, j.source_id, j.created_at DESC
  ),
  -- ADR-007: a source whose latest job is 'skipped' is correctly not
  -- indexed (too short to chunk, e.g. a twelve-character note) and must
  -- never count as a coverage gap, or gap_pct can never reach 0% and the
  -- alert becomes permanent noise that gets muted.
  expected AS (
    SELECT er.source_type, er.id
    FROM expected_raw er
    LEFT JOIN latest_job_status ljs
      ON ljs.source_type = er.source_type AND ljs.source_id = er.id
    WHERE ljs.status IS DISTINCT FROM 'skipped'
  ),
  covered AS (
    -- One pass over semantic_chunks; expired chunks (chat attachments carry a
    -- 7-day expires_at, 099) don't count as coverage.
    SELECT sc.source_type, sc.source_id
    FROM public.semantic_chunks sc
    WHERE sc.expires_at IS NULL OR sc.expires_at > now()
    GROUP BY sc.source_type, sc.source_id
  ),
  agg AS (
    -- Source types with zero expected rows simply produce no log row.
    SELECT ex.source_type,
           count(*)::bigint            AS expected_sources,
           count(c.source_id)::bigint  AS covered_sources
    FROM expected ex
    LEFT JOIN covered c
      ON c.source_type = ex.source_type AND c.source_id = ex.id
    GROUP BY ex.source_type
  )
  INSERT INTO public.chunk_coverage_gaps
    (source_type, expected_sources, covered_sources, missing_sources,
     gap_pct, alert_threshold_pct, alert)
  SELECT a.source_type,
         a.expected_sources,
         a.covered_sources,
         a.expected_sources - a.covered_sources,
         -- expected_sources = 0 means every source of this type is currently
         -- skipped: a real, legitimate state, not an error. NULLIF turns the
         -- would-be division by zero into a reported 0.00 / not-alerting row
         -- instead of failing the whole nightly check.
         coalesce(round(100.0 * (a.expected_sources - a.covered_sources)
                         / NULLIF(a.expected_sources, 0), 2), 0.00),
         2.00,
         coalesce(100.0 * (a.expected_sources - a.covered_sources)
                   / NULLIF(a.expected_sources, 0) > 2.00, false)
  FROM agg a
  ORDER BY a.source_type
  RETURNING *;
END;
$$;

-- ---- privileges --------------------------------------------------------------
-- CREATE OR REPLACE preserves existing grants, but re-issuing is the repo
-- convention (107/108) and keeps this file correct standalone if the function
-- is ever dropped and recreated by hand.
REVOKE EXECUTE ON FUNCTION public.run_chunk_coverage_check() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.run_chunk_coverage_check() TO service_role;

COMMIT;

-- ---- 4. install pg_cron + nightly schedule -----------------------------------
-- After COMMIT, matching 108's own precedent: cron.schedule() inside an
-- explicit transaction block is awkward. Unschedule-then-schedule keeps a
-- re-run idempotent (exactly one 'chunk_coverage_nightly' job survives).
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
    FROM cron.job
   WHERE jobname = 'chunk_coverage_nightly';
  PERFORM cron.schedule(
    'chunk_coverage_nightly',
    '30 2 * * *',
    'SELECT public.run_chunk_coverage_check();'
  );
END $$;

-- ---- migration ledger ---------------------------------------------------------
-- Convention (109_migration_ledger.sql), per ADR-006: every hand-run script
-- records itself as its final statement. The to_regclass guard 107/108 used
-- is dropped -- the table exists unconditionally from here on, and a
-- migration that runs before 109 against a fresh database should fail loudly
-- rather than skip silently, which is exactly the defect this file fixes.
INSERT INTO public.schema_migrations (filename, checksum, applied_by)
VALUES ('113_context_observability.sql', 'manual', current_user)
ON CONFLICT (filename) DO NOTHING;

-- =============================================================================
-- Verify. No automated harness exists for scripts/ (see scripts/README.md);
-- this block is the deliverable in place of test output. Every query below
-- maps to one "Done when" or "Edge cases to test" bullet in
-- docs/arch/context-activation/slices/01-db-observability-and-status.md.
-- =============================================================================

-- Done when (1): ledger count is 109 (107 existing + the 108 backfill + this
-- migration's own self-record), and the 108 row exists.
--   SELECT count(*) FROM public.schema_migrations;
--     -> 109
--   SELECT count(*) FROM public.schema_migrations
--     WHERE filename = '108_chunk_coverage_monitor.sql';
--     -> 1

-- Done when (2): exactly one cron job, both before and after a second run of
-- this whole file.
--   SELECT count(*) FROM cron.job WHERE jobname = 'chunk_coverage_nightly';
--     -> 1  (still 1 after re-running this file)

-- Done when (3): 'skipped' is now a legal status.
--   INSERT INTO public.chunk_jobs (source_type, source_id, operation, status)
--     VALUES ('lab_note', gen_random_uuid(), 'create', 'skipped');
--     -> INSERT 0 1, no error (chunk_jobs_status_check now allows 'skipped';
--        chunk_jobs_operation_check is unmodified and still requires
--        operation IN ('create','update','delete'))

-- Done when (4): six rows, alert=true on every one, matching the measured
-- 2026-08-08 gaps (11.1%-67.9%, all over the 2.00 threshold).
--   SELECT source_type, alert FROM public.run_chunk_coverage_check() ORDER BY 1;
--     -> 6 rows: chat_attachment, experiment_summary, lab_note,
--        literature_review, protocol, report -- alert = true on every row

-- Done when (5): a source whose latest job is 'skipped' drops out of
-- expected_sources. Run against a real lab_note that currently has content
-- and no prior job:
--   SELECT expected_sources FROM public.chunk_coverage_gaps
--     WHERE source_type = 'lab_note' ORDER BY checked_at DESC LIMIT 1;   -- N
--   INSERT INTO public.chunk_jobs (source_type, source_id, operation, status)
--     VALUES ('lab_note', '<that lab_note.id>', 'update', 'skipped');
--   SELECT expected_sources FROM public.run_chunk_coverage_check()
--     WHERE source_type = 'lab_note';
--     -> N - 1

-- Done when (6): the whole file is re-runnable with no error and no
-- duplicate rows. Run this file twice, then:
--   SELECT count(*) FROM public.schema_migrations
--     WHERE filename IN ('108_chunk_coverage_monitor.sql',
--                         '113_context_observability.sql');
--     -> 2  (one row each, ON CONFLICT DO NOTHING absorbs the re-run)
--   SELECT count(*) FROM cron.job WHERE jobname = 'chunk_coverage_nightly';
--     -> 1
--   SELECT count(*) FROM pg_constraint
--     WHERE conrelid = 'public.chunk_jobs'::regclass
--       AND conname = 'chunk_jobs_status_check';
--     -> 1  (DROP IF EXISTS + ADD leaves exactly one)

-- Done when (7): scripts/README.md carries no applied-through marker and no
-- hand-maintenance instruction. Not a SQL check -- verified by the README
-- edit shipped alongside this file (see its own diff). Spot check:
--   grep -n "applied through\|Update this line whenever" scripts/README.md
--     -> no matches

-- Edge case (Volume): the coverage query stays a grouped aggregate at 10x
-- corpus (23k chunk_jobs, 48k semantic_chunks) -- no correlated subquery
-- re-run per source. Verify by EXPLAIN-ing the query body directly (the
-- PL/pgSQL wrapper is opaque to EXPLAIN on a bare
-- `SELECT * FROM run_chunk_coverage_check()`, so plan the inner query):
--   EXPLAIN (COSTS OFF)
--   WITH expected_raw AS (
--     SELECT 'lab_note'::text AS source_type, n.id FROM public.lab_notes n
--     WHERE coalesce(n.content, '') <> ''
--   ),
--   latest_job_status AS (
--     SELECT DISTINCT ON (j.source_type, j.source_id)
--            j.source_type, j.source_id, j.status
--     FROM public.chunk_jobs j
--     ORDER BY j.source_type, j.source_id, j.created_at DESC
--   ),
--   expected AS (
--     SELECT er.source_type, er.id FROM expected_raw er
--     LEFT JOIN latest_job_status ljs
--       ON ljs.source_type = er.source_type AND ljs.source_id = er.id
--     WHERE ljs.status IS DISTINCT FROM 'skipped'
--   )
--   SELECT * FROM expected;
--     -> plan shows Sort + Unique (the DISTINCT ON) and a Hash/Merge Join,
--        no Nested Loop whose inner side is a per-outer-row SubPlan; cost
--        scales with table size, not with expected_sources row count.

-- Edge case (Shape, unknown source_type): a 7th source_type is silently
-- absent from the report, not counted as a 0% gap, and does not error.
--   INSERT INTO public.chunk_jobs (source_type, source_id, operation, status)
--     VALUES ('mystery_type', gen_random_uuid(), 'create', 'pending');
--     -> INSERT 0 1, no error (chunk_jobs.source_type carries no CHECK
--        constraint -- only status and operation are constrained)
--   SELECT * FROM public.run_chunk_coverage_check()
--     WHERE source_type = 'mystery_type';
--     -> 0 rows (expected_raw only ever unions the 6 named content tables;
--        it never reads chunk_jobs.source_type, so an unrecognised type
--        cannot appear here, matching the ADR: adding a 7th type requires
--        editing this function)

-- Edge case (Boundaries, zero gap reachable): a source type whose every
-- source is either chunked or skipped reports gap_pct = 0.00, alert = false.
--   -- e.g. for a source type with a small fixture: chunk every source that
--   -- isn't already chunked, mark every remaining uncovered source's latest
--   -- job 'skipped', then:
--   SELECT source_type, gap_pct, alert FROM public.run_chunk_coverage_check()
--     WHERE source_type = '<that type>';
--     -> gap_pct = 0.00, alert = false

-- Edge case (Idempotency): re-running the whole migration leaves exactly one
-- cron job, one 108 ledger row, and one status constraint (all three
-- combined in Done-when (6) above; restated here per the brief's own
-- "Edge cases to test" list):
--   SELECT count(*) FROM cron.job WHERE jobname = 'chunk_coverage_nightly';
--     -> 1
--   SELECT count(*) FROM public.schema_migrations
--     WHERE filename = '108_chunk_coverage_monitor.sql';
--     -> 1
--   SELECT count(*) FROM pg_constraint
--     WHERE conrelid = 'public.chunk_jobs'::regclass
--       AND conname = 'chunk_jobs_status_check';
--     -> 1
