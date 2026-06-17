-- =============================================================================
-- 084_chat_attachments_capture.sql
-- =============================================================================
-- PURPOSE: Capture the pre-existing `chat_attachments` table into version
-- control.  The table was created out-of-band directly against the live DB;
-- NO prior migration covers it.  Running this migration against the LIVE DB
-- is a SAFE NO-OP (all DDL is guarded with IF NOT EXISTS / DROP … IF EXISTS).
-- Running it against a FRESH DB correctly recreates the table so new
-- environments match production.
--
-- DERIVATION NOTES
-- Column names, types, and nullability were derived from:
--   • app/api/files/upload/route.ts           — INSERT column list
--   • app/api/files/register/route.ts         — UPSERT + onConflict target
--   • app/api/cron/cleanup-chat-attachments/route.ts — index name references
--   • AI/catalyst/agents/core/tools/retrieval/read_document.py — select_fields
--   • scripts/019_chat_sessions.sql           — chat_sessions PK type (uuid)
--   • scripts/020_chat_messages.sql           — chat_messages PK type (uuid)
--   • scripts/000_full_script.sql lines 209, 184 — FK targets: profiles(id),
--     chat_sessions(id), chat_messages(id)
-- Sibling table style mirrors scripts/076_agent_artifact_drafts.sql.
--
-- HUMAN DIFF REQUIRED BEFORE TRUSTING ON A FRESH DB
-- The following could NOT be verified against a live information_schema dump;
-- a human MUST diff these against the live table before relying on this
-- migration in a new environment:
--   1. message_id nullability — coded NULL here (upload route passes null when
--      session_id is present but no message_id yet); confirm with:
--        SELECT is_nullable FROM information_schema.columns
--        WHERE table_name='chat_attachments' AND column_name='message_id';
--   2. NOT NULL constraints on storage_bucket, storage_path, file_name,
--      mime_type — inferred from application-layer validation; confirm live
--      column is_nullable for each.
--   3. size_bytes column type — coded bigint (matching 076 / upload route
--      `file.size` which is a JS number); confirm with:
--        SELECT data_type FROM information_schema.columns
--        WHERE table_name='chat_attachments' AND column_name='size_bytes';
--   4. expires_at default interval — coded '7 days' matching the upload
--      route SIGNED_URL_TTL_SECONDS constant; confirm live column default.
--   5. Any triggers on the table (e.g. updated_at triggers) — not added here
--      because no code path was observed writing updated_at; confirm with:
--        SELECT trigger_name FROM information_schema.triggers
--        WHERE event_object_table='chat_attachments';
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLE
-- ---------------------------------------------------------------------------
create table if not exists public.chat_attachments (
  -- Primary key
  id               uuid         not null default gen_random_uuid(),

  -- Ownership — FK verified against scripts/000_full_script.sql line 209:
  -- chat_sessions.user_id → public.profiles(id); all per-user chat tables
  -- (chat_sessions, chat_memories, agent_sessions, …) use profiles(id).
  user_id          uuid         not null
                   references public.profiles(id) on delete cascade,

  -- Chat context — FK verified: chat_sessions PK is uuid (scripts/019).
  -- ON DELETE CASCADE: if the session is deleted, attachments go with it.
  session_id       uuid         not null
                   references public.chat_sessions(id) on delete cascade,

  -- Message linkage — nullable: the upload route accepts a null message_id
  -- (files uploaded before the first message exists).  FK verified: chat_messages
  -- PK is uuid (scripts/020).  No ON DELETE action specified here because
  -- deleting a message should not silently orphan the attachment reference;
  -- leave null rather than cascade-delete the attachment row.
  --
  -- [HUMAN DIFF] Confirm nullability against live information_schema.
  message_id       uuid         null
                   references public.chat_messages(id) on delete set null,

  -- Storage coordinates — bucket is a logical Supabase Storage bucket name
  -- (e.g. "user"); path is the object key within that bucket.  Both are
  -- required for any operation (sign, delete, read_document).
  --
  -- [HUMAN DIFF] Confirm NOT NULL on storage_bucket, storage_path, file_name,
  -- mime_type against the live table.
  storage_bucket   text         not null,
  storage_path     text         not null,
  file_name        text         not null,
  mime_type        text         not null,

  -- File size in bytes.  Coded as bigint to match 076_agent_artifact_drafts
  -- and to safely hold files up to the theoretical Storage limit without
  -- integer overflow (JS Number.MAX_SAFE_INTEGER is ~9 PB as bigint).
  --
  -- [HUMAN DIFF] Confirm data_type = 'bigint' against live column.
  size_bytes       bigint       not null default 0,

  -- Timestamps
  created_at       timestamptz  not null default now(),

  -- TTL: 7 days matching SIGNED_URL_TTL_SECONDS in the upload route and the
  -- cron's Phase 1 logic (expires_at < now() AND deleted_at IS NULL).
  --
  -- [HUMAN DIFF] Confirm the default interval is '7 days' on the live column.
  expires_at       timestamptz  not null default (now() + interval '7 days'),

  -- Soft-delete tombstone.  Set by the cron Phase 1; row is hard-deleted in
  -- Phase 2 after 24 h.  Also checked by read_document to block expired reads.
  deleted_at       timestamptz  null,

  -- Constraints
  constraint chat_attachments_pkey primary key (id),

  -- Unique on (storage_bucket, storage_path) — enforced here and relied on by
  -- the register route's `onConflict: "storage_bucket,storage_path"` upsert.
  constraint chat_attachments_storage_unique unique (storage_bucket, storage_path)
);

