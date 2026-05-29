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
