# Slice 01: db-observability-and-status

Repo: **Notes9**. Branch target: `dev`. Wave 1, alone.

## Goal

When this is done, the coverage monitor actually runs on a schedule, the migration ledger
tells the truth, and the database accepts the `skipped` job status that slice 03 needs.
One new migration plus one README correction. No application code changes.

This slice is a prerequisite for every other slice in this feature. Nothing else can start
until it merges and is applied.

## Owns (you may write ONLY these)

- `scripts/113_context_observability.sql`  (new file)
- `scripts/README.md`

Touching anything outside this list is a bug. If you believe you must, stop and report it
instead. Another slice owns that file and is being built against it right now.

Use number **113**. Do not use 110. The repo has no 110, but 111 and 112 are already
applied, so 113 keeps the sequence monotonic against what production has actually seen.

## Context

Measured live on 2026-08-08 (Supabase `rutcjpugsrfoobsrufnn`):

- `chunk_coverage_gaps` has 0 rows and `run_chunk_coverage_check()` has never run. pg_cron
  is not installed, and migration 108's schedule block is wrapped in
  `IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron')`, so it skipped silently.
  pg_cron **is** available on this project (default_version 1.6.4, installed_version null).
- `schema_migrations` holds 107 rows and is missing its `108_chunk_coverage_monitor.sql`
  row. 108 was applied before 109 created the table, and its `to_regclass`-guarded
  self-record skipped without complaint.
- `chunk_jobs` has `CHECK (status = ANY (ARRAY['pending','processing','completed','failed']))`.
  Slice 03 must write a new `skipped` status and will fail against this constraint until
  you widen it.
- 453 of 823 enqueued sources have zero chunks, a 55% coverage gap, against migration 108's
  2% alert threshold.

Constraining decisions, with their reasons, from the ADRs in this directory:

**ADR-006** makes `schema_migrations` the only migration tracker. `scripts/README.md`
currently carries an "applied-through marker" saying `as of 2026-07-18 the live DB is
applied through 105`, three migrations stale, plus an instruction to hand-update it. Both
come out. The ledger's primary key stays `filename`: the repo has duplicate migration
*numbers* (two each of 102, 103, 104, 105) but the *filenames* are distinct, so the key is
sound and needs no change.

**ADR-007** introduces `skipped` as a terminal status meaning correctly not indexed, and
requires the coverage query to exclude skipped sources from `expected_sources`. The reason
is specific: if a twelve-character note counts as a coverage gap forever, the gap never
reaches 0%, the 2% alert fires permanently, and someone mutes it. An alert that cannot be
driven green is the same end state as no alert, which is the failure this whole feature
exists to correct.

## What to build

`scripts/113_context_observability.sql`, following the conventions of 107 through 112 in
this directory (transaction wrapping, `IF NOT EXISTS` guards, revoke-then-grant, a verify
comment at the end, and a self-record into `schema_migrations` as the final statement):

1. **Backfill the missing 108 ledger row**, idempotently. Match the existing backfill's
   shape from `109_migration_ledger.sql:38-148` (`checksum = 'backfill'`).

2. **Install pg_cron and schedule the monitor.** `CREATE EXTENSION IF NOT EXISTS pg_cron;`
   then register `chunk_coverage_nightly` at `30 2 * * *` calling
   `run_chunk_coverage_check()`, matching what `108_chunk_coverage_monitor.sql:160-172`
   already writes. Registering must be idempotent: a re-run must not create a second job.
   Note that `cron.schedule` in a transaction can be awkward; follow 108's precedent of
   placing the scheduling block after `COMMIT`.

3. **Widen the `chunk_jobs` status constraint** to include `'skipped'`. Drop and recreate
   `chunk_jobs_status_check`. Do not alter the `chunk_jobs_operation_check` constraint.

