-- RLS Policies for experiment_protocols table
-- This table links experiments to protocols

-- SELECT: Users can view protocol links for experiments they have access to
CREATE POLICY "Users can view experiment protocols they have access to"
  ON experiment_protocols FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM experiments e
      JOIN projects p ON e.project_id = p.id
      WHERE e.id = experiment_protocols.experiment_id
      AND p.organization_id = get_user_organization_id(auth.uid())
    )
  );

-- INSERT: Users can link protocols to experiments they have access to
CREATE POLICY "Users can link protocols to experiments they have access to"
  ON experiment_protocols FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM experiments e
      JOIN projects p ON e.project_id = p.id
      WHERE e.id = experiment_protocols.experiment_id
      AND p.organization_id = get_user_organization_id(auth.uid())
    )
    AND
    EXISTS (
      SELECT 1 FROM protocols pr
      WHERE pr.id = experiment_protocols.protocol_id
      AND pr.organization_id = get_user_organization_id(auth.uid())
    )
  );

-- UPDATE: Users can update protocol links for experiments they have access to
CREATE POLICY "Users can update experiment protocols they have access to"
  ON experiment_protocols FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM experiments e
      JOIN projects p ON e.project_id = p.id
      WHERE e.id = experiment_protocols.experiment_id
      AND p.organization_id = get_user_organization_id(auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM experiments e
      JOIN projects p ON e.project_id = p.id
      WHERE e.id = experiment_protocols.experiment_id
      AND p.organization_id = get_user_organization_id(auth.uid())
    )
    AND
    EXISTS (
      SELECT 1 FROM protocols pr
      WHERE pr.id = experiment_protocols.protocol_id
      AND pr.organization_id = get_user_organization_id(auth.uid())
    )
  );

-- DELETE: Users can unlink protocols from experiments they have access to
CREATE POLICY "Users can unlink protocols from experiments they have access to"
  ON experiment_protocols FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM experiments e
      JOIN projects p ON e.project_id = p.id
      WHERE e.id = experiment_protocols.experiment_id
      AND p.organization_id = get_user_organization_id(auth.uid())
    )
  );