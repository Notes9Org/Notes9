-- 114_analyses_union_repair.sql
-- ADR-016 (docs/arch/data-analysis-ai-chat). Repair the public.analyses collision.
--
-- 105_saved_analyses.sql and 106_analyses.sql BOTH declare
-- `create table if not exists public.analyses`, with incompatible shapes. 106 ran
-- first and won, so the live table carries the agent-backend columns (title,
-- table_type, analysis_type, analysis_spec, source_data_id, …) and none of the
-- workspace columns that lib/data-analysis/saved-analysis.ts writes. The live
-- commit_analysis_revision() body — installed by 105 — ends with
--   update public.analyses set current_revision_no = …, draft_spec = …
-- so the RPC raises on every call. Saving an analysis has never worked.
--
-- Both claimants are live: 106's columns are written by the Catalyst agent backend
-- with the service-role key, 105's are what the workspace needs. So the fix is
-- additive: make the table the union, and leave both writers alone.
--
-- This migration is intentionally ONE-WAY. There is no DOWN section: dropping the
-- columns added here would re-break saved-analysis.ts. Reverting the application
-- code is safe on its own — the added columns are inert to code that ignores them.

/* ── 1. The workspace columns 105 expected ───────────────────────────────── */

alter table public.analyses add column if not exists name text;
alter table public.analyses add column if not exists draft_spec jsonb not null default '{}'::jsonb;
alter table public.analyses add column if not exists draft_updated_at timestamptz;
alter table public.analyses add column if not exists source_data_file_id uuid
  references public.experiment_data(id) on delete set null;
alter table public.analyses add column if not exists workspace_state jsonb not null default '{}'::jsonb;
alter table public.analyses add column if not exists current_revision_no integer not null default 0;

-- 105 defaults name; do the same so an insert that omits it still lands.
alter table public.analyses alter column name set default 'Untitled analysis';

/* ── 2. Let a draft exist before it is filed ─────────────────────────────── */
--
-- 106 made these NOT NULL. A scratch analysis has no experiment, no table_type and
-- no analysis_spec until the researcher decides where it lives (105 documents
-- experiment_id as nullable for exactly this reason, and ADR-015 makes an empty
-- analysis the default starting state). Widening a NOT NULL is backward compatible:
-- the agent backend keeps supplying all four.

alter table public.analyses alter column experiment_id drop not null;
alter table public.analyses alter column table_type    drop not null;
alter table public.analyses alter column analysis_type drop not null;
alter table public.analyses alter column analysis_spec drop not null;

/* ── 3. Indexes 105 declared against the columns that were missing ───────── */

create index if not exists idx_analyses_source_data_file
  on public.analyses (source_data_file_id);
create index if not exists idx_analyses_user_updated
  on public.analyses (user_id, updated_at desc);

/* ── 4. Backfill a display name for rows the agent backend wrote ─────────── */
--
-- Those rows have `title` and no `name`. The analysis library reads `name`, so
-- without this they list as "Untitled analysis". Coalescing at read time is still
-- required for rows written between this migration and the code deploy.

update public.analyses set name = title
 where name is null and title is not null;

/* ── 5. Reinstall commit_analysis_revision against columns that now exist ── */
--
-- Same signature, same body as 105. It is replaced rather than patched so a
-- database that never ran 105 ends up with the same function as one that did.
-- SECURITY DEFINER for the reason 105 gives: it must allocate revision_no under a
-- lock and insert into an append-only table the caller has no INSERT policy on, so
-- the access check is done by hand below.

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

comment on table public.analyses is
  'Saved data analyses. UNION of two historical declarations (105 workspace columns, '
  '106 agent-backend columns) — see 114_analyses_union_repair.sql / ADR-016. A row '
  'written by one writer will have nulls in the other family; readers must coalesce '
  '(name <- title) and must not assume draft_spec or table_type is populated.';

-- No DOWN. See the header.
