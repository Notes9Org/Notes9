-- 107_content_addressed_chunks.sql
--
-- Content-addressed chunk storage + atomic job claiming (WP1, SQL half).
--
-- Rollout: the worker gates the new path behind WORKER_CONTENT_ADDRESSED
-- (default OFF). Flag off, the legacy delete-then-insert path never calls
-- these functions, so this migration is inert until the flag flips. Flag on,
-- the worker claims jobs via claim_chunk_jobs() instead of SELECT+UPDATE,
-- hashes each chunk (chunk_version|size|overlap|embed_model|text), embeds
-- ONLY hashes not already stored for the source, and swaps the source's
-- chunks in one transaction via replace_chunks().
--
-- No backfill: legacy rows have chunk_hash IS NULL and replace_chunks always
-- deletes those, so the first flag-on pass over a source rewrites it cleanly.
--
-- Idempotent; modifies no existing row data.

BEGIN;

-- ---- columns + index -------------------------------------------------------

ALTER TABLE public.semantic_chunks
  ADD COLUMN IF NOT EXISTS chunk_hash  text,
  ADD COLUMN IF NOT EXISTS source_hash text;

ALTER TABLE public.chunk_jobs
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_semantic_chunks_source_chunk_hash
  ON public.semantic_chunks (source_type, source_id, chunk_hash);

-- ---- atomic claim ----------------------------------------------------------
-- Claims up to p_max 'pending' jobs, plus 'processing' jobs whose claim went
-- stale (claimed_at older than p_stale_seconds — a worker crashed mid-job).
-- FOR UPDATE SKIP LOCKED = exactly-once across workers (074/104 pattern).
-- Pre-107 'processing' rows have claimed_at IS NULL and are never reclaimed
-- here; the 2026-08-04 redrive runbook resets those by hand.
CREATE OR REPLACE FUNCTION public.claim_chunk_jobs(
  p_max           integer DEFAULT 10,
  p_stale_seconds integer DEFAULT 900
)
RETURNS SETOF public.chunk_jobs
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.chunk_jobs j
     SET status     = 'processing',
         claimed_at = now()
   WHERE j.id IN (
           SELECT id
           FROM public.chunk_jobs
           WHERE status = 'pending'
              OR (status = 'processing'
                  AND claimed_at < now() - make_interval(secs => p_stale_seconds))
           ORDER BY created_at
           LIMIT p_max
           FOR UPDATE SKIP LOCKED
         )
  RETURNING j.*;
END;
$$;

-- ---- content-addressed replace ---------------------------------------------
-- One-transaction swap of a source's chunks. Each element of p_chunks:
--   { "chunk_index": int, "content": text, "context": text|null,
--     "chunk_hash": text (REQUIRED),
--     "embedding": [float,...]|null (null only if hash already stored),
--     "metadata": object|null,
--     "organization_id"/"project_id"/"experiment_id": uuid|null,
--     "created_by": uuid|null, "expires_at": timestamptz|null }
-- Rows whose hash survives keep content+embedding untouched (the hash pins
-- both), so unchanged chunks cost zero embed calls.
CREATE OR REPLACE FUNCTION public.replace_chunks(
  p_source_type text,
  p_source_id   uuid,
  p_source_hash text,
  p_chunks      jsonb
)
RETURNS TABLE (inserted_count int, deleted_count int, kept_count int)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_inserted int;
  v_deleted  int;
  v_kept     int;
