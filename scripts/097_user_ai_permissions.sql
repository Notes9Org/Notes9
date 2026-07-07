-- scripts/097_user_ai_permissions.sql
-- Per-user consent for Catalyst reading the user's PRIVATE lab data
-- (NLP->SQL over their records, RAG over their notes/documents, file reads,
-- agent memory recall). Backs the in-chat permission prompt and the Settings
-- "Permissions" tab.
--
-- New table only. Additive, idempotent, safe to re-run. Owner-only RLS,
-- mirroring the chat_folders / chat_sessions policies (see 092 / 038).
--
-- One row per user. internal_data_access:
--   'ask'    (default) — prompt in chat before the agent reads private data
--   'always'           — allow silently
--   'never'            — auto-deny (agent degrades, never prompts)
--
-- The frontend degrades gracefully until this is applied: a missing table/row
-- is treated as 'ask', and the backend gate defaults to 'ask' as well, so
-- nothing breaks pre-migration.
--
-- Applied: NOT YET — to be applied by the dedicated Supabase operator agent
-- after human review.

create table if not exists public.user_ai_permissions (
  -- References public.profiles(id), which equals the auth user id, so RLS
  -- `auth.uid() = user_id` holds. One row per user (user_id is the PK).
  user_id uuid primary key references public.profiles(id) on delete cascade,
  internal_data_access text not null default 'ask'
    check (internal_data_access in ('ask', 'always', 'never')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_ai_permissions enable row level security;

drop policy if exists "user_ai_permissions_select_own" on public.user_ai_permissions;
drop policy if exists "user_ai_permissions_insert_own" on public.user_ai_permissions;
drop policy if exists "user_ai_permissions_update_own" on public.user_ai_permissions;
drop policy if exists "user_ai_permissions_delete_own" on public.user_ai_permissions;

create policy "user_ai_permissions_select_own"
  on public.user_ai_permissions for select
  using (auth.uid() = user_id);

create policy "user_ai_permissions_insert_own"
  on public.user_ai_permissions for insert
  with check (auth.uid() = user_id);

create policy "user_ai_permissions_update_own"
  on public.user_ai_permissions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_ai_permissions_delete_own"
  on public.user_ai_permissions for delete
  using (auth.uid() = user_id);

comment on table public.user_ai_permissions is
  'Per-user consent for the agent reading the user''s private lab data (SQL/RAG/files/memory). Owner-only.';
comment on column public.user_ai_permissions.internal_data_access is
  'ask (default) | always | never. Drives the in-chat permission prompt and the Settings Permissions tab.';
