-- Combined fix: resolve_entity_scope fn (059) + sample_files/junctions/storage RLS (060) + sample children org RLS (061)
-- All statements are idempotent (CREATE OR REPLACE / IF NOT EXISTS / DROP POLICY IF EXISTS).

-- ============================================================ 059
-- Collapses the multi-step entity→scope cascade that previously required
-- 2–4 separate API round-trips (each hitting RLS → my_org_id() → profiles)
-- into a single Postgres function call.
--
-- Handles: projects, experiments, lab-notes, protocols, samples,
--          data (experiment_data), reports, papers, literature-reviews.
-- equipment has no project_id/experiment_id columns and returns nulls.
--
-- SECURITY INVOKER: runs with the calling user's role so existing RLS
-- policies enforce org-boundary scoping automatically.

CREATE OR REPLACE FUNCTION public.resolve_entity_scope(
  p_type text,
  p_id   uuid
)
RETURNS TABLE(
  project_id      uuid,
  project_name    text,
  experiment_id   uuid,
  experiment_name text
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_project_id      uuid;
  v_experiment_id   uuid;
  v_project_name    text;
  v_experiment_name text;
  v_eid             uuid;
  v_pid             uuid;
BEGIN
  IF p_type = 'projects' THEN
    SELECT p.id, p.name
      INTO v_project_id, v_project_name
      FROM public.projects p
     WHERE p.id = p_id;

  ELSIF p_type = 'experiments' THEN
    SELECT e.id, e.name, e.project_id
      INTO v_experiment_id, v_experiment_name, v_project_id
      FROM public.experiments e
     WHERE e.id = p_id;

  ELSIF p_type = 'lab-notes' THEN
    SELECT ln.experiment_id, ln.project_id
      INTO v_eid, v_pid
      FROM public.lab_notes ln
     WHERE ln.id = p_id;
    IF v_eid IS NOT NULL THEN
      v_experiment_id := v_eid;
      SELECT e.name, e.project_id
        INTO v_experiment_name, v_project_id
        FROM public.experiments e
       WHERE e.id = v_eid;
    ELSE
      v_project_id := v_pid;
    END IF;

  ELSIF p_type = 'protocols' THEN
    SELECT pr.experiment_id, pr.project_id
      INTO v_eid, v_pid
      FROM public.protocols pr
     WHERE pr.id = p_id;
    IF v_eid IS NOT NULL THEN
      v_experiment_id := v_eid;
      SELECT e.name, e.project_id
        INTO v_experiment_name, v_project_id
        FROM public.experiments e
       WHERE e.id = v_eid;
      IF v_project_id IS NULL THEN v_project_id := v_pid; END IF;
    ELSIF v_pid IS NOT NULL THEN
      v_project_id := v_pid;
    ELSE
      -- Fallback: first experiment_protocols link
      SELECT ep.experiment_id
        INTO v_experiment_id
        FROM public.experiment_protocols ep
       WHERE ep.protocol_id = p_id
       LIMIT 1;
      IF v_experiment_id IS NOT NULL THEN
        SELECT e.name, e.project_id
          INTO v_experiment_name, v_project_id
          FROM public.experiments e
         WHERE e.id = v_experiment_id;
      END IF;
    END IF;

  ELSIF p_type = 'samples' THEN
    SELECT s.experiment_id, s.project_id
      INTO v_eid, v_pid
      FROM public.samples s
     WHERE s.id = p_id;
    IF v_eid IS NOT NULL THEN
      v_experiment_id := v_eid;
      SELECT e.name, e.project_id
        INTO v_experiment_name, v_project_id
        FROM public.experiments e
       WHERE e.id = v_eid;
      IF v_project_id IS NULL THEN v_project_id := v_pid; END IF;
    ELSIF v_pid IS NOT NULL THEN
      v_project_id := v_pid;
    ELSE
      -- Fallback: most-recent sample_experiments link
      SELECT se.experiment_id
        INTO v_experiment_id
        FROM public.sample_experiments se
       WHERE se.sample_id = p_id
       ORDER BY se.linked_at DESC
       LIMIT 1;
      IF v_experiment_id IS NOT NULL THEN
        SELECT e.name, e.project_id
          INTO v_experiment_name, v_project_id
          FROM public.experiments e
         WHERE e.id = v_experiment_id;
      ELSE
        -- Final fallback: sample_projects
        SELECT sp.project_id
          INTO v_project_id
          FROM public.sample_projects sp
         WHERE sp.sample_id = p_id
         LIMIT 1;
      END IF;
    END IF;

  ELSIF p_type = 'data' THEN
    SELECT ed.experiment_id, ed.project_id
      INTO v_eid, v_pid
      FROM public.experiment_data ed
     WHERE ed.id = p_id;
    IF v_eid IS NOT NULL THEN
      v_experiment_id := v_eid;
      SELECT e.name, e.project_id
        INTO v_experiment_name, v_project_id
        FROM public.experiments e
       WHERE e.id = v_eid;
      IF v_project_id IS NULL THEN v_project_id := v_pid; END IF;
    ELSE
      v_project_id := v_pid;
    END IF;

  ELSIF p_type = 'reports' THEN
    SELECT r.experiment_id, r.project_id
      INTO v_eid, v_pid
      FROM public.reports r
     WHERE r.id = p_id;
    IF v_eid IS NOT NULL THEN
      v_experiment_id := v_eid;
      SELECT e.name, e.project_id
        INTO v_experiment_name, v_project_id
        FROM public.experiments e
       WHERE e.id = v_eid;
      IF v_project_id IS NULL THEN v_project_id := v_pid; END IF;
    ELSE
      v_project_id := v_pid;
    END IF;

  ELSIF p_type = 'papers' THEN
    -- papers has project_id but no experiment_id
    SELECT pa.project_id
      INTO v_project_id
      FROM public.papers pa
     WHERE pa.id = p_id;

  ELSIF p_type = 'literature-reviews' THEN
    SELECT lr.experiment_id, lr.project_id
      INTO v_eid, v_pid
      FROM public.literature_reviews lr
     WHERE lr.id = p_id;
    IF v_eid IS NOT NULL THEN
      v_experiment_id := v_eid;
      SELECT e.name, e.project_id
        INTO v_experiment_name, v_project_id
        FROM public.experiments e
       WHERE e.id = v_eid;
      IF v_project_id IS NULL THEN v_project_id := v_pid; END IF;
    ELSE
      v_project_id := v_pid;
    END IF;

  -- equipment has no project_id/experiment_id; returns all nulls
  END IF;

  -- Resolve project name once (covers cases where we got project_id but not name)
  IF v_project_id IS NOT NULL AND v_project_name IS NULL THEN
    SELECT p.name
      INTO v_project_name
      FROM public.projects p
     WHERE p.id = v_project_id;
  END IF;

  RETURN QUERY
    SELECT v_project_id, v_project_name, v_experiment_id, v_experiment_name;
END;
$$;

-- Grant execute to authenticated users (anon cannot call this — auth check
-- is enforced in the API route before the RPC is called).
GRANT EXECUTE ON FUNCTION public.resolve_entity_scope(text, uuid) TO authenticated;

-- ============================================================ 060
-- Idempotent catch-up for DBs that missed 046_sample_molecular_files_and_links.
-- Safe to run multiple times; all statements use IF NOT EXISTS / OR REPLACE / DO NOTHING.

-- ── 1. sample_files table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sample_files (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sample_id      uuid NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  file_kind      text NOT NULL CHECK (file_kind IN ('plasmid','protein_structure','sequence','other')),
  file_name      text NOT NULL,
  file_type      text,
  file_size      bigint,
  storage_path   text NOT NULL,
  parsed_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  viewer_state   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sample_files_sample_id_idx ON public.sample_files(sample_id);
CREATE INDEX IF NOT EXISTS sample_files_file_kind_idx ON public.sample_files(file_kind);

-- ── 2. Junction tables ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sample_projects (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sample_id  uuid NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  linked_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  linked_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sample_id, project_id)
);
CREATE INDEX IF NOT EXISTS sample_projects_sample_id_idx  ON public.sample_projects(sample_id);
CREATE INDEX IF NOT EXISTS sample_projects_project_id_idx ON public.sample_projects(project_id);

CREATE TABLE IF NOT EXISTS public.sample_experiments (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sample_id     uuid NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  experiment_id uuid NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  linked_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  linked_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sample_id, experiment_id)
);
CREATE INDEX IF NOT EXISTS sample_experiments_sample_id_idx     ON public.sample_experiments(sample_id);
CREATE INDEX IF NOT EXISTS sample_experiments_experiment_id_idx ON public.sample_experiments(experiment_id);

