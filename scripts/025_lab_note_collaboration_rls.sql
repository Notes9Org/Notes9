-- Allow collaborators to view lab notes they have access to

DROP POLICY IF EXISTS "Users can view lab notes they collaborate on" ON lab_notes;

CREATE POLICY "Users can view lab notes they collaborate on"
  ON lab_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lab_note_access
      WHERE lab_note_access.lab_note_id = lab_notes.id
      AND lab_note_access.user_id = auth.uid()
    )
  );
