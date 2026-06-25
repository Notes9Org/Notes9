---
title: Setup
created: 2026-06-24
updated: 2026-06-24
status: current
---

# Setup

This guide covers getting a local Notes9 development environment running from scratch.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20+ (LTS) | Use `nvm` or `fnm` for version management |
| pnpm | 9+ | `npm install -g pnpm` |
| Git | Any recent | |
| Supabase account | — | For a development project |

Optional (if running collaboration features locally):

| Tool | Notes |
|------|-------|
| Node.js (same) | The `collaboration-server/` service also runs on Node |

---

## 1. Clone and Install

```bash
git clone <repo-url> Notes9
cd Notes9
pnpm install
```

> The `collaboration-server/` directory has its own `package.json` and is **excluded** from the root `tsconfig.json` and from the Vercel build. Install its dependencies separately if you need real-time collaboration locally:
>
> ```bash
> cd collaboration-server
> pnpm install
> cd ..
> ```

---

## 2. Configure Environment Variables

Copy the example and fill in your values:

```bash
cp .env.example .env.local   # if .env.example exists, otherwise create .env.local
```

**Minimum required to start the app:**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_JWT_SECRET=<jwt-secret>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

For Catalyst AI chat to work, also set:

```bash
CHAT_API_URL=https://<catalyst-lambda-url>.on.aws
```

See `docs/ENVIRONMENT_VARIABLES.md` for the full variable list.

---

## 3. Apply the Database Schema

If you are setting up a fresh Supabase project:

```bash
# Apply baseline schema
PGPASSWORD='<db-password>' psql \
  -h db.<project-ref>.supabase.co -p 5432 -U postgres -d postgres \
  -f scripts/000_full_script.sql

# Then apply any numbered incremental migrations in order
for script in scripts/0[0-9][0-9]_*.sql; do
  echo "Applying $script ..."
  PGPASSWORD='<db-password>' psql \
    -h db.<project-ref>.supabase.co -p 5432 -U postgres -d postgres \
    -f "$script"
done
```

See `docs/database-connection-guide.md` for psql setup and troubleshooting.

---

## 4. Start the Development Server

```bash
pnpm dev
```

The app starts at [http://localhost:3000](http://localhost:3000).

> **Note:** `pnpm dev` uses Turbopack. If you hit a Turbopack-specific build error with a third-party package, check `next.config.mjs` — there are already aliases for common Node built-ins (`fs`, `path`, `worker_threads`). Add new stubs in `lib/stubs/` if needed.

---

## 5. Type-Checking

The real type gate for this project is `tsc --noEmit`, not `next build`:

```bash
pnpm typecheck
# or
pnpm exec tsc --noEmit
```

`next build` (and `ignoreBuildErrors: true` in `next.config.mjs`) is intentionally permissive because the `collaboration-server/` sibling service has packages that are not installed in the Vercel Next.js build environment. The `tsconfig.json` excludes `collaboration-server/` so `tsc --noEmit` stays clean.

---

## 6. Tests

```bash
pnpm test          # run once (vitest)
pnpm test:watch    # watch mode
```

---

## 7. Linting

```bash
pnpm lint          # eslint
```

> Note: as of the last audit, `eslint` is configured but there are known no-op ESLint rules. A full lint pass is informational rather than a hard gate. `tsc --noEmit` is the authoritative quality gate.

---

## 8. Collaboration Server (optional)

If you need real-time Tiptap collaboration locally:

```bash
cd collaboration-server
pnpm install
pnpm dev        # starts HocusPocus WebSocket server
```

Set in your root `.env.local`:

```bash
NEXT_PUBLIC_COLLABORATION_URL=ws://localhost:1234
```

---

## 9. Catalyst AI Backend (optional)

The Catalyst AI backend lives in the sibling `AI/` repository and is a separate Python FastAPI service. It is not required to run the app — Catalyst chat will simply fail gracefully if `CHAT_API_URL` is not set or unreachable.

Refer to the `AI/` repo README for setup. It requires:
- Python 3.11+
- A virtual environment at `AI/.venv`
- AWS credentials (Bedrock) or Anthropic API key
- Its own `.env`

Once running locally, point the Next.js app at it:

```bash
CHAT_API_URL=http://localhost:8000
```

---

## Useful Scripts

| Script | Command |
|--------|---------|
| Start dev server | `pnpm dev` |
| Type-check | `pnpm typecheck` |
| Build (Vercel) | `pnpm build` |
| Run tests | `pnpm test` |
| Watch tests | `pnpm test:watch` |
| Lint | `pnpm lint` |
| Capture screenshots | `pnpm capture:screenshots` |
