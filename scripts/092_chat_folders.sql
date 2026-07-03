-- scripts/092_chat_folders.sql
-- User-defined folders for organising Catalyst chat sessions.
--
-- New table + one additive column. Existing chats stay ungrouped (folder_id
-- NULL). Deleting a folder keeps its chats (folder_id -> NULL via ON DELETE SET
-- NULL). Owner-only RLS, mirroring the chat_sessions policies (see 038).
--
-- The frontend degrades gracefully until this is applied: folder features are
-- hidden when the table/column is missing, and chats simply render ungrouped.

create table if not exists public.chat_folders (
  id uuid primary key default uuid_generate_v4(),
  -- Matches chat_sessions.user_id: references public.profiles(id) (which is the
  -- auth user id), so RLS `auth.uid() = user_id` holds.
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  color text,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chat_folders_user
  on public.chat_folders (user_id, sort, created_at);

alter table public.chat_folders enable row level security;

drop policy if exists "chat_folders_select_own" on public.chat_folders;
drop policy if exists "chat_folders_insert_own" on public.chat_folders;
drop policy if exists "chat_folders_update_own" on public.chat_folders;
drop policy if exists "chat_folders_delete_own" on public.chat_folders;

create policy "chat_folders_select_own"
  on public.chat_folders for select
  using (auth.uid() = user_id);

create policy "chat_folders_insert_own"
  on public.chat_folders for insert
  with check (auth.uid() = user_id);

create policy "chat_folders_update_own"
  on public.chat_folders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "chat_folders_delete_own"
  on public.chat_folders for delete
  using (auth.uid() = user_id);

-- Link chats to a folder. ON DELETE SET NULL keeps the chats when a folder goes.
alter table public.chat_sessions
  add column if not exists folder_id uuid references public.chat_folders(id) on delete set null;

create index if not exists idx_chat_sessions_folder
  on public.chat_sessions (user_id, folder_id, updated_at desc);

comment on table public.chat_folders is
  'User-defined folders for organising Catalyst chat sessions (owner-only).';
comment on column public.chat_sessions.folder_id is
  'Optional folder (chat_folders.id). NULL = ungrouped. Set NULL when the folder is deleted.';
