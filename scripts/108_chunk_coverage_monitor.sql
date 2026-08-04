-- 108_chunk_coverage_monitor.sql
--
-- Nightly chunk-coverage monitor (context backend, WP4).
--
-- WHY: chunk_jobs is a lossy queue — 2026-07-31 it held 414 failed rows
-- spanning every source type, discovered only by manual inspection. This adds
-- a cheap nightly check that compares, per source type, the distinct source
-- ids that SHOULD have chunks (rows in the content table with chunkable text)
-- against the distinct source ids that DO have live rows in semantic_chunks,
-- and logs one row per source type into chunk_coverage_gaps. A gap above the
-- 2% alert threshold marks the row alert=true; the threshold itself is
-- recorded on every row so later threshold changes don't rewrite history.
--
-- SOURCE MAP (source_type → content table.id), derived from the enqueue
-- producers, not guessed:
--   * lab_note           → lab_notes.id            (queue_semantic_chunk_job; 066/068/111)
--   * protocol           → protocols.id            (enqueue_protocol_chunk_job; 068/111)
--   * literature_review  → literature_reviews.id   (enqueue_literature_review_chunk_job; 111)
--   * report             → reports.id              (queue_semantic_chunk_job generic producer;
--                                                   source_type CHECK in 101)
--   * experiment_summary → experiments.id          (queue_experiment_summary_chunk_job; 102)
--   * chat_attachment    → chat_attachments.id     (AI worker chat_attachment_worker sweep;
--                                                   084 table, 101 CHECK widening)
--
-- LEGITIMATELY-EMPTY EXCLUSIONS (kept out of "expected" so they never alert):
--   * lab_notes / protocols / reports with NULL/empty content — draft-only or
--     not-yet-generated rows produce zero chunks by design.
--   * literature_reviews with no abstract, no personal_notes and no uploaded
--     PDF — citation-only rows have nothing to chunk (027 added the PDF path).
--   * chat_attachments that are soft-deleted, past their 7-day expires_at, or
--     of a MIME type the worker cannot extract text from (PDF + text-like
--     only; docx/xlsx/images produce zero chunks by design — see
--     AI/worker/chat_attachment_worker.py parse_attachment_bytes).
--   * experiments have no exclusion: experiment_summary_payload (102) always
--     yields non-empty content.
--
-- KNOWN NOISE (absorbed by the 2% threshold, not filtered): sources whose
-- enqueue job is still in flight at check time, and chat attachments whose
-- extracted text is under the worker's 50-char minimum.
--
-- ROLLOUT: apply any time; no backfill, no app deploy. Where pg_cron exists
-- the check self-schedules nightly at 02:30 UTC (job 'chunk_coverage_nightly');
-- where it doesn't, the script still applies cleanly and the check can be run
-- manually: SELECT * FROM public.run_chunk_coverage_check();
-- Idempotent: safe to re-run (IF NOT EXISTS / CREATE OR REPLACE / re-schedule).

BEGIN;

-- ---- log table --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chunk_coverage_gaps (
  id                  uuid          NOT NULL DEFAULT gen_random_uuid(),
  checked_at          timestamptz   NOT NULL DEFAULT now(),
  source_type         text          NOT NULL,
  expected_sources    bigint        NOT NULL,
  covered_sources     bigint        NOT NULL,
  missing_sources     bigint        NOT NULL,
  gap_pct             numeric(5,2)  NOT NULL,
  alert_threshold_pct numeric(5,2)  NOT NULL,
  alert               boolean       NOT NULL,
  CONSTRAINT chunk_coverage_gaps_pkey PRIMARY KEY (id)
);

-- Ops-only table (109 posture): RLS on, no policies — only service_role /
-- the function owner can touch it.
ALTER TABLE public.chunk_coverage_gaps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chunk_coverage_gaps FROM PUBLIC, anon, authenticated;

-- ---- check function ---------------------------------------------------------
-- Returns the rows it just inserted so a manual run shows the result inline.
CREATE OR REPLACE FUNCTION public.run_chunk_coverage_check()
RETURNS SETOF public.chunk_coverage_gaps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH expected AS (
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
         round(100.0 * (a.expected_sources - a.covered_sources) / a.expected_sources, 2),
         2.00,
         100.0 * (a.expected_sources - a.covered_sources) / a.expected_sources > 2.00
  FROM agg a
  ORDER BY a.source_type
  RETURNING *;
END;
$$;

-- ---- privileges -------------------------------------------------------------
-- Same posture as 111/112 (and 107): SECURITY DEFINER, cross-org read =
-- service_role only. Postgres grants EXECUTE to PUBLIC by default on every new
-- function, so revoke PUBLIC explicitly (the 112 lesson).
REVOKE EXECUTE ON FUNCTION public.run_chunk_coverage_check() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.run_chunk_coverage_check() TO service_role;

COMMIT;

-- ---- nightly schedule -------------------------------------------------------
-- Guarded on the cron schema (096 pattern) so this script still applies on
-- environments without pg_cron; there, run the function manually or from an
-- external scheduler. Unschedule-then-schedule keeps re-runs idempotent
-- across pg_cron versions.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule(jobid)
      FROM cron.job
     WHERE jobname = 'chunk_coverage_nightly';
    PERFORM cron.schedule(
      'chunk_coverage_nightly',
      '30 2 * * *',
      'SELECT public.run_chunk_coverage_check();'
    );
  END IF;
END $$;

-- ---- migration ledger -------------------------------------------------------
-- Convention (109_migration_ledger.sql): every hand-run script records itself.
-- Guarded with to_regclass so 108 runs cleanly whether or not 109 ran first;
-- if 109 runs later, its backfill picks this file up instead.
DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO public.schema_migrations (filename, checksum, applied_by)
    VALUES ('108_chunk_coverage_monitor.sql', 'manual', current_user)
    ON CONFLICT (filename) DO NOTHING;
  END IF;
END;
$$;
