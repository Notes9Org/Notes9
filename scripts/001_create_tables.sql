-- LIMS Database Schema
-- Based on the ERD diagram provided

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'researcher', 'technician', 'analyst', 'viewer')),
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')) DEFAULT 'planning',
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  start_date DATE,
  end_date DATE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Project members/team
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('lead', 'member', 'observer')),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- Experiments table
CREATE TABLE IF NOT EXISTS experiments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  hypothesis TEXT,
  status TEXT NOT NULL CHECK (status IN ('planned', 'in_progress', 'data_ready', 'analyzed', 'completed', 'cancelled')) DEFAULT 'planned',
  start_date DATE,
  completion_date DATE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Global SOPs/Protocols library
CREATE TABLE IF NOT EXISTS protocols (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT NOT NULL DEFAULT '1.0',
  content TEXT NOT NULL, -- Rich text / Markdown content
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link protocols to experiments
CREATE TABLE IF NOT EXISTS experiment_protocols (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  protocol_id UUID NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(experiment_id, protocol_id)
);

-- Global Assays definitions
CREATE TABLE IF NOT EXISTS assays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  default_parameters JSONB, -- Store default parameters as JSON
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Experiment-specific assay instances (with mutable parameters)
CREATE TABLE IF NOT EXISTS experiment_assays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  assay_id UUID NOT NULL REFERENCES assays(id) ON DELETE CASCADE,
  parameters JSONB, -- Experiment-specific parameters
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Samples table
CREATE TABLE IF NOT EXISTS samples (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_id UUID REFERENCES experiments(id) ON DELETE CASCADE,
  sample_code TEXT NOT NULL UNIQUE,
  sample_type TEXT NOT NULL,
  description TEXT,
  source TEXT,
  collection_date DATE,
  storage_location TEXT,
  storage_condition TEXT,
  quantity DECIMAL,
  quantity_unit TEXT,
  status TEXT NOT NULL CHECK (status IN ('available', 'in_use', 'depleted', 'disposed')) DEFAULT 'available',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Equipment/Instruments table
CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  equipment_code TEXT NOT NULL UNIQUE,
  category TEXT,
  model TEXT,
  manufacturer TEXT,
  serial_number TEXT,
  location TEXT,
  status TEXT NOT NULL CHECK (status IN ('available', 'in_use', 'maintenance', 'offline')) DEFAULT 'available',
  next_maintenance_date DATE,
  purchase_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Equipment usage tracking
CREATE TABLE IF NOT EXISTS equipment_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  experiment_id UUID REFERENCES experiments(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  purpose TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Equipment maintenance records
CREATE TABLE IF NOT EXISTS equipment_maintenance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  maintenance_type TEXT NOT NULL CHECK (maintenance_type IN ('routine', 'repair', 'calibration', 'upgrade')),
  description TEXT NOT NULL,
  performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  maintenance_date DATE NOT NULL,
  next_maintenance_date DATE,
  cost DECIMAL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Experiment data/results
CREATE TABLE IF NOT EXISTS experiment_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  data_type TEXT NOT NULL CHECK (data_type IN ('raw', 'processed', 'analysis', 'visualization')),
  file_name TEXT,
  file_url TEXT,
  file_size BIGINT,
  file_type TEXT,
  metadata JSONB, -- Additional metadata as JSON
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lab notes/documentation (Affine-like blocks)
CREATE TABLE IF NOT EXISTS lab_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_id UUID REFERENCES experiments(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT, -- Rich text content
  note_type TEXT CHECK (note_type IN ('observation', 'analysis', 'conclusion', 'general')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  experiment_id UUID REFERENCES experiments(id) ON DELETE CASCADE, -- NULL for project-level reports
  title TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('experiment', 'project', 'interim', 'final')),
  content TEXT, -- Rich text content
  status TEXT NOT NULL CHECK (status IN ('draft', 'review', 'final')) DEFAULT 'draft',
  generated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quality Control records
CREATE TABLE IF NOT EXISTS quality_control (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  qc_type TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('pass', 'fail', 'warning')),
  measured_value TEXT,
  expected_value TEXT,
  notes TEXT,
  performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log for tracking changes
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  old_values JSONB,
  new_values JSONB,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_profiles_organization ON profiles(organization_id);
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_projects_organization ON projects(organization_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_experiments_project ON experiments(project_id);
CREATE INDEX idx_experiments_status ON experiments(status);
CREATE INDEX idx_samples_experiment ON samples(experiment_id);
CREATE INDEX idx_samples_code ON samples(sample_code);
CREATE INDEX idx_equipment_organization ON equipment(organization_id);
CREATE INDEX idx_equipment_status ON equipment(status);
CREATE INDEX idx_experiment_data_experiment ON experiment_data(experiment_id);
CREATE INDEX idx_lab_notes_experiment ON lab_notes(experiment_id);
CREATE INDEX idx_lab_notes_project ON lab_notes(project_id);
CREATE INDEX idx_reports_project ON reports(project_id);
CREATE INDEX idx_reports_experiment ON reports(experiment_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to tables
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_experiments_updated_at BEFORE UPDATE ON experiments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_protocols_updated_at BEFORE UPDATE ON protocols FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_assays_updated_at BEFORE UPDATE ON assays FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_experiment_assays_updated_at BEFORE UPDATE ON experiment_assays FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_samples_updated_at BEFORE UPDATE ON samples FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_equipment_updated_at BEFORE UPDATE ON equipment FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lab_notes_updated_at BEFORE UPDATE ON lab_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
