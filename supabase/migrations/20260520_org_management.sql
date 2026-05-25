-- =============================================================================
-- Organization Management Migration
-- Adds org roles, permissions, members, and invitations system
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add type and description columns to existing organizations table
-- ---------------------------------------------------------------------------
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS description TEXT;

-- ---------------------------------------------------------------------------
-- 2. Create org_permissions table and seed 28 rows (7 resources × 4 actions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  UNIQUE (resource, action)
);

INSERT INTO org_permissions (resource, action, description) VALUES
  ('projects', 'view', 'View projects'),
  ('projects', 'create', 'Create projects'),
  ('projects', 'edit', 'Edit projects'),
  ('projects', 'delete', 'Delete projects'),
  ('experiments', 'view', 'View experiments'),
  ('experiments', 'create', 'Create experiments'),
  ('experiments', 'edit', 'Edit experiments'),
  ('experiments', 'delete', 'Delete experiments'),
  ('samples', 'view', 'View samples'),
  ('samples', 'create', 'Create samples'),
  ('samples', 'edit', 'Edit samples'),
  ('samples', 'delete', 'Delete samples'),
  ('equipment', 'view', 'View equipment'),
  ('equipment', 'create', 'Create equipment'),
  ('equipment', 'edit', 'Edit equipment'),
  ('equipment', 'delete', 'Delete equipment'),
  ('protocols', 'view', 'View protocols'),
  ('protocols', 'create', 'Create protocols'),
  ('protocols', 'edit', 'Edit protocols'),
  ('protocols', 'delete', 'Delete protocols'),
  ('lab_notes', 'view', 'View lab notes'),
  ('lab_notes', 'create', 'Create lab notes'),
  ('lab_notes', 'edit', 'Edit lab notes'),
  ('lab_notes', 'delete', 'Delete lab notes'),
  ('reports', 'view', 'View reports'),
  ('reports', 'create', 'Create reports'),
  ('reports', 'edit', 'Edit reports'),
  ('reports', 'delete', 'Delete reports')
ON CONFLICT (resource, action) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Create org_roles table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_system_role BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

-- Apply updated_at trigger to org_roles
CREATE TRIGGER update_org_roles_updated_at
  BEFORE UPDATE ON org_roles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. Create org_role_permissions join table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id UUID NOT NULL REFERENCES org_roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES org_permissions(id) ON DELETE CASCADE,
  UNIQUE (role_id, permission_id)
);

-- ---------------------------------------------------------------------------
-- 5. Create org_members table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id UUID REFERENCES org_roles(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 6. Create org_invitations table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role_id UUID REFERENCES org_roles(id) ON DELETE SET NULL,
  token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'accepted', 'revoked', 'expired', 'failed')),
  invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- 7. Create indexes on all FK columns
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_org_roles_organization_id ON org_roles(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_role_permissions_role_id ON org_role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_org_role_permissions_permission_id ON org_role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_org_members_organization_id ON org_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role_id ON org_members(role_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_organization_id ON org_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_role_id ON org_invitations(role_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_invited_by ON org_invitations(invited_by);

-- ---------------------------------------------------------------------------
-- 8. Enable RLS on all new tables
-- ---------------------------------------------------------------------------
ALTER TABLE org_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_invitations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 9. RLS helper: check if user is an active member of a given organization
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_active_org_member(check_org_id UUID, check_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE organization_id = check_org_id
      AND user_id = check_user_id
      AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---------------------------------------------------------------------------
-- 10. RLS helper: check if user holds the Admin role in a given organization
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_org_admin(check_org_id UUID, check_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members om
    JOIN org_roles r ON r.id = om.role_id
    WHERE om.organization_id = check_org_id
      AND om.user_id = check_user_id
      AND om.is_active = true
      AND r.is_system_role = true
      AND r.name = 'Admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---------------------------------------------------------------------------
-- 11. org_permissions RLS — readable by any authenticated user (global seed data)
-- ---------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view permissions"
  ON org_permissions FOR SELECT
  USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- 12. org_roles RLS (Req 9.1, 9.2)
-- ---------------------------------------------------------------------------

-- 9.1: SELECT for active members of same org
CREATE POLICY "Active members can view org roles"
  ON org_roles FOR SELECT
  USING (is_active_org_member(organization_id, auth.uid()));

-- 9.2: INSERT only for Admin role holders
CREATE POLICY "Admins can create org roles"
  ON org_roles FOR INSERT
  WITH CHECK (is_org_admin(organization_id, auth.uid()));

-- 9.2: UPDATE only for Admin role holders
CREATE POLICY "Admins can update org roles"
  ON org_roles FOR UPDATE
  USING (is_org_admin(organization_id, auth.uid()));

-- 9.2: DELETE only for Admin role holders
CREATE POLICY "Admins can delete org roles"
  ON org_roles FOR DELETE
  USING (is_org_admin(organization_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- 13. org_members RLS (Req 9.3, 9.4)
-- ---------------------------------------------------------------------------

-- 9.3: SELECT for active members of same org
CREATE POLICY "Active members can view org members"
  ON org_members FOR SELECT
  USING (is_active_org_member(organization_id, auth.uid()));

-- 9.4: INSERT only for Admin role holders
CREATE POLICY "Admins can add org members"
  ON org_members FOR INSERT
  WITH CHECK (is_org_admin(organization_id, auth.uid()));

-- 9.4: DELETE only for Admin role holders
CREATE POLICY "Admins can remove org members"
  ON org_members FOR DELETE
  USING (is_org_admin(organization_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- 14. org_invitations RLS (Req 9.5, 9.6, 9.7)
-- ---------------------------------------------------------------------------

-- 9.5: SELECT for Admin role holders
CREATE POLICY "Admins can view org invitations"
  ON org_invitations FOR SELECT
  USING (is_org_admin(organization_id, auth.uid()));

-- 9.6: INSERT only for Admin role holders
CREATE POLICY "Admins can create org invitations"
  ON org_invitations FOR INSERT
  WITH CHECK (is_org_admin(organization_id, auth.uid()));

-- 9.7: UPDATE for any authenticated user whose email matches the invitation email
CREATE POLICY "Users can accept invitations addressed to them"
  ON org_invitations FOR UPDATE
  USING (
    email = (SELECT p.email FROM profiles p WHERE p.id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 15. org_role_permissions RLS (Req 9.8, 9.9)
-- ---------------------------------------------------------------------------

-- 9.8: SELECT for active members of same org (via role's organization_id)
CREATE POLICY "Active members can view role permissions"
  ON org_role_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_roles r
      WHERE r.id = org_role_permissions.role_id
        AND is_active_org_member(r.organization_id, auth.uid())
    )
  );

-- 9.9: INSERT only for Admin role holders
CREATE POLICY "Admins can assign role permissions"
  ON org_role_permissions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_roles r
      WHERE r.id = org_role_permissions.role_id
        AND is_org_admin(r.organization_id, auth.uid())
    )
  );

-- 9.9: DELETE only for Admin role holders
CREATE POLICY "Admins can remove role permissions"
  ON org_role_permissions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM org_roles r
      WHERE r.id = org_role_permissions.role_id
        AND is_org_admin(r.organization_id, auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 16. (Removed) Data migration for existing users is no longer needed.
--     The org setup CTA flow handles linking users to orgs via org_members.
-- ---------------------------------------------------------------------------
