-- Enable Row Level Security (RLS) on all tables

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE assays ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_assays ENABLE ROW LEVEL SECURITY;
ALTER TABLE samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles table
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can view profiles in their organization"
  ON profiles FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS Policies for organizations
CREATE POLICY "Users can view their organization"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS Policies for projects
CREATE POLICY "Users can view projects in their organization"
  ON projects FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create projects in their organization"
  ON projects FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update projects they're members of"
  ON projects FOR UPDATE
  USING (
    id IN (
      SELECT project_id FROM project_members WHERE user_id = auth.uid()
    ) OR created_by = auth.uid()
  );

CREATE POLICY "Users can delete projects they created"
  ON projects FOR DELETE
  USING (created_by = auth.uid());

-- RLS Policies for experiments
CREATE POLICY "Users can view experiments in their projects"
  ON experiments FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create experiments in their projects"
  ON experiments FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT project_id FROM project_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update experiments they created or are assigned to"
  ON experiments FOR UPDATE
  USING (created_by = auth.uid() OR assigned_to = auth.uid());

-- RLS Policies for samples
CREATE POLICY "Users can view samples in their experiments"
  ON samples FOR SELECT
  USING (
    experiment_id IN (
      SELECT e.id FROM experiments e
      JOIN project_members pm ON e.project_id = pm.project_id
      WHERE pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create samples in their experiments"
  ON samples FOR INSERT
  WITH CHECK (
    experiment_id IN (
      SELECT e.id FROM experiments e
      JOIN project_members pm ON e.project_id = pm.project_id
      WHERE pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update samples they created"
  ON samples FOR UPDATE
  USING (created_by = auth.uid());

-- RLS Policies for equipment (organization-wide access)
CREATE POLICY "Users can view equipment in their organization"
  ON equipment FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS Policies for lab_notes
CREATE POLICY "Users can view lab notes in their projects/experiments"
  ON lab_notes FOR SELECT
  USING (
    (project_id IN (
      SELECT project_id FROM project_members WHERE user_id = auth.uid()
    )) OR
    (experiment_id IN (
      SELECT e.id FROM experiments e
      JOIN project_members pm ON e.project_id = pm.project_id
      WHERE pm.user_id = auth.uid()
    ))
  );

CREATE POLICY "Users can create lab notes"
  ON lab_notes FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own lab notes"
  ON lab_notes FOR UPDATE
  USING (created_by = auth.uid());

-- RLS Policies for reports
CREATE POLICY "Users can view reports in their projects"
  ON reports FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create reports"
  ON reports FOR INSERT
  WITH CHECK (auth.uid() = generated_by);

CREATE POLICY "Users can update their own reports"
  ON reports FOR UPDATE
  USING (generated_by = auth.uid());

-- Additional policies for other tables can be added similarly
-- For now, we'll add basic policies that allow organization members to access data

CREATE POLICY "Organization members can view protocols"
  ON protocols FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Organization members can view assays"
  ON assays FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );
