-- scripts/117_analysis_durability.sql
--
-- Numbering: 116 is the highest number in scripts/ and 117 is unused, so this
-- collides with nothing. The directory has a documented history of duplicate
-- numbers (003, 004, 012, 019, 025, 027, 030, 046, 047, 066, 092, 102, 103,
-- 104, 105, 114 all appear twice) and 109_migration_ledger.sql exists precisely
-- because filename order stopped being trustworthy. This file therefore records
-- itself in that ledger at the bottom and is written to be idempotent, so
-- re-applying it after a partial apply is safe.
--
-- ADDITIVE ONLY. 105_saved_analyses.sql, 106_analyses.sql and
-- 114_analyses_union_repair.sql are already applied (or partly applied) against
-- a live database and are not edited.
--
-- What this fixes, in the order it matters:
--
--   1. A frozen revision was destroyable by three FK cascades. It is now
--      undeletable. (§3A.3 rule 5 was enforced on every write path and no
--      delete path, which made "frozen" a promise the database did not keep.)
--   2. analysis_revisions.author_id cascaded from profiles, so deleting a
--      departing colleague's profile deleted the revisions they authored on
--      OTHER people's projects. Now it nulls the author and keeps the record.
--   3. is_pinned, so "named and pinned revisions" (§3A.4) is real.
--   4. duplicate_analysis(), so "duplicate as a new analysis" (§3A.4) is real —
--      forkFrozenRevision() forks WITHIN an analysis, which is a different act.

/* ══ 1. A frozen revision cannot be destroyed by an ordinary delete ═══════════

   The hole: analysis_revisions has a deliberate SELECT-only RLS policy, which
   stops a direct DELETE — but cascade deletes do not consult RLS. Three
   cascades reached a frozen row anyway:

     analysis_revisions.analysis_id  -> analyses     on delete cascade  (105:74)
       reachable through the "analyses_delete_own" policy: the owner deletes
       the analysis, every revision under it goes, frozen or not.
     analyses.experiment_id          -> experiments  on delete cascade  (105:31)
       a co-author tidies the experiment and takes the published figure with it.
     analysis_revisions.author_id    -> profiles     on delete cascade  (105:126)
       deleting one user's profile destroys frozen revisions on a project that
       is not theirs.

   A BEFORE DELETE trigger closes all three at once, because a cascading delete
   is still a DELETE on this table and still fires this table's row triggers.
   Fixing it here rather than at each of the three parents is also the only
   version that covers a fourth cascade nobody has added yet.

   DELETION SEMANTICS, stated plainly:

     - An UNFROZEN revision deletes exactly as it did before. Nothing changes.
     - A FROZEN revision cannot be deleted. Not by its author, not by the
       analysis owner, not by cascade. Freezing is already documented as
       one-way and un-undoable (105:252); "except that deleting the experiment
       erases it" was not a caveat anyone was told about.
     - Deleting an ANALYSIS that contains a frozen revision FAILS. The whole
       statement aborts and the analysis survives intact.
     - Deleting an EXPERIMENT that contains an analysis with a frozen revision
       FAILS, loudly, with a message naming the analysis and the revision. It
       does not partially delete: the cascade runs inside the caller's
       transaction, so the raise rolls the entire delete back. This is the
       intended behaviour, not an inconvenience — an experiment that backs a
       published figure should be undeletable while that claim stands.
     - Deleting a PROFILE no longer touches revisions at all (see 2 below), so
       it neither deletes nor fails.

   The escape hatch is deliberate and deliberately awkward: a superuser or
   service-role session that sets notes9.allow_frozen_delete = 'on' can delete
   a frozen revision. Erasure requests and genuine mistakes exist, and a
   guarantee with no documented override becomes an undocumented one via
   pg_dump surgery. `authenticated` cannot reach it: the GUC is set with SET
   LOCAL by an operator, and the ordinary API role never issues one. */

