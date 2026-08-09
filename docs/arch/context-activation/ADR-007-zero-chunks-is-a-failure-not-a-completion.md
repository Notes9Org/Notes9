# ADR-007: Zero chunks is a failure, and "too short" is a distinct terminal status

- Status: accepted
- Date: 2026-08-08
- Supersedes: none

## Context

When the chunker produces no chunks, the worker records the job as `completed` and returns
`True` (`AI/worker/worker.py:112-119`). The two short-content branches at `:77-83` and
`:88-94` do the same. A document that was never indexed is therefore indistinguishable in
the queue from one that was indexed correctly.

This is the mechanism behind the 55% coverage gap. The queue reports 1899 completed jobs
and looks healthy; 453 of 823 sources have no chunks. Job-level success and corpus-level
coverage measure different things, and only the second one is what a user experiences.
Nothing reconciled them, because reconciliation is exactly what migration 108's coverage
monitor was for, and it has never run.

A second defect is bundled in the same lines. All three branches pass a human-readable
string as `error_message` on a success path (`"No chunks generated"`). That trips the
`if error_message:` branch at `db.py:119`, which increments `retry_count`. So a supposedly
successful job accumulates retries, and `retry_count` becomes useless as a signal of
genuine trouble.

The two conditions are not the same failure and must not be conflated. A note containing
twelve characters is correctly not chunked and will never be chunked; counting it as a
coverage gap forever means the gap never reaches zero, the 2% alert fires permanently, and
someone mutes it. A 40-page PDF that produced zero chunks is a real defect. Collapsing both
into `failed` produces an alert that cannot be driven to green, which is the same
end state as having no alert.

The live path is also untested. All five worker tests cover the content-addressed path
behind `WORKER_CONTENT_ADDRESSED`, which is off. The branch that has been silently dropping
documents in production has no test at all.

## Decision

`process_job` outcomes become exhaustive and mutually exclusive:

| Outcome | `status` | `error_message` | `retry_count` |
|---|---|---|---|
| chunks written | `completed` | `NULL` | unchanged |
| zero chunks produced | `failed` | `"no chunks generated: <reason>"` | incremented |
| content below threshold | `skipped` | `NULL` | unchanged |
| exception | `failed` | `str(e)` verbatim | incremented |

`skipped` is a new terminal status meaning correctly not indexed. Migration 108's coverage
query excludes `skipped` sources from `expected_sources`, so the gap is drivable to zero
and the alert stays meaningful.

`error_message` carries only errors. Never a status note, never a success message.

The change lands at the shared status-write path so all four call sites route through it,
rather than being patched at `worker.py:112` alone. The two short-content branches at
`:77-83` and `:88-94` are siblings of the same bug and are fixed in the same edit.

Each of the four outcomes gets a test on the **legacy** path, since that is the code
running in production.

## Consequences

Buys: the queue stops lying. A zero-chunk document becomes visible, re-drivable by the
existing runbook, and countable by the coverage monitor. `retry_count` becomes a real
signal again.

Costs: `skipped` is a new value that every consumer of `chunk_jobs.status` must tolerate.
The consumers are the worker, the coverage monitor, and the runbook, all changed together
here. Any dashboard filtering on `status = 'completed'` will show a drop that is a
correction, not a regression, and the re-drive will move a batch of historical
`completed` rows into `failed`. That number should be expected and announced rather than
investigated as a new incident.

Forecloses: `skipped` becomes part of the queue's vocabulary and is awkward to remove
later. The alternative is worse, so it is accepted.

## Alternatives rejected

**Leave the status alone and rely on the coverage monitor to catch gaps.** Lost because it
treats the symptom. The monitor tells you 453 sources are missing; it cannot tell you which
job dropped them or let you re-drive them, because those jobs are marked `completed` and no
re-drive query will select them. It also leaves the corrupt `retry_count` untouched.

**Mark zero-chunk results `failed` with no `skipped` status.** Simpler, and rejected for a
specific reason: short notes would fail permanently, the gap would never reach 0%, the 2%
alert would fire forever, and it would get muted. An alert that cannot go green is
equivalent to no alert, which is the failure this whole document exists to correct.

**Fix only `worker.py:112` since that is where zero-chunk results land.** Lost to the
root-cause rule. The two short-content branches share the defect. Patching the path the
symptom named and leaving its siblings is how this class of bug survives a fix.
