-- Rich sample records, molecular files, and many-to-many sample context links.
-- Keeps samples.experiment_id as a compatibility mirror of the first experiment link.

ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS organism text,
  ADD COLUMN IF NOT EXISTS strain text,
  ADD COLUMN IF NOT EXISTS genotype text,
  ADD COLUMN IF NOT EXISTS supplier text,
  ADD COLUMN IF NOT EXISTS catalog_number text,
  ADD COLUMN IF NOT EXISTS lot_number text,
  ADD COLUMN IF NOT EXISTS concentration numeric,
  ADD COLUMN IF NOT EXISTS concentration_unit text,
  ADD COLUMN IF NOT EXISTS purity text,
  ADD COLUMN IF NOT EXISTS container_type text,
  ADD COLUMN IF NOT EXISTS box_position text,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS hazard_class text,
  ADD COLUMN IF NOT EXISTS biosafety_level text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS custom_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.sample_projects (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sample_id uuid NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  linked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sample_id, project_id)
);

CREATE TABLE IF NOT EXISTS public.sample_experiments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sample_id uuid NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  experiment_id uuid NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  linked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sample_id, experiment_id)
);

CREATE TABLE IF NOT EXISTS public.sample_lab_notes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sample_id uuid NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  lab_note_id uuid NOT NULL REFERENCES public.lab_notes(id) ON DELETE CASCADE,
  linked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sample_id, lab_note_id)
);

