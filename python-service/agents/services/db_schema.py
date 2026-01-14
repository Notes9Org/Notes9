"""Database schema documentation for SQL generation."""
# This schema is used by LLM to generate SQL queries

DB_SCHEMA = """
# Notes9 LIMS Database Schema

## Core Tables and Relationships

### organizations
- id (uuid, PK)
- name (text)
- address (text)
- phone (text)
- email (text)
- created_at (timestamptz)
- updated_at (timestamptz)

### profiles (extends auth.users)
- id (uuid, PK, FK -> auth.users)
- organization_id (uuid, FK -> organizations)
- first_name (text)
- last_name (text)
- email (text, unique)
- role (text: 'admin', 'researcher', 'technician', 'analyst', 'viewer')
- phone (text)
- avatar_url (text)
- is_active (boolean)
- created_at (timestamptz)
- updated_at (timestamptz)

### projects
- id (uuid, PK)
- organization_id (uuid, FK -> organizations)
- name (text)
- description (text)
- status (text: 'planning', 'active', 'on_hold', 'completed', 'cancelled')
- priority (text: 'low', 'medium', 'high', 'critical')
- start_date (date)
- end_date (date)
- created_by (uuid, FK -> profiles)
- created_at (timestamptz)
- updated_at (timestamptz)

### project_members
- id (uuid, PK)
- project_id (uuid, FK -> projects)
- user_id (uuid, FK -> profiles)
- role (text: 'lead', 'member', 'observer')
- added_at (timestamptz)

### experiments
- id (uuid, PK)
- project_id (uuid, FK -> projects, NOT NULL)
- name (text)
- description (text)
- hypothesis (text)
- status (text: 'planned', 'in_progress', 'data_ready', 'analyzed', 'completed', 'cancelled')
- start_date (date)
- completion_date (date)
- created_by (uuid, FK -> profiles)
- assigned_to (uuid, FK -> profiles)
- created_at (timestamptz)
- updated_at (timestamptz)

### samples
- id (uuid, PK)
- experiment_id (uuid, FK -> experiments)
- sample_code (text, unique)
- sample_type (text)
- description (text)
- source (text)
- collection_date (date)
- storage_location (text)
- storage_condition (text)
- quantity (numeric)
- quantity_unit (text)
- status (text: 'available', 'in_use', 'depleted', 'disposed')
- created_by (uuid, FK -> profiles)
- created_at (timestamptz)
- updated_at (timestamptz)

### protocols
- id (uuid, PK)
- organization_id (uuid, FK -> organizations)
- name (text)
- description (text)
- version (text)
- content (text)
- category (text)
- is_active (boolean)
- created_by (uuid, FK -> profiles)
- created_at (timestamptz)
- updated_at (timestamptz)

### experiment_protocols
- id (uuid, PK)
- experiment_id (uuid, FK -> experiments)
- protocol_id (uuid, FK -> protocols)
- added_at (timestamptz)

### assays
- id (uuid, PK)
- organization_id (uuid, FK -> organizations)
- name (text)
- description (text)
- category (text)
- default_parameters (jsonb)
- created_by (uuid, FK -> profiles)
- created_at (timestamptz)
- updated_at (timestamptz)

### experiment_assays
- id (uuid, PK)
- experiment_id (uuid, FK -> experiments)
- assay_id (uuid, FK -> assays)
- parameters (jsonb)
- notes (text)
- created_at (timestamptz)
- updated_at (timestamptz)

### equipment
- id (uuid, PK)
- organization_id (uuid, FK -> organizations)
- name (text)
- equipment_code (text, unique)
- category (text)
- model (text)
- manufacturer (text)
- serial_number (text)
- location (text)
- status (text: 'available', 'in_use', 'maintenance', 'offline')
- next_maintenance_date (date)
- purchase_date (date)
- notes (text)
- created_at (timestamptz)
- updated_at (timestamptz)

### equipment_usage
- id (uuid, PK)
- equipment_id (uuid, FK -> equipment)
- experiment_id (uuid, FK -> experiments)
- user_id (uuid, FK -> profiles)
- start_time (timestamptz)
- end_time (timestamptz)
- purpose (text)
- notes (text)
- created_at (timestamptz)

### equipment_maintenance
- id (uuid, PK)
- equipment_id (uuid, FK -> equipment)
- maintenance_type (text: 'routine', 'repair', 'calibration', 'upgrade')
- description (text)
- performed_by (uuid, FK -> profiles)
- maintenance_date (date)
- next_maintenance_date (date)
- cost (numeric)
- notes (text)
- created_at (timestamptz)

### lab_notes
- id (uuid, PK)
- experiment_id (uuid, FK -> experiments)
- project_id (uuid, FK -> projects)
- title (text)
- content (text)
- note_type (text: 'observation', 'analysis', 'conclusion', 'general')
- created_by (uuid, FK -> profiles)
- created_at (timestamptz)
- updated_at (timestamptz)
- editor_data (jsonb)
- editor_version (text)
- last_edited_at (timestamptz)
- metadata (jsonb)

### literature_reviews
- id (uuid, PK)
- organization_id (uuid, FK -> organizations)
- project_id (uuid, FK -> projects)
- experiment_id (uuid, FK -> experiments)
- title (text)
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
- keywords (array)
- personal_notes (text)
- relevance_rating (integer, 1-5)
- status (text: 'saved', 'reading', 'completed', 'archived')
- created_by (uuid, FK -> profiles)
- created_at (timestamptz)
- updated_at (timestamptz)

### reports
- id (uuid, PK)
- project_id (uuid, FK -> projects)
- experiment_id (uuid, FK -> experiments)
- title (text)
- report_type (text: 'experiment', 'project', 'interim', 'final')
- content (text)
- status (text: 'draft', 'review', 'final')
- generated_by (uuid, FK -> profiles)
- created_at (timestamptz)
- updated_at (timestamptz)

### experiment_data
- id (uuid, PK)
- experiment_id (uuid, FK -> experiments)
- data_type (text: 'raw', 'processed', 'analysis', 'visualization')
- file_name (text)
- file_url (text)
- file_size (bigint)
- file_type (text)
- metadata (jsonb)
- uploaded_by (uuid, FK -> profiles)
- created_at (timestamptz)

### quality_control
- id (uuid, PK)
- experiment_id (uuid, FK -> experiments)
- qc_type (text)
- result (text: 'pass', 'fail', 'warning')
- measured_value (text)
- expected_value (text)
- notes (text)
- performed_by (uuid, FK -> profiles)
- performed_at (timestamptz)

### semantic_chunks
- id (uuid, PK)
- source_type (text: 'lab_note', 'literature_review', 'protocol', 'report', 'experiment_summary')
- source_id (uuid)
- organization_id (uuid, FK -> organizations)
- project_id (uuid, FK -> projects)
- experiment_id (uuid, FK -> experiments)
- user_id (uuid, FK -> profiles)
- chunk_index (integer)
- content (text)
- embedding (vector)
- fts (tsvector)
- metadata (jsonb)
- created_at (timestamptz)

## Key Relationships

1. organizations -> projects (1:N)
2. projects -> experiments (1:N)
3. experiments -> samples (1:N)
4. experiments -> lab_notes (1:N)
5. experiments -> experiment_protocols (N:M with protocols)
6. experiments -> experiment_assays (N:M with assays)
7. organizations -> protocols (1:N)
8. organizations -> equipment (1:N)
9. experiments -> equipment_usage (N:M with equipment)
10. projects -> reports (1:N)
11. experiments -> reports (1:N)

## Access Control Notes

- All queries MUST filter by organization_id (from scope)
- Optionally filter by project_id (from scope)
- Optionally filter by experiment_id (from scope)
- Use JOINs to access organization_id through relationships:
  - experiments -> projects -> organizations
  - samples -> experiments -> projects -> organizations
  - lab_notes -> experiments -> projects -> organizations OR lab_notes -> projects -> organizations
"""
