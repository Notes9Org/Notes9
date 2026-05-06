-- Sample transfer history and QC records, with org/project-aware RLS aligned to sample_files (script 046).

CREATE TABLE IF NOT EXISTS public.sample_transfers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sample_id uuid NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  action text NOT NULL DEFAULT 'transfer'
    CHECK (action IN ('transfer', 'check_in', 'check_out', 'aliquot', 'dispose', 'reagent_use')),
  from_location text,
  to_location text,
  quantity numeric,
  quantity_unit text,
  notes text,
  transferred_at timestamptz NOT NULL DEFAULT now(),
  performed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sample_transfers_sample_id_idx ON public.sample_transfers(sample_id);
CREATE INDEX IF NOT EXISTS sample_transfers_transferred_at_idx
  ON public.sample_transfers(transferred_at DESC);

CREATE TABLE IF NOT EXISTS public.sample_qc_records (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sample_id uuid NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  qc_type text NOT NULL,
  result text NOT NULL DEFAULT 'pass'
    CHECK (result IN ('pass', 'fail', 'inconclusive', 'pending')),
  measured_value text,
  measured_unit text,
  expected_value text,
  notes text,
  attachment_path text,
  performed_at timestamptz NOT NULL DEFAULT now(),
  performed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sample_qc_records_sample_id_idx ON public.sample_qc_records(sample_id);
CREATE INDEX IF NOT EXISTS sample_qc_records_performed_at_idx
  ON public.sample_qc_records(performed_at DESC);

-- updated_at maintenance triggers (uses public.set_updated_at if available, else inline).
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $touch_updated_at$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$touch_updated_at$;

DROP TRIGGER IF EXISTS sample_transfers_set_updated_at ON public.sample_transfers;
CREATE TRIGGER sample_transfers_set_updated_at
  BEFORE UPDATE ON public.sample_transfers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS sample_qc_records_set_updated_at ON public.sample_qc_records;
CREATE TRIGGER sample_qc_records_set_updated_at
  BEFORE UPDATE ON public.sample_qc_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS aligned with sample_files: creators, sample owners, and project/org members can read/write.
ALTER TABLE public.sample_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sample_qc_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read sample transfers" ON public.sample_transfers;
CREATE POLICY "Users can read sample transfers"
  ON public.sample_transfers FOR SELECT
  USING (
    performed_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.samples s WHERE s.id = sample_id AND s.created_by = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.sample_experiments se
      JOIN public.experiments e ON e.id = se.experiment_id
      JOIN public.project_members pm ON pm.project_id = e.project_id
      WHERE se.sample_id = sample_transfers.sample_id AND pm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.sample_projects sp
      JOIN public.project_members pm ON pm.project_id = sp.project_id
      WHERE sp.sample_id = sample_transfers.sample_id AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage sample transfers" ON public.sample_transfers;
CREATE POLICY "Users can manage sample transfers"
  ON public.sample_transfers FOR ALL
  USING (
    performed_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.samples s WHERE s.id = sample_id AND s.created_by = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.sample_experiments se
      JOIN public.experiments e ON e.id = se.experiment_id
      JOIN public.project_members pm ON pm.project_id = e.project_id
      WHERE se.sample_id = sample_transfers.sample_id AND pm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    performed_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.samples s WHERE s.id = sample_id AND s.created_by = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.sample_experiments se
      JOIN public.experiments e ON e.id = se.experiment_id
      JOIN public.project_members pm ON pm.project_id = e.project_id
      WHERE se.sample_id = sample_transfers.sample_id AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can read sample QC records" ON public.sample_qc_records;
CREATE POLICY "Users can read sample QC records"
  ON public.sample_qc_records FOR SELECT
  USING (
    performed_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.samples s WHERE s.id = sample_id AND s.created_by = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.sample_experiments se
      JOIN public.experiments e ON e.id = se.experiment_id
      JOIN public.project_members pm ON pm.project_id = e.project_id
      WHERE se.sample_id = sample_qc_records.sample_id AND pm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.sample_projects sp
      JOIN public.project_members pm ON pm.project_id = sp.project_id
      WHERE sp.sample_id = sample_qc_records.sample_id AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage sample QC records" ON public.sample_qc_records;
CREATE POLICY "Users can manage sample QC records"
  ON public.sample_qc_records FOR ALL
  USING (
    performed_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.samples s WHERE s.id = sample_id AND s.created_by = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.sample_experiments se
      JOIN public.experiments e ON e.id = se.experiment_id
      JOIN public.project_members pm ON pm.project_id = e.project_id
      WHERE se.sample_id = sample_qc_records.sample_id AND pm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    performed_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.samples s WHERE s.id = sample_id AND s.created_by = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.sample_experiments se
      JOIN public.experiments e ON e.id = se.experiment_id
      JOIN public.project_members pm ON pm.project_id = e.project_id
      WHERE se.sample_id = sample_qc_records.sample_id AND pm.user_id = auth.uid()
    )
  );

SELECT '048_sample_history_and_qc applied' AS status;
