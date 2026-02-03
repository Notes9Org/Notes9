-- Fix experiment_protocols RLS policies
-- The existing policies are too strict - they require organization_id to match
-- but protocols created individually may not have organization_id set correctly

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view experiment protocols they have access to" ON experiment_protocols;
DROP POLICY IF EXISTS "Users can link protocols to experiments they have access to" ON experiment_protocols;

-- Create a simpler SELECT policy
CREATE POLICY "Users can view experiment protocols they have access to"
  ON experiment_protocols FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM experiments e
      JOIN projects p ON e.project_id = p.id
      WHERE e.id = experiment_protocols.experiment_id
      AND (
        p.organization_id = get_user_organization_id(auth.uid())
        OR e.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = auth.uid())
      )
    )
  );

-- Create a simpler INSERT policy
CREATE POLICY "Users can link protocols to experiments they have access to"
  ON experiment_protocols FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM experiments e
      JOIN projects p ON e.project_id = p.id
      WHERE e.id = experiment_id
      AND (
        p.organization_id = get_user_organization_id(auth.uid())
        OR e.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = auth.uid())
      )
    )
    AND
    EXISTS (
      SELECT 1 FROM protocols pr
      WHERE pr.id = protocol_id
      AND (
        pr.created_by = auth.uid()
        OR pr.organization_id = get_user_organization_id(auth.uid())
        OR pr.organization_id IS NULL
      )
    )
  );
