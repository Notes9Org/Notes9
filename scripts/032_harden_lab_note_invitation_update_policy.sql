-- Harden invitation updates so invitees cannot tamper with immutable fields.

DROP POLICY IF EXISTS "lab_note_invitations_update_policy" ON public.lab_note_invitations;
DROP POLICY IF EXISTS "lab_note_invitations_update_owner_policy" ON public.lab_note_invitations;
DROP POLICY IF EXISTS "lab_note_invitations_update_invitee_policy" ON public.lab_note_invitations;

-- Owners can update invitations for notes they own.
CREATE POLICY "lab_note_invitations_update_owner_policy"
  ON public.lab_note_invitations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.lab_notes
      WHERE lab_notes.id = lab_note_invitations.lab_note_id
        AND lab_notes.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lab_notes
      WHERE lab_notes.id = lab_note_invitations.lab_note_id
        AND lab_notes.created_by = auth.uid()
    )
  );

-- Invitees can only accept their own pending invitation and cannot change immutable fields.
CREATE POLICY "lab_note_invitations_update_invitee_policy"
  ON public.lab_note_invitations
  FOR UPDATE
  USING (
    lab_note_invitations.email = public.get_current_user_email()
    AND lab_note_invitations.status = 'pending'
  )
  WITH CHECK (
    lab_note_invitations.email = public.get_current_user_email()
    AND lab_note_invitations.status = 'accepted'
    AND lab_note_invitations.accepted_by = auth.uid()
    AND lab_note_invitations.accepted_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.lab_note_invitations AS original
      WHERE original.id = lab_note_invitations.id
        AND original.email = public.get_current_user_email()
        AND original.status = 'pending'
        AND original.lab_note_id = lab_note_invitations.lab_note_id
        AND original.permission_level = lab_note_invitations.permission_level
        AND original.token = lab_note_invitations.token
        AND original.expires_at = lab_note_invitations.expires_at
        AND original.created_at = lab_note_invitations.created_at
        AND original.invited_by IS NOT DISTINCT FROM lab_note_invitations.invited_by
    )
  );
