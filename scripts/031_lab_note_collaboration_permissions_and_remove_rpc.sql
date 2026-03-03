-- Ensure collaboration tables remain accessible to authenticated users.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lab_note_access TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lab_note_invitations TO authenticated;

ALTER TABLE IF EXISTS public.lab_note_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.lab_note_invitations ENABLE ROW LEVEL SECURITY;

-- Security-definer helper so owners can remove collaborators even if table grants drift.
CREATE OR REPLACE FUNCTION public.remove_lab_note_collaborator(
  p_lab_note_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_target_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT created_by
  INTO v_owner_id
  FROM public.lab_notes
  WHERE id = p_lab_note_id;

  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lab note not found');
  END IF;

  IF v_owner_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the owner can remove collaborators');
  END IF;

  IF p_user_id = v_owner_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot remove the owner from the lab note');
  END IF;

  DELETE FROM public.lab_note_access
  WHERE lab_note_id = p_lab_note_id
    AND user_id = p_user_id;

  SELECT email
  INTO v_target_email
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_target_email IS NULL THEN
    SELECT email
    INTO v_target_email
    FROM auth.users
    WHERE id = p_user_id;
  END IF;

  UPDATE public.lab_note_invitations
  SET status = 'revoked',
      updated_at = NOW()
  WHERE lab_note_id = p_lab_note_id
    AND accepted_by = p_user_id
    AND status = 'accepted';

  IF v_target_email IS NOT NULL AND btrim(v_target_email) <> '' THEN
    UPDATE public.lab_note_invitations
    SET status = 'revoked',
        updated_at = NOW()
    WHERE lab_note_id = p_lab_note_id
      AND lower(email) = lower(v_target_email)
      AND status IN ('pending', 'accepted');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_lab_note_collaborator(UUID, UUID) TO authenticated;

-- Security-definer helper for collaborator permission updates.
CREATE OR REPLACE FUNCTION public.update_lab_note_collaborator_permission(
  p_lab_note_id UUID,
  p_user_id UUID,
  p_permission_level permission_level
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_has_accepted_invitation BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT created_by
  INTO v_owner_id
  FROM public.lab_notes
  WHERE id = p_lab_note_id;

  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lab note not found');
  END IF;

  IF v_owner_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the owner can update collaborator permissions');
  END IF;

  IF p_user_id = v_owner_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot modify the owner''s permissions');
  END IF;

  IF p_permission_level NOT IN ('editor', 'viewer') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid permission level');
  END IF;

  UPDATE public.lab_note_access
  SET permission_level = p_permission_level,
      updated_at = NOW()
  WHERE lab_note_id = p_lab_note_id
    AND user_id = p_user_id;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.lab_note_invitations
    WHERE lab_note_id = p_lab_note_id
      AND accepted_by = p_user_id
      AND status = 'accepted'
  )
  INTO v_has_accepted_invitation;

  IF NOT v_has_accepted_invitation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Collaborator not found');
  END IF;

  INSERT INTO public.lab_note_access (lab_note_id, user_id, permission_level, granted_by, updated_at)
  VALUES (p_lab_note_id, p_user_id, p_permission_level, v_owner_id, NOW())
  ON CONFLICT (lab_note_id, user_id)
  DO UPDATE SET
    permission_level = EXCLUDED.permission_level,
    updated_at = NOW();

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_lab_note_collaborator_permission(UUID, UUID, permission_level) TO authenticated;
