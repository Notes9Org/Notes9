-- ============================================================================
-- RLS lockdown — closes the gaps surfaced by the security audit.
-- Tables previously had no RLS at all (anyone authenticated could read every
-- other tenant) or had RLS enabled with no policies (table effectively dead to
-- the app but readable via the service-role key).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- agent_runs / agent_trace_events
-- Note: agent_runs.organization_id is TEXT (not a UUID FK). Until that column
-- is migrated to UUID, the policy compares the caller's profile.organization_id
-- cast to text.
-- ---------------------------------------------------------------------------
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_trace_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_runs_select_own_org" ON public.agent_runs;
CREATE POLICY "agent_runs_select_own_org"
  ON public.agent_runs FOR SELECT
  USING (
    organization_id = (
      SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "agent_runs_insert_own_org" ON public.agent_runs;
CREATE POLICY "agent_runs_insert_own_org"
  ON public.agent_runs FOR INSERT
  WITH CHECK (
    created_by = auth.uid()::text
    AND organization_id = (
      SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "agent_runs_update_own" ON public.agent_runs;
CREATE POLICY "agent_runs_update_own"
  ON public.agent_runs FOR UPDATE
  USING (created_by = auth.uid()::text)
  WITH CHECK (created_by = auth.uid()::text);

DROP POLICY IF EXISTS "agent_trace_events_select_own_org" ON public.agent_trace_events;
CREATE POLICY "agent_trace_events_select_own_org"
  ON public.agent_trace_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_runs r
      WHERE r.run_id = agent_trace_events.run_id
        AND r.organization_id = (
          SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "agent_trace_events_insert_owner" ON public.agent_trace_events;
CREATE POLICY "agent_trace_events_insert_owner"
  ON public.agent_trace_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agent_runs r
      WHERE r.run_id = agent_trace_events.run_id
        AND r.created_by = auth.uid()::text
    )
  );

-- ---------------------------------------------------------------------------
-- agent_sessions / agent_messages — strictly per-user AI chat history.
-- ---------------------------------------------------------------------------
ALTER TABLE public.agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_sessions_own" ON public.agent_sessions;
CREATE POLICY "agent_sessions_own"
  ON public.agent_sessions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "agent_messages_via_session" ON public.agent_messages;
CREATE POLICY "agent_messages_via_session"
  ON public.agent_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_sessions s
      WHERE s.id = agent_messages.session_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agent_sessions s
      WHERE s.id = agent_messages.session_id AND s.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- mcp_servers — OAuth tokens scoped to the owning user only.
-- (Encrypting the secret columns at rest is a separate hardening step that
-- should land before storing real OAuth tokens; see ADR / app config.)
-- ---------------------------------------------------------------------------
ALTER TABLE public.mcp_servers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mcp_servers_own" ON public.mcp_servers;
CREATE POLICY "mcp_servers_own"
  ON public.mcp_servers FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- audit_log — append-only via trusted triggers; admins in same org can SELECT.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "audit_log_select_admins" ON public.audit_log;
CREATE POLICY "audit_log_select_admins"
  ON public.audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.role = 'admin'
        AND me.organization_id = (
          SELECT organization_id FROM public.profiles WHERE id = audit_log.user_id
        )
    )
  );

-- No INSERT/UPDATE/DELETE policy — writes happen via SECURITY DEFINER triggers
-- (or the service role for backfills). Without those policies, regular users
-- cannot mutate audit history even if RLS is bypassed at app level.

-- ---------------------------------------------------------------------------
-- semantic_chunks / chunk_jobs — embeddings and source content per org/user.
-- ---------------------------------------------------------------------------
ALTER TABLE public.semantic_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chunk_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "semantic_chunks_select_org" ON public.semantic_chunks;
CREATE POLICY "semantic_chunks_select_org"
  ON public.semantic_chunks FOR SELECT
  USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "semantic_chunks_insert_org" ON public.semantic_chunks;
CREATE POLICY "semantic_chunks_insert_org"
  ON public.semantic_chunks FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "semantic_chunks_update_owner" ON public.semantic_chunks;
CREATE POLICY "semantic_chunks_update_owner"
  ON public.semantic_chunks FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "semantic_chunks_delete_owner" ON public.semantic_chunks;
CREATE POLICY "semantic_chunks_delete_owner"
  ON public.semantic_chunks FOR DELETE
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "chunk_jobs_own" ON public.chunk_jobs;
CREATE POLICY "chunk_jobs_own"
  ON public.chunk_jobs FOR ALL
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- message_votes — only the voter can see/modify their own votes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.message_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_votes_own" ON public.message_votes;
CREATE POLICY "message_votes_own"
  ON public.message_votes FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- content_diffs — tighten SELECT so a reader must also have access to the
-- underlying protocol (org-scoped) or lab note (project-scoped) instead of the
-- previous "any org member of the creator" rule.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "content_diffs_select_org" ON public.content_diffs;
CREATE POLICY "content_diffs_select_by_record_access"
  ON public.content_diffs FOR SELECT
  USING (
    auth.uid() = user_id
    OR (
      record_type = 'protocol' AND EXISTS (
        SELECT 1
        FROM public.protocols p
        JOIN public.profiles me ON me.id = auth.uid()
        WHERE p.id = content_diffs.record_id
          AND p.organization_id = me.organization_id
      )
    )
    OR (
      record_type = 'lab_note' AND EXISTS (
        SELECT 1
        FROM public.lab_notes ln
        JOIN public.project_members pm
          ON pm.project_id = ln.project_id AND pm.user_id = auth.uid()
        WHERE ln.id = content_diffs.record_id
      )
    )
  );

-- ---------------------------------------------------------------------------
-- experiment_steps — broaden access to match the rest of the codebase
-- (organization-scoped via experiments → projects), not strict project_members.
-- This keeps admins/viewers in the org consistent with how they see the parent
-- experiment, and removes the silent "you can see the experiment but its steps
-- come back empty" gap.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view steps for experiments in their projects" ON public.experiment_steps;
DROP POLICY IF EXISTS "Users can insert steps for experiments in their projects" ON public.experiment_steps;
DROP POLICY IF EXISTS "Users can update steps for experiments in their projects" ON public.experiment_steps;
DROP POLICY IF EXISTS "Users can delete steps for experiments in their projects" ON public.experiment_steps;

CREATE POLICY "experiment_steps_select_org"
  ON public.experiment_steps FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      JOIN public.profiles me ON me.id = auth.uid()
      WHERE e.id = experiment_steps.experiment_id
        AND p.organization_id = me.organization_id
    )
  );

CREATE POLICY "experiment_steps_write_org"
  ON public.experiment_steps FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      JOIN public.profiles me ON me.id = auth.uid()
      WHERE e.id = experiment_steps.experiment_id
        AND p.organization_id = me.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      JOIN public.profiles me ON me.id = auth.uid()
      WHERE e.id = experiment_steps.experiment_id
        AND p.organization_id = me.organization_id
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: tighten lab_notes_public so only the owning user can UPDATE/DELETE
-- their own files (was previously any authenticated user).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Update lab_notes_public" ON storage.objects;
CREATE POLICY "Update lab_notes_public"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'lab_notes_public'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Delete lab_notes_public" ON storage.objects;
CREATE POLICY "Delete lab_notes_public"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'lab_notes_public'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
