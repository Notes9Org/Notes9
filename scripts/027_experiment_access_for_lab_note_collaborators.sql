-- Allow users to view experiments if they have access to any lab note in the experiment

CREATE OR REPLACE FUNCTION can_view_experiment_via_lab_notes(p_experiment_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM lab_notes ln
    JOIN lab_note_access lna ON lna.lab_note_id = ln.id
    WHERE ln.experiment_id = p_experiment_id
      AND lna.user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION can_view_experiment_via_lab_notes(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can view experiments with lab note access" ON experiments;

CREATE POLICY "Users can view experiments with lab note access"
  ON experiments FOR SELECT
  USING (can_view_experiment_via_lab_notes(id, auth.uid()));
