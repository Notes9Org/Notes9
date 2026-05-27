-- ============================================================
-- NOTES9 – ROW-LEVEL SECURITY MIGRATION
-- Safe to re-run: DROP POLICY IF EXISTS guards all policies.
--
-- SQL EDITOR TIMEOUT: This file is ~765 lines. Supabase often returns
-- "Connection terminated due to connection timeout" if you paste it all at once.
-- Run the 5 parts in scripts/053_supabase_rls_parts/ in order (01 → 05) instead.
-- See scripts/053_supabase_rls_parts/ — run parts 01→05 in order.
-- If a prior run timed out, use 053-part-00-login-only.sql then finish 02–05.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- Helper: returns the calling user's organization_id.
-- SECURITY DEFINER bypasses RLS on profiles so it works
-- even after profiles gets RLS enabled below.
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.my_org_id()
  RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$$;

-- ──────────────────────────────────────────────────────────
-- ENABLE RLS ON ALL TABLES
-- ──────────────────────────────────────────────────────────
ALTER TABLE public.agent_llm_calls              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_sessions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tool_calls             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_trace_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assays                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_episode_summaries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_memories                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_researcher_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chunk_jobs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_diffs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_maintenance        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_usage              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_assays            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_data              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_data_entity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_protocols         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_steps             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiments                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_note_protocols           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_notes                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.literature_pdf_annotations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.literature_reviews           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_servers                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_votes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_invitations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_permissions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_role_permissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_roles                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_yjs_documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.papers                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protocol_document_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protocols                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_control              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sample_experiments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sample_files                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sample_lab_notes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sample_projects              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sample_qc_records            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sample_transfers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samples                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semantic_chunks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whiteboard_notes             ENABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════════════
-- PROFILES
-- Read: own row OR any profile in same org (team features)
-- Insert: own row (bootstrap / ensureUserProfile)
-- Update: own row only
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR organization_id = public.my_org_id()
  );

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (
    id = auth.uid()
    AND (
      organization_id IS NULL
      OR organization_id IN (
        SELECT o.id FROM public.organizations o
        WHERE o.email = (auth.jwt() ->> 'email')
      )
    )
  );

-- ══════════════════════════════════════════════════════════════
-- ORGANIZATIONS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "organizations_select" ON public.organizations;
CREATE POLICY "organizations_select" ON public.organizations
  FOR SELECT USING (
    id = public.my_org_id()
    OR email = (auth.jwt() ->> 'email')
  );

DROP POLICY IF EXISTS "organizations_insert" ON public.organizations;
CREATE POLICY "organizations_insert" ON public.organizations
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND email = (auth.jwt() ->> 'email')
  );

-- ══════════════════════════════════════════════════════════════
-- ORG MEMBERS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "org_members_select" ON public.org_members;
CREATE POLICY "org_members_select" ON public.org_members
  FOR SELECT USING (organization_id = public.my_org_id());

-- ══════════════════════════════════════════════════════════════
-- ORG ROLES
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "org_roles_select" ON public.org_roles;
CREATE POLICY "org_roles_select" ON public.org_roles
  FOR SELECT USING (organization_id = public.my_org_id());

