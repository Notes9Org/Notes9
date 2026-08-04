# Context Management

How Notes9 keeps the agent's retrieval context fresh: what the user is working on
right now (focus signal) and a searchable summary of every experiment. This is the
"context backend" slice work (migrations `102`–`105`).

All source-of-truth lives in Postgres; the embedding worker and retriever are the
Python side (Catalyst / `core/retriever.py`). The pieces below are the DB triggers,
tables, RPCs, and the one frontend beacon that feed it.

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

## Env / feature flags

| Var | Default | Effect |
| --- | --- | --- |
| `NEXT_PUBLIC_ACTIVITY_BEACON` | `false` | Enables the client activity beacon that populates `recently_touched`. |

## Migrations

| # | File | Adds |
| --- | --- | --- |
| 102 | `scripts/102_experiment_summary_enqueue.sql` | `experiment_summary_payload` builder, enqueue trigger, re-runnable backfill. |
| 103 | `scripts/103_recently_touched.sql` | `recently_touched` table + owner-only RLS. |
| 104 | `scripts/104_claim_consolidations_per_user.sql` | `claim_due_consolidations` per-user serialization RPC. |
| 105 | `scripts/105_experiment_summary_org_fallback.sql` | Org fallback in the payload builder + re-enqueue of failed jobs. |
