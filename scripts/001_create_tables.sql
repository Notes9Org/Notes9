-- Notes9 baseline database schema.
-- Rewritten from the current Supabase schema snapshot supplied on 2026-04-27.
-- Feature migrations after 001 may add columns/tables beyond this baseline.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Optional when pgvector is installed in the Supabase project.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  address text,
  phone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('admin', 'researcher', 'technician', 'analyst', 'viewer')),
  phone text,
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  notes9_tour_completed_at timestamptz,
  notes9_tour_skipped_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  start_date date,
  end_date date,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('lead', 'member', 'observer')),
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.experiments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  hypothesis text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'data_ready', 'analyzed', 'completed', 'cancelled')),
  start_date date,
  completion_date date,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.protocol_document_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  source_filename text NOT NULL,
  mime_type text NOT NULL,
  storage_path text NOT NULL,
  extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.protocols (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  version text NOT NULL DEFAULT '1.0',
  content text NOT NULL,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  experiment_id uuid REFERENCES public.experiments(id) ON DELETE SET NULL,
  document_template_id uuid REFERENCES public.protocol_document_templates(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.experiment_protocols (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_id uuid NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  protocol_id uuid NOT NULL REFERENCES public.protocols(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(experiment_id, protocol_id)
);

CREATE TABLE IF NOT EXISTS public.assays (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text,
  default_parameters jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.experiment_assays (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_id uuid NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  assay_id uuid NOT NULL REFERENCES public.assays(id) ON DELETE CASCADE,
  parameters jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.samples (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_id uuid REFERENCES public.experiments(id) ON DELETE CASCADE,
  sample_code text NOT NULL UNIQUE,
  sample_type text NOT NULL,
  description text,
  source text,
  collection_date date,
  storage_location text,
  storage_condition text,
  quantity numeric,
  quantity_unit text,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'depleted', 'disposed')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.equipment (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  equipment_code text NOT NULL UNIQUE,
  category text,
  model text,
  manufacturer text,
  serial_number text,
  location text,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'maintenance', 'offline')),
  next_maintenance_date date,
  purchase_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.equipment_usage (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  experiment_id uuid REFERENCES public.experiments(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  purpose text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.equipment_maintenance (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  maintenance_type text NOT NULL CHECK (maintenance_type IN ('routine', 'repair', 'calibration', 'upgrade')),
  description text NOT NULL,
  performed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  maintenance_date date NOT NULL,
  next_maintenance_date date,
  cost numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lab_notes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_id uuid REFERENCES public.experiments(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text,
  note_type text CHECK (note_type IN ('observation', 'analysis', 'conclusion', 'general')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  editor_data jsonb,
  editor_version text DEFAULT '1.0.0',
  last_edited_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.lab_note_protocols (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lab_note_id uuid NOT NULL REFERENCES public.lab_notes(id) ON DELETE CASCADE,
  protocol_id uuid NOT NULL REFERENCES public.protocols(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lab_note_id, protocol_id)
);

CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  protocol_id uuid REFERENCES public.protocols(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.agent_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  agent_type text NOT NULL CHECK (agent_type IN ('paper_analyzer', 'biomni')),
  title text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id uuid NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_runs (
  run_id uuid PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  organization_id text NOT NULL,
  project_id text,
  created_by text,
  session_id text,
  query text NOT NULL,
  status text DEFAULT 'running',
  completed_at timestamptz,
  total_latency_ms integer,
  final_confidence double precision,
  tool_used text
);

CREATE TABLE IF NOT EXISTS public.agent_trace_events (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.agent_runs(run_id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  node_name text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  latency_ms integer
);

CREATE TABLE IF NOT EXISTS public.experiment_data (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_id uuid NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  data_type text NOT NULL CHECK (data_type IN ('raw', 'processed', 'analysis', 'visualization')),
  file_name text,
  file_url text,
  file_size bigint,
  file_type text,
  metadata jsonb,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  workbook_snapshot jsonb,
  snapshot_updated_at timestamptz,
  tabular_format text,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  source_chat_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  source_agent_message_id uuid REFERENCES public.agent_messages(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.experiment_data_entity_links (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_data_id uuid NOT NULL REFERENCES public.experiment_data(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  link_role text NOT NULL DEFAULT 'embed_reference',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  experiment_id uuid REFERENCES public.experiments(id) ON DELETE CASCADE,
  title text NOT NULL,
  report_type text NOT NULL CHECK (report_type IN ('experiment', 'project', 'interim', 'final', 'data_analysis')),
  content text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'final')),
  generated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quality_control (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_id uuid NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  qc_type text NOT NULL,
  result text NOT NULL CHECK (result IN ('pass', 'fail', 'warning')),
  measured_value text,
  expected_value text,
  notes text,
  performed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  performed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  old_values jsonb,
  new_values jsonb,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dashboard_tasks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_at timestamptz,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_diffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type text NOT NULL CHECK (record_type IN ('protocol', 'lab_note')),
  record_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  change_summary text,
  words_added integer NOT NULL DEFAULT 0,
  words_removed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  diff_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  structure_hints jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.literature_reviews (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) <= 1024),
  authors text CHECK (authors IS NULL OR char_length(authors) <= 4000),
  journal text CHECK (journal IS NULL OR char_length(journal) <= 512),
  publication_year integer,
  volume text,
  issue text,
  pages text,
  doi text CHECK (doi IS NULL OR char_length(doi) <= 256),
  pmid text CHECK (pmid IS NULL OR char_length(pmid) <= 64),
  url text CHECK (url IS NULL OR char_length(url) <= 2048),
  abstract text CHECK (abstract IS NULL OR char_length(abstract) <= 20000),
  keywords text[],
  personal_notes text CHECK (personal_notes IS NULL OR char_length(personal_notes) <= 50000),
  relevance_rating integer CHECK (relevance_rating >= 1 AND relevance_rating <= 5),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  experiment_id uuid REFERENCES public.experiments(id) ON DELETE SET NULL,
  status text DEFAULT 'saved' CHECK (status IN ('saved', 'reading', 'completed', 'archived')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  pdf_file_url text,
  pdf_file_name varchar,
  pdf_file_size bigint,
  pdf_file_type varchar,
  pdf_storage_path varchar,
  pdf_uploaded_at timestamptz,
  pdf_checksum varchar,
  pdf_match_source varchar,
  pdf_metadata jsonb,
  ai_methods_summary text,
  ai_results_summary text,
  ai_summary_updated_at timestamptz,
  pdf_extracted_text text,
  pdf_text_extracted_at timestamptz,
  catalog_placement text NOT NULL DEFAULT 'repository' CHECK (catalog_placement IN ('staging', 'repository')),
  pdf_import_status text CHECK (pdf_import_status IS NULL OR pdf_import_status IN ('none', 'pending', 'success', 'failed'))
);

CREATE TABLE IF NOT EXISTS public.literature_pdf_annotations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  literature_review_id uuid NOT NULL REFERENCES public.literature_reviews(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  type varchar NOT NULL CHECK (type IN ('highlight', 'note', 'comment')),
  page_number integer NOT NULL,
  quote_text text CHECK (quote_text IS NULL OR char_length(quote_text) <= 5000),
  comment_text text CHECK (comment_text IS NULL OR char_length(comment_text) <= 10000),
  color varchar,
  rects jsonb,
  anchor jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mcp_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  transport_type text NOT NULL CHECK (transport_type IN ('http', 'sse')),
  url text NOT NULL,
  headers jsonb DEFAULT '{}'::jsonb,
  is_enabled boolean DEFAULT true,
  last_connected_at timestamptz,
  connection_status text DEFAULT 'unknown' CHECK (connection_status IN ('connected', 'disconnected', 'error', 'unknown')),
  error_message text,
  tools_count integer DEFAULT 0,
  resources_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  requires_auth boolean DEFAULT false,
  oauth_client_id text,
  oauth_client_secret text,
  oauth_access_token text,
  oauth_refresh_token text,
  oauth_token_expires_at timestamptz,
  oauth_scopes text
);

CREATE TABLE IF NOT EXISTS public.message_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_upvoted boolean NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(chat_id, message_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chunk_jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  payload jsonb,
  error_message text,
  retry_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.semantic_chunks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type text NOT NULL CHECK (source_type IN ('lab_note', 'literature_review', 'protocol', 'report', 'experiment_summary')),
  source_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  experiment_id uuid REFERENCES public.experiments(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  embedding vector,
  fts tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, content)) STORED,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_profiles_organization ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_projects_organization ON public.projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON public.project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_experiments_project ON public.experiments(project_id);
CREATE INDEX IF NOT EXISTS idx_experiments_status ON public.experiments(status);
CREATE INDEX IF NOT EXISTS idx_protocols_project ON public.protocols(project_id);
CREATE INDEX IF NOT EXISTS idx_protocols_experiment ON public.protocols(experiment_id);
CREATE INDEX IF NOT EXISTS idx_samples_experiment ON public.samples(experiment_id);
CREATE INDEX IF NOT EXISTS idx_lab_notes_experiment ON public.lab_notes(experiment_id);
CREATE INDEX IF NOT EXISTS idx_lab_notes_project ON public.lab_notes(project_id);
CREATE INDEX IF NOT EXISTS idx_experiment_data_experiment ON public.experiment_data(experiment_id);
CREATE INDEX IF NOT EXISTS idx_experiment_data_project ON public.experiment_data(project_id);
CREATE INDEX IF NOT EXISTS idx_literature_reviews_project ON public.literature_reviews(project_id);
CREATE INDEX IF NOT EXISTS idx_literature_reviews_experiment ON public.literature_reviews(experiment_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON public.chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_session ON public.agent_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_trace_events_run ON public.agent_trace_events(run_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_tasks_user ON public.dashboard_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_source ON public.semantic_chunks(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_project ON public.semantic_chunks(project_id);
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_experiment ON public.semantic_chunks(experiment_id);
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_fts ON public.semantic_chunks USING gin(fts);
