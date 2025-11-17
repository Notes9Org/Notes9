-- Complete RLS policies for Equipment Management module
-- This script creates comprehensive policies for equipment, equipment_usage, and equipment_maintenance tables

-- ============================================
-- EQUIPMENT TABLE POLICIES
-- ============================================

-- Drop existing policies if any (for idempotency)
DROP POLICY IF EXISTS "Users can create equipment in their organization" ON equipment;
DROP POLICY IF EXISTS "Organization members can update equipment" ON equipment;
DROP POLICY IF EXISTS "Organization members can delete equipment" ON equipment;

-- INSERT: Users can create equipment in their organization
CREATE POLICY "Users can create equipment in their organization"
  ON equipment
  FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- UPDATE: Organization members can update equipment
CREATE POLICY "Organization members can update equipment"
  ON equipment
  FOR UPDATE
  USING (organization_id = get_user_organization_id(auth.uid()));

-- DELETE: Organization members can delete equipment
CREATE POLICY "Organization members can delete equipment"
  ON equipment
  FOR DELETE
  USING (organization_id = get_user_organization_id(auth.uid()));

-- ============================================
-- EQUIPMENT_USAGE TABLE POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE equipment_usage ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view equipment usage in their organization" ON equipment_usage;
DROP POLICY IF EXISTS "Users can create equipment usage logs" ON equipment_usage;
DROP POLICY IF EXISTS "Users can update their own equipment usage logs" ON equipment_usage;
DROP POLICY IF EXISTS "Users can delete their own equipment usage logs" ON equipment_usage;

-- SELECT: Users can view usage logs for equipment in their organization
CREATE POLICY "Users can view equipment usage in their organization"
  ON equipment_usage
  FOR SELECT
  USING (
    equipment_id IN (
      SELECT id FROM equipment 
      WHERE organization_id = get_user_organization_id(auth.uid())
    )
  );

-- INSERT: Users can create usage logs
CREATE POLICY "Users can create equipment usage logs"
  ON equipment_usage
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    equipment_id IN (
      SELECT id FROM equipment 
      WHERE organization_id = get_user_organization_id(auth.uid())
    )
  );

-- UPDATE: Users can update their own usage logs
CREATE POLICY "Users can update their own equipment usage logs"
  ON equipment_usage
  FOR UPDATE
  USING (user_id = auth.uid());

-- DELETE: Users can delete their own usage logs
CREATE POLICY "Users can delete their own equipment usage logs"
  ON equipment_usage
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================
-- EQUIPMENT_MAINTENANCE TABLE POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE equipment_maintenance ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view equipment maintenance in their organization" ON equipment_maintenance;
DROP POLICY IF EXISTS "Users can create equipment maintenance records" ON equipment_maintenance;
DROP POLICY IF EXISTS "Users can update maintenance records they created" ON equipment_maintenance;
DROP POLICY IF EXISTS "Users can delete maintenance records they created" ON equipment_maintenance;

-- SELECT: Users can view maintenance records for equipment in their organization
CREATE POLICY "Users can view equipment maintenance in their organization"
  ON equipment_maintenance
  FOR SELECT
  USING (
    equipment_id IN (
      SELECT id FROM equipment 
      WHERE organization_id = get_user_organization_id(auth.uid())
    )
  );

-- INSERT: Users can create maintenance records
CREATE POLICY "Users can create equipment maintenance records"
  ON equipment_maintenance
  FOR INSERT
  WITH CHECK (
    equipment_id IN (
      SELECT id FROM equipment 
      WHERE organization_id = get_user_organization_id(auth.uid())
    )
  );

-- UPDATE: Users can update maintenance records they created
CREATE POLICY "Users can update maintenance records they created"
  ON equipment_maintenance
  FOR UPDATE
  USING (performed_by = auth.uid());

-- DELETE: Users can delete maintenance records they created
CREATE POLICY "Users can delete maintenance records they created"
  ON equipment_maintenance
  FOR DELETE
  USING (performed_by = auth.uid());