-- ══════════════════════════════════════════════════════════════
-- ORG PERMISSIONS (reference table — any authenticated user)
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "org_permissions_select" ON public.org_permissions;
CREATE POLICY "org_permissions_select" ON public.org_permissions
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ══════════════════════════════════════════════════════════════
-- ORG ROLE PERMISSIONS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "org_role_permissions_select" ON public.org_role_permissions;
CREATE POLICY "org_role_permissions_select" ON public.org_role_permissions
  FOR SELECT USING (
    role_id IN (
      SELECT id FROM public.org_roles WHERE organization_id = public.my_org_id()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- ORG INVITATIONS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "org_invitations_select" ON public.org_invitations;
CREATE POLICY "org_invitations_select" ON public.org_invitations
  FOR SELECT USING (organization_id = public.my_org_id());

DROP POLICY IF EXISTS "org_invitations_insert" ON public.org_invitations;
CREATE POLICY "org_invitations_insert" ON public.org_invitations
  FOR INSERT WITH CHECK (organization_id = public.my_org_id());

DROP POLICY IF EXISTS "org_invitations_update" ON public.org_invitations;
CREATE POLICY "org_invitations_update" ON public.org_invitations
  FOR UPDATE USING (organization_id = public.my_org_id());

-- ══════════════════════════════════════════════════════════════
-- PROJECTS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select" ON public.projects
  FOR SELECT USING (organization_id = public.my_org_id());

DROP POLICY IF EXISTS "projects_insert" ON public.projects;
CREATE POLICY "projects_insert" ON public.projects
  FOR INSERT WITH CHECK (organization_id = public.my_org_id());

DROP POLICY IF EXISTS "projects_update" ON public.projects;
CREATE POLICY "projects_update" ON public.projects
  FOR UPDATE USING (organization_id = public.my_org_id())
  WITH CHECK (organization_id = public.my_org_id());

DROP POLICY IF EXISTS "projects_delete" ON public.projects;
CREATE POLICY "projects_delete" ON public.projects
  FOR DELETE USING (organization_id = public.my_org_id());

-- ══════════════════════════════════════════════════════════════
-- PROJECT MEMBERS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "project_members_select" ON public.project_members;
CREATE POLICY "project_members_select" ON public.project_members
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
  );

DROP POLICY IF EXISTS "project_members_insert" ON public.project_members;
CREATE POLICY "project_members_insert" ON public.project_members
  FOR INSERT WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
  );

DROP POLICY IF EXISTS "project_members_delete" ON public.project_members;
CREATE POLICY "project_members_delete" ON public.project_members
  FOR DELETE USING (
    project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- EXPERIMENTS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "experiments_select" ON public.experiments;
CREATE POLICY "experiments_select" ON public.experiments
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
  );

DROP POLICY IF EXISTS "experiments_insert" ON public.experiments;
CREATE POLICY "experiments_insert" ON public.experiments
  FOR INSERT WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
  );

DROP POLICY IF EXISTS "experiments_update" ON public.experiments;
CREATE POLICY "experiments_update" ON public.experiments
  FOR UPDATE USING (
    project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
  );

