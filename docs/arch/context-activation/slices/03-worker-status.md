# Slice 03: worker-status

Repo: **AI** (`/Users/ramanareddy/Desktop/ELN/AI`). Branch target: `dev`. Wave 2, parallel
with 02 and 04.

## Goal

When this is done, the chunk queue stops lying. A document that produced no chunks is
recorded as `failed` and is re-drivable; a document legitimately too short to chunk is
recorded as `skipped` and stops counting against coverage forever; and `error_message`
carries only errors, so `retry_count` becomes a real signal again.

This is the root-cause fix for a 55% corpus coverage gap.

## Owns (you may write ONLY these)

- `worker/worker.py`
- `worker/services/db.py`
- `worker/test_worker_status.py`  (new file)

Touching anything outside this list is a bug. Slice 02 is editing `catalyst/main.py` and
slice 04 is editing `catalyst/core/memory/`; do not touch either.

## Context

Measured live on 2026-08-08: 453 of 823 enqueued sources have zero chunks, a 55% coverage
gap, while the queue reported 1899 completed jobs and looked healthy.

The mechanism is `worker/worker.py:112-119`:

```python
if not chunk_infos:
    self.db.update_job_status(job_id, "completed", "No chunks generated")
    logger.info("Job skipped - no chunks generated", job_id=job_id)
    return True
```

A document that was never indexed is indistinguishable in the queue from one that was
indexed correctly. Because those rows are marked `completed`, no re-drive query will ever
select them: they are unrecoverable without this fix.

Two sibling branches at `worker.py:77-83` and `worker.py:88-94` have the same defect for
short content. **Fix all three.** Patching only the branch the symptom named and leaving
its siblings is how this class of bug survives a fix. Land the change at the shared
status-write path so all call sites route through it, rather than editing three call sites.

A second defect rides along. All three branches pass a human-readable string as
`error_message` on a success path, which trips `if error_message:` at
`worker/services/db.py:119` and increments `retry_count`. Supposedly successful jobs
accumulate retries, making `retry_count` useless as a signal of real trouble.

**Why `skipped` must be distinct from `failed` (ADR-007).** A twelve-character note is
correctly not chunked and never will be. If it counts as a coverage gap forever, the gap
never reaches 0%, the 2% alert fires permanently, and someone mutes it. An alert that
cannot be driven green is the same end state as no alert, which is the failure this feature
exists to correct. A 40-page PDF that produced zero chunks is a genuine defect. They are
not the same outcome and must not share a status.

**The live path is untested.** All five existing worker tests
(`worker/test_worker_content_addressed.py` and friends) cover the content-addressed path
behind `WORKER_CONTENT_ADDRESSED`, which is off in production. The branch that has been
silently dropping documents has no test at all. Your tests go on the **legacy** path.

## What to build

Make `process_job` outcomes exhaustive and mutually exclusive:

| Outcome | `status` | `error_message` | `retry_count` |
|---|---|---|---|
| chunks written | `completed` | `NULL` | unchanged |
| zero chunks produced | `failed` | `"no chunks generated: <reason>"` | incremented |
| content below threshold | `skipped` | `NULL` | unchanged |
| exception | `failed` | `str(e)` verbatim | incremented |

`error_message` is never used to carry a success or status message. That is the specific
thing that corrupted `retry_count`.

Preserve the existing behaviour of `insert_chunks` re-raising rather than returning a bool
(`worker/services/db.py:180-206`, from commit `b2b5e9a`). That fix is correct and the outer
handler at `worker.py:252-261` records `str(e)`. Do not regress it. The dead constant-string
path at `worker.py:244-248` should go, since `insert_chunks` now only returns `True` or
raises.

## Interfaces you must honor

`chunk_jobs.status` domain, after slice 01 widens the CHECK constraint:

```
pending | processing | completed | failed | skipped
```

Writing any other value fails at the database. Slice 02's `/health/context` reports counts
keyed by exactly these five names.

