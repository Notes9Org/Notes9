-- scripts/105_saved_analyses.sql
-- The saved analysis: the unit of work for the Data Analysis feature.
--
-- Per the Data Analysis master document §3A, an analysis is NOT a file the
-- researcher has to name, file, back up and lose. It is an object that lives
-- inside the experiment it belongs to, reopenable, versioned, and attached to
-- the record that explains why it exists.
--
-- Two tables, because §3A.3 rule 1 draws a hard line between the two kinds of
-- write:
--
--   analyses            the working draft. Autosaved continuously, mutable.
--   analysis_revisions  immutable, numbered revisions. Append-only. Cut only
--                       when the researcher explicitly saves.
--
-- The append-only guarantee uses the same technique as document_versions (063)
-- and content_diffs (039): RLS is enabled and NO update or delete policy is
-- ever granted, so those verbs are denied outright rather than by convention.
-- Storage is cheap; a lost provenance chain is not.
--
-- The frontend degrades gracefully until this is applied: the workspace keeps
-- using its local session and simply cannot save named revisions.

/* ── The working object ──────────────────────────────────────────────────── */

create table if not exists public.analyses (
  id uuid primary key default uuid_generate_v4(),
  -- An analysis belongs to the experiment that explains it. Nullable so a
  -- scratch analysis can exist before the researcher decides where it lives;
  -- the UI asks before the first Save.
  experiment_id uuid references public.experiments(id) on delete cascade,
  -- Denormalised for the project-level analysis library (§3A.5), kept in sync
  -- by the trigger below the same way experiment_data does it (044).
  project_id uuid references public.projects(id) on delete set null,
  -- Matches data_analysis_templates.user_id: references public.profiles(id)
  -- (the auth user id), so RLS `auth.uid() = user_id` holds.
  user_id uuid not null references public.profiles(id) on delete cascade,

  name text not null default 'Untitled analysis',

  -- §3A.3 rule 1: continuous autosave writes here, to a working draft.
  -- This is the Analysis Spec (lib/data-analysis/spec/analysis-spec.ts).
  draft_spec jsonb not null default '{}'::jsonb,
  draft_updated_at timestamptz,

  -- The source file this analysis reads. Referenced, not owned: §3A.3 rule 4
  -- keeps the reference so drift can be DETECTED, while the row snapshot on
  -- each revision guarantees the analysis still opens if the file is deleted.
  source_data_file_id uuid references public.experiment_data(id) on delete set null,

  -- §3A.2: active tab, pane sizes, zoom, selection — so reopening resumes
  -- rather than restarts.
  workspace_state jsonb not null default '{}'::jsonb,

  -- Denormalised pointer to the newest revision, so the library can list
  -- analyses without a lateral join per row.
  current_revision_no integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_analyses_experiment
  on public.analyses (experiment_id, updated_at desc);
create index if not exists idx_analyses_project
  on public.analyses (project_id, updated_at desc);
create index if not exists idx_analyses_user
  on public.analyses (user_id, updated_at desc);

/* ── Immutable revisions ─────────────────────────────────────────────────── */

create table if not exists public.analysis_revisions (
  id uuid primary key default uuid_generate_v4(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  -- Monotonic per analysis. Enforced by the unique constraint below rather than
  -- trusted from the client.
  revision_no integer not null,

  -- A researcher-given name, e.g. "Figure 2B as submitted". §3A.4 wants history
  -- to be a readable list of what changed, not a list of timestamps.
  name text,
  change_summary text,

  /* §3A.2 — what a saved analysis has to contain. Each column below is one row
     of that table, and omitting any of them breaks a promise the product makes. */

  -- The recipe.
  spec jsonb not null,
  -- Hash of the computational slice of the spec (see engine/contract.ts). Lets
  -- the reopen check say "the spec changed" without diffing the whole object.
  spec_hash text not null,

  -- The exact rows used, immutable — so the analysis still opens if the source
  -- file is edited, renamed, moved, or deleted (§3A.3 rule 4).
  data_snapshot jsonb,
  -- Content hash of that snapshot. Compared against the live file to surface
  -- drift on open.
  data_version_hash text not null,
  -- Set when the snapshot was too large to store inline and a manifest was
  -- stored instead (§11 decision 14 leaves the threshold open).
  data_snapshot_is_manifest boolean not null default false,

  -- The engine's output, so reopening is instant and the numbers on screen are
  -- the numbers that were published.
  results jsonb,
  -- Library versions and seeds. Reproducibility without this is a claim we
  -- cannot honour (§3A.2).
  engine_version text not null,

  -- Catalyst's reasoning is part of the scientific record. A figure without its
  -- reasoning is just a picture (§3A.2).
  conversation_thread jsonb not null default '[]'::jsonb,

  -- §3A.3 rule 5: freeze what gets published. A frozen revision is read-only
  -- and citable; editing it forks a new revision rather than modifying it.
  is_frozen boolean not null default false,
  frozen_at timestamptz,
  frozen_by uuid references public.profiles(id) on delete set null,

  -- §3A.4: "duplicate as a new analysis" and "re-run into a new revision" both
  -- record where they came from, so the lineage stays walkable. Deliberately no
  -- FK: a parent may live in an analysis that was since deleted, and a dangling
  -- pointer is better than losing the fact that there was a parent.
  forked_from_revision_id uuid,

  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint analysis_revisions_no_unique unique (analysis_id, revision_no)
);

create index if not exists idx_analysis_revisions_analysis
  on public.analysis_revisions (analysis_id, revision_no desc);
create index if not exists idx_analysis_revisions_author
  on public.analysis_revisions (author_id, created_at desc);
-- Partial index: the frozen set is small and is queried on its own whenever a
-- manuscript asks what it is allowed to cite.
create index if not exists idx_analysis_revisions_frozen
  on public.analysis_revisions (analysis_id) where is_frozen;

/* ── Keep project_id in step with the experiment ─────────────────────────── */

create or replace function public.sync_analysis_project_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.experiment_id is not null then
    select e.project_id into new.project_id
    from public.experiments e
    where e.id = new.experiment_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_analyses_sync_project on public.analyses;
create trigger trg_analyses_sync_project
  before insert or update of experiment_id on public.analyses
  for each row execute function public.sync_analysis_project_id();

/* ── Cut a revision ──────────────────────────────────────────────────────── */

-- SECURITY DEFINER for the same reason commit_lab_note (066) and
-- commit_protocol (067) use it: the function must allocate revision_no under a
-- lock and insert into an append-only table the caller has no INSERT policy on.
-- Because DEFINER bypasses RLS, the access check below is done by hand.
create or replace function public.commit_analysis_revision(
  p_analysis_id       uuid,
  p_spec              jsonb,
  p_spec_hash         text,
  p_data_version_hash text,
  p_engine_version    text,
  p_results           jsonb default null,
  p_data_snapshot     jsonb default null,
  p_name              text default null,
  p_change_summary    text default null,
  p_conversation      jsonb default '[]'::jsonb,
  p_forked_from       uuid default null
)
returns public.analysis_revisions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_owner    uuid;
  v_next     integer;
  v_revision public.analysis_revisions;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Manual access check, since DEFINER bypasses RLS.
  select a.user_id into v_owner from public.analyses a where a.id = p_analysis_id;
  if v_owner is null then
    raise exception 'Analysis not found';
  end if;
  if v_owner <> v_uid and not exists (
    select 1
    from public.analyses a
    join public.project_members pm on pm.project_id = a.project_id and pm.user_id = v_uid
    where a.id = p_analysis_id
  ) then
    raise exception 'Not permitted to save this analysis';
  end if;

  -- Serialise revision numbering for this analysis. Two browser tabs saving at
  -- once must produce revisions 3 and 4, never two revision 3s.
  perform 1 from public.analyses where id = p_analysis_id for update;

  select coalesce(max(revision_no), 0) + 1 into v_next
  from public.analysis_revisions where analysis_id = p_analysis_id;

  insert into public.analysis_revisions (
    analysis_id, revision_no, name, change_summary,
    spec, spec_hash, data_snapshot, data_version_hash,
    results, engine_version, conversation_thread,
    forked_from_revision_id, author_id
  ) values (
    p_analysis_id, v_next, p_name, p_change_summary,
    p_spec, p_spec_hash, p_data_snapshot, p_data_version_hash,
    p_results, p_engine_version, coalesce(p_conversation, '[]'::jsonb),
    p_forked_from, v_uid
  )
  returning * into v_revision;

  update public.analyses
     set current_revision_no = v_next,
         draft_spec = p_spec,
         updated_at = now()
   where id = p_analysis_id;

  return v_revision;
end;
$$;

revoke all on function public.commit_analysis_revision(
  uuid, jsonb, text, text, text, jsonb, jsonb, text, text, jsonb, uuid
) from public;
grant execute on function public.commit_analysis_revision(
  uuid, jsonb, text, text, text, jsonb, jsonb, text, text, jsonb, uuid
) to authenticated;

/* ── Freeze a revision ───────────────────────────────────────────────────── */

-- §3A.3 rule 5. This is the ONLY permitted mutation of a revision row, and it
-- is one-way: a frozen revision can never be unfrozen or edited, because that
-- is exactly the guarantee that makes a notes9 figure defensible eighteen
-- months later when a reviewer asks how it was made.
create or replace function public.freeze_analysis_revision(p_revision_id uuid)
returns public.analysis_revisions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_rev public.analysis_revisions;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select r.* into v_rev
  from public.analysis_revisions r
  join public.analyses a on a.id = r.analysis_id
  where r.id = p_revision_id
    and (
      a.user_id = v_uid
      or exists (
        select 1 from public.project_members pm
        where pm.project_id = a.project_id and pm.user_id = v_uid
      )
    );

  if v_rev.id is null then
    raise exception 'Revision not found or not permitted';
  end if;
  if v_rev.is_frozen then
    return v_rev;  -- Idempotent: freezing twice is not an error.
  end if;

  update public.analysis_revisions
     set is_frozen = true, frozen_at = now(), frozen_by = v_uid
   where id = p_revision_id
  returning * into v_rev;

  return v_rev;
end;
$$;

revoke all on function public.freeze_analysis_revision(uuid) from public;
grant execute on function public.freeze_analysis_revision(uuid) to authenticated;

/* ── RLS ─────────────────────────────────────────────────────────────────── */

alter table public.analyses enable row level security;
alter table public.analysis_revisions enable row level security;

-- auth.uid() is wrapped in a subselect throughout, per 058_rls_perf_uid_wrap:
-- it makes Postgres evaluate it once per query instead of once per row.

drop policy if exists "analyses_select" on public.analyses;
drop policy if exists "analyses_insert_own" on public.analyses;
drop policy if exists "analyses_update" on public.analyses;
drop policy if exists "analyses_delete_own" on public.analyses;

create policy "analyses_select"
  on public.analyses for select
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = analyses.project_id and pm.user_id = (select auth.uid())
    )
  );