CREATE TABLE IF NOT EXISTS public.sample_lab_notes (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sample_id   uuid NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  lab_note_id uuid NOT NULL REFERENCES public.lab_notes(id) ON DELETE CASCADE,
  linked_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  linked_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sample_id, lab_note_id)
);
CREATE INDEX IF NOT EXISTS sample_lab_notes_sample_id_idx   ON public.sample_lab_notes(sample_id);
CREATE INDEX IF NOT EXISTS sample_lab_notes_lab_note_id_idx ON public.sample_lab_notes(lab_note_id);

-- ── 3. Extended sample columns (idempotent) ──────────────────────────────────
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS barcode          text,
  ADD COLUMN IF NOT EXISTS external_id      text,
  ADD COLUMN IF NOT EXISTS organism         text,
  ADD COLUMN IF NOT EXISTS strain           text,
  ADD COLUMN IF NOT EXISTS genotype         text,
  ADD COLUMN IF NOT EXISTS supplier         text,
  ADD COLUMN IF NOT EXISTS catalog_number   text,
  ADD COLUMN IF NOT EXISTS lot_number       text,
  ADD COLUMN IF NOT EXISTS concentration    numeric,
  ADD COLUMN IF NOT EXISTS concentration_unit text,
  ADD COLUMN IF NOT EXISTS purity           text,
  ADD COLUMN IF NOT EXISTS container_type   text,
  ADD COLUMN IF NOT EXISTS box_position     text,
  ADD COLUMN IF NOT EXISTS expiry_date      date,
  ADD COLUMN IF NOT EXISTS hazard_class     text,
  ADD COLUMN IF NOT EXISTS biosafety_level  text,
  ADD COLUMN IF NOT EXISTS tags             text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS custom_metadata  jsonb  DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS project_id       uuid   REFERENCES public.projects(id) ON DELETE SET NULL;

