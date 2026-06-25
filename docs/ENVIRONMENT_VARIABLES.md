---
title: Environment Variables
created: 2026-06-24
updated: 2026-06-24
status: current
---

# Environment Variables

All variables are configured in `.env.local` (never committed). This file lists every variable found across `app/`, `lib/`, and `components/`. For each: purpose, required/optional, and which runtime uses it.

---

## Supabase

| Variable | Required | Runtime | Purpose |
|----------|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Client + Server | Supabase project URL (e.g. `https://<ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client + Server | Public anon key for Supabase JS client |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (server) | Server only | Elevated key — bypasses RLS. Used in cron jobs, seeding, service-level operations. **Never expose to the browser.** |
| `SUPABASE_JWT_SECRET` | Recommended | Server (middleware) | Enables local JWT verification in middleware, avoiding auth-server round-trips that exhaust connection slots. If absent, middleware falls back to `getUser()` (slower, uses a DB connection). |

---

## Catalyst AI Backend

| Variable | Required | Runtime | Purpose |
|----------|----------|---------|---------|
| `CHAT_API_URL` | Yes | Server | Base URL of the Catalyst FastAPI service (e.g. `https://<lambda-url>.on.aws`). Used by the Next.js SSE proxy at `app/api/agent/stream/`. Also exposed as `NEXT_PUBLIC_CHAT_API_URL` via `next.config.mjs` for direct client-side SSE. |
| `NEXT_PUBLIC_CHAT_API_URL` | Auto-derived | Client | Set by `next.config.mjs` from `CHAT_API_URL`. Allows the browser to connect directly to the Catalyst backend (bypasses Vercel Edge timeout for long streams). |
| `AI_SERVICE_URL` | Optional | Server | Alternate AI service URL used by some routes |
| `AI_SERVICE_BEARER_TOKEN` | Optional | Server | Bearer token for `AI_SERVICE_URL` authentication |
| `BIOMNI_FUNCTION_URL` | Optional | Server | Biomni agent Lambda URL |
| `CATALYST_URL` | Optional | Server | Alternative name for Catalyst backend URL (used by some routes) |
| `LITERATURE_BIOMNI_AGENT_URL` | Optional | Server | Literature search agent endpoint |
| `LITERATURE_BIOMNI_STREAM_URL` | Optional | Server | Literature search streaming endpoint |
| `LITERATURE_COMPARE_AGENT_URL` | Optional | Server | Literature comparison agent endpoint |
| `LITERATURE_COMPARE_STREAM_URL` | Optional | Server | Literature comparison streaming endpoint |

---

## AWS (Bedrock / Transcribe)

| Variable | Required | Runtime | Purpose |
|----------|----------|---------|---------|
| `AWS_REGION` | If AWS used | Server | AWS region (e.g. `us-east-1`) |
| `AWS_ACCESS_KEY_ID` | If AWS used | Server | AWS access key for Bedrock / Transcribe |
| `AWS_SECRET_ACCESS_KEY` | If AWS used | Server | AWS secret key |
| `AWS_SESSION_TOKEN` | If STS role | Server | Temporary session token (when using assumed roles) |

---

## Google OAuth

| Variable | Required | Runtime | Purpose |
|----------|----------|---------|---------|
| `GOOGLE_CLIENT_ID` | Yes (auth) | Server | Google OAuth client ID — for Google Sign-In. **Kept.** The `@google/generative-ai` Gemini dependency was removed, but Google sign-in remains. |
| `GOOGLE_CLIENT_SECRET` | Yes (auth) | Server | Google OAuth client secret |

---

## Email (Resend)

| Variable | Required | Runtime | Purpose |
|----------|----------|---------|---------|
| `RESEND_API_KEY` | Yes (email) | Server | Resend API key for transactional email |
| `RESEND_FROM_EMAIL` | Yes (email) | Server | Sender address for outgoing email |
| `CONTACT_TO_EMAIL` | Yes (email) | Server | Destination for contact form submissions |

---

## Collaboration

| Variable | Required | Runtime | Purpose |
|----------|----------|---------|---------|
| `NEXT_PUBLIC_COLLABORATION_URL` | Yes (collab) | Client | HocusPocus WebSocket URL for real-time collaborative editing |

---

## Literature / Academic APIs

| Variable | Required | Runtime | Purpose |
|----------|----------|---------|---------|
| `NCBI_API_KEY` | Optional | Server | NCBI/PubMed API key (increases rate limits) |
| `OPENALEX_CONTACT_EMAIL` | Optional | Server | Email polite pool for OpenAlex API |
| `UNPAYWALL_EMAIL` | Optional | Server | Email for Unpaywall open-access lookups |

---

## Limits and Feature Flags

| Variable | Required | Runtime | Purpose |
|----------|----------|---------|---------|
| `LIMITS_MODE` | Optional | Server | Controls the stateful limits system for agent calls (e.g. `shadow`, `enforce`) |
| `LIMITS_MODE_CHAT` | Optional | Server | Same as above but for the general chat endpoint |
| `NEXT_PUBLIC_GENERAL_CHAT_INCLUDE_HISTORY` | Optional | Client | Feature flag: whether general chat sends full history |
| `NEXT_PUBLIC_NOTES` | Optional | Client | Internal feature-flag notes (dev only) |
| `NOTES` | Optional | Server | Same flag, server side |

---

## Cron / Scheduled Jobs

| Variable | Required | Runtime | Purpose |
|----------|----------|---------|---------|
| `CRON_SECRET` | Yes (cron) | Server | Bearer secret that Vercel Cron passes to `/api/cron/*` routes to authenticate scheduled invocations |
| `AGENT_DRAFT_CLEANUP_BATCH` | Optional | Server | Max rows per draft artifact cleanup run |
| `AGENT_DRAFT_CLEANUP_MAX_ROWS` | Optional | Server | Total row cap for draft cleanup |
| `CHAT_ATTACHMENT_CLEANUP_BATCH` | Optional | Server | Batch size for chat attachment cleanup cron |
| `CHAT_ATTACHMENT_CLEANUP_MAX_ROWS` | Optional | Server | Total cap for chat attachment cleanup |

---

## Redis

| Variable | Required | Runtime | Purpose |
|----------|----------|---------|---------|
| `REDIS_URL` | Optional | Server | Redis connection URL — used for stream resumption state and rate-limiting where enabled |

---

## App

| Variable | Required | Runtime | Purpose |
|----------|----------|---------|---------|
| `NEXT_PUBLIC_APP_URL` | Yes | Client + Server | Canonical public URL of the app (e.g. `https://app.notes9.com`). Used for share links, OAuth redirects. |
| `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` | Dev only | Client | Override OAuth redirect URL in local development |
| `NEXT_PUBLIC_SURVEY_FORM_URL` | Optional | Client | External survey form URL shown post-onboarding |
| `NODE_ENV` | Auto | Both | `development` / `production` — set by Next.js automatically |

---

## Example `.env.local`

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_JWT_SECRET=<jwt-secret>

# Catalyst AI
CHAT_API_URL=https://<lambda-url>.on.aws

# Google OAuth
GOOGLE_CLIENT_ID=<client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<client-secret>

# Email
RESEND_API_KEY=re_<key>
RESEND_FROM_EMAIL=no-reply@notes9.com
CONTACT_TO_EMAIL=admin@your-domain.com

# Cron
CRON_SECRET=<random-secret>

# Collaboration
NEXT_PUBLIC_COLLABORATION_URL=wss://collab.notes9.com

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> **Never commit `.env.local`.** It is listed in `.gitignore`.