create or replace function public.guard_frozen_analysis_revision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  if not old.is_frozen then
    return old;
  end if;

  -- current_setting(..., true) returns null rather than raising when the GUC
  -- was never set, which is the ordinary case.
  if coalesce(current_setting('notes9.allow_frozen_delete', true), 'off') = 'on' then
    return old;
  end if;

  select a.name into v_name from public.analyses a where a.id = old.analysis_id;

  raise exception using
    errcode = 'restrict_violation',
    message = format(
      'Revision %s of "%s" is frozen and cannot be deleted.',
      old.revision_no, coalesce(v_name, 'this analysis')
    ),
    detail = format(
      'Frozen revision %s (id %s) was published on %s. Freezing is one-way: it exists so a figure stays defensible after the paper is out, which means nothing that deletes around it may quietly delete it either.',
      old.revision_no, old.id, coalesce(old.frozen_at::text, 'an unrecorded date')
    ),
    hint =
      'Nothing has been deleted. To remove the container instead, delete or move the analyses that do not hold frozen revisions. To retract the frozen record itself, an operator must run: set local notes9.allow_frozen_delete = ''on'';';
end;
$$;

drop trigger if exists trg_analysis_revisions_guard_frozen on public.analysis_revisions;
create trigger trg_analysis_revisions_guard_frozen
  before delete on public.analysis_revisions
  for each row execute function public.guard_frozen_analysis_revision();

comment on function public.guard_frozen_analysis_revision() is
  'Refuses any DELETE of a frozen analysis revision, including cascades from analyses, experiments and profiles, which bypass RLS. Override with: set local notes9.allow_frozen_delete = ''on''.';

/* ══ 2. A person leaving must not delete the project''s record ════════════════

   author_id was `not null references profiles(id) on delete cascade`. Keeping
   the record and losing the name is strictly better than the reverse, so the
   column becomes nullable and the FK becomes ON DELETE SET NULL — matching
   frozen_by, which 105 already got right (105:118).

   This does lose "who" for a deleted profile. The alternative that keeps it is
   denormalising the author''s name onto every revision at write time, which is
   a bigger change than this defect justifies; if a reviewer needs the name of
   a departed author, revision_no plus created_at plus the experiment''s member
   history still reaches it. Callers must treat authorId as nullable — the
   TypeScript side does after this migration.

   The constraint name is looked up rather than assumed: 105 let Postgres
   generate it, and a database that has been through a repair migration may not
   have the default. */

do $$
declare
  v_constraint text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'analysis_revisions'
      and column_name = 'author_id'
  ) then
    raise notice 'analysis_revisions.author_id absent; skipping author FK change.';
    return;
  end if;

  alter table public.analysis_revisions alter column author_id drop not null;

  select con.conname into v_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'analysis_revisions'
    and con.contype = 'f'
    and con.conkey = array[
      (select attnum from pg_attribute
        where attrelid = rel.oid and attname = 'author_id' and not attisdropped)
    ]::smallint[]
  limit 1;

  if v_constraint is not null then
    execute format(
      'alter table public.analysis_revisions drop constraint %I', v_constraint
    );
  end if;

  alter table public.analysis_revisions
    add constraint analysis_revisions_author_id_fkey
    foreign key (author_id) references public.profiles(id) on delete set null;
end;
$$;

/* ══ 3. Pinned revisions (§3A.4) ══════════════════════════════════════════════

   Pinning is not freezing and the two must not be conflated. Freezing is a
   one-way scientific claim ("this is what was published"); pinning is a
   reversible bookmark ("this is the one I keep coming back to"). A revision
   can be pinned and unpinned all day without touching the record.

   It still needs a SECURITY DEFINER function, for the same reason freezing
   does: analysis_revisions has no UPDATE policy, by design (105:349). */

alter table public.analysis_revisions
  add column if not exists is_pinned boolean not null default false;

create index if not exists idx_analysis_revisions_pinned
  on public.analysis_revisions (analysis_id) where is_pinned;

create or replace function public.set_analysis_revision_pinned(
  p_revision_id uuid,
  p_pinned      boolean
)
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

  -- Same hand-rolled access check as freeze_analysis_revision, because DEFINER
  -- bypasses RLS.
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

  update public.analysis_revisions
     set is_pinned = coalesce(p_pinned, false)
   where id = p_revision_id
  returning * into v_rev;

  return v_rev;
end;
$$;

revoke all on function public.set_analysis_revision_pinned(uuid, boolean) from public;
grant execute on function public.set_analysis_revision_pinned(uuid, boolean) to authenticated;

