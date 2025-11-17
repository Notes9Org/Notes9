-- Complete Protocol RLS Policies (INSERT, UPDATE, DELETE)
-- Run this script to add all missing CRUD policies for protocols table

-- Drop existing policies if any (for idempotency)
DROP POLICY IF EXISTS "Users can create protocols in their organization" ON protocols;
DROP POLICY IF EXISTS "Organization members can update protocols" ON protocols;
DROP POLICY IF EXISTS "Organization members can delete protocols" ON protocols;

-- Allow users to create protocols in their organization
CREATE POLICY "Users can create protocols in their organization"
  ON protocols
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid() AND
    organization_id = get_user_organization_id(auth.uid())
  );

-- Allow organization members to update protocols
CREATE POLICY "Organization members can update protocols"
  ON protocols
  FOR UPDATE
  USING (organization_id = get_user_organization_id(auth.uid()));

-- Allow organization members to delete protocols
CREATE POLICY "Organization members can delete protocols"
  ON protocols
  FOR DELETE
  USING (organization_id = get_user_organization_id(auth.uid()));

