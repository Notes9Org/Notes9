-- ============================================================
-- 058 — RLS PERFORMANCE: wrap auth.uid()/auth.jwt() in (SELECT ...)
-- ============================================================
-- WHY. A bare `auth.uid()` / `auth.jwt()` inside a USING / WITH CHECK clause
-- is re-evaluated PER ROW scanned. Wrapping it in `(SELECT auth.uid())` lets
-- Postgres treat it as a one-time InitPlan (evaluated once per statement).
-- On the per-user tables this is the difference between an index seek and a
-- per-row function call across the whole table.
--
-- This migration only changes the auth.* call form — the access logic is
-- IDENTICAL to 050/053/057. `public.my_org_id()` is already STABLE
-- SECURITY DEFINER, so it is folded once per statement and is left as-is.
--
-- Safe to re-run: every policy is DROP POLICY IF EXISTS then CREATE.
-- Verified against: scripts/053_supabase_rls_migration.sql,
--                   scripts/050_rls_lockdown.sql, scripts/057_security_hardening.sql
-- Run in the Supabase SQL editor (small enough to paste in one go).
-- ============================================================

-- ── Missing index: samples policies filter on created_by ────────────────────
CREATE INDEX IF NOT EXISTS idx_samples_created_by ON public.samples(created_by);

-- ── Drop older 050 policies that overlap 053 names (avoid duplicate permissive
--    policies being OR'd together — they double the qual work). 053's
--    equivalents are recreated below in wrapped form. ─────────────────────────
DROP POLICY IF EXISTS "agent_sessions_own"        ON public.agent_sessions;
DROP POLICY IF EXISTS "agent_messages_via_session" ON public.agent_messages;
DROP POLICY IF EXISTS "mcp_servers_own"           ON public.mcp_servers;
DROP POLICY IF EXISTS "message_votes_own"         ON public.message_votes;

-- ════════════════════════ PROFILES ════════════════════════
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    id = (SELECT auth.uid())
    OR organization_id = public.my_org_id()
  );

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (
    id = (SELECT auth.uid())
    AND (
      organization_id IS NULL
      OR organization_id IN (
        SELECT o.id FROM public.organizations o
        WHERE o.email = ((SELECT auth.jwt()) ->> 'email')
      )
    )
  );

-- ════════════════════════ ORGANIZATIONS ════════════════════════
DROP POLICY IF EXISTS "organizations_select" ON public.organizations;
CREATE POLICY "organizations_select" ON public.organizations
  FOR SELECT USING (
    id = public.my_org_id()
    OR email = ((SELECT auth.jwt()) ->> 'email')
  );

DROP POLICY IF EXISTS "organizations_insert" ON public.organizations;
CREATE POLICY "organizations_insert" ON public.organizations
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND email = ((SELECT auth.jwt()) ->> 'email')
  );

-- ════════════════════════ ORG PERMISSIONS (reference) ════════════════════════
DROP POLICY IF EXISTS "org_permissions_select" ON public.org_permissions;
CREATE POLICY "org_permissions_select" ON public.org_permissions
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

-- ════════════════════════ LAB NOTES ════════════════════════
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
    OR created_by = (SELECT auth.uid())
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
    OR created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "lab_notes_delete" ON public.lab_notes;
CREATE POLICY "lab_notes_delete" ON public.lab_notes
  FOR DELETE USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "lab_note_protocols_all" ON public.lab_note_protocols;
CREATE POLICY "lab_note_protocols_all" ON public.lab_note_protocols
  USING (
    lab_note_id IN (
      SELECT id FROM public.lab_notes
      WHERE project_id IN (
        SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
      )
      OR created_by = (SELECT auth.uid())
    )
  );

-- ════════════════════════ SAMPLES ════════════════════════
DROP POLICY IF EXISTS "samples_insert" ON public.samples;
CREATE POLICY "samples_insert" ON public.samples
  FOR INSERT WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "samples_delete" ON public.samples;
CREATE POLICY "samples_delete" ON public.samples
  FOR DELETE USING (created_by = (SELECT auth.uid()));

