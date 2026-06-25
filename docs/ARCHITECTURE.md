---
title: Architecture
created: 2026-06-24
updated: 2026-06-24
status: current
---

# Architecture

Notes9 is a Next.js 16 Electronic Lab Notebook (ELN) with an AI research assistant called **Catalyst**. The frontend is a single Vercel deployment; Catalyst runs as a separate FastAPI service (in the sibling `AI/` repository).

---

## Component Diagram

```mermaid
graph TD
    subgraph Browser
        UI[Next.js App\nReact 19 / Tailwind / shadcn]
    end

    subgraph Vercel
        NEXT[Next.js Edge + Node Functions\napp/ routes]
    end

    subgraph Supabase
        DB[(PostgreSQL\n+ RLS)]
        AUTH[Auth Service]
        STORAGE[Object Storage\n'user' bucket — private]
        REALTIME[Realtime\nWS subscriptions]
    end

    subgraph Catalyst AI — separate repo AI/
        FASTAPI[FastAPI\nPython service]
        BEDROCK[AWS Bedrock\nClaude]
    end

    subgraph Collaboration
        HOCUSPOCUS[HocusPocus Server\ncollaboration-server/]
    end

    UI -->|HTTPS| NEXT
    NEXT -->|Supabase JS client| DB
    NEXT -->|service_role key| DB
    NEXT -->|SSE proxy| FASTAPI
    UI -->|SSE direct\nNEXT_PUBLIC_CHAT_API_URL| FASTAPI
    FASTAPI --> BEDROCK
    FASTAPI --> DB
    UI -->|Yjs WebSocket\nNEXT_PUBLIC_COLLABORATION_URL| HOCUSPOCUS
    HOCUSPOCUS --> DB
    UI -->|auth cookie| AUTH
    NEXT -->|JWT local-verify\nSUPABASE_JWT_SECRET| AUTH
    UI --> REALTIME
    UI -->|signed URLs| STORAGE
```

---

## Next.js Route Groups

All routes live under `app/`:

| Route Group | Path | Purpose |
|-------------|------|---------|
| `(app)` | `app/(app)/` | Authenticated app — dashboard, projects, experiments, lab notes, samples, protocols, papers, equipment, research map, Catalyst chat, reports, settings |
| `(marketing)` | `app/(marketing)/` | Public marketing pages — excluded from all audits per standing decision |
| `(legal)` | `app/(legal)/` | Privacy policy, terms of service |
| `auth/` | `app/auth/` | Login, signup, password reset, OAuth callbacks |
| `api/` | `app/api/` | Server-side API routes |
| `share/` | `app/share/` | Public read-only share links |
| `agent-studio/` | `app/agent-studio/` | Internal agent debugging surface |
| `survey/` | `app/survey/` | User survey (public) |

### App route contents (`app/(app)/`)

```
catalyst/          — Catalyst AI chat
dashboard/         — Home dashboard
data/              — Experiment data files
equipment/         — Lab equipment management
experiments/       — Experiment CRUD + detail
lab-notes/         — Individual lab note editor
lab-notes-list/    — Lab notes list view
literature-reviews/— Literature search + review
org/               — Organization management
papers/            — Paper library
projects/          — Project management (top-level entity)
protocols/         — Protocol management + template library
reports/           — Generated reports
research-map/      — ReactFlow relationship graph
samples/           — Sample management
settings/          — User/org settings
```

### API routes (`app/api/`)

| Path | Purpose |
|------|---------|
| `api/agent/stream/` | **Primary Catalyst SSE proxy** (Edge runtime, passes through to `CHAT_API_URL/notes9/stream`) |
| `api/agent/run/` | Agent run status |
| `api/agent/runs/` | List agent runs |
| `api/agent/artifacts/` | Draft artifact management |
| `api/ai/` | Misc AI utilities |
| `api/aws-transcribe/` | Voice-to-text |
| `api/chat/` | General LLM chat (non-agent) |
| `api/context/` | Context resolution |
| `api/cron/` | Scheduled cleanup jobs |
| `api/data-transfer/` | Data import/export |
| `api/experiments/` | Experiment server actions |
| `api/export-docx/` | DOCX export |
| `api/files/` | File registration + signed URL generation |
| `api/import/` | Data import |
| `api/literature/` | Literature search |
| `api/org/` | Organisation management |
| `api/paper-abstract/` | Paper abstract fetching |
| `api/protocol-templates/` | Protocol template operations |
| `api/reports/` | Report generation |
| `api/research-map/` | Research map realtime |
| `api/resolve-scope/` | Agent scope resolution |
| `api/search/` | Global search |
| `api/search-papers/` | Paper search |
| `api/share/` | Share link management |
| `api/telemetry/` | Usage event ingest |
| `api/vote/` | Feedback voting |

---

## Authentication

Auth is handled by **Supabase Auth** (JWT + cookie). The middleware in `lib/supabase/middleware.ts` runs on every protected request:

1. Public routes (`/`, `/about`, `/pricing`, etc.) and `/auth/*` skip heavy auth checks.
2. For protected routes the middleware calls `supabase.auth.getSession()` to get the access token.
3. If `SUPABASE_JWT_SECRET` is set, the token is **verified locally** via `lib/auth/verify-token.ts` (HMAC-SHA256 — no auth-server round-trip, no DB connection consumed).
4. If the secret is absent, it falls back to `supabase.auth.getUser()` (an auth-server call that consumes a connection slot).
5. Auth failures redirect to `/auth/login?next=<returnPath>`.

