-- Fix RLS policies for samples table to allow creation without experiment
-- This allows users to create samples not yet associated with an experiment

-- Drop the restrictive INSERT policy
DROP POLICY IF EXISTS "Users can create samples in their experiments" ON samples;

-- Create a more permissive INSERT policy that allows:
-- 1. Creating samples linked to experiments in user's projects
-- 2. Creating standalone samples (experiment_id = NULL) within user's organization
CREATE POLICY "Users can create samples"
  ON samples
  FOR INSERT
  WITH CHECK (
    -- Allow if no experiment (standalone sample)
    (experiment_id IS NULL AND created_by = auth.uid())
    OR
    -- Allow if experiment belongs to user's project
    (experiment_id IN (
      SELECT e.id
      FROM experiments e
      JOIN project_members pm ON e.project_id = pm.project_id
      WHERE pm.user_id = auth.uid()
    ))
  );

-- Also update SELECT policy to include standalone samples
DROP POLICY IF EXISTS "samples_select_via_experiment" ON samples;

CREATE POLICY "Users can view samples"
  ON samples
  FOR SELECT
  USING (
    -- Can view if created by user (including standalone samples)
    (created_by = auth.uid())
    OR
    -- Can view if experiment is in their organization
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