-- ════════════════════════ CHAT (per-user) ════════════════════════
DROP POLICY IF EXISTS "chat_sessions_all" ON public.chat_sessions;
CREATE POLICY "chat_sessions_all" ON public.chat_sessions
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "chat_messages_all" ON public.chat_messages;
CREATE POLICY "chat_messages_all" ON public.chat_messages
  USING (
    session_id IN (
      SELECT id FROM public.chat_sessions WHERE user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "chat_memories_all" ON public.chat_memories;
CREATE POLICY "chat_memories_all" ON public.chat_memories
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "chat_episode_summaries_all" ON public.chat_episode_summaries;
CREATE POLICY "chat_episode_summaries_all" ON public.chat_episode_summaries
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "chat_researcher_profiles_all" ON public.chat_researcher_profiles;
CREATE POLICY "chat_researcher_profiles_all" ON public.chat_researcher_profiles
  USING (user_id = (SELECT auth.uid()));

-- ════════════════════════ AGENT (per-user) ════════════════════════
DROP POLICY IF EXISTS "agent_sessions_all" ON public.agent_sessions;
CREATE POLICY "agent_sessions_all" ON public.agent_sessions
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "agent_messages_all" ON public.agent_messages;
CREATE POLICY "agent_messages_all" ON public.agent_messages
  USING (
    session_id IN (
      SELECT id FROM public.agent_sessions WHERE user_id = (SELECT auth.uid())
    )
  );

-- ════════════════════════ DASHBOARD / CALENDAR / WHITEBOARD ════════════════════════
DROP POLICY IF EXISTS "dashboard_tasks_all" ON public.dashboard_tasks;
CREATE POLICY "dashboard_tasks_all" ON public.dashboard_tasks
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "calendar_events_all" ON public.calendar_events;
CREATE POLICY "calendar_events_all" ON public.calendar_events
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "whiteboard_notes_select" ON public.whiteboard_notes;
CREATE POLICY "whiteboard_notes_select" ON public.whiteboard_notes
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
  );

DROP POLICY IF EXISTS "whiteboard_notes_write" ON public.whiteboard_notes;
CREATE POLICY "whiteboard_notes_write" ON public.whiteboard_notes
  AS PERMISSIVE FOR ALL USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ════════════════════════ MCP SERVERS / VOTES / DIFFS ════════════════════════
DROP POLICY IF EXISTS "mcp_servers_all" ON public.mcp_servers;
CREATE POLICY "mcp_servers_all" ON public.mcp_servers
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "message_votes_all" ON public.message_votes;
CREATE POLICY "message_votes_all" ON public.message_votes
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "content_diffs_all" ON public.content_diffs;
CREATE POLICY "content_diffs_all" ON public.content_diffs
  USING (user_id = (SELECT auth.uid()));

-- content_diffs richer SELECT from 050 (kept; wrapped)
DROP POLICY IF EXISTS "content_diffs_select_by_record_access" ON public.content_diffs;
CREATE POLICY "content_diffs_select_by_record_access" ON public.content_diffs
  FOR SELECT USING (
    (SELECT auth.uid()) = user_id
    OR (
      record_type = 'protocol' AND EXISTS (
        SELECT 1 FROM public.protocols p
        JOIN public.profiles me ON me.id = (SELECT auth.uid())
        WHERE p.id = content_diffs.record_id
          AND p.organization_id = me.organization_id
      )
    )
    OR (
      record_type = 'lab_note' AND EXISTS (
        SELECT 1 FROM public.lab_notes ln
        JOIN public.project_members pm
          ON pm.project_id = ln.project_id AND pm.user_id = (SELECT auth.uid())
        WHERE ln.id = content_diffs.record_id
      )
    )
  );

-- ════════════════════════ PAPERS ════════════════════════
DROP POLICY IF EXISTS "papers_select" ON public.papers;
CREATE POLICY "papers_select" ON public.papers
  FOR SELECT USING (
    created_by = (SELECT auth.uid())
    OR project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
  );

DROP POLICY IF EXISTS "papers_insert" ON public.papers;
CREATE POLICY "papers_insert" ON public.papers
  FOR INSERT WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "papers_update" ON public.papers;
CREATE POLICY "papers_update" ON public.papers
  FOR UPDATE USING (
    created_by = (SELECT auth.uid())
    OR project_id IN (
      SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
    )
  );

DROP POLICY IF EXISTS "papers_delete" ON public.papers;
CREATE POLICY "papers_delete" ON public.papers
  FOR DELETE USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "paper_yjs_documents_all" ON public.paper_yjs_documents;
CREATE POLICY "paper_yjs_documents_all" ON public.paper_yjs_documents
  USING (
    paper_id IN (
      SELECT id FROM public.papers
      WHERE created_by = (SELECT auth.uid())
        OR project_id IN (
          SELECT id FROM public.projects WHERE organization_id = public.my_org_id()
        )
    )
  );

-- ════════════════════════ AUDIT LOG ════════════════════════
DROP POLICY IF EXISTS "audit_log_insert" ON public.audit_log;
CREATE POLICY "audit_log_insert" ON public.audit_log
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "audit_log_select_admins" ON public.audit_log;
CREATE POLICY "audit_log_select_admins" ON public.audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = (SELECT auth.uid())
        AND me.role = 'admin'
        AND me.organization_id = (
          SELECT organization_id FROM public.profiles WHERE id = audit_log.user_id
        )
    )
  );

