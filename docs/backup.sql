-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.assays (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid,
  name text NOT NULL,
  description text,
  category text,
  default_parameters jsonb,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT assays_pkey PRIMARY KEY (id),
  CONSTRAINT assays_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT assays_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.audit_log (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text])),
  old_values jsonb,
  new_values jsonb,
  user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.equipment (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid,
  name text NOT NULL,
  equipment_code text NOT NULL UNIQUE,
  category text,
  model text,
  manufacturer text,
  serial_number text,
  location text,
  status text NOT NULL DEFAULT 'available'::text CHECK (status = ANY (ARRAY['available'::text, 'in_use'::text, 'maintenance'::text, 'offline'::text])),
  next_maintenance_date date,
  purchase_date date,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT equipment_pkey PRIMARY KEY (id),
  CONSTRAINT equipment_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.equipment_maintenance (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  equipment_id uuid NOT NULL,
  maintenance_type text NOT NULL CHECK (maintenance_type = ANY (ARRAY['routine'::text, 'repair'::text, 'calibration'::text, 'upgrade'::text])),
  description text NOT NULL,
  performed_by uuid,
  maintenance_date date NOT NULL,
  next_maintenance_date date,
  cost numeric,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT equipment_maintenance_pkey PRIMARY KEY (id),
  CONSTRAINT equipment_maintenance_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id),
  CONSTRAINT equipment_maintenance_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.equipment_usage (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  equipment_id uuid NOT NULL,
  experiment_id uuid,
  user_id uuid NOT NULL,
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone,
  purpose text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT equipment_usage_pkey PRIMARY KEY (id),
  CONSTRAINT equipment_usage_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id),
  CONSTRAINT equipment_usage_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id),
  CONSTRAINT equipment_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.experiment_assays (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  experiment_id uuid NOT NULL,
  assay_id uuid NOT NULL,
  parameters jsonb,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT experiment_assays_pkey PRIMARY KEY (id),
  CONSTRAINT experiment_assays_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id),
  CONSTRAINT experiment_assays_assay_id_fkey FOREIGN KEY (assay_id) REFERENCES public.assays(id)
);
CREATE TABLE public.experiment_data (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  experiment_id uuid NOT NULL,
  data_type text NOT NULL CHECK (data_type = ANY (ARRAY['raw'::text, 'processed'::text, 'analysis'::text, 'visualization'::text])),
  file_name text,
  file_url text,
  file_size bigint,
  file_type text,
  metadata jsonb,
  uploaded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT experiment_data_pkey PRIMARY KEY (id),
  CONSTRAINT experiment_data_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id),
  CONSTRAINT experiment_data_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.experiment_protocols (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  experiment_id uuid NOT NULL,
  protocol_id uuid NOT NULL,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT experiment_protocols_pkey PRIMARY KEY (id),
  CONSTRAINT experiment_protocols_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id),
  CONSTRAINT experiment_protocols_protocol_id_fkey FOREIGN KEY (protocol_id) REFERENCES public.protocols(id)
);
CREATE TABLE public.experiments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  hypothesis text,
  status text NOT NULL DEFAULT 'planned'::text CHECK (status = ANY (ARRAY['planned'::text, 'in_progress'::text, 'data_ready'::text, 'analyzed'::text, 'completed'::text, 'cancelled'::text])),
  start_date date,
  completion_date date,
  created_by uuid,
  assigned_to uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT experiments_pkey PRIMARY KEY (id),
  CONSTRAINT experiments_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT experiments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
  CONSTRAINT experiments_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id)
);
CREATE TABLE public.lab_notes (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  experiment_id uuid,
  project_id uuid,
  title text NOT NULL,
  content text,
  note_type text CHECK (note_type = ANY (ARRAY['observation'::text, 'analysis'::text, 'conclusion'::text, 'general'::text])),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT lab_notes_pkey PRIMARY KEY (id),
  CONSTRAINT lab_notes_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id),
  CONSTRAINT lab_notes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT lab_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.literature_reviews (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid,
  title text NOT NULL,
  authors text,
  journal text,
  publication_year integer,
  volume text,
  issue text,
  pages text,
  doi text,
  pmid text,
  url text,
  abstract text,
  keywords ARRAY,
  personal_notes text,
  relevance_rating integer CHECK (relevance_rating >= 1 AND relevance_rating <= 5),
  project_id uuid,
  experiment_id uuid,
  status text DEFAULT 'saved'::text CHECK (status = ANY (ARRAY['saved'::text, 'reading'::text, 'completed'::text, 'archived'::text])),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT literature_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT literature_reviews_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT literature_reviews_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT literature_reviews_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id),
  CONSTRAINT literature_reviews_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  address text,
  phone text,
  email text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT organizations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  organization_id uuid,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role = ANY (ARRAY['admin'::text, 'researcher'::text, 'technician'::text, 'analyst'::text, 'viewer'::text])),
  phone text,
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.project_members (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['lead'::text, 'member'::text, 'observer'::text])),
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT project_members_pkey PRIMARY KEY (id),
  CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'planning'::text CHECK (status = ANY (ARRAY['planning'::text, 'active'::text, 'on_hold'::text, 'completed'::text, 'cancelled'::text])),
  priority text DEFAULT 'medium'::text CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])),
  start_date date,
  end_date date,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.protocols (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid,
  name text NOT NULL,
  description text,
  version text NOT NULL DEFAULT '1.0'::text,
  content text NOT NULL,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT protocols_pkey PRIMARY KEY (id),
  CONSTRAINT protocols_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT protocols_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.quality_control (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  experiment_id uuid NOT NULL,
  qc_type text NOT NULL,
  result text NOT NULL CHECK (result = ANY (ARRAY['pass'::text, 'fail'::text, 'warning'::text])),
  measured_value text,
  expected_value text,
  notes text,
  performed_by uuid,
  performed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT quality_control_pkey PRIMARY KEY (id),
  CONSTRAINT quality_control_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id),
  CONSTRAINT quality_control_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.reports (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  project_id uuid,
  experiment_id uuid,
  title text NOT NULL,
  report_type text NOT NULL CHECK (report_type = ANY (ARRAY['experiment'::text, 'project'::text, 'interim'::text, 'final'::text])),
  content text,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'review'::text, 'final'::text])),
  generated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reports_pkey PRIMARY KEY (id),
  CONSTRAINT reports_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT reports_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id),
  CONSTRAINT reports_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.samples (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  experiment_id uuid,
  sample_code text NOT NULL UNIQUE,
  sample_type text NOT NULL,
  description text,
  source text,
  collection_date date,
  storage_location text,
  storage_condition text,
  quantity numeric,
  quantity_unit text,
  status text NOT NULL DEFAULT 'available'::text CHECK (status = ANY (ARRAY['available'::text, 'in_use'::text, 'depleted'::text, 'disposed'::text])),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT samples_pkey PRIMARY KEY (id),
  CONSTRAINT samples_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiments(id),
  CONSTRAINT samples_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);