BEGIN
  IF p_chunks IS NULL OR jsonb_typeof(p_chunks) <> 'array' THEN
    RAISE EXCEPTION 'replace_chunks: p_chunks must be a jsonb array, got %',
      coalesce(jsonb_typeof(p_chunks), 'null');
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_chunks) e
             WHERE e->>'chunk_hash' IS NULL) THEN
    RAISE EXCEPTION 'replace_chunks: chunk_hash is required on every chunk';
  END IF;

  -- New hashes must arrive with an embedding (kept rows already have one).
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_chunks) e
    WHERE jsonb_typeof(e->'embedding') IS DISTINCT FROM 'array'
      AND NOT EXISTS (
        SELECT 1 FROM public.semantic_chunks sc
        WHERE sc.source_type = p_source_type
          AND sc.source_id   = p_source_id
          AND sc.chunk_hash  = e->>'chunk_hash'
      )
  ) THEN
    RAISE EXCEPTION 'replace_chunks: null embedding for a chunk_hash not already stored for %/%',
      p_source_type, p_source_id;
  END IF;

  -- 1. Drop rows not in the incoming set. Legacy rows (chunk_hash IS NULL)
  --    are always replaced.
  WITH incoming AS (
    SELECT e->>'chunk_hash' AS chunk_hash
    FROM jsonb_array_elements(p_chunks) e
  ),
  del AS (
    DELETE FROM public.semantic_chunks sc
    WHERE sc.source_type = p_source_type
      AND sc.source_id   = p_source_id
      AND (sc.chunk_hash IS NULL
           OR sc.chunk_hash NOT IN (SELECT chunk_hash FROM incoming))
    RETURNING 1
  )
  SELECT count(*)::int INTO v_deleted FROM del;

  -- 2. Kept rows: refresh position + mutable fields; content/embedding stay.
  WITH incoming AS (
    SELECT (e->>'chunk_index')::int             AS chunk_index,
           e->>'context'                        AS context,
           e->>'chunk_hash'                     AS chunk_hash,
           NULLIF(e->'metadata', 'null'::jsonb) AS metadata,
           (e->>'expires_at')::timestamptz      AS expires_at
    FROM jsonb_array_elements(p_chunks) e
  ),
  upd AS (
    UPDATE public.semantic_chunks sc
       SET chunk_index = i.chunk_index,
           context     = i.context,
           metadata    = i.metadata,
           expires_at  = i.expires_at,
           source_hash = p_source_hash
      FROM incoming i
     WHERE sc.source_type = p_source_type
       AND sc.source_id   = p_source_id
       AND sc.chunk_hash  = i.chunk_hash
    RETURNING 1
  )
  SELECT count(*)::int INTO v_kept FROM upd;

  -- 3. New hashes: full insert (created_at defaults; fts handled as on the
  --    legacy insert path).
  WITH incoming AS (
    SELECT (e->>'chunk_index')::int             AS chunk_index,
           e->>'content'                        AS content,
           e->>'context'                        AS context,
           e->>'chunk_hash'                     AS chunk_hash,
           (e->>'embedding')::vector            AS embedding,
           NULLIF(e->'metadata', 'null'::jsonb) AS metadata,
           (e->>'organization_id')::uuid        AS organization_id,
           (e->>'project_id')::uuid             AS project_id,
           (e->>'experiment_id')::uuid          AS experiment_id,
           (e->>'created_by')::uuid             AS created_by,
           (e->>'expires_at')::timestamptz      AS expires_at
    FROM jsonb_array_elements(p_chunks) e
  ),
  ins AS (
    INSERT INTO public.semantic_chunks
      (source_type, source_id, chunk_index, content, context,
       chunk_hash, source_hash, embedding, metadata,
       organization_id, project_id, experiment_id, created_by, expires_at)
    SELECT p_source_type, p_source_id, i.chunk_index, i.content, i.context,
           i.chunk_hash, p_source_hash, i.embedding, i.metadata,
           i.organization_id, i.project_id, i.experiment_id, i.created_by,
           i.expires_at
    FROM incoming i
    WHERE NOT EXISTS (
      SELECT 1 FROM public.semantic_chunks sc
      WHERE sc.source_type = p_source_type
        AND sc.source_id   = p_source_id
        AND sc.chunk_hash  = i.chunk_hash
    )
    RETURNING 1
  )
  SELECT count(*)::int INTO v_inserted FROM ins;

  RETURN QUERY SELECT v_inserted, v_deleted, v_kept;
END;
$$;

-- ---- privileges ------------------------------------------------------------
-- Same posture as 111/112: SECURITY DEFINER + caller-supplied scope + no
-- auth.uid() check = service_role only. Postgres grants EXECUTE to PUBLIC by
-- default on every new function, so revoke PUBLIC explicitly (the 112 lesson).
REVOKE EXECUTE ON FUNCTION public.claim_chunk_jobs(integer, integer)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.replace_chunks(text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_chunk_jobs(integer, integer)      TO service_role;
GRANT  EXECUTE ON FUNCTION public.replace_chunks(text, uuid, text, jsonb) TO service_role;

COMMIT;

-- ---- migration ledger ------------------------------------------------------
-- Convention (109_migration_ledger.sql): every hand-run script records itself.
-- Guarded with to_regclass so 107 runs cleanly whether or not 109 ran first;
-- if 109 runs later, its backfill picks this file up instead.
DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO public.schema_migrations (filename, checksum, applied_by)
    VALUES ('107_content_addressed_chunks.sql', 'manual', current_user)
    ON CONFLICT (filename) DO NOTHING;
  END IF;
END;
$$;