4. **Amend `run_chunk_coverage_check()`** so `expected_sources` excludes sources whose
   most recent job is `skipped`. Keep the existing 6 source types, the
   `alert = gap > 2.00` threshold, the `SECURITY DEFINER` marking, and the existing
   grants (revoke PUBLIC/anon/authenticated, grant `service_role`). Change nothing else
   about its shape; slice 02 reads `chunk_coverage_gaps` and depends on the columns.

Then edit `scripts/README.md`: delete the applied-through marker at line 3 and the
maintenance instruction at line 163, and replace both with a pointer to the ledger and the
query that reads it (`SELECT filename, applied_at FROM public.schema_migrations ORDER BY 1;`).

## Interfaces you must honor

`chunk_coverage_gaps` keeps its current column set exactly. Slice 02 reads these and will
break if any is renamed:

```
id, checked_at, source_type, expected_sources, covered_sources,
missing_sources, gap_pct, alert_threshold_pct, alert
```

`schema_migrations` keeps `(filename PK, checksum, applied_at, applied_by)`.

`chunk_jobs.status` domain after this slice is exactly:
`pending | processing | completed | failed | skipped`.

## Depends on

Nothing. This is wave 1.

## Done when

- [ ] `SELECT count(*) FROM public.schema_migrations` returns 109 (107 existing + the 108
      backfill + this migration's own self-record), and a row for
      `108_chunk_coverage_monitor.sql` exists.
- [ ] `SELECT count(*) FROM cron.job WHERE jobname = 'chunk_coverage_nightly'` returns
      exactly 1, and returns 1 again after re-running the migration.
- [ ] `INSERT` of a `chunk_jobs` row with `status='skipped'` succeeds.
- [ ] `SELECT * FROM run_chunk_coverage_check()` returns 6 rows, one per source type, with
      `alert = true` for every type (that is correct today: real gaps are 11.1% to 67.9%
      against a 2% threshold).
- [ ] A source whose latest job is `skipped` is absent from `expected_sources`.
- [ ] The migration is re-runnable end to end with no error and no duplicate rows.
- [ ] `scripts/README.md` contains no applied-through marker and no instruction to
      hand-maintain one.

## Edge cases to test

Each of these is a row from the Failure modes table in `../ARCHITECTURE.md`, quoted with
the behaviour the design guarantees. Assert on the behaviour, not on the code shape.

- **Volume** 10x corpus (48k chunks, 23k jobs). Guarantee: the coverage query stays an
  aggregate and does not degrade to per-row work. Assert `run_chunk_coverage_check()` uses
  grouped aggregates over `semantic_chunks` and `chunk_jobs`, not a correlated subquery
  per source.
- **Shape** unknown `source_type`. Guarantee: the check enumerates 6 known types
  explicitly, so an unrecognised type is absent from the report rather than being counted
  as a 0% gap. Assert that inserting a job with a 7th source_type does not add a row and
  does not error. This is a documented limit, not a bug: adding a type means editing this
  function.
- **Boundaries** zero gap must be reachable. Guarantee: coverage of 0% is achievable, or
  the alert is permanent and gets muted. Assert that a source type whose every source is
  either chunked or `skipped` reports `gap_pct = 0.00` and `alert = false`.
- **Idempotency.** Re-running the whole migration leaves exactly one cron job, one 108
  ledger row, and one status constraint.

## Out of scope

- Dropping `idx_semantic_chunks_embedding` (the redundant ivfflat). That is ADR-008 and it
  is deliberately deferred to Phase C, after the corpus repair, so the re-drive is not
  writing against a changing index. See `DEFERRED.md`.
- Executing `scripts/runbooks/2026-08-04_redrive.md`. That mutates production data and is
  an operator action, not a migration. See `DEFERRED.md`.
- Any change to `claim_chunk_jobs` or `replace_chunks` from migration 107. They are correct.
- Backfilling the five other filenames missing from 109's array
  (`102_profile_demo_seeded`, `103_data_analysis_templates`, `104_onboarding_checklist`,
  `105_saved_analyses`, `106_analyses`). Real, but cosmetic next to the 108 gap, and
  bundling it widens the blast radius of a migration that must be trivially reviewable.
  Note it in the README pointer instead.
