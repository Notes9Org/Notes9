---
title: Glossary
created: 2026-06-24
updated: 2026-06-24
status: current
---

# Glossary

Domain terms used throughout the Notes9 codebase and documentation.

---

## Catalyst

The AI research assistant embedded in Notes9. It is a multi-tool ReAct agent running as a separate FastAPI service (sibling `AI/` repo). It can search the team's own research records via RAG and SQL, search the web, generate files (PDF/DOCX/XLSX/charts), map relationships, and recall past conversation context. The public brand name is "Catalyst"; internally it is sometimes called the "agent" or "Biomni" (an earlier iteration name still visible in some env vars and table names).

See `docs/CATALYST_INTEGRATION.md` for integration details.

---

## Chat Session

A conversation thread between a user and Catalyst. Persisted in `chat_sessions` (one row per thread) and `chat_messages` (one row per message). The `metadata` JSONB column on assistant messages carries the full structured payload: citations, grounding, artifacts, tool call summaries. Sessions never hard-cap — long sessions roll into `chat_episode_summaries` for compression.

---

## Citation

A reference from a specific claim in a Catalyst answer to a specific span of text in a source record (lab note, paper, sample, etc.). Represented as a `GroundingResource` object in `lib/agent-stream-types.ts`. Each citation can carry `cited_text` (the exact supporting sentence), `char_start/end` (position in the source), `support_score` (0–1 confidence), `support_status` (supported / partial / unsupported), and `grounding` (how the span was located: native / heuristic / none).

Distinct from a literature reference (a `literature_reviews` row).

---

## Draft / Commit Model (Lab Note)

Lab notes use a two-phase save model to prevent data loss:

1. **Draft** — Tiptap's `onUpdate` fires on every keystroke and autosaves to `lab_notes.draft_content`. This is invisible to other users and does not create an audit record.
2. **Commit** — An explicit "Save" action copies `draft_content` → `lab_notes.content`, creates a `document_versions` audit row with diff stats, and clears the draft.
3. **Discard** — Reverts `draft_content` back to `content` without saving.

This mirrors a draft/commit model in version control: the draft is the working tree, the content column is HEAD.

---

## Experiment

A research experiment within a Project. Has a lifecycle status (planned → in_progress → data_ready → analyzed → completed / cancelled). Can contain lab notes, samples, data files, protocol links, assays, equipment usage records, and steps. Represented in the `experiments` table.

---

## Grounding / GroundingResource

The process of binding each claim in a Catalyst answer to a specific field-value span in a source database record. "Grounding" refers both to the process and to the `grounding` field on a `GroundingResource` object (`'native'` = model-native citation, `'heuristic'` = regex/fuzzy match, `'none'` = not located).

`GroundingResource` is the canonical citation wire type in `lib/agent-stream-types.ts`, superseding the older `Citation` alias (kept for backward compatibility).

---

## Lab Note

A rich-text document attached to an experiment or project. Stored in the `lab_notes` table. Content is in Tiptap JSON format (`editor_data` JSONB column). Note types: observation, analysis, conclusion, general. See "Draft / Commit Model" above.

---

## Organization

The top-level multi-tenant boundary. Every user belongs to exactly one organization. All research data (projects, experiments, samples, protocols, equipment, etc.) is scoped to an organization via `organization_id`. RLS policies enforce this at the database level.

---

## Organization Scope

When the Catalyst agent executes a query, it receives the user's `organization_id` (and optionally project IDs and experiment IDs) as the "scope". This ensures the agent only searches data belonging to the user's organization and the projects they are members of. Scope is resolved server-side via `/api/resolve-scope` before being forwarded to the Catalyst backend.

---

## Project

The primary container for research work within an organization. Contains experiments, protocols, literature reviews, papers, and reports. Users access projects via `project_members` (roles: lead / member / observer). Project membership is the inner RLS boundary — experiments and lab notes check `project_members` not just `organization_id`.

---

## Protocol

A Standard Operating Procedure (SOP). Org-scoped, versioned (`version` text column), reusable. Can be linked to projects and experiments via join tables. Protocols use the Tiptap editor and the same draft/commit model as lab notes. Protocol document templates (uploaded DOCX/PDF) can be used to seed protocol content.

---

## RLS (Row Level Security)

A PostgreSQL feature that restricts which rows each database role can see or modify. Notes9 has RLS enabled on all user-data tables. The two main scopes are:
- **Org-scoped**: row visible if `organization_id` matches the authenticated user's org.
- **Project-scoped**: row visible if the user is in `project_members` for the row's project.

The Supabase `authenticated` role is used for all user queries; the `service_role` key bypasses RLS (used only in server-side cron jobs and agent telemetry writes).

See `docs/row-level-security-policies.md` and `docs/rls-quick-reference.md`.

---

## Research Map

A knowledge graph visualized with ReactFlow in `app/(app)/research-map/`. Nodes represent entities (projects, experiments, lab notes, papers, samples, protocols, reports, etc.). Edges are typed relationships. Layout uses the dagre algorithm. Realtime updates come via Supabase Realtime subscriptions. Catalyst can also generate and emit relationship graphs as `graph` SSE events for inline dagre rendering in chat.

---

## Sample

A biological or chemical sample tracked within an experiment. Stored in the `samples` table with status tracking and linkage to experiments and projects.

---

## SSE (Server-Sent Events)

The streaming protocol used between the Next.js frontend and the Catalyst backend. The client opens a long-lived HTTP connection; the server pushes `event: <type>\ndata: <json>\n\n` frames. Notes9 uses SSE (not WebSocket) for the agent stream because it is unidirectional (server → client), fits naturally in HTTP/2, and works through Vercel's Edge runtime without buffering.

---

## Tiptap

The rich text editor used for lab notes, protocols, and collaborative papers. MIT-licensed, built on ProseMirror. Version 3.x. Content is stored as Tiptap JSON (not HTML). Collaboration is via Yjs + HocusPocus. See `docs/tiptap.md`.

---

## Usage Events

Product telemetry events emitted when users take significant actions (starting a chat, generating a file, saving a lab note, etc.). Stored in the `usage_events` table. The Nani dashboard consumes aggregated views of this data. Completely separate from the Catalyst agent telemetry (`agent_runs`, `agent_llm_calls`, etc.).