-- ── 4. Backfill junction tables from existing FK columns ─────────────────────
INSERT INTO public.sample_experiments (sample_id, experiment_id, linked_by)
  SELECT s.id, s.experiment_id, s.created_by
  FROM   public.samples s
  WHERE  s.experiment_id IS NOT NULL
ON CONFLICT (sample_id, experiment_id) DO NOTHING;

INSERT INTO public.sample_projects (sample_id, project_id, linked_by)
  SELECT s.id, s.project_id, s.created_by
  FROM   public.samples s
  WHERE  s.project_id IS NOT NULL
ON CONFLICT (sample_id, project_id) DO NOTHING;

-- ── 5. Primary-experiment sync trigger ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_sample_primary_experiment()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  target_sample_id uuid;
  first_experiment_id uuid;
BEGIN
  target_sample_id := COALESCE(NEW.sample_id, OLD.sample_id);
  SELECT se.experiment_id INTO first_experiment_id
  FROM   public.sample_experiments se
  WHERE  se.sample_id = target_sample_id
  ORDER BY se.linked_at ASC, se.id ASC
  LIMIT 1;
  UPDATE public.samples
  SET    experiment_id = first_experiment_id, updated_at = now()
  WHERE  id = target_sample_id
    AND  experiment_id IS DISTINCT FROM first_experiment_id;
  RETURN COALESCE(NEW, OLD);
END;
$fn$;

DROP TRIGGER IF EXISTS sample_experiments_sync_primary_insert_update ON public.sample_experiments;
CREATE TRIGGER sample_experiments_sync_primary_insert_update
  AFTER INSERT OR UPDATE ON public.sample_experiments
  FOR EACH ROW EXECUTE FUNCTION public.sync_sample_primary_experiment();

DROP TRIGGER IF EXISTS sample_experiments_sync_primary_delete ON public.sample_experiments;
CREATE TRIGGER sample_experiments_sync_primary_delete
  AFTER DELETE ON public.sample_experiments
  FOR EACH ROW EXECUTE FUNCTION public.sync_sample_primary_experiment();

-- ── 6. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.sample_files      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sample_projects   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sample_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sample_lab_notes  ENABLE ROW LEVEL SECURITY;

