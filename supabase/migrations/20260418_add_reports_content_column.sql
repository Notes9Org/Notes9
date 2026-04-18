-- Add 'data_analysis' to the report_type CHECK constraint on the reports table.
-- The content column already exists, so no ALTER needed for that.

-- Drop the existing CHECK constraint and recreate with the new value
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_report_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_report_type_check
  CHECK (report_type IN ('experiment', 'project', 'interim', 'final', 'data_analysis'));

-- Allow users to view reports they generated (in addition to the existing
-- project-membership policy). Without this, the INSERT succeeds but the
-- chained .select() fails because the SELECT policy only checks project_members.
CREATE POLICY "Users can view their own reports"
  ON reports FOR SELECT
  USING (generated_by = auth.uid());

-- Allow users to delete their own reports
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'reports' AND policyname = 'Users can delete their own reports'
  ) THEN
    CREATE POLICY "Users can delete their own reports"
      ON reports FOR DELETE
      USING (generated_by = auth.uid());
  END IF;
END $$;
