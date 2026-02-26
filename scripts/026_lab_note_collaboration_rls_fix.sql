-- Fix infinite recursion in lab_notes collaborator policy by using a security definer helper

CREATE OR REPLACE FUNCTION is_lab_note_collaborator(p_lab_note_id uuid, p_user_id uuid)
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
  );
$$;

GRANT EXECUTE ON FUNCTION is_lab_note_collaborator(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can view lab notes they collaborate on" ON lab_notes;

CREATE POLICY "Users can view lab notes they collaborate on"
  ON lab_notes FOR SELECT
  USING (is_lab_note_collaborator(id, auth.uid()));