-- sample_files: any org member whose org owns the sample can read/write
DROP POLICY IF EXISTS "sample_files_all"  ON public.sample_files;
DROP POLICY IF EXISTS "Users can read sample files"   ON public.sample_files;
DROP POLICY IF EXISTS "Users can manage sample files" ON public.sample_files;
DROP POLICY IF EXISTS "sample_files_org_select" ON public.sample_files;
DROP POLICY IF EXISTS "sample_files_org_insert" ON public.sample_files;
DROP POLICY IF EXISTS "sample_files_org_update" ON public.sample_files;
DROP POLICY IF EXISTS "sample_files_org_delete" ON public.sample_files;
CREATE POLICY "sample_files_org_select" ON public.sample_files
  FOR SELECT USING (
    sample_id IN (
      SELECT id FROM public.samples
      WHERE created_by IN (
        SELECT id FROM public.profiles WHERE organization_id = public.my_org_id()
      )
    )
  );
CREATE POLICY "sample_files_org_insert" ON public.sample_files
  FOR INSERT WITH CHECK (
    sample_id IN (
      SELECT id FROM public.samples
      WHERE created_by IN (
        SELECT id FROM public.profiles WHERE organization_id = public.my_org_id()
      )
    )
  );
CREATE POLICY "sample_files_org_update" ON public.sample_files
  FOR UPDATE
  USING (
    sample_id IN (
      SELECT id FROM public.samples
      WHERE created_by IN (
        SELECT id FROM public.profiles WHERE organization_id = public.my_org_id()
      )
    )
  )
  WITH CHECK (
    sample_id IN (
      SELECT id FROM public.samples
      WHERE created_by IN (
        SELECT id FROM public.profiles WHERE organization_id = public.my_org_id()
      )
    )
  );
CREATE POLICY "sample_files_org_delete" ON public.sample_files
  FOR DELETE USING (
    created_by = auth.uid()
    OR sample_id IN (
      SELECT id FROM public.samples WHERE created_by = auth.uid()
    )
  );

-- Junction tables: mirror 053 pattern
DROP POLICY IF EXISTS "sample_experiments_all"  ON public.sample_experiments;
DROP POLICY IF EXISTS "Users can read sample experiment links"   ON public.sample_experiments;
DROP POLICY IF EXISTS "Users can manage sample experiment links" ON public.sample_experiments;
DROP POLICY IF EXISTS "sample_experiments_org" ON public.sample_experiments;
CREATE POLICY "sample_experiments_org" ON public.sample_experiments
  FOR ALL USING (
    sample_id IN (
      SELECT id FROM public.samples
      WHERE created_by IN (
        SELECT id FROM public.profiles WHERE organization_id = public.my_org_id()
      )
    )
  );

DROP POLICY IF EXISTS "sample_projects_all"  ON public.sample_projects;
DROP POLICY IF EXISTS "Users can read sample project links"   ON public.sample_projects;
DROP POLICY IF EXISTS "Users can manage sample project links" ON public.sample_projects;
DROP POLICY IF EXISTS "sample_projects_org" ON public.sample_projects;
CREATE POLICY "sample_projects_org" ON public.sample_projects
  FOR ALL USING (
    project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
  );

DROP POLICY IF EXISTS "sample_lab_notes_all"  ON public.sample_lab_notes;
DROP POLICY IF EXISTS "Users can read sample lab note links"   ON public.sample_lab_notes;
DROP POLICY IF EXISTS "Users can manage sample lab note links" ON public.sample_lab_notes;
DROP POLICY IF EXISTS "sample_lab_notes_org" ON public.sample_lab_notes;
CREATE POLICY "sample_lab_notes_org" ON public.sample_lab_notes
  FOR ALL USING (
    sample_id IN (
      SELECT id FROM public.samples
      WHERE created_by IN (
        SELECT id FROM public.profiles WHERE organization_id = public.my_org_id()
      )
    )
  );

-- ── 7. Storage policies for sample molecular files ───────────────────────────
-- Path: {orgId}/sample/{sampleId}/{sampleFileId}/{fileName}
-- foldername segments (1-indexed, excludes filename):
--   [1] = orgId  [2] = 'sample'  [3] = sampleId  [4] = sampleFileId

DROP POLICY IF EXISTS "Org members read sample files in user bucket"   ON storage.objects;
DROP POLICY IF EXISTS "Org members insert sample files in user bucket" ON storage.objects;
DROP POLICY IF EXISTS "Org members delete sample files in user bucket" ON storage.objects;
DROP POLICY IF EXISTS "Org members update sample files in user bucket" ON storage.objects;