/* ══ 4. Duplicate as a NEW analysis (§3A.4) ═══════════════════════════════════

   forkFrozenRevision() appends a revision to the SAME analysis. Duplicating is
   the other thing the requirement asks for: a genuinely independent analysis
   with its own id and its own revision chain, so editing the copy cannot touch
   the original''s history and the original''s revision numbering does not
   advance because someone made a variant.

   LINEAGE. The copy is not anonymous. Its revision 1 sets
   forked_from_revision_id to the source revision, which is exactly what that
   column is for ("duplicate as a new analysis and re-run into a new revision
   both record where they came from, so the lineage stays walkable", 105:120)
   and why it deliberately carries no FK — the pointer must survive the source
   analysis being deleted. The copy''s change_summary names the source analysis
   and revision in prose as well, so the lineage is legible to a human reading
   the history list, not only walkable by a query.

   What is NOT copied: is_frozen and frozen_at/frozen_by. A duplicate of a
   published figure is a new working object, not a second published figure; it
   has never been published and must not claim to have been. The conversation
   thread, the results, the snapshot and the spec ARE copied, because the point
   of duplicating is to start from a working analysis rather than an empty one.
   The source''s earlier revisions are NOT copied: the copy starts at r1, and
   the pointer back to its parent is how you reach the history it came from. */

create or replace function public.duplicate_analysis(
  p_revision_id uuid,
  p_name        text default null
)
returns public.analyses
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_src_rev  public.analysis_revisions;
  v_src      public.analyses;
  v_new      public.analyses;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Two statements, not `select r.*, a.* into v_src_rev, v_src`: SELECT INTO
  -- with a composite target assigns column by column, so the joined form would
  -- pour the revision's first N columns into the analysis record.
  select r.* into v_src_rev
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

  if v_src_rev.id is null then
    raise exception 'Revision not found or not permitted';
  end if;

  select a.* into v_src from public.analyses a where a.id = v_src_rev.analysis_id;

  -- The duplicate belongs to whoever made it, in the same experiment. The
  -- project_id trigger (105:160) fills project_id from experiment_id.
  insert into public.analyses (
    experiment_id, user_id, name, draft_spec, draft_updated_at,
    source_data_file_id, workspace_state, current_revision_no
  ) values (
    v_src.experiment_id,
    v_uid,
    coalesce(nullif(btrim(p_name), ''), v_src.name || ' (copy)'),
    v_src_rev.spec,
    now(),
    v_src.source_data_file_id,
    v_src.workspace_state,
    1
  )
  returning * into v_new;

  insert into public.analysis_revisions (
    analysis_id, revision_no, name, change_summary,
    spec, spec_hash, data_snapshot, data_version_hash,
    data_snapshot_is_manifest, results, engine_version, conversation_thread,
    forked_from_revision_id, author_id
  ) values (
    v_new.id, 1, v_src_rev.name,
    format(
      'Duplicated from "%s" revision %s.', v_src.name, v_src_rev.revision_no
    ),
    v_src_rev.spec, v_src_rev.spec_hash,
    v_src_rev.data_snapshot, v_src_rev.data_version_hash,
    v_src_rev.data_snapshot_is_manifest,
    v_src_rev.results, v_src_rev.engine_version, v_src_rev.conversation_thread,
    v_src_rev.id,
    v_uid
  );

  return v_new;
end;
$$;

revoke all on function public.duplicate_analysis(uuid, text) from public;
grant execute on function public.duplicate_analysis(uuid, text) to authenticated;

comment on function public.duplicate_analysis(uuid, text) is
  'Copies one revision into a brand-new analysis with its own revision chain, starting at r1. Lineage is kept via forked_from_revision_id; frozen status is deliberately not copied.';

comment on column public.analysis_revisions.is_pinned is
  'A reversible bookmark (§3A.4). Not freezing: pinning makes no claim about publication and can be undone.';

/* ══ Ledger (109) ═════════════════════════════════════════════════════════════ */

-- Guarded on the table existing, because 109 may not have been applied on every
-- database this file reaches, and a missing ledger must not fail the migration.
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    insert into public.schema_migrations (filename)
    values ('117_analysis_durability.sql')
    on conflict (filename) do nothing;
  end if;
end;
$$;