> **Why local verification?** A prior incident where `getUser()` was called in middleware and 45+ other files saturated Supabase connection slots and made the app unhealthy. Local JWT verification eliminates those round-trips. See memory note `project_supabase_unhealthy_getuser.md`.

---

## Supabase Integration

### Client-side

- `lib/supabase/client.ts` — browser Supabase client (anon key, cookie-based session)
- Used in React components and hooks

### Server-side

- `lib/supabase/server.ts` — server Supabase client (anon key, server cookies)
- Used in Server Components and Route Handlers
- For elevated operations: `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS — used sparingly)

### Row Level Security

All 19+ core tables have RLS enabled. The security model is org-scoped: every row is readable/writable only to members of the owning organization. See `docs/row-level-security-policies.md` and `docs/rls-quick-reference.md` for full policy listings.

### Realtime

The research map and some collaborative features use Supabase Realtime (WebSocket subscriptions) for live updates.

### Storage

The `user` bucket is **private**. File URLs are always **signed** (via `/api/files/sign`) — `getPublicUrl` must never be used for this bucket. File rows are registered via `/api/files/register`. See memory note `project_chat_attachments_signed_urls.md`.

---

## Catalyst AI Integration

Catalyst is a separate Python FastAPI service in the sibling `AI/` repository, deployed independently (currently on an AWS Lambda Function URL). The frontend integrates it via SSE.

### SSE Streaming Path

```
Browser (useAgentStream hook)
  → POST /api/agent/stream (Next.js Edge route — auth check, rate/size limits)
    → POST CHAT_API_URL/notes9/stream (FastAPI — SSE)
      ← SSE event stream (pipe-through, Edge runtime for true streaming)
  ← SSE tokens land in browser with no buffering
```

The proxy exists to:
- Add authentication (`Authorization: Bearer <supabase-access-token>`)
- Enforce pre-parse body-size limits
- Keep `CHAT_API_URL` server-side (not in client bundle)
- Avoid Vercel function timeout (Edge runtime, 300s max)

Client-side SSE (direct to `NEXT_PUBLIC_CHAT_API_URL`) is also supported for environments where the Edge proxy adds unnecessary latency.

### SSE Event Contract

Defined in `lib/agent-stream-types.ts` (mirrored from `AI/catalyst/agents/core/sse_schema.py`).

Key events in order: `run_started` → `thinking` → `thinking_token` → `tool_start` → `tool_call` → `tool_result` → `synthesis_plan` / `synthesis_step` → `token` → `citations_update` → `citations_manifest` → `artifact` / `graph` → `done` (or `error`).

See `docs/CATALYST_INTEGRATION.md` for full details.

---

## Major Subsystems

### Tiptap Editor

Rich text editing for lab notes and protocols. Tiptap v3 with 20+ extensions. Custom table resize/add/delete UI in `components/text-editor/table-controls.tsx`. Collaboration via HocusPocus + Yjs (separate `collaboration-server/`). See `docs/tiptap.md`.

### Research Map

ReactFlow (`reactflow`) renders the knowledge graph. Nodes represent entities (protocols, experiments, papers, samples, lab notes, reports, etc.). Edges are typed relationships. Layout uses dagre. Realtime updates via Supabase Realtime. Native graph SSE events from Catalyst (`event: graph`) render as inline dagre graphs in chat.

### Catalyst Chat

Streaming chat surface powered by the Catalyst agent. Core hooks: `hooks/use-agent-stream.ts` (SSE parser), `hooks/use-smooth-text-stream.ts` (RAF-batched token rendering). Features: live tool cards (Cursor-style), synthesis checklist, per-claim span citations + grounding badges, artifact file cards, reasoning panel, Stop/Cancel, pinned auto-scroll.

### Citations and Grounding

Every assistant answer can carry `GroundingResource` objects (defined in `lib/agent-stream-types.ts`). Each resource may include `cited_text`, `char_start`, `char_end`, `support_score`, `support_status` (supported/partial/unsupported), and `grounding` (native/heuristic/none). The UI renders inline `[N]` citation chips, a citations panel, and a span-highlight viewer.

### Telemetry

`usage_events` table + `/api/telemetry/` ingest usage product metrics. The Nani dashboard (Next.js app planned at `/ELN/Nani`) consumes aggregated views.

---

## Key Config Files

| File | Purpose |
|------|---------|
| `next.config.mjs` | `ignoreBuildErrors: true` (collaboration-server excluded from tsc); `NEXT_PUBLIC_CHAT_API_URL` env exposure; 20 MB body limits; `optimizePackageImports` for lucide-react etc.; Turbopack Node built-in stubs |
| `lib/supabase/middleware.ts` | Auth gate — local JWT verification |
| `lib/agent-stream-types.ts` | SSE event contract (TypeScript mirror of Python schema) |
| `tsconfig.json` | Excludes `collaboration-server/` from type-checking |

---

## Deployment

- **Frontend:** Vercel (Next.js, Edge + Node runtimes)
- **Database:** Supabase (hosted Postgres + RLS + Auth + Storage + Realtime)
- **Catalyst AI backend:** AWS Lambda (FastAPI, separate `AI/` repo)
- **Collaboration server:** Separate deployment (`collaboration-server/`)

See `docs/DEPLOYMENT.md` for environment variables and deploy steps.
