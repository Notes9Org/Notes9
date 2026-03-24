-- Samples: align SELECT with experiment visibility (project_members).
-- Policy 011 used organization_id-only for experiment-linked rows; users who access
-- experiments via project_members but without a matching profiles.organization_id
-- could not see samples on the experiment detail page.

DROP POLICY IF EXISTS "Users can view samples" ON samples;

CREATE POLICY "Users can view samples"
  ON samples
  FOR SELECT
  USING (
    (created_by = auth.uid())
    OR
    (experiment_id IN (
      SELECT e.id
      FROM experiments e
      JOIN project_members pm ON e.project_id = pm.project_id
      WHERE pm.user_id = auth.uid()
    ))
    OR
    (experiment_id IN (
      SELECT e.id
      FROM experiments e
      JOIN projects p ON e.project_id = p.id
      WHERE p.organization_id IN (
        SELECT organization_id
        FROM profiles
        WHERE id = auth.uid()
          AND organization_id IS NOT NULL
      )
    ))
  );
