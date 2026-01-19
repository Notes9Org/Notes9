"""Database schema documentation for SQL generation."""
# This schema is used by LLM to generate SQL queries
# Updated to match actual database schema

DB_SCHEMA = """
# Notes9 LIMS Database Schema

## Core Tables and Relationships

### organizations
- id (uuid, PK, default: uuid_generate_v4())
- name (text, NOT NULL)
- address (text)
- phone (text)
- email (text)
- created_at (timestamptz, NOT NULL, default: now())
- updated_at (timestamptz, NOT NULL, default: now())

### profiles (extends auth.users)
- id (uuid, PK, FK -> auth.users.id, NOT NULL)
- organization_id (uuid, FK -> organizations.id, optional)
- first_name (text, NOT NULL)
- last_name (text, NOT NULL)
- email (text, NOT NULL, UNIQUE)
- role (text, NOT NULL, CHECK: 'admin', 'researcher', 'technician', 'analyst', 'viewer')
- phone (text, optional)
- avatar_url (text, optional)
- is_active (boolean, NOT NULL, default: true)
- created_at (timestamptz, NOT NULL, default: now())
- updated_at (timestamptz, NOT NULL, default: now())

### projects
- id (uuid, PK, default: uuid_generate_v4())
- organization_id (uuid, FK -> organizations.id, optional)
- name (text, NOT NULL)
- description (text)
- status (text, NOT NULL, default: 'planning', CHECK: 'planning', 'active', 'on_hold', 'completed', 'cancelled')
- priority (text, default: 'medium', CHECK: 'low', 'medium', 'high', 'critical')
- start_date (date)
- end_date (date)
- created_by (uuid, FK -> profiles.id, optional)
- created_at (timestamptz, NOT NULL, default: now())
- updated_at (timestamptz, NOT NULL, default: now())

### project_members
- id (uuid, PK, default: uuid_generate_v4())
- project_id (uuid, FK -> projects.id, NOT NULL)
- user_id (uuid, FK -> profiles.id, NOT NULL)
- role (text, NOT NULL, CHECK: 'lead', 'member', 'observer')
- added_at (timestamptz, NOT NULL, default: now())

### experiments
- id (uuid, PK, default: uuid_generate_v4())
- project_id (uuid, FK -> projects.id, NOT NULL)
- name (text, NOT NULL)
- description (text)
- hypothesis (text)
- status (text, NOT NULL, default: 'planned', CHECK: 'planned', 'in_progress', 'data_ready', 'analyzed', 'completed', 'cancelled')
- start_date (date)
- completion_date (date)
- created_by (uuid, FK -> profiles.id, optional)
- assigned_to (uuid, FK -> profiles.id, optional)
- created_at (timestamptz, NOT NULL, default: now())
- updated_at (timestamptz, NOT NULL, default: now())

### samples
- id (uuid, PK, default: uuid_generate_v4())
- experiment_id (uuid, FK -> experiments.id, optional)
- sample_code (text, NOT NULL, UNIQUE)
- sample_type (text, NOT NULL)
- description (text)
- source (text)
- collection_date (date)
- storage_location (text)
- storage_condition (text)
- quantity (numeric)
- quantity_unit (text)
- status (text, NOT NULL, default: 'available', CHECK: 'available', 'in_use', 'depleted', 'disposed')
- created_by (uuid, FK -> profiles.id, optional)
- created_at (timestamptz, NOT NULL, default: now())
- updated_at (timestamptz, NOT NULL, default: now())

### protocols
- id (uuid, PK, default: uuid_generate_v4())
- organization_id (uuid, FK -> organizations.id, optional)
- name (text, NOT NULL)
- description (text)
- version (text, NOT NULL, default: '1.0')
- content (text, NOT NULL)
- category (text)
- is_active (boolean, NOT NULL, default: true)
- created_by (uuid, FK -> profiles.id, optional)
- created_at (timestamptz, NOT NULL, default: now())
- updated_at (timestamptz, NOT NULL, default: now())

### experiment_protocols
- id (uuid, PK, default: uuid_generate_v4())
- experiment_id (uuid, FK -> experiments.id, NOT NULL)
- protocol_id (uuid, FK -> protocols.id, NOT NULL)
- added_at (timestamptz, NOT NULL, default: now())

### assays
- id (uuid, PK, default: uuid_generate_v4())
- organization_id (uuid, FK -> organizations.id, optional)
- name (text, NOT NULL)
- description (text)
- category (text)
- default_parameters (jsonb)
- created_by (uuid, FK -> profiles.id, optional)
- created_at (timestamptz, NOT NULL, default: now())
- updated_at (timestamptz, NOT NULL, default: now())

### experiment_assays
- id (uuid, PK, default: uuid_generate_v4())
- experiment_id (uuid, FK -> experiments.id, NOT NULL)
- assay_id (uuid, FK -> assays.id, NOT NULL)
- parameters (jsonb)
- notes (text)
- created_at (timestamptz, NOT NULL, default: now())
- updated_at (timestamptz, NOT NULL, default: now())

### equipment
- id (uuid, PK, default: uuid_generate_v4())
- organization_id (uuid, FK -> organizations.id, optional)
- name (text, NOT NULL)
- equipment_code (text, NOT NULL, UNIQUE)
- category (text)
- model (text)
- manufacturer (text)
- serial_number (text)
- location (text)
- status (text, NOT NULL, default: 'available', CHECK: 'available', 'in_use', 'maintenance', 'offline')
- next_maintenance_date (date)
- purchase_date (date)
- notes (text)
- created_at (timestamptz, NOT NULL, default: now())
- updated_at (timestamptz, NOT NULL, default: now())

### equipment_usage
- id (uuid, PK, default: uuid_generate_v4())
- equipment_id (uuid, FK -> equipment.id, NOT NULL)
- experiment_id (uuid, FK -> experiments.id, optional)
- user_id (uuid, FK -> profiles.id, NOT NULL)
- start_time (timestamptz, NOT NULL)
- end_time (timestamptz)
- purpose (text)
- notes (text)
- created_at (timestamptz, NOT NULL, default: now())

### equipment_maintenance
- id (uuid, PK, default: uuid_generate_v4())
- equipment_id (uuid, FK -> equipment.id, NOT NULL)
- maintenance_type (text, NOT NULL, CHECK: 'routine', 'repair', 'calibration', 'upgrade')
- description (text, NOT NULL)
- performed_by (uuid, FK -> profiles.id, optional)
- maintenance_date (date, NOT NULL)
- next_maintenance_date (date)
- cost (numeric)
- notes (text)
- created_at (timestamptz, NOT NULL, default: now())

### lab_notes
- id (uuid, PK, default: uuid_generate_v4())
- experiment_id (uuid, FK -> experiments.id, optional)
- project_id (uuid, FK -> projects.id, optional)
- title (text, NOT NULL)
- content (text)
- note_type (text, CHECK: 'observation', 'analysis', 'conclusion', 'general')
- created_by (uuid, FK -> profiles.id, optional)
- created_at (timestamptz, NOT NULL, default: now())
- updated_at (timestamptz, NOT NULL, default: now())
- editor_data (jsonb)
- editor_version (text, default: '1.0.0')
- last_edited_at (timestamptz, default: now())
- metadata (jsonb, default: '{}')

### literature_reviews
- id (uuid, PK, default: uuid_generate_v4())
- organization_id (uuid, FK -> organizations.id, optional)
- project_id (uuid, FK -> projects.id, optional)
- experiment_id (uuid, FK -> experiments.id, optional)
- title (text, NOT NULL)
- authors (text)
- journal (text)
- publication_year (integer)
- volume (text)
- issue (text)
- pages (text)
- doi (text)
- pmid (text)
- url (text)
- abstract (text)
- keywords (ARRAY)
- personal_notes (text)
- relevance_rating (integer, CHECK: 1-5)
- status (text, default: 'saved', CHECK: 'saved', 'reading', 'completed', 'archived')
- created_by (uuid, FK -> profiles.id, optional)
- created_at (timestamptz, NOT NULL, default: now())
- updated_at (timestamptz, NOT NULL, default: now())

### reports
- id (uuid, PK, default: uuid_generate_v4())
- project_id (uuid, FK -> projects.id, optional)
- experiment_id (uuid, FK -> experiments.id, optional)
- title (text, NOT NULL)
- report_type (text, NOT NULL, CHECK: 'experiment', 'project', 'interim', 'final')
- content (text)
- status (text, NOT NULL, default: 'draft', CHECK: 'draft', 'review', 'final')
- generated_by (uuid, FK -> profiles.id, optional)
- created_at (timestamptz, NOT NULL, default: now())
- updated_at (timestamptz, NOT NULL, default: now())

### experiment_data
- id (uuid, PK, default: uuid_generate_v4())
- experiment_id (uuid, FK -> experiments.id, NOT NULL)
- data_type (text, NOT NULL, CHECK: 'raw', 'processed', 'analysis', 'visualization')
- file_name (text)
- file_url (text)
- file_size (bigint)
- file_type (text)
- metadata (jsonb)
- uploaded_by (uuid, FK -> profiles.id, optional)
- created_at (timestamptz, NOT NULL, default: now())

### quality_control
- id (uuid, PK, default: uuid_generate_v4())
- experiment_id (uuid, FK -> experiments.id, NOT NULL)
- qc_type (text, NOT NULL)
- result (text, NOT NULL, CHECK: 'pass', 'fail', 'warning')
- measured_value (text)
- expected_value (text)
- notes (text)
- performed_by (uuid, FK -> profiles.id, optional)
- performed_at (timestamptz, NOT NULL, default: now())

### semantic_chunks
- id (uuid, PK, default: uuid_generate_v4())
- source_type (text, NOT NULL, CHECK: 'lab_note', 'literature_review', 'protocol', 'report', 'experiment_summary')
- source_id (uuid, NOT NULL)
- organization_id (uuid, FK -> organizations.id, optional)
- project_id (uuid, FK -> projects.id, optional)
- experiment_id (uuid, FK -> experiments.id, optional)
- chunk_index (integer, NOT NULL)
- content (text, NOT NULL)
- embedding (vector)
- fts (tsvector, default: to_tsvector('english', content))
- metadata (jsonb)
- created_at (timestamptz, NOT NULL, default: now())
- created_by (uuid, FK -> profiles.id, optional)

### agent_runs
- run_id (uuid, PK, NOT NULL)
- created_at (timestamptz, default: now())
- organization_id (text, NOT NULL)
- project_id (text, optional)
- created_by (text, optional)
- session_id (text, optional)
- query (text, NOT NULL)
- status (text, default: 'running')
- completed_at (timestamptz, optional)
- total_latency_ms (integer, optional)
- final_confidence (double precision, optional)
- tool_used (text, optional)

### agent_trace_events
- id (bigint, PK, default: nextval('agent_trace_events_id_seq'))
- run_id (uuid, FK -> agent_runs.run_id, NOT NULL)
- created_at (timestamptz, default: now())
- node_name (text, NOT NULL)
- event_type (text, NOT NULL)
- payload (jsonb, NOT NULL)
- latency_ms (integer, optional)

### chat_sessions
- id (uuid, PK, default: uuid_generate_v4())
- user_id (uuid, FK -> profiles.id, NOT NULL)
- title (text, optional)
- created_at (timestamptz, NOT NULL, default: now())
- updated_at (timestamptz, NOT NULL, default: now())

### chat_messages
- id (uuid, PK, default: uuid_generate_v4())
- session_id (uuid, FK -> chat_sessions.id, NOT NULL)
- role (text, NOT NULL, CHECK: 'user', 'assistant', 'system')
- content (text, NOT NULL)
- created_at (timestamptz, NOT NULL, default: now())

### message_votes
- id (uuid, PK, default: gen_random_uuid())
- chat_id (uuid, FK -> chat_sessions.id, NOT NULL)
- message_id (uuid, FK -> chat_messages.id, NOT NULL)
- user_id (uuid, FK -> profiles.id, NOT NULL)
- is_upvoted (boolean, NOT NULL)
- created_at (timestamptz, default: now())
- updated_at (timestamptz, default: now())

### chunk_jobs
- id (uuid, PK, default: uuid_generate_v4())
- source_type (text, NOT NULL)
- source_id (uuid, NOT NULL)
- operation (text, NOT NULL, CHECK: 'create', 'update', 'delete')
- status (text, default: 'pending', CHECK: 'pending', 'processing', 'completed', 'failed')
- payload (jsonb)
- error_message (text)
- retry_count (integer, default: 0)
- created_at (timestamptz, NOT NULL, default: now())
- processed_at (timestamptz, optional)
- created_by (uuid, FK -> profiles.id, optional)

### audit_log
- id (uuid, PK, default: uuid_generate_v4())
- table_name (text, NOT NULL)
- record_id (uuid, NOT NULL)
- action (text, NOT NULL, CHECK: 'create', 'update', 'delete')
- old_values (jsonb)
- new_values (jsonb)
- user_id (uuid, FK -> profiles.id, optional)
- created_at (timestamptz, NOT NULL, default: now())

## Key Relationships

1. organizations -> projects (1:N)
2. organizations -> profiles (1:N, optional)
3. organizations -> protocols (1:N)
4. organizations -> equipment (1:N)
5. organizations -> assays (1:N)
6. organizations -> literature_reviews (1:N, optional)
7. projects -> experiments (1:N)
8. projects -> project_members (1:N)
9. projects -> lab_notes (1:N, optional)
10. projects -> reports (1:N, optional)
11. experiments -> samples (1:N, optional)
12. experiments -> lab_notes (1:N, optional)
13. experiments -> experiment_protocols (N:M with protocols)
14. experiments -> experiment_assays (N:M with assays)
15. experiments -> equipment_usage (N:M with equipment)
16. experiments -> experiment_data (1:N)
17. experiments -> quality_control (1:N)
18. experiments -> reports (1:N, optional)
19. profiles -> experiments (via created_by, assigned_to)
20. profiles -> projects (via created_by)
21. profiles -> samples (via created_by)
22. profiles -> lab_notes (via created_by)
23. profiles -> equipment_usage (via user_id)
24. profiles -> equipment_maintenance (via performed_by)
25. profiles -> chat_sessions (1:N)
26. profiles -> message_votes (1:N)
27. profiles -> chunk_jobs (via created_by)
28. profiles -> audit_log (via user_id)

## Access Control Notes

- All queries MUST filter by organization_id (from scope) for security
- Optionally filter by project_id (from scope)
- Optionally filter by experiment_id (from scope)
- Use JOINs to access organization_id through relationships:
  - experiments -> projects -> organizations
  - samples -> experiments -> projects -> organizations
  - lab_notes -> experiments -> projects -> organizations OR lab_notes -> projects -> organizations
  - equipment_usage -> experiments -> projects -> organizations
  - experiment_data -> experiments -> projects -> organizations
  - quality_control -> experiments -> projects -> organizations

## Common Query Patterns

### Get experiments for a person (created_by):
SELECT e.* FROM experiments e
JOIN projects p ON e.project_id = p.id
WHERE p.organization_id = '<org_id>'
  AND e.created_by = '<person_id>'

### Get experiments assigned to a person:
SELECT e.* FROM experiments e
JOIN projects p ON e.project_id = p.id
WHERE p.organization_id = '<org_id>'
  AND e.assigned_to = '<person_id>'

### Get all experiments for an organization:
SELECT e.* FROM experiments e
JOIN projects p ON e.project_id = p.id
WHERE p.organization_id = '<org_id>'

### Get samples for an organization:
SELECT s.* FROM samples s
JOIN experiments e ON s.experiment_id = e.id
JOIN projects p ON e.project_id = p.id
WHERE p.organization_id = '<org_id>'
"""
