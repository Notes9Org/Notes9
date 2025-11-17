-- Complete RLS policies for samples table
-- Provides full CRUD access with proper security

-- Drop existing policies
DROP POLICY IF EXISTS "Users can create samples" ON samples;
DROP POLICY IF EXISTS "Users can view samples" ON samples;
DROP POLICY IF EXISTS "Users can update samples they created" ON samples;
DROP POLICY IF EXISTS "Users can delete their own samples" ON samples;
DROP POLICY IF EXISTS "Users can view samples in their experiments" ON samples;
DROP POLICY IF EXISTS "samples_select_via_experiment" ON samples;

-- INSERT: Allow users to create samples they own
CREATE POLICY "Users can create samples"
  ON samples
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
  );

-- SELECT: Allow users to view their own samples or samples in their org
CREATE POLICY "Users can view samples"
  ON samples
  FOR SELECT
  USING (
    (created_by = auth.uid())
    OR
    (experiment_id IN (
      SELECT e.id
      FROM experiments e
      JOIN projects p ON e.project_id = p.id
      WHERE p.organization_id IN (
        SELECT organization_id
        FROM profiles
        WHERE id = auth.uid()
      )
    ))
  );

-- UPDATE: Allow users to update samples they created
CREATE POLICY "Users can update samples they created"
  ON samples
  FOR UPDATE
  USING (created_by = auth.uid());

-- DELETE: Allow users to delete samples they created
CREATE POLICY "Users can delete their own samples"
  ON samples
  FOR DELETE
  USING (created_by = auth.uid());

