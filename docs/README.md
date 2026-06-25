---
title: Documentation Index
created: 2026-06-24
updated: 2026-06-24
status: current
---

# Notes9 Documentation

Notes9 is an Electronic Lab Notebook (ELN) for research teams, with an AI research assistant called **Catalyst**. It is built on Next.js 16, React 19, TypeScript 5, Tailwind + shadcn/ui, Supabase (Postgres + RLS + Realtime + Storage), and Tiptap. Catalyst is a separate FastAPI service in the sibling `AI/` repository.

---

## Architecture

Start here to understand how the system fits together.

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Route groups, Supabase integration, auth model, Catalyst SSE path, major subsystems, key config files.

---

## Setup

- **[SETUP.md](./SETUP.md)** — Prerequisites, clone + install, env vars, schema migration, `pnpm dev`, type-checking, tests, collaboration server, Catalyst backend.
- **[ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md)** — Every `process.env.*` variable in the codebase: purpose, required/optional, runtime (client vs server).
- **[database-connection-guide.md](./database-connection-guide.md)** — psql setup, direct vs pooler connections, running migrations, RLS diagnostics.

---

## Data Model

- **[DATA_MODEL.md](./DATA_MODEL.md)** — Table reference, ER diagram, RLS scoping model. Derived from `scripts/000_full_script.sql`.
- **[row-level-security-policies.md](./row-level-security-policies.md)** — Full RLS policy listing for all 19+ tables.
- **[rls-quick-reference.md](./rls-quick-reference.md)** — Diagnostic SQL for testing RLS policies interactively.

---

## Features

### Tiptap Editor
- **[tiptap.md](./tiptap.md)** — Installed extensions, data storage format (Tiptap JSON in `editor_data`), draft/commit model, collaboration (HocusPocus + Yjs), bundle size notes.

### Catalyst AI
- **[CATALYST_INTEGRATION.md](./CATALYST_INTEGRATION.md)** — SSE event contract, frontend components, chat sessions, citations/grounding, artifacts, Stop/Cancel, graph events, feature flags.
- **[AGENT_STREAM_API.md](./AGENT_STREAM_API.md)** — HTTP endpoint reference for the Catalyst streaming API, including request/response shapes and a full TypeScript parsing example.
- **[CATALYST_CHAT_UX_AUDIT.md](./CATALYST_CHAT_UX_AUDIT.md)** — Capability surfacing audit: what the backend emits vs what the UI shows. The authoritative gap list.

### Research Map
The ReactFlow knowledge graph lives at `app/(app)/research-map/`. See `ARCHITECTURE.md` → "Research Map" subsystem.

### File Uploads
- **[file-upload-implementation.md](./file-upload-implementation.md)** — Storage bucket setup, signed URL flow, file registration API.

---

## Operations

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Vercel deploy, `ignoreBuildErrors` rationale, SQL migration process, Catalyst + collaboration server deployment, health checks.
- **[ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md)** — (same as Setup → required prod vars section)

---

## Reference

### TABLE_* docs (Tiptap table feature)
These docs cover the custom table resize/add/delete UI built on top of the Tiptap table extension:

- [TABLE_README.md](./TABLE_README.md) — Feature overview
- [TABLE_QUICK_REFERENCE.md](./TABLE_QUICK_REFERENCE.md) — Keyboard shortcuts and controls
- [TABLE_FEATURES.md](./TABLE_FEATURES.md) — Feature breakdown
- [TABLE_UI_LAYOUT.md](./TABLE_UI_LAYOUT.md) — Visual design / layout guide
- [TABLE_CODE_EXAMPLES.md](./TABLE_CODE_EXAMPLES.md) — Code patterns
- [TABLE_INSTALLATION.md](./TABLE_INSTALLATION.md) — Integration checklist
- [TABLE_IMPLEMENTATION_SUMMARY.md](./TABLE_IMPLEMENTATION_SUMMARY.md) — Technical overview
- [TABLE_INDEX.md](./TABLE_INDEX.md) — Navigation index

### Other reference
- **[GLOSSARY.md](./GLOSSARY.md)** — Domain terms: Catalyst, Citation, GroundingResource, Lab Note, Organization scope, Protocol, RLS, Research Map, SSE, Tiptap, and more.
- **[NOTES9_AI_PRODUCT_UX_CHANGES.md](./NOTES9_AI_PRODUCT_UX_CHANGES.md)** — 2026-06-17 AI product design audit: locked decisions, build sequence (Waves 0–6), gap analysis.
- **[FRONTEND_INTEGRATION_GUIDE.md](./FRONTEND_INTEGRATION_GUIDE.md)** — Full frontend integration guide: Chat API, Agent API, auth headers, error handling.
- **[scale.md](./scale.md)** — Scaling considerations.
- **[storage-decision.md](./storage-decision.md)** — Storage architecture decisions.

---

## Archive

Stale or superseded documents are in **[archive/](./archive/)** with a README explaining why each was archived.

---

## How Docs Are Maintained

- Update the `updated:` frontmatter date whenever you edit a doc.
- Change `status:` from `current` to `stale` when a doc is no longer accurate but not yet worth replacing.
- Move genuinely superseded docs to `docs/archive/` and add a line to `docs/archive/README.md`.
- Ground everything in actual code. Mark anything unverifiable as `> TODO: confirm`.