CREATE TABLE IF NOT EXISTS public.sample_files (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sample_id uuid NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  file_kind text NOT NULL CHECK (file_kind IN ('plasmid', 'protein_structure', 'sequence', 'other')),
  file_name text NOT NULL,
  file_type text,
  file_size bigint,
  storage_path text NOT NULL,
  parsed_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  viewer_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sample_projects_sample_id_idx ON public.sample_projects(sample_id);
CREATE INDEX IF NOT EXISTS sample_projects_project_id_idx ON public.sample_projects(project_id);
CREATE INDEX IF NOT EXISTS sample_experiments_sample_id_idx ON public.sample_experiments(sample_id);
CREATE INDEX IF NOT EXISTS sample_experiments_experiment_id_idx ON public.sample_experiments(experiment_id);
CREATE INDEX IF NOT EXISTS sample_lab_notes_sample_id_idx ON public.sample_lab_notes(sample_id);
CREATE INDEX IF NOT EXISTS sample_lab_notes_lab_note_id_idx ON public.sample_lab_notes(lab_note_id);
CREATE INDEX IF NOT EXISTS sample_files_sample_id_idx ON public.sample_files(sample_id);
CREATE INDEX IF NOT EXISTS sample_files_file_kind_idx ON public.sample_files(file_kind);
CREATE INDEX IF NOT EXISTS samples_tags_gin_idx ON public.samples USING gin(tags);

INSERT INTO public.sample_experiments (sample_id, experiment_id, linked_by)
SELECT s.id, s.experiment_id, s.created_by
FROM public.samples s
WHERE s.experiment_id IS NOT NULL
ON CONFLICT (sample_id, experiment_id) DO NOTHING;

INSERT INTO public.sample_projects (sample_id, project_id, linked_by)
SELECT DISTINCT s.id, e.project_id, s.created_by
FROM public.samples s
JOIN public.experiments e ON e.id = s.experiment_id
WHERE s.experiment_id IS NOT NULL
ON CONFLICT (sample_id, project_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_sample_primary_experiment()
RETURNS trigger
LANGUAGE plpgsql
AS $sync_sample_primary_experiment$
DECLARE
  target_sample_id uuid;
  first_experiment_id uuid;
BEGIN
  target_sample_id := COALESCE(NEW.sample_id, OLD.sample_id);

  SELECT se.experiment_id
    INTO first_experiment_id
  FROM public.sample_experiments se
  WHERE se.sample_id = target_sample_id
  ORDER BY se.linked_at ASC, se.id ASC
  LIMIT 1;

  UPDATE public.samples
  SET experiment_id = first_experiment_id,
      updated_at = now()
  WHERE id = target_sample_id
    AND experiment_id IS DISTINCT FROM first_experiment_id;

  RETURN COALESCE(NEW, OLD);
END;
$sync_sample_primary_experiment$;

DROP TRIGGER IF EXISTS sample_experiments_sync_primary_insert_update ON public.sample_experiments;
CREATE TRIGGER sample_experiments_sync_primary_insert_update
  AFTER INSERT OR UPDATE OF experiment_id, linked_at ON public.sample_experiments
  FOR EACH ROW EXECUTE FUNCTION public.sync_sample_primary_experiment();

DROP TRIGGER IF EXISTS sample_experiments_sync_primary_delete ON public.sample_experiments;
CREATE TRIGGER sample_experiments_sync_primary_delete
  AFTER DELETE ON public.sample_experiments
  FOR EACH ROW EXECUTE FUNCTION public.sync_sample_primary_experiment();

ALTER TABLE public.sample_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sample_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sample_lab_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sample_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read sample project links" ON public.sample_projects;
CREATE POLICY "Users can read sample project links"
  ON public.sample_projects FOR SELECT
  USING (
    linked_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.samples s WHERE s.id = sample_id AND s.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = sample_projects.project_id AND pm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can manage sample project links" ON public.sample_projects;
CREATE POLICY "Users can manage sample project links"
  ON public.sample_projects FOR ALL
  USING (
    linked_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.samples s WHERE s.id = sample_id AND s.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = sample_projects.project_id AND pm.user_id = auth.uid())
  )
  WITH CHECK (
    linked_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.samples s WHERE s.id = sample_id AND s.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = sample_projects.project_id AND pm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can read sample experiment links" ON public.sample_experiments;
CREATE POLICY "Users can read sample experiment links"
  ON public.sample_experiments FOR SELECT
  USING (
    linked_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.samples s WHERE s.id = sample_id AND s.created_by = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.experiments e
      JOIN public.project_members pm ON pm.project_id = e.project_id
      WHERE e.id = sample_experiments.experiment_id AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage sample experiment links" ON public.sample_experiments;
CREATE POLICY "Users can manage sample experiment links"
  ON public.sample_experiments FOR ALL
  USING (
    linked_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.samples s WHERE s.id = sample_id AND s.created_by = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.experiments e
      JOIN public.project_members pm ON pm.project_id = e.project_id
      WHERE e.id = sample_experiments.experiment_id AND pm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    linked_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.samples s WHERE s.id = sample_id AND s.created_by = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.experiments e
      JOIN public.project_members pm ON pm.project_id = e.project_id
      WHERE e.id = sample_experiments.experiment_id AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can read sample lab note links" ON public.sample_lab_notes;
CREATE POLICY "Users can read sample lab note links"
  ON public.sample_lab_notes FOR SELECT
  USING (
    linked_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.samples s WHERE s.id = sample_id AND s.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.lab_notes ln WHERE ln.id = lab_note_id AND ln.created_by = auth.uid())
  );

DROP POLICY IF EXISTS "Users can manage sample lab note links" ON public.sample_lab_notes;
CREATE POLICY "Users can manage sample lab note links"
  ON public.sample_lab_notes FOR ALL
  USING (
    linked_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.samples s WHERE s.id = sample_id AND s.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.lab_notes ln WHERE ln.id = lab_note_id AND ln.created_by = auth.uid())
  )
  WITH CHECK (
    linked_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.samples s WHERE s.id = sample_id AND s.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.lab_notes ln WHERE ln.id = lab_note_id AND ln.created_by = auth.uid())
  );

DROP POLICY IF EXISTS "Users can read sample files" ON public.sample_files;
CREATE POLICY "Users can read sample files"
  ON public.sample_files FOR SELECT
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.samples s WHERE s.id = sample_id AND s.created_by = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.sample_experiments se
      JOIN public.experiments e ON e.id = se.experiment_id
      JOIN public.project_members pm ON pm.project_id = e.project_id
      WHERE se.sample_id = sample_files.sample_id AND pm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.sample_projects sp
      JOIN public.project_members pm ON pm.project_id = sp.project_id
      WHERE sp.sample_id = sample_files.sample_id AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage sample files" ON public.sample_files;
CREATE POLICY "Users can manage sample files"
  ON public.sample_files FOR ALL
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.samples s WHERE s.id = sample_id AND s.created_by = auth.uid())
  )
  WITH CHECK (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.samples s WHERE s.id = sample_id AND s.created_by = auth.uid())
  );

DROP POLICY IF EXISTS "Org members read sample files in user bucket" ON storage.objects;
CREATE POLICY "Org members read sample files in user bucket"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'user'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(storage.objects.name))[2] = 'sample'
    AND (storage.foldername(storage.objects.name))[1] = (SELECT organization_id::text FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.sample_files sf
      WHERE sf.id::text = (storage.foldername(storage.objects.name))[4]
        AND sf.storage_path = storage.objects.name
    )
  );

DROP POLICY IF EXISTS "Org members insert sample files in user bucket" ON storage.objects;
CREATE POLICY "Org members insert sample files in user bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'user'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(storage.objects.name))[2] = 'sample'
    AND (storage.foldername(storage.objects.name))[1] = (SELECT organization_id::text FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Org members delete sample files in user bucket" ON storage.objects;
CREATE POLICY "Org members delete sample files in user bucket"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'user'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(storage.objects.name))[2] = 'sample'
    AND (storage.foldername(storage.objects.name))[1] = (SELECT organization_id::text FROM public.profiles WHERE id = auth.uid())
  );

SELECT '046_sample_molecular_files_and_links applied' AS status;
