-- 076_agent_artifact_drafts.sql
-- Staging table for AI-generated files that have NOT yet been saved to an
-- experiment's Data files.
--
-- The Catalyst agent's artifact tools (create_pdf_report, create_word_document,
-- create_excel_workbook, create_chart_image, create_figure_from_code) now
-- generate in a DRAFT-FIRST flow: bytes go to the private `user` bucket under
--   {org}/agent-drafts/{session_id}/{data_id}/{file}
-- and a row is recorded here. NO experiment_data row exists yet, so the file
-- does NOT appear in any experiment's Data files until the user approves it.
--
-- On "Save to Data files" the backend commits the draft: it copies the object to
-- the canonical experiment path, inserts the experiment_data row, and stamps
-- committed_at here. Unsaved drafts past expires_at (default now()+24h) are
-- removed by cleanup_expired_drafts().
--
-- ACCESS MODEL: this table is written and read ONLY by the agent backend using
-- the service-role key (RLS-bypassing), exactly like experiment_data writes.
-- The browser never queries it directly — draft metadata reaches the UI over the
-- chat SSE stream, and the commit goes through an authenticated backend endpoint
-- that re-checks the chosen experiment against the user's AccessScope. We
-- therefore enable RLS with NO policies (deny-all to anon/authenticated) rather
-- than auth.uid()-based policies, to avoid adding per-row auth calls to the DB
-- (see the connection-exhaustion history) while keeping the table invisible to
-- end-user clients.

create table if not exists public.agent_artifact_drafts (
  id                      uuid primary key,            -- == storage data_id
  session_id              text not null,
  user_id                 uuid not null references public.profiles(id) on delete cascade,
  organization_id         uuid references public.organizations(id) on delete set null,
  storage_path            text not null,
  file_name               text not null,
  mime_type               text not null,
  size_bytes              bigint not null default 0,
  data_type               text not null default 'analysis',
  generator               text,
  created_at              timestamptz not null default now(),
  expires_at              timestamptz not null default (now() + interval '24 hours'),
  committed_at            timestamptz,
  committed_experiment_id uuid,
  committed_data_id       uuid                          -- experiment_data.id once committed
);

create index if not exists idx_artifact_drafts_user
  on public.agent_artifact_drafts (user_id);
create index if not exists idx_artifact_drafts_session
  on public.agent_artifact_drafts (session_id);
-- Cleanup scans only live (uncommitted) drafts by expiry.
create index if not exists idx_artifact_drafts_expiry
  on public.agent_artifact_drafts (expires_at)
  where committed_at is null;

alter table public.agent_artifact_drafts enable row level security;
-- Intentionally no SELECT/INSERT/UPDATE policies: all access is service-role
-- (bypasses RLS). This makes the table deny-all for browser clients.
