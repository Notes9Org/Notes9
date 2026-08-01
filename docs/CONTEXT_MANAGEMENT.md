# Context Management

How Notes9 keeps the agent's retrieval context fresh: what the user is working on
right now (focus signal) and a searchable summary of every experiment. This is the
"context backend" slice work (migrations `102`–`105`).

All source-of-truth lives in Postgres; the embedding worker and retriever are the
Python side (Catalyst / `core/retriever.py`). The pieces below are the DB triggers,
tables, RPCs, and the frontend beacon and request wiring that feed it.

## Status (verified 2026-07-31)

Verified against the live database, not the migration log — by checking the actual
objects, and by `EXPLAIN`ing the one query whose validity `CREATE FUNCTION` cannot
prove.

| Piece | Built | Running in production |
| --- | --- | --- |
| §1 Experiment summary chunks | yes | **yes** — `trg_experiment_summary_chunk` enabled, 82 chunks |
| §2 Focus signal (`recently_touched`) | yes | no — table empty, beacon flag off |
| §3 Consolidation serialization | yes | **no — never once executed** (see §3) |
| §4 Focus envelope forwarding | yes | partially — frontend sends it, backend flag gates it |

"Built" and "running" are different claims and this table keeps them apart on
purpose: three of these four are code-complete but inert, and a green test suite
says nothing about which. Flip them in the order under
[Env / feature flags](#env--feature-flags).

## 1. Experiment summary chunks

Every experiment gets a derived, embeddable text summary so the agent can retrieve
experiments semantically, not just by title.

- **Payload builder** — `experiment_summary_payload(e experiments) → jsonb`
  (migration `102`, patched in `105`). Assembles a single `content` string from the
  experiment name, status, hypothesis, description, and the titles of linked
  protocols, lab notes, samples, and papers (each capped, e.g. lab notes/samples
  LIMIT 15, papers LIMIT 10). The JSON also carries `organization_id`, `project_id`,
  `experiment_id`, and `created_by` for scoping.
  - `organization_id` falls back from the experiment's project org to the **creator's
    profile org** (added in `105`) — experiments with no project, or a project with no
    org, previously produced `organization_id = NULL` and failed the
    `semantic_chunks` NOT NULL constraint (44 experiments in the initial backfill).

- **Enqueue trigger** — `queue_experiment_summary_chunk_job()` on
  `AFTER INSERT OR UPDATE OR DELETE ON experiments` (migration `102`). `SECURITY
  DEFINER` so member writes can enqueue without a direct grant on `chunk_jobs`.
  - INSERT → enqueues `operation='create'`; DELETE → `operation='delete'`.
  - UPDATE enqueues `operation='update'` **only** when a text-bearing column
    (`name`, `description`, `hypothesis`, `status`) actually changed — otherwise it
    skips, so unrelated updates don't churn the embedding queue.

- **Queue → worker** — jobs land in `chunk_jobs` (`source_type='experiment_summary'`).
  The Python worker consumes them, deletes any existing chunks for the source, and
  writes fresh rows to `semantic_chunks`.

- **Backfill** — both `102` and `105` end with a re-runnable backfill that enqueues
  experiments with no summary chunks and no pending/processing job. It uses
  `operation='update'` (not `'create'`) precisely because the worker deletes existing
  chunks first, so a retry after an interrupted run can never collide with partial
  rows — the backfill is idempotent and safe to re-run any time (e.g. to pick up
  linked-title drift). `105` additionally re-enqueues the earlier failure classes
  (org-NULL and burst rate-limited embeddings) with freshly built payloads.

**Known: the queue loses roughly a quarter of its jobs, and always has.** As of
2026-07-31 `chunk_jobs` holds 414 `status='failed'` rows spanning *every* source
type, the oldest from 2026-03-13 — long before this slice existed.
`experiment_summary` inherits it at ~82 succeeded / 32 failed. Adding this producer
did not cause the failures, but it did add a sixth producer to a lossy queue.

Every one of those rows carries the same unhelpful string,
`"Failed to insert chunks into database"`, so none of them can be diagnosed after
the fact. The cause is a swallowed error, not a mystery:
`AI/catalyst/infra/db.py` `insert_chunks()` catches the real Postgres exception,
logs it to worker stdout, and returns a bare `bool`; `AI/worker/worker.py` then
writes that generic string into the row. Once stdout rotates the real reason is
gone. Fix it at the boundary — propagate the error text instead of a boolean —
before trying to interpret the backlog.

## 2. Focus signal — `recently_touched` + activity beacon

The recency half of the agent's focus signal: what entities the user just looked at
or edited.

- **Table** — `recently_touched` (migration `103`). Last-write-wins register:
  primary key `(user_id, entity_type, entity_id)`, so it holds **one row per (user,
  entity)** and is bounded by distinct entities per user — it is not an activity log
  and never needs cleanup. Owner-only RLS on all verbs. Read path is "top-10 by
  `touched_at DESC`" only, backed by `idx_recently_touched_user_time`. `entity_id` is
  polymorphic (no FK); deleted entities are tolerated — the retriever skips
  unresolvable ids at read time.

- **Beacon** — `components/activity-beacon.tsx` fires a fire-and-forget
  `navigator.sendBeacon("/api/activity/touch", …)` on route changes, mapping the URL
  to an `entity_type`/`entity_id` (`action` = `view` or `edit`). Gated by
  `NEXT_PUBLIC_ACTIVITY_BEACON` (default `false` in `.env.example`).

- **Endpoint** — `app/api/activity/touch/route.ts` validates the entity type (against
  a fixed allowlist) and a UUID `entity_id`, then upserts into `recently_touched`
  (`onConflict: user_id,entity_type,entity_id`). Owner-scoped by RLS; always answers
  fast and never surfaces errors to the UI.

Because the table is still empty, that upsert has never run against real data — so
its two silent preconditions were checked directly (2026-07-31): the live primary key
is exactly `(user_id, entity_type, entity_id)`, matching the `onConflict` target, and
RLS is on with all four owner policies present (the upsert needs both `INSERT` and
`UPDATE`). A mismatch on either would not fail until the first beacon fired.

## 3. Consolidation serialization — `claim_due_consolidations`

Chat sessions periodically consolidate into durable memory facts. Two workers
consolidating two different sessions of the **same user** concurrently could each
miss the reconcile match and write near-duplicate facts (the `073` content-hash index
only blocks exact duplicates).

- **RPC** — `claim_due_consolidations(p_max, p_stale_seconds, p_max_attempts)`
  (migration `104`, `SECURITY DEFINER`). Claims at most **one session per user per
  batch** and skips any user with a non-stale in-flight consolidation. Advisory xact
  locks can't span PostgREST's pooled requests, so this per-user serialization is the
  cheapest correct guard.
  - Eligible: sessions past `consolidate_due_at`, or crash-recovery sessions whose
    `consolidate_started_at` is older than `p_stale_seconds` and still under
    `consolidation_attempts < p_max_attempts`.
  - Ceiling: a same-instant claim by two workers on different sessions of one user
    remains theoretically possible; the next reconcile pass repairs it.

**This RPC has never executed in production.** As of 2026-07-31: zero sessions with
`consolidate_due_at` set, zero with `consolidate_started_at`, zero attempts. Nothing
schedules consolidation yet, so the whole path is unexercised.

That matters more than usual here, because `CREATE FUNCTION` cannot vouch for it.
plpgsql does not plan the SQL inside a function body at creation time, so an invalid
construct is accepted at migration time and only raises on the first real call — and
the first real call has not happened. The specific risk was the claim query's
`FOR UPDATE SKIP LOCKED` applied over a join against a CTE, which is not always
legal. `EXPLAIN` (which parse-analyzes without executing) settles it: the query
plans, and Postgres scopes the lock to `chat_sessions` alone rather than the CTE.
Postgres 17 additionally pushes a `Run Condition: row_number() <= 1` into the
`WindowAgg`, so it stops ranking early instead of walking every session.

Treat that as "provably well-formed", not "known to work". End-to-end behaviour is
still unproven.

## 4. Focus envelope forwarding

The focus signal is only useful if the agent is told what the user currently has
open. The frontend derives that from the route and sends it with every agent request.

- **Deriving the entity** — `lib/entity-from-path.ts` maps the current pathname
  (`/projects/…`, `/lab-notes/…`, `/protocols/…`, `/samples/…`, `/papers/…`,
  `/reports/…`) to an entity type and id.
- **Attaching it** — `lib/notes9-agent-request.ts` builds the `FocusEnvelope` onto
  the outgoing request; `hooks/use-agent-stream.ts` carries it through the stream.
- **Always sent, conditionally honoured** — the frontend does not gate on a flag. The
  envelope ships on every request and the *backend* ignores it while
  `NOTES9_FOCUS_ENVELOPE` is off, so scope is enforced server-side where it belongs.
  Sending it unconditionally is therefore safe, and turning the feature on is a
  backend-only change with no frontend deploy.

Note the flag lives in the Catalyst repo, not here — grepping this repo for
`NOTES9_FOCUS_ENVELOPE` finds only comments.

## Env / feature flags

All default to off. Each is exact-match on the string `"true"`; any other value,
including `"1"`, leaves the feature disabled.

| Var | Where | Default | Effect |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_ACTIVITY_BEACON` | Notes9 | `false` | Enables the client activity beacon that populates `recently_touched` (§2). |
| `NEXT_PUBLIC_ORG_COLLABORATION` | Notes9 | `false` | Reveals org invite/member UI. Off means collaboration is hidden, not broken. |
| `NOTES9_FOCUS_ENVELOPE` | **Catalyst** | off | Makes the backend *honour* the envelope the frontend already sends (§4). |

Suggested order to flip them: `NEXT_PUBLIC_ACTIVITY_BEACON` first, so
`recently_touched` has data to offer; then `NOTES9_FOCUS_ENVELOPE`, so the agent
starts weighting it. Reversing that order turns on scope weighting against an empty
focus table.

## Migrations

| # | File | Adds |
| --- | --- | --- |
| 102 | `scripts/102_experiment_summary_enqueue.sql` | `experiment_summary_payload` builder, enqueue trigger, re-runnable backfill. |
| 103 | `scripts/103_recently_touched.sql` | `recently_touched` table + owner-only RLS. |
| 104 | `scripts/104_claim_consolidations_per_user.sql` | `claim_due_consolidations` per-user serialization RPC. |
| 105 | `scripts/105_experiment_summary_org_fallback.sql` | Org fallback in the payload builder + re-enqueue of failed jobs. |

**All four are already applied in production** — confirmed 2026-07-31 by checking the
objects themselves (`experiment_summary_payload`,
`queue_experiment_summary_chunk_job`, `trg_experiment_summary_chunk`,
`claim_due_consolidations`, `finish_consolidation`) rather than trusting a migration
log. Shipping this slice needs no DDL step.

**Don't renumber these.** On `context_management` they sit next to migrations from
the unrelated data-analysis line, which was renumbered to `107`–`110` to clear a
filename collision. The context migrations kept `102`–`105` precisely because those
numbers are what production has already run; changing them would strand the applied
state.
