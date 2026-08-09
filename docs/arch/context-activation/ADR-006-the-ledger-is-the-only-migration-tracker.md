# ADR-006: The schema_migrations ledger is the only migration tracker

- Status: accepted
- Date: 2026-08-08
- Supersedes: the applied-through marker convention in `scripts/README.md`

## Context

Migration 109 introduced a `schema_migrations` ledger, backfilling 106 filenames plus its
own row. It was meant to answer one question: what is actually applied to the live
database.

It gets that question wrong on its first real use. Migration 108 is not in the ledger. 108
was applied before 109 created the table, and its self-record block is wrapped in a
`to_regclass` guard, so it skipped silently and left no trace. The ledger under-reports,
and it under-reports without complaining, which is the worst failure shape for a component
whose entire job is to be believed.

Meanwhile `scripts/README.md` still carries an "applied-through marker" reading
`as of 2026-07-18 the live DB is applied through 105`, with an instruction to update it by
hand on every migration. It has not been updated for 106, 107, 108, or 109.

So there are two trackers. One is stale by four migrations because it depends on a human
remembering. The other is missing one row because of an ordering accident. They disagree
with each other and both disagree with the database. Verifying the real state required
querying production directly, which is precisely the work the ledger was built to
eliminate.

A related concern turned out to be a non-issue and is recorded here so it is not
re-litigated. The repo has duplicate migration numbers: two each of 102, 103, 104, and 105.
This suggested the filename primary key was fragile. It is not. The duplicated element is
the numeric prefix, not the filename, and the filenames are distinct
(`102_experiment_summary_enqueue.sql` and `102_profile_demo_seeded.sql`). The key is sound
and requires no change.

## Decision

`public.schema_migrations` is the single source of truth for what is applied. Nothing else
tracks it.

Three changes follow. The missing 108 row is inserted. The applied-through marker and its
maintenance instruction are removed from `scripts/README.md`, replaced by a pointer to the
ledger and the query that reads it. Future migrations self-record unconditionally as their
final statement, with the `to_regclass` guard dropped now that the table exists.

The primary key stays `filename`.

Being applied is not the same as being in effect, and the ledger does not claim otherwise.
That second question belongs to `/health/context` (ARCHITECTURE.md, Interfaces), which
reports resolved flag state by calling the application's own predicates. The two are
deliberately separate: one answers what the database contains, the other what the running
code is doing with it.

## Consequences

Buys: one place to look, and it is queryable rather than requiring someone to have
remembered. Removing the README marker removes an artifact that was wrong for three weeks
and could not announce it.

Costs: dropping the `to_regclass` guard means a migration run against a database without
`schema_migrations` now fails instead of silently continuing. That is the intended trade.
The guard is exactly what produced this defect, and a loud failure on a fresh database is
better than a quiet gap on production. Bootstrapping a new environment requires applying
109 before any migration that self-records, which is already true of the numbering.

Forecloses: filename-keyed tracking assumes migrations are never renamed after
application. Renaming one now requires a matching ledger update. This is standard for
filename-keyed ledgers and the constraint is accepted.

## Alternatives rejected

**Key the ledger on a content checksum instead of the filename.** Lost because it solves a
problem that does not exist. Filenames are already unique, and a checksum key makes any
whitespace edit to an applied migration look like a new migration.

**Keep both trackers and reconcile them in CI.** Lost because Notes9 has no CI workflows
at all, so this means building a pipeline to keep a hand-maintained duplicate honest. The
cheaper fix is to delete the duplicate.

**Adopt a migration framework.** Lost on the ladder. 112 migrations already exist under
a working convention; the defect was one missing row from an ordering accident, not a
structural inadequacy. Replacing the system to fix one row is the wrong size of change.
