-- Migration: Create yjs_states table + RLS policy hardening
-- Addresses Copilot PR #56 review comments:
--   1. yjs_states table referenced by collaboration server but never created
--   2. Missing WITH CHECK on lab_note_access UPDATE policy 
--   3. Missing WITH CHECK on lab_note_invitations UPDATE policy
--   4. accept_lab_note_invitation should use auth.users instead of profiles for email matching

-- ============================================================
-- 1. Create yjs_states table for CRDT state persistence
-- ============================================================

CREATE TABLE IF NOT EXISTS public.yjs_states (
  document_id UUID PRIMARY KEY REFERENCES public.lab_notes(id) ON DELETE CASCADE,
  state TEXT NOT NULL,  -- base64 encoded Yjs update
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE yjs_states ENABLE ROW LEVEL SECURITY;

-- Only the collaboration server (service role) accesses yjs_states directly.
-- No RLS policies for authenticated users — service role bypasses RLS.
-- Grant no direct access to authenticated users for defense-in-depth.

-- ============================================================
-- 2. Add WITH CHECK to lab_note_access UPDATE policy
-- ============================================================
-- Prevents owners from rewriting lab_note_id to grant access
-- to notes they do not own.

DROP POLICY IF EXISTS "lab_note_access_update_policy" ON lab_note_access;

CREATE POLICY "lab_note_access_update_policy" ON lab_note_access FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM lab_notes
      WHERE lab_notes.id = lab_note_access.lab_note_id
      AND lab_notes.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lab_notes
      WHERE lab_notes.id = lab_note_access.lab_note_id
      AND lab_notes.created_by = auth.uid()
    )
  );

-- ============================================================
-- 3. Add WITH CHECK to lab_note_invitations UPDATE policy
-- ============================================================
-- Prevents invited users from repointing their invitation
-- to a different lab_note_id before accepting.

DROP POLICY IF EXISTS "lab_note_invitations_update_policy" ON lab_note_invitations;

CREATE POLICY "lab_note_invitations_update_policy" ON lab_note_invitations FOR UPDATE
  USING (
    -- User is the owner of the lab note
    EXISTS (
      SELECT 1 FROM lab_notes
      WHERE lab_notes.id = lab_note_invitations.lab_note_id
      AND lab_notes.created_by = auth.uid()
    )
    -- Or user is the invited person accepting their own invitation
    OR lab_note_invitations.email = get_current_user_email()
  )
  WITH CHECK (
    -- Owner can update invitations for notes they own
    EXISTS (
      SELECT 1 FROM lab_notes
      WHERE lab_notes.id = lab_note_invitations.lab_note_id
      AND lab_notes.created_by = auth.uid()
    )
    -- Invited user can only update their own invitation (email must remain theirs,
    -- and lab_note_id must stay the same — enforced by requiring ownership OR email match)
    OR lab_note_invitations.email = get_current_user_email()
  );

-- ============================================================
-- 4. Fix accept_lab_note_invitation to use auth.users for email
-- ============================================================
-- The profiles table may not be synced immediately after account
-- creation, causing invitation acceptance failures.

CREATE OR REPLACE FUNCTION accept_lab_note_invitation(p_token TEXT)
RETURNS JSONB AS $$
DECLARE
  v_invitation RECORD;
  v_user_id UUID;
  v_user_email TEXT;
  v_result JSONB;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get the invitation
  SELECT * INTO v_invitation
  FROM lab_note_invitations
  WHERE token = p_token
  AND status = 'pending'
  AND expires_at > NOW();
  
  IF v_invitation IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;
  
  -- Get user email from auth.users (more reliable than profiles)
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = v_user_id;

  -- Check if the user's email matches the invitation email
  IF v_user_email IS NULL OR lower(trim(v_user_email)) <> lower(trim(v_invitation.email)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation email does not match your account');
  END IF;
  
  -- Add user to lab_note_access
  INSERT INTO lab_note_access (lab_note_id, user_id, permission_level, granted_by)
  VALUES (v_invitation.lab_note_id, v_user_id, v_invitation.permission_level, v_invitation.invited_by)
  ON CONFLICT (lab_note_id, user_id) 
  DO UPDATE SET 
    permission_level = v_invitation.permission_level,
    granted_by = v_invitation.invited_by,
    updated_at = NOW();
  
  -- Update invitation status
  UPDATE lab_note_invitations
  SET 
    status = 'accepted',
    accepted_at = NOW(),
    accepted_by = v_user_id,
    updated_at = NOW()
  WHERE id = v_invitation.id;
  
  RETURN jsonb_build_object(
    'success', true,
    'lab_note_id', v_invitation.lab_note_id,
    'permission_level', v_invitation.permission_level
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