-- ---------------------------------------------------------------------------
-- 2. INDEXES
-- ---------------------------------------------------------------------------

-- Ownership — fast lookups and RLS policy evaluation.
create index if not exists ix_chat_attachments_user_id
  on public.chat_attachments (user_id);

-- Session scope — join from chat_sessions on cascade delete and per-session
-- attachment queries.
create index if not exists ix_chat_attachments_session_id
  on public.chat_attachments (session_id);

-- TTL cron Phase 1: SELECT … WHERE expires_at < now() AND deleted_at IS NULL
-- Exact name referenced in cleanup-chat-attachments/route.ts comment.
create index if not exists ix_chat_attachments_expires_live
  on public.chat_attachments (expires_at)
  where deleted_at is null;

-- TTL cron Phase 2: SELECT … WHERE deleted_at < now() - interval '24 hours'
-- Exact name referenced in cleanup-chat-attachments/route.ts comment.
create index if not exists ix_chat_attachments_deleted_at
  on public.chat_attachments (deleted_at);

-- ---------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
-- ACCESS MODEL (mirrors scripts/076_agent_artifact_drafts.sql rationale):
--   • Backend paths that READ attachments (read_document tool, sign route,
--     cleanup cron) use the service-role key, which bypasses RLS entirely.
--   • Browser clients (the Next.js upload/register routes) use the anon-key
--     client authenticated via the user's session cookie.  We add a minimal
--     owner-scoped SELECT policy so the browser can verify its own uploads if
--     needed, but we do NOT add INSERT/UPDATE/DELETE policies — all writes
--     go through authenticated API routes (not direct browser PostgREST).
--   • The `(SELECT auth.uid())` wrapping is mandatory (scripts/058 pattern)
--     to prevent per-row function re-evaluation, which was a root cause of
--     the connection-exhaustion incidents noted in project memory.

alter table public.chat_attachments enable row level security;

-- Allow the owning user to SELECT their own attachments via the browser
-- client (e.g. to list attachments in a session, re-sign URLs on reload).
-- Scoped through chat_sessions so a user who loses their session also loses
-- access, consistent with the chat_messages RLS policy in scripts/058.
drop policy if exists "chat_attachments_select_own" on public.chat_attachments;
create policy "chat_attachments_select_own"
  on public.chat_attachments
  for select
  using (
    session_id in (
      select id from public.chat_sessions
      where user_id = (select auth.uid())
    )
  );

-- No INSERT / UPDATE / DELETE policies.  All mutations are performed by:
--   • upload/route.ts  → authenticated API route (server-side supabase client
--     with the user's session — bypasses RLS via service-role on writes, or
--     the anon client for the insert which will be blocked without a policy;
--     see note below).
--   • register/route.ts → same pattern.
--   • cleanup cron → createServiceRoleClient() — bypasses RLS.
--
-- NOTE FOR FRESH-ENV SETUP: if the upload/register routes use the anon-key
-- client (not service-role) for the INSERT, you must add an INSERT policy
-- scoped to user_id = (SELECT auth.uid()).  Inspect createClient() vs
-- createServiceRoleClient() calls in those routes to confirm.  On the live
-- DB the insert works, which implies either service-role writes or a policy
-- that was never captured here.  A human MUST verify before running in a
-- new environment.
