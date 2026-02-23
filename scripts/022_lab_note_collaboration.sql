-- Migration: Create lab note collaboration tables
-- This enables inviting collaborators to lab notes with different permission levels

-- Create permission level type if not exists
DO $$ BEGIN
  CREATE TYPE permission_level AS ENUM ('owner', 'editor', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Table for storing lab note access permissions (active collaborators)
CREATE TABLE IF NOT EXISTS public.lab_note_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lab_note_id UUID NOT NULL REFERENCES public.lab_notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_level permission_level NOT NULL DEFAULT 'viewer',
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(lab_note_id, user_id)
);

-- Table for storing pending invitations
CREATE TABLE IF NOT EXISTS public.lab_note_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lab_note_id UUID NOT NULL REFERENCES public.lab_notes(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  permission_level permission_level NOT NULL DEFAULT 'viewer',
  token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Align existing tables with nullable FK columns when ON DELETE SET NULL is used.
ALTER TABLE IF EXISTS public.lab_note_access
  ALTER COLUMN granted_by DROP NOT NULL;
ALTER TABLE IF EXISTS public.lab_note_invitations
  ALTER COLUMN invited_by DROP NOT NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_lab_note_access_note_id ON lab_note_access(lab_note_id);
CREATE INDEX IF NOT EXISTS idx_lab_note_access_user_id ON lab_note_access(user_id);
CREATE INDEX IF NOT EXISTS idx_lab_note_invitations_note_id ON lab_note_invitations(lab_note_id);
CREATE INDEX IF NOT EXISTS idx_lab_note_invitations_token ON lab_note_invitations(token);
CREATE INDEX IF NOT EXISTS idx_lab_note_invitations_email ON lab_note_invitations(email);
CREATE INDEX IF NOT EXISTS idx_lab_note_invitations_status ON lab_note_invitations(status);

-- Enable RLS
ALTER TABLE lab_note_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_note_invitations ENABLE ROW LEVEL SECURITY;

-- Grant table access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lab_note_access TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lab_note_invitations TO authenticated;

-- RLS Policies for lab_note_access

-- Users can view access for lab notes they own or have access to
CREATE POLICY "lab_note_access_select_policy" ON lab_note_access FOR SELECT USING (
  -- User is the owner of the lab note
  EXISTS (
    SELECT 1 FROM lab_notes 
    WHERE lab_notes.id = lab_note_access.lab_note_id 
    AND lab_notes.created_by = auth.uid()
  )
  -- Or user is the one who was granted access
  OR user_id = auth.uid()
  -- Or user has been granted access to this note
  OR EXISTS (
    SELECT 1 FROM lab_note_access AS my_access
    WHERE my_access.lab_note_id = lab_note_access.lab_note_id
    AND my_access.user_id = auth.uid()
  )
);

-- Only owners can insert access records
CREATE POLICY "lab_note_access_insert_policy" ON lab_note_access FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM lab_notes 
    WHERE lab_notes.id = lab_note_id 
    AND lab_notes.created_by = auth.uid()
  )
);

-- Only owners can update access records
CREATE POLICY "lab_note_access_update_policy" ON lab_note_access FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM lab_notes 
    WHERE lab_notes.id = lab_note_access.lab_note_id 
    AND lab_notes.created_by = auth.uid()
  )
);

-- Only owners can delete access records
CREATE POLICY "lab_note_access_delete_policy" ON lab_note_access FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM lab_notes 
    WHERE lab_notes.id = lab_note_access.lab_note_id 
    AND lab_notes.created_by = auth.uid()
  )
);

-- RLS Policies for lab_note_invitations

-- Create a function to get current user's email
CREATE OR REPLACE FUNCTION get_current_user_email()
RETURNS TEXT AS $$
DECLARE
  user_email TEXT;
BEGIN
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = auth.uid();
  RETURN user_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Users can view invitations for lab notes they own or were invited to
CREATE POLICY "lab_note_invitations_select_policy" ON lab_note_invitations FOR SELECT USING (
  -- User is the owner of the lab note
  EXISTS (
    SELECT 1 FROM lab_notes 
    WHERE lab_notes.id = lab_note_invitations.lab_note_id 
    AND lab_notes.created_by = auth.uid()
  )
  -- Or user is the invited person (check by email matching user's email from auth.users)
  OR lab_note_invitations.email = get_current_user_email()
);

-- Only owners can insert invitations
CREATE POLICY "lab_note_invitations_insert_policy" ON lab_note_invitations FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM lab_notes 
    WHERE lab_notes.id = lab_note_id 
    AND lab_notes.created_by = auth.uid()
  )
);

-- Owners can update invitations (e.g., revoke)
-- OR the invited user can update to accept
CREATE POLICY "lab_note_invitations_update_policy" ON lab_note_invitations FOR UPDATE USING (
  -- User is the owner of the lab note
  EXISTS (
    SELECT 1 FROM lab_notes 
    WHERE lab_notes.id = lab_note_invitations.lab_note_id 
    AND lab_notes.created_by = auth.uid()
  )
  -- Or user is the invited person accepting their own invitation
  OR lab_note_invitations.email = get_current_user_email()
);

-- Only owners can delete invitations
CREATE POLICY "lab_note_invitations_delete_policy" ON lab_note_invitations FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM lab_notes 
    WHERE lab_notes.id = lab_note_invitations.lab_note_id 
    AND lab_notes.created_by = auth.uid()
  )
);

-- Function to automatically add owner access when a lab note is created
CREATE OR REPLACE FUNCTION add_lab_note_owner_access()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO lab_note_access (lab_note_id, user_id, permission_level, granted_by)
  VALUES (NEW.id, NEW.created_by, 'owner', NEW.created_by)
  ON CONFLICT (lab_note_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to add owner access on lab note creation
DROP TRIGGER IF EXISTS trigger_add_lab_note_owner_access ON lab_notes;
CREATE TRIGGER trigger_add_lab_note_owner_access
  AFTER INSERT ON lab_notes
  FOR EACH ROW
  EXECUTE FUNCTION add_lab_note_owner_access();

-- Function to accept an invitation
CREATE OR REPLACE FUNCTION accept_lab_note_invitation(p_token TEXT)
RETURNS JSONB AS $$
DECLARE
  v_invitation RECORD;
  v_user_id UUID;
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
  
  -- Check if the user's email matches the invitation email
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = v_user_id 
    AND email = v_invitation.email
  ) THEN
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

-- Function to get user's permission level for a lab note
CREATE OR REPLACE FUNCTION get_lab_note_permission(p_lab_note_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS permission_level AS $$
DECLARE
  v_user_id UUID;
  v_permission permission_level;
BEGIN
  -- Use provided user_id or current user
  v_user_id := COALESCE(p_user_id, auth.uid());
  
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Check if user is the creator (owner)
  SELECT created_by INTO v_permission
  FROM lab_notes
  WHERE id = p_lab_note_id AND created_by = v_user_id;
  
  IF FOUND THEN
    RETURN 'owner';
  END IF;
  
  -- Check lab_note_access
  SELECT permission_level INTO v_permission
  FROM lab_note_access
  WHERE lab_note_id = p_lab_note_id AND user_id = v_user_id;
  
  RETURN v_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable realtime for permission changes
ALTER PUBLICATION supabase_realtime ADD TABLE lab_note_access;
ALTER PUBLICATION supabase_realtime ADD TABLE lab_note_invitations;
