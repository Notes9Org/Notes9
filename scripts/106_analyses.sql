-- 106_analyses.sql
-- Catalyst Analysis: one row per statistical analysis run against an experiment's
-- data (Prism-style column/grouped/xy/contingency/survival/nested tables).
--
-- An analysis is spec-first: `analysis_spec` is the complete, replayable
-- description of what was run (source data, role assignment, params,
-- transforms, figure template). `results` and `figure_spec` are the outputs.
-- `code` is the generated runtime script — it is SERVER-SIDE ONLY and must
-- never be included in a client-facing select list.
--
-- table_type is an open text column with a CHECK, not an enum: the plate /
-- matrix / pk_profile table types land later and widening a CHECK is a
-- one-line migration, whereas widening an enum in production is not.
--
-- source_analysis_ids covers analyses that read other analyses' results rather
-- than raw data (Cheng-Prusoff, Schild, selectivity index). It is a plain uuid[]
-- — Postgres cannot express a FK from an array element, so referential
-- integrity there is the application's job.
--
-- ACCESS MODEL: owner-only RLS (auth.uid() = user_id), same shape as the other
-- user-owned tables (message_votes, literature_reviews). user_id references
-- public.profiles(id) per repo convention — profiles.id IS auth.users.id, so
-- auth.uid() = user_id still holds. The agent backend writes with the
-- service-role key and bypasses RLS.

create table if not exists public.analyses (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  project_id          uuid references public.projects(id) on delete cascade,
  experiment_id       uuid not null references public.experiments(id) on delete cascade,
  organization_id     uuid references public.organizations(id) on delete set null,

  title               text not null default 'Untitled analysis',
  table_type          text not null check (table_type in (
                        'column', 'grouped', 'xy', 'contingency', 'survival', 'nested'
                      )),
  analysis_type       text not null,
  runtime             text not null default 'python',
  analysis_spec       jsonb not null,

  -- Input provenance.
  source_data_id      uuid references public.experiment_data(id) on delete set null,
  source_ref          jsonb not null default '{}',
  source_fingerprint  text,
  source_analysis_ids uuid[] not null default '{}',

  -- Outputs.
  results             jsonb,
  figure_spec         jsonb,
  figure_data_id      uuid references public.experiment_data(id) on delete set null,
  -- ponytail: server-side only by convention (API selects explicit columns).
  -- Column-level `revoke select(code)` would enforce it, but it also 403s every
  -- PostgREST `select=*` — upgrade to that only if a leak actually shows up.
  code                text,

  status              text not null default 'draft'
                        check (status in ('draft', 'running', 'ready', 'failed')),
  error               jsonb,
  ai_provenance       jsonb not null default '{}',

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Experiment detail lists analyses newest-first.
create index if not exists idx_analyses_experiment_created
  on public.analyses (experiment_id, created_at desc);
-- "What was run on this data file?" + invalidation when a data file changes.
create index if not exists idx_analyses_source_data
  on public.analyses (source_data_id);
create index if not exists idx_analyses_user
  on public.analyses (user_id);

alter table public.analyses enable row level security;

drop policy if exists "Users can view own analyses" on public.analyses;
create policy "Users can view own analyses"
  on public.analyses for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own analyses" on public.analyses;
create policy "Users can insert own analyses"
  on public.analyses for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own analyses" on public.analyses;
create policy "Users can update own analyses"
  on public.analyses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own analyses" on public.analyses;
create policy "Users can delete own analyses"
  on public.analyses for delete
  using (auth.uid() = user_id);

-- Repo convention: shared update_updated_at_column() trigger function.
drop trigger if exists update_analyses_updated_at on public.analyses;
create trigger update_analyses_updated_at
  before update on public.analyses
  for each row
  execute function update_updated_at_column();

-- DOWN
-- drop trigger if exists update_analyses_updated_at on public.analyses;
-- drop table if exists public.analyses;
