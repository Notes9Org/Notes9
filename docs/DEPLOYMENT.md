---
title: Deployment
created: 2026-06-24
updated: 2026-06-24
status: current
---

# Deployment

Notes9 has three independently deployed services:

| Service | Host | Repo |
|---------|------|------|
| Next.js frontend | Vercel | This repo (`Notes9/`) |
| Catalyst AI backend | AWS Lambda (FastAPI) | Sibling `AI/` repo |
| Collaboration server | Separate host | `Notes9/collaboration-server/` |

---

## Next.js Frontend (Vercel)

### Deploy steps

1. Push to the main branch (or open a PR — Vercel creates a preview deployment automatically).
2. Vercel runs `pnpm build` → `next build`.
3. `ignoreBuildErrors: true` in `next.config.mjs` means TypeScript errors do **not** block the Vercel build. The real type gate is `pnpm typecheck` (`tsc --noEmit`), which should be clean before merging.

> **Why `ignoreBuildErrors: true`?** The `collaboration-server/` directory is a sibling Next.js-adjacent service with its own `package.json`. Its dependencies (`@tiptap/html`, `y-prosemirror`) are not installed in the Vercel build environment, so `next build` would fail trying to type-check them. The `tsconfig.json` `exclude: ["collaboration-server"]` keeps `tsc --noEmit` clean; `ignoreBuildErrors` keeps the Vercel build clean. The quality gate is always `tsc --noEmit`.

### Required production environment variables

Set these in Vercel → Project → Settings → Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET           ← critical for auth performance (local JWT verify)
NEXT_PUBLIC_APP_URL           ← canonical public URL
CHAT_API_URL                  ← Catalyst FastAPI Lambda URL
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
RESEND_API_KEY
RESEND_FROM_EMAIL
CONTACT_TO_EMAIL
CRON_SECRET
NEXT_PUBLIC_COLLABORATION_URL
```

See `docs/ENVIRONMENT_VARIABLES.md` for the full list.

### Cron jobs

Scheduled cleanup routes live under `app/api/cron/`. They are triggered by Vercel Cron (configured in `vercel.json` or the Vercel dashboard). Each route checks `Authorization: Bearer <CRON_SECRET>`.

Current cron jobs:
- Draft artifact cleanup (stale unreferenced drafts from agent-generated files)
- Chat attachment cleanup

### Edge vs Node runtimes

The agent stream route (`app/api/agent/stream/route.ts`) runs on the **Edge runtime** (`export const runtime = 'edge'`). This eliminates Node's ReadableStream buffering so SSE tokens arrive in the browser one by one rather than in a burst. All other API routes use the default Node runtime.

---

## SQL Migrations

Migrations are SQL files in `scripts/`. The baseline is `scripts/000_full_script.sql`. Incremental migrations are numbered `scripts/001_...`, `scripts/002_...`, etc.

**There is no auto-migration runner** — migrations are applied manually via psql or the Supabase SQL Editor. Apply in numeric order.

### Before writing a new migration

1. Read `scripts/000_full_script.sql` to understand the live schema.
2. Read all existing numbered `scripts/0XX_*.sql` files.
3. Never infer column names, FK names, or policy names from memory — always read the baseline first.
4. For seeding data as a user (not postgres), use `set_config` to set `request.jwt.claims` before inserts, because service-role seeding bypasses RLS and may produce misleading results. See memory note `project_projects_rls_recursion_bug.md`.

### Applying a migration

```bash
PGPASSWORD='<db-password>' psql \
  -h db.<project-ref>.supabase.co -p 5432 -U postgres -d postgres \
  -f scripts/083_my_migration.sql
```

See `docs/database-connection-guide.md` for full psql setup.

---

## Catalyst AI Backend

Deployed as an AWS Lambda Function URL (FastAPI + Mangum). The URL is stable across redeployments unless the Lambda or Function URL resource is recreated. Set `CHAT_API_URL` in Vercel to point to the current URL.

Refer to the `AI/` repository for:
- Deploy instructions
- Required environment variables (Bedrock credentials, Supabase service role key, etc.)
- Migration of the `AI/.venv` Python environment

---

## Collaboration Server

The `collaboration-server/` directory is a HocusPocus WebSocket server. It is a separate Node.js service that must be deployed separately (e.g., on a VPS, Railway, or Fly.io). Set `NEXT_PUBLIC_COLLABORATION_URL` in Vercel to point to its deployed WebSocket URL.

The collaboration server is **not** type-checked or built by Vercel. Its `node_modules` are never installed in the Vercel build environment by design.

---

## Health Checks

| Check | Command |
|-------|---------|
| TypeScript clean | `pnpm typecheck` → must return 0 errors |
| Tests passing | `pnpm test` |
| Build succeeds | `pnpm build` (ignoreBuildErrors=true, so this is always green if tsc passes) |
| Supabase connectivity | Check `NEXT_PUBLIC_SUPABASE_URL` responds; `getSession()` works |
| Catalyst reachable | `curl -X POST $CHAT_API_URL/health` (or equivalent) |