create policy "analyses_insert_own"
  on public.analyses for insert
  with check (user_id = (select auth.uid()));

create policy "analyses_update"
  on public.analyses for update
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = analyses.project_id and pm.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = analyses.project_id and pm.user_id = (select auth.uid())
    )
  );

create policy "analyses_delete_own"
  on public.analyses for delete
  using (user_id = (select auth.uid()));

-- Revisions: SELECT only.
--
-- There is deliberately NO insert, update, or delete policy. Inserts happen
-- exclusively through commit_analysis_revision(), and the single legal mutation
-- happens through freeze_analysis_revision(); both are SECURITY DEFINER. With
-- RLS enabled and no policy granted, every other write is denied by the
-- database rather than by a code path someone can forget to call. That is what
-- makes "revisions are immutable and append-only" (§3A.3 rule 2) a guarantee
-- instead of an intention.
drop policy if exists "analysis_revisions_select" on public.analysis_revisions;

create policy "analysis_revisions_select"
  on public.analysis_revisions for select
  using (
    exists (
      select 1 from public.analyses a
      where a.id = analysis_revisions.analysis_id
        and (
          a.user_id = (select auth.uid())
          or exists (
            select 1 from public.project_members pm
            where pm.project_id = a.project_id and pm.user_id = (select auth.uid())
          )
        )
    )
  );

comment on table public.analyses is
  'Saved data analyses. The working draft; autosaved. Revisions live in analysis_revisions.';
comment on table public.analysis_revisions is
  'Immutable, append-only revisions of a saved analysis. Written only via commit_analysis_revision(); frozen via freeze_analysis_revision(). No UPDATE/DELETE policy exists by design.';
