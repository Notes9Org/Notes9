-- scripts/108_data_analysis_templates.sql
-- Saved Data-Analysis templates, stored in-platform so a researcher's own
-- analysis setups (chart + plate config) persist across sessions and devices
-- and can be reused on new data. Owner-only, mirroring chat_folders (092).
--
-- The frontend degrades gracefully until this is applied: the Templates dialog
-- still shows the built-in gallery and falls back to browser-local storage for
-- the user's own templates; once this table exists they persist server-side.

create table if not exists public.data_analysis_templates (
  id uuid primary key default uuid_generate_v4(),
  -- Matches chat_sessions.user_id: references public.profiles(id) (the auth
  -- user id), so RLS `auth.uid() = user_id` holds.
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  -- Chart + plate configuration (no raw data): applied to whatever sheet is open.
  config jsonb not null default '{}'::jsonb,
  phase text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_data_analysis_templates_user
  on public.data_analysis_templates (user_id, created_at desc);

alter table public.data_analysis_templates enable row level security;

drop policy if exists "data_analysis_templates_select_own" on public.data_analysis_templates;
drop policy if exists "data_analysis_templates_insert_own" on public.data_analysis_templates;
drop policy if exists "data_analysis_templates_update_own" on public.data_analysis_templates;
drop policy if exists "data_analysis_templates_delete_own" on public.data_analysis_templates;

create policy "data_analysis_templates_select_own"
  on public.data_analysis_templates for select
  using (auth.uid() = user_id);

create policy "data_analysis_templates_insert_own"
  on public.data_analysis_templates for insert
  with check (auth.uid() = user_id);

create policy "data_analysis_templates_update_own"
  on public.data_analysis_templates for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "data_analysis_templates_delete_own"
  on public.data_analysis_templates for delete
  using (auth.uid() = user_id);

comment on table public.data_analysis_templates is
  'User-saved Data-Analysis setups (chart + plate config) reusable on new data (owner-only).';
