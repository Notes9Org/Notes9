-- Fix infinite recursion in lab_note_access SELECT policy.
-- The original policy (022) had a self-referencing EXISTS clause that causes
-- "infinite recursion detected in policy for relation lab_note_access".
-- The user_id = auth.uid() check already covers the collaborator case,
-- so the self-referencing EXISTS is redundant and can be removed.

DROP POLICY IF EXISTS "lab_note_access_select_policy" ON lab_note_access;

CREATE POLICY "lab_note_access_select_policy" ON lab_note_access FOR SELECT USING (
  -- User is the owner of the lab note
  EXISTS (
    SELECT 1 FROM lab_notes
    WHERE lab_notes.id = lab_note_access.lab_note_id
    AND lab_notes.created_by = auth.uid()
  )
  -- Or user is the one who was granted access (covers both own row and collaborator case)
  OR user_id = auth.uid()
);