CREATE POLICY "Org members read sample files in user bucket"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'user'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[2] = 'sample'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.sample_files sf
      WHERE sf.id::text = (storage.foldername(name))[4]
        AND sf.storage_path = name
    )
  );

CREATE POLICY "Org members insert sample files in user bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'user'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[2] = 'sample'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

-- UPDATE needed for upsert operations (storage.upsert requires INSERT + SELECT + UPDATE)
CREATE POLICY "Org members update sample files in user bucket"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'user'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[2] = 'sample'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Org members delete sample files in user bucket"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'user'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[2] = 'sample'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ── 8. Grant Data API access ─────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sample_files      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sample_projects   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sample_experiments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sample_lab_notes  TO authenticated;

SELECT '060_sample_files_ensure applied' AS status;

-- ============================================================ 061
-- Harmonize sample CHILD tables (transfers, QC, junctions) to the ORG-scoped
-- access model that script 053 established for `samples` itself.
--
-- WHY: 053 made `samples` viewable/editable by any member of the owning org,
-- but 048 left `sample_transfers` / `sample_qc_records` on a narrow owner model
-- (performed_by = auth.uid() OR sample.created_by = auth.uid()). Result: a
-- colleague in the same org can open a sample but the History/QC tabs appear
-- empty (existing records hidden) and "Add entry"/"Record QC" can fail. This
-- aligns child-table visibility with the parent sample.
--
-- Idempotent: safe to run repeatedly.

-- Helper: is this sample visible to the current user under the same rule
-- 053 uses for samples_select (org member via creator OR via experiment→project)?
CREATE OR REPLACE FUNCTION public.can_access_sample(p_sample_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.samples s
    WHERE s.id = p_sample_id
      AND (
        s.created_by IN (
          SELECT id FROM public.profiles WHERE organization_id = public.my_org_id()
        )
        OR s.experiment_id IN (
          SELECT e.id FROM public.experiments e
          JOIN public.projects p ON p.id = e.project_id
          WHERE p.organization_id = public.my_org_id()
        )
        OR s.id IN (
          SELECT sp.sample_id FROM public.sample_projects sp
          JOIN public.projects p ON p.id = sp.project_id
          WHERE p.organization_id = public.my_org_id()
        )
      )
  );
$$;
GRANT EXECUTE ON FUNCTION public.can_access_sample(uuid) TO authenticated;

-- ── sample_transfers ─────────────────────────────────────────────────────────
ALTER TABLE public.sample_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read sample transfers"   ON public.sample_transfers;
DROP POLICY IF EXISTS "Users can manage sample transfers" ON public.sample_transfers;
DROP POLICY IF EXISTS "sample_transfers_org_select" ON public.sample_transfers;
DROP POLICY IF EXISTS "sample_transfers_org_write"  ON public.sample_transfers;

CREATE POLICY "sample_transfers_org_select" ON public.sample_transfers
  FOR SELECT USING (public.can_access_sample(sample_id));

CREATE POLICY "sample_transfers_org_write" ON public.sample_transfers
  FOR ALL
  USING (public.can_access_sample(sample_id))
  WITH CHECK (public.can_access_sample(sample_id) AND performed_by = auth.uid());

-- ── sample_qc_records ────────────────────────────────────────────────────────
ALTER TABLE public.sample_qc_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read sample QC records"   ON public.sample_qc_records;
DROP POLICY IF EXISTS "Users can manage sample QC records" ON public.sample_qc_records;
DROP POLICY IF EXISTS "sample_qc_org_select" ON public.sample_qc_records;
DROP POLICY IF EXISTS "sample_qc_org_write"  ON public.sample_qc_records;

CREATE POLICY "sample_qc_org_select" ON public.sample_qc_records
  FOR SELECT USING (public.can_access_sample(sample_id));

CREATE POLICY "sample_qc_org_write" ON public.sample_qc_records
  FOR ALL
  USING (public.can_access_sample(sample_id))
  WITH CHECK (public.can_access_sample(sample_id) AND performed_by = auth.uid());

-- ── Grants (Data API visibility) ─────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sample_transfers  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sample_qc_records TO authenticated;

SELECT '061_sample_children_org_rls applied' AS status;