DROP POLICY IF EXISTS "experiments_delete" ON public.experiments;
CREATE POLICY "experiments_delete" ON public.experiments
  FOR DELETE USING (
    project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- EXPERIMENT STEPS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "experiment_steps_all" ON public.experiment_steps;
CREATE POLICY "experiment_steps_all" ON public.experiment_steps
  USING (
    experiment_id IN (
      SELECT e.id FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      WHERE p.organization_id = public.my_org_id()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- EXPERIMENT ASSAYS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "experiment_assays_all" ON public.experiment_assays;
CREATE POLICY "experiment_assays_all" ON public.experiment_assays
  USING (
    experiment_id IN (
      SELECT e.id FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      WHERE p.organization_id = public.my_org_id()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- EXPERIMENT PROTOCOLS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "experiment_protocols_all" ON public.experiment_protocols;
CREATE POLICY "experiment_protocols_all" ON public.experiment_protocols
  USING (
    experiment_id IN (
      SELECT e.id FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      WHERE p.organization_id = public.my_org_id()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- EXPERIMENT DATA
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "experiment_data_all" ON public.experiment_data;
CREATE POLICY "experiment_data_all" ON public.experiment_data
  USING (
    experiment_id IN (
      SELECT e.id FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      WHERE p.organization_id = public.my_org_id()
    )
    OR project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- EXPERIMENT DATA ENTITY LINKS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "experiment_data_entity_links_all" ON public.experiment_data_entity_links;
CREATE POLICY "experiment_data_entity_links_all" ON public.experiment_data_entity_links
  USING (
    experiment_data_id IN (
      SELECT id FROM public.experiment_data
      WHERE experiment_id IN (
        SELECT e.id FROM public.experiments e
        JOIN public.projects p ON p.id = e.project_id
        WHERE p.organization_id = public.my_org_id()
      )
      OR project_id IN (
        SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
      )
    )
  );

-- ══════════════════════════════════════════════════════════════
-- QUALITY CONTROL
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "quality_control_all" ON public.quality_control;
CREATE POLICY "quality_control_all" ON public.quality_control
  USING (
    experiment_id IN (
      SELECT e.id FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      WHERE p.organization_id = public.my_org_id()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- ASSAYS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "assays_all" ON public.assays;
CREATE POLICY "assays_all" ON public.assays
  USING (organization_id = public.my_org_id());

-- ══════════════════════════════════════════════════════════════
-- PROTOCOLS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "protocols_all" ON public.protocols;
CREATE POLICY "protocols_all" ON public.protocols
  USING (organization_id = public.my_org_id());

-- ══════════════════════════════════════════════════════════════
-- PROTOCOL DOCUMENT TEMPLATES
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "protocol_document_templates_all" ON public.protocol_document_templates;
CREATE POLICY "protocol_document_templates_all" ON public.protocol_document_templates
  USING (organization_id = public.my_org_id());

-- ══════════════════════════════════════════════════════════════
-- LAB NOTES
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "lab_notes_select" ON public.lab_notes;
CREATE POLICY "lab_notes_select" ON public.lab_notes
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
    OR experiment_id IN (
      SELECT e.id FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      WHERE p.organization_id = public.my_org_id()
    )
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS "lab_notes_insert" ON public.lab_notes;
CREATE POLICY "lab_notes_insert" ON public.lab_notes
  FOR INSERT WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
    OR experiment_id IN (
      SELECT e.id FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      WHERE p.organization_id = public.my_org_id()
    )
  );

DROP POLICY IF EXISTS "lab_notes_update" ON public.lab_notes;
CREATE POLICY "lab_notes_update" ON public.lab_notes
  FOR UPDATE USING (
    project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
    OR experiment_id IN (
      SELECT e.id FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      WHERE p.organization_id = public.my_org_id()
    )
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS "lab_notes_delete" ON public.lab_notes;
CREATE POLICY "lab_notes_delete" ON public.lab_notes
  FOR DELETE USING (created_by = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- LAB NOTE PROTOCOLS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "lab_note_protocols_all" ON public.lab_note_protocols;
CREATE POLICY "lab_note_protocols_all" ON public.lab_note_protocols
  USING (
    lab_note_id IN (
      SELECT id FROM public.lab_notes
      WHERE project_id IN (
        SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
      )
      OR created_by = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- SAMPLES
-- No direct organization_id — derive from creator's org
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "samples_select" ON public.samples;
CREATE POLICY "samples_select" ON public.samples
  FOR SELECT USING (
    created_by IN (
      SELECT id FROM public.profiles WHERE organization_id = public.my_org_id()
    )
    OR experiment_id IN (
      SELECT e.id FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      WHERE p.organization_id = public.my_org_id()
    )
  );

DROP POLICY IF EXISTS "samples_insert" ON public.samples;
CREATE POLICY "samples_insert" ON public.samples
  FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "samples_update" ON public.samples;
CREATE POLICY "samples_update" ON public.samples
  FOR UPDATE USING (
    created_by IN (
      SELECT id FROM public.profiles WHERE organization_id = public.my_org_id()
    )
  );

DROP POLICY IF EXISTS "samples_delete" ON public.samples;
CREATE POLICY "samples_delete" ON public.samples
  FOR DELETE USING (created_by = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- SAMPLE CHILD TABLES (all gate through samples)
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "sample_experiments_all" ON public.sample_experiments;
CREATE POLICY "sample_experiments_all" ON public.sample_experiments
  USING (
    sample_id IN (
      SELECT id FROM public.samples
      WHERE created_by IN (
        SELECT id FROM public.profiles WHERE organization_id = public.my_org_id()
      )
    )
  );

DROP POLICY IF EXISTS "sample_files_all" ON public.sample_files;
CREATE POLICY "sample_files_all" ON public.sample_files
  USING (
    sample_id IN (
      SELECT id FROM public.samples
      WHERE created_by IN (
        SELECT id FROM public.profiles WHERE organization_id = public.my_org_id()
      )
    )
  );

DROP POLICY IF EXISTS "sample_lab_notes_all" ON public.sample_lab_notes;
CREATE POLICY "sample_lab_notes_all" ON public.sample_lab_notes
  USING (
    sample_id IN (
      SELECT id FROM public.samples
      WHERE created_by IN (
        SELECT id FROM public.profiles WHERE organization_id = public.my_org_id()
      )
    )
  );

DROP POLICY IF EXISTS "sample_projects_all" ON public.sample_projects;
CREATE POLICY "sample_projects_all" ON public.sample_projects
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
  );

DROP POLICY IF EXISTS "sample_qc_records_all" ON public.sample_qc_records;
CREATE POLICY "sample_qc_records_all" ON public.sample_qc_records
  USING (
    sample_id IN (
      SELECT id FROM public.samples
      WHERE created_by IN (
        SELECT id FROM public.profiles WHERE organization_id = public.my_org_id()
      )
    )
  );

DROP POLICY IF EXISTS "sample_transfers_all" ON public.sample_transfers;
CREATE POLICY "sample_transfers_all" ON public.sample_transfers
  USING (
    sample_id IN (
      SELECT id FROM public.samples
      WHERE created_by IN (
        SELECT id FROM public.profiles WHERE organization_id = public.my_org_id()
      )
    )
  );

-- ══════════════════════════════════════════════════════════════
-- EQUIPMENT
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "equipment_all" ON public.equipment;
CREATE POLICY "equipment_all" ON public.equipment
  USING (organization_id = public.my_org_id());

DROP POLICY IF EXISTS "equipment_maintenance_all" ON public.equipment_maintenance;
CREATE POLICY "equipment_maintenance_all" ON public.equipment_maintenance
  USING (
    equipment_id IN (
      SELECT id FROM public.equipment WHERE organization_id = public.my_org_id()
    )
  );

DROP POLICY IF EXISTS "equipment_usage_all" ON public.equipment_usage;
CREATE POLICY "equipment_usage_all" ON public.equipment_usage
  USING (
    equipment_id IN (
      SELECT id FROM public.equipment WHERE organization_id = public.my_org_id()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- LITERATURE REVIEWS & PDF ANNOTATIONS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "literature_reviews_all" ON public.literature_reviews;
CREATE POLICY "literature_reviews_all" ON public.literature_reviews
  USING (organization_id = public.my_org_id());

DROP POLICY IF EXISTS "literature_pdf_annotations_all" ON public.literature_pdf_annotations;
CREATE POLICY "literature_pdf_annotations_all" ON public.literature_pdf_annotations
  USING (organization_id = public.my_org_id());

-- ══════════════════════════════════════════════════════════════
-- REPORTS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "reports_all" ON public.reports;
CREATE POLICY "reports_all" ON public.reports
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
    OR experiment_id IN (
      SELECT e.id FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      WHERE p.organization_id = public.my_org_id()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- SEMANTIC CHUNKS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "semantic_chunks_all" ON public.semantic_chunks;
CREATE POLICY "semantic_chunks_all" ON public.semantic_chunks
  USING (organization_id = public.my_org_id());

-- ══════════════════════════════════════════════════════════════
-- CHAT SESSIONS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "chat_sessions_all" ON public.chat_sessions;
CREATE POLICY "chat_sessions_all" ON public.chat_sessions
  USING (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- CHAT MESSAGES
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "chat_messages_all" ON public.chat_messages;
CREATE POLICY "chat_messages_all" ON public.chat_messages
  USING (
    session_id IN (
      SELECT id FROM public.chat_sessions WHERE user_id = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- CHAT MEMORIES
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "chat_memories_all" ON public.chat_memories;
CREATE POLICY "chat_memories_all" ON public.chat_memories
  USING (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- CHAT EPISODE SUMMARIES
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "chat_episode_summaries_all" ON public.chat_episode_summaries;
CREATE POLICY "chat_episode_summaries_all" ON public.chat_episode_summaries
  USING (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- CHAT RESEARCHER PROFILES
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "chat_researcher_profiles_all" ON public.chat_researcher_profiles;
CREATE POLICY "chat_researcher_profiles_all" ON public.chat_researcher_profiles
  USING (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- AGENT SESSIONS & MESSAGES
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "agent_sessions_all" ON public.agent_sessions;
CREATE POLICY "agent_sessions_all" ON public.agent_sessions
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "agent_messages_all" ON public.agent_messages;
CREATE POLICY "agent_messages_all" ON public.agent_messages
  USING (
    session_id IN (
      SELECT id FROM public.agent_sessions WHERE user_id = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- AGENT RUNS / LLM CALLS / TOOL CALLS / TRACE EVENTS
--
-- These use organization_id TEXT (not uuid) and are written
-- server-side. RLS is ON so the anon/user JWT has zero access.
-- Your server must use the service-role key for these tables.
--
-- If you instead query agent_runs from the client with a user
-- JWT, uncomment the policy below:
-- ══════════════════════════════════════════════════════════════
-- DROP POLICY IF EXISTS "agent_runs_select" ON public.agent_runs;
-- CREATE POLICY "agent_runs_select" ON public.agent_runs
--   FOR SELECT USING (created_by = auth.uid()::text);

-- ══════════════════════════════════════════════════════════════
-- DASHBOARD TASKS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "dashboard_tasks_all" ON public.dashboard_tasks;
CREATE POLICY "dashboard_tasks_all" ON public.dashboard_tasks
  USING (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- CALENDAR EVENTS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "calendar_events_all" ON public.calendar_events;
CREATE POLICY "calendar_events_all" ON public.calendar_events
  USING (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- WHITEBOARD NOTES
-- Own notes + notes on projects you're a member of
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "whiteboard_notes_select" ON public.whiteboard_notes;
CREATE POLICY "whiteboard_notes_select" ON public.whiteboard_notes
  FOR SELECT USING (
    user_id = auth.uid()
    OR project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
  );

DROP POLICY IF EXISTS "whiteboard_notes_write" ON public.whiteboard_notes;
CREATE POLICY "whiteboard_notes_write" ON public.whiteboard_notes
  AS PERMISSIVE FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- MCP SERVERS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "mcp_servers_all" ON public.mcp_servers;
CREATE POLICY "mcp_servers_all" ON public.mcp_servers
  USING (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- MESSAGE VOTES
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "message_votes_all" ON public.message_votes;
CREATE POLICY "message_votes_all" ON public.message_votes
  USING (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- CONTENT DIFFS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "content_diffs_all" ON public.content_diffs;
CREATE POLICY "content_diffs_all" ON public.content_diffs
  USING (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- PAPERS
-- Creators + org members of the linked project can read/edit
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "papers_select" ON public.papers;
CREATE POLICY "papers_select" ON public.papers
  FOR SELECT USING (
    created_by = auth.uid()
    OR project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
  );

DROP POLICY IF EXISTS "papers_insert" ON public.papers;
CREATE POLICY "papers_insert" ON public.papers
  FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "papers_update" ON public.papers;
CREATE POLICY "papers_update" ON public.papers
  FOR UPDATE USING (
    created_by = auth.uid()
    OR project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
  );

DROP POLICY IF EXISTS "papers_delete" ON public.papers;
CREATE POLICY "papers_delete" ON public.papers
  FOR DELETE USING (created_by = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- PAPER YJS DOCUMENTS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "paper_yjs_documents_all" ON public.paper_yjs_documents;
CREATE POLICY "paper_yjs_documents_all" ON public.paper_yjs_documents
  USING (
    paper_id IN (
      SELECT id FROM public.papers
      WHERE created_by = auth.uid()
        OR project_id IN (
          SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
        )
    )
  );

-- ══════════════════════════════════════════════════════════════
-- AUDIT LOG
-- SELECT: service-role only (admins/backend see all logs).
-- INSERT: authenticated users may log their own actions only.
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "audit_log_insert" ON public.audit_log;
CREATE POLICY "audit_log_insert" ON public.audit_log
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- CHUNK JOBS
-- Service-role only. RLS ON + no user policies = no JWT access.
-- ══════════════════════════════════════════════════════════════
-- (intentionally no policies — access via service-role key only)
