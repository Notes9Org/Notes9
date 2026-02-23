-- Allow collaborators to update lab notes and view related protocols/links

-- Editors/owners can update lab notes
CREATE OR REPLACE FUNCTION can_edit_lab_note(p_lab_note_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM lab_note_access
    WHERE lab_note_access.lab_note_id = p_lab_note_id
      AND lab_note_access.user_id = p_user_id
      AND lab_note_access.permission_level IN ('owner', 'editor')
  );
$$;

GRANT EXECUTE ON FUNCTION can_edit_lab_note(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Collaborators can update lab notes" ON lab_notes;

CREATE POLICY "Collaborators can update lab notes"
  ON lab_notes FOR UPDATE
  USING (can_edit_lab_note(id, auth.uid()))
  WITH CHECK (can_edit_lab_note(id, auth.uid()));

-- Allow collaborators to view experiment_protocols rows for experiments they have lab note access to
DROP POLICY IF EXISTS "Collaborators can view experiment protocols" ON experiment_protocols;

CREATE POLICY "Collaborators can view experiment protocols"
  ON experiment_protocols FOR SELECT
  USING (can_view_experiment_via_lab_notes(experiment_id, auth.uid()));

-- Allow collaborators to view protocols linked to experiments they have lab note access to
CREATE OR REPLACE FUNCTION can_view_protocol_via_lab_notes(p_protocol_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM experiment_protocols ep
    JOIN lab_notes ln ON ln.experiment_id = ep.experiment_id
    JOIN lab_note_access lna ON lna.lab_note_id = ln.id
    WHERE ep.protocol_id = p_protocol_id
      AND lna.user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION can_view_protocol_via_lab_notes(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Collaborators can view protocols" ON protocols;

CREATE POLICY "Collaborators can view protocols"
  ON protocols FOR SELECT
  USING (can_view_protocol_via_lab_notes(id, auth.uid()));
