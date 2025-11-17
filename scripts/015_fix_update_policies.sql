-- Fix RLS policies for Projects and Experiments UPDATE operations
-- The issue: UPDATE policies need both USING and WITH CHECK clauses

-- Drop existing UPDATE policies
DROP POLICY IF EXISTS "Users can update projects they're members of" ON projects;
DROP POLICY IF EXISTS "Users can update experiments they created or are assigned to" ON experiments;

-- Recreate Projects UPDATE policy with WITH CHECK clause
CREATE POLICY "Users can update projects they're members of"
  ON projects FOR UPDATE
  USING (
    id IN (
      SELECT project_id FROM project_members WHERE user_id = auth.uid()
    ) OR created_by = auth.uid()
  )
  WITH CHECK (
    id IN (
      SELECT project_id FROM project_members WHERE user_id = auth.uid()
    ) OR created_by = auth.uid()
  );

-- Recreate Experiments UPDATE policy with WITH CHECK clause
CREATE POLICY "Users can update experiments they created or are assigned to"
  ON experiments FOR UPDATE
  USING (created_by = auth.uid() OR assigned_to = auth.uid())
  WITH CHECK (created_by = auth.uid() OR assigned_to = auth.uid());

