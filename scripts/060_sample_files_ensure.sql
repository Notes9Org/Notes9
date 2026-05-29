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
CREATE POLICY "sample_projects_org" ON public.sample_projects
  FOR ALL USING (
    project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
  );

DROP POLICY IF EXISTS "sample_lab_notes_all"  ON public.sample_lab_notes;
DROP POLICY IF EXISTS "Users can read sample lab note links"   ON public.sample_lab_notes;
DROP POLICY IF EXISTS "Users can manage sample lab note links" ON public.sample_lab_notes;
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