-- ════════════════════════ SEMANTIC CHUNKS / CHUNK JOBS ════════════════════════
DROP POLICY IF EXISTS "semantic_chunks_select_org" ON public.semantic_chunks;
CREATE POLICY "semantic_chunks_select_org" ON public.semantic_chunks
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "semantic_chunks_insert_org" ON public.semantic_chunks;
CREATE POLICY "semantic_chunks_insert_org" ON public.semantic_chunks
  FOR INSERT WITH CHECK (
    created_by = (SELECT auth.uid())
    AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "semantic_chunks_update_owner" ON public.semantic_chunks;
CREATE POLICY "semantic_chunks_update_owner" ON public.semantic_chunks
  FOR UPDATE USING (created_by = (SELECT auth.uid()))
  WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "semantic_chunks_delete_owner" ON public.semantic_chunks;
CREATE POLICY "semantic_chunks_delete_owner" ON public.semantic_chunks
  FOR DELETE USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "chunk_jobs_own" ON public.chunk_jobs;
CREATE POLICY "chunk_jobs_own" ON public.chunk_jobs
  FOR ALL USING (created_by = (SELECT auth.uid()))
  WITH CHECK (created_by = (SELECT auth.uid()));

-- ════════════════════════ AGENT RUNS / TRACE EVENTS (TEXT org id) ════════════
DROP POLICY IF EXISTS "agent_runs_select_own_org" ON public.agent_runs;
CREATE POLICY "agent_runs_select_own_org" ON public.agent_runs
  FOR SELECT USING (
    organization_id = (SELECT organization_id::text FROM public.profiles WHERE id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "agent_runs_insert_own_org" ON public.agent_runs;
CREATE POLICY "agent_runs_insert_own_org" ON public.agent_runs
  FOR INSERT WITH CHECK (
    created_by = (SELECT auth.uid())::text
    AND organization_id = (SELECT organization_id::text FROM public.profiles WHERE id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "agent_runs_update_own" ON public.agent_runs;
CREATE POLICY "agent_runs_update_own" ON public.agent_runs
  FOR UPDATE USING (created_by = (SELECT auth.uid())::text)
  WITH CHECK (created_by = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "agent_trace_events_select_own_org" ON public.agent_trace_events;
CREATE POLICY "agent_trace_events_select_own_org" ON public.agent_trace_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.agent_runs r
      WHERE r.run_id = agent_trace_events.run_id
        AND r.organization_id = (SELECT organization_id::text FROM public.profiles WHERE id = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "agent_trace_events_insert_owner" ON public.agent_trace_events;
CREATE POLICY "agent_trace_events_insert_owner" ON public.agent_trace_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agent_runs r
      WHERE r.run_id = agent_trace_events.run_id
        AND r.created_by = (SELECT auth.uid())::text
    )
  );

-- ════════════════════════ EXPERIMENT STEPS (050) ════════════════════════
DROP POLICY IF EXISTS "experiment_steps_select_org" ON public.experiment_steps;
CREATE POLICY "experiment_steps_select_org" ON public.experiment_steps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      JOIN public.profiles me ON me.id = (SELECT auth.uid())
      WHERE e.id = experiment_steps.experiment_id
        AND p.organization_id = me.organization_id
    )
  );

DROP POLICY IF EXISTS "experiment_steps_write_org" ON public.experiment_steps;
CREATE POLICY "experiment_steps_write_org" ON public.experiment_steps
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      JOIN public.profiles me ON me.id = (SELECT auth.uid())
      WHERE e.id = experiment_steps.experiment_id
        AND p.organization_id = me.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      JOIN public.profiles me ON me.id = (SELECT auth.uid())
      WHERE e.id = experiment_steps.experiment_id
        AND p.organization_id = me.organization_id
    )
  );

-- ════════════════════════ LITERATURE PDF ANNOTATIONS (057) ════════════════════
DROP POLICY IF EXISTS "Users can update their literature PDF annotations" ON public.literature_pdf_annotations;
CREATE POLICY "Users can update their literature PDF annotations"
  ON public.literature_pdf_annotations FOR UPDATE
  USING (created_by = (SELECT auth.uid())
         AND organization_id = (SELECT public.my_org_id()))
  WITH CHECK (created_by = (SELECT auth.uid())
         AND organization_id = (SELECT public.my_org_id()));

DROP POLICY IF EXISTS "Users can delete their literature PDF annotations" ON public.literature_pdf_annotations;
CREATE POLICY "Users can delete their literature PDF annotations"
  ON public.literature_pdf_annotations FOR DELETE
  USING (created_by = (SELECT auth.uid())
         AND organization_id = (SELECT public.my_org_id()));

-- ── Verify (Supabase advisor): no remaining "auth_rls_initplan" warnings ──────
--   Dashboard → Advisors → Performance  (or)
--   select * from pg_policies where schemaname='public'
--     and (qual like '%auth.uid()%' or with_check like '%auth.uid()%')
--     and qual not like '%(SELECT auth.uid())%';   -- should return few/no rows