`update_job_status(job_id, status, error_message=None)` keeps its signature. Callers pass
`error_message=None` on every non-error outcome.

## Depends on

**Slice 01** (Notes9), merged and applied. `chunk_jobs` currently has
`CHECK (status = ANY (ARRAY['pending','processing','completed','failed']))`. Every test you
write that inserts `skipped` fails against the live database until 01 lands. Do not work
around this by mocking the constraint away; the point is that the database enforces it.

## Done when

- [ ] All four outcomes above are implemented at the shared status-write path, and all
      three original branches (`:112-119`, `:77-83`, `:88-94`) route through it.
- [ ] Each of the four outcomes has a test **on the legacy path**, with
      `WORKER_CONTENT_ADDRESSED` unset.
- [ ] A test asserts `retry_count` is NOT incremented for `completed` and `skipped`.
- [ ] A test asserts a zero-chunk document lands as `failed` and is therefore selected by
      `retry_failed_jobs`, which is what makes the historical 453 recoverable.
- [ ] The five existing worker tests still pass.
- [ ] No behaviour change on the content-addressed path.

## Edge cases to test

Rows from the Failure modes table in `../ARCHITECTURE.md`, quoted with the guaranteed
behaviour.

- **Size** one chunk over the embedding token limit. Guarantee: the embedding call fails,
  the job fails with the real Bedrock error, never a generic constant, and no partial chunk
  set is left behind. Assert the recorded `error_message` contains the underlying exception
  text. 91 historical rows carry `"Failed to generate embeddings for any chunks"`, which is
  the generic shape this must never reproduce.
- **Shape** null or sub-threshold content. Guarantee: terminal `skipped`, excluded from
  `expected_sources`, never `completed`, never a permanent gap. Assert empty string, `None`,
  and whitespace-only content all reach `skipped` with `error_message IS NULL`.
- **Partial failure** timeout mid-ingest. Guarantee: on the content-addressed path the job
  stays `processing` with `claimed_at` set and is reclaimed after 900s by
  `claim_chunk_jobs`; on the legacy path `claimed_at` is never set, so it is stuck forever.
  This is exactly how the 15 zombies stuck since 2026-03-18 were created. Assert the legacy
  path leaves `claimed_at` null and add a `ponytail:` comment naming the limitation and
  that flipping `WORKER_CONTENT_ADDRESSED` is the upgrade path. Do not attempt to fix the
  legacy claim semantics here; that is what the flag is for.

## Out of scope

- Flipping `WORKER_CONTENT_ADDRESSED`. That is an operator action in Phase B, sequenced
  before the re-drive for data-safety reasons. See `DEFERRED.md`.
- Executing the re-drive runbook or resetting the 15 stuck `processing` jobs. Production
  data mutation, operator action. See `DEFERRED.md`.
- Making the legacy batch insert transactional. `replace_chunks` from migration 107 already
  solves this atomically and is what the flag turns on. Do not build a second solution;
  that is a second way to do an existing thing.
- Changing `claim_chunk_jobs` so it reclaims rows with `claimed_at IS NULL`. It excludes
  them deliberately; the 15 zombies are handled once by the runbook.
- Any change to `worker/services/chunker.py`. Chunking behaviour is correct; only the
  recording of its outcome is wrong.

### Failure modes deferred out of this slice

These rows of the Failure modes table in `../ARCHITECTURE.md` are ingestion behaviour, so
this is their nearest slice, but all of them are only exercised by the re-drive, which is
an operator action against production data and cannot be a worktree PR. They are owned by
**OPS-1 in `DEFERRED.md`**, which carries each one with its guaranteed behaviour. Do not
write tests for them here; the code paths they describe are reached by running the runbook,
not by this change.

- **Volume** re-drive of 4k failed rows
- **Volume** 10x concurrent writers on one source
- **Size** 10k-chunk document
- **Shape** source row deleted between enqueue and process
- **Partial failure** retry arrives twice
- **Partial failure** re-drive interrupted halfway
