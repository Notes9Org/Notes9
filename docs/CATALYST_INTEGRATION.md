---
title: Catalyst Integration
created: 2026-06-24
updated: 2026-06-24
status: current
---

# Catalyst Integration

Catalyst is Notes9's AI research assistant. It runs as a separate FastAPI service (in the sibling `AI/` repository) and communicates with the Next.js frontend over Server-Sent Events (SSE).

See also: `docs/AGENT_STREAM_API.md` (endpoint reference) and `docs/CATALYST_CHAT_UX_AUDIT.md` (capability audit with surfacing status).

---

## Overview

```
User types query in Catalyst chat
  → useAgentStream hook (hooks/use-agent-stream.ts)
    → POST /api/agent/stream (Next.js Edge route)
      → POST CHAT_API_URL/notes9/stream (FastAPI SSE)
        → Catalyst agent: ReAct loop, tools, Bedrock Claude
      ← SSE event stream (pipe-through)
    ← SSE events rendered by agent-stream-reply.tsx
```

The Next.js proxy (`app/api/agent/stream/route.ts`) runs on the **Edge runtime** so SSE chunks are flushed immediately without Node buffering. It attaches the Supabase JWT and enforces pre-parse body size limits.

---

## SSE Event Contract

Defined in `lib/agent-stream-types.ts` — a TypeScript mirror of `AI/catalyst/agents/core/sse_schema.py`. **Both files must stay in sync.** Contract tests in `tests/` enforce this.

### Event order (typical)

```
run_started   → agent run ID (enables Stop/Cancel)
thinking      → agent reasoning steps (node, stage, message, structured fields)
thinking_token→ chain-of-thought token deltas (rendered in reasoning panel)
tool_start    → a tool invocation has begun (label for the card)
tool_call     → tool completed summary (latency_ms, citations_count)
tool_result   → tool detail (source_names, preview)
synthesis_plan→ ordered checklist for multi-step synthesis
synthesis_step→ one checklist step status changed (pending/active/done)
token         → answer text delta (append to answer buffer)
citations_update → running citation count
citations_manifest → full citation map
artifact      → generated file (PDF/DOCX/XLSX/chart/figure)
graph         → relationship graph for dagre rendering
done          → final answer + resources (GroundingResource[]) + health envelope
error         → stream terminated with error message
ping          → keep-alive (no UI action needed)
```

### Key payload types (from `lib/agent-stream-types.ts`)

**`DonePayload`** — the final answer envelope:
```typescript
interface DonePayload {
  content: string;              // canonical answer text
  resources?: GroundingResource[];  // citations (preferred over legacy citations[])
  confidence?: number;
  tool_used?: string;           // "sql" | "rag" | "hybrid" | "none"
  citations_health?: 'ok' | 'degraded' | 'floor' | 'failed';
  tokens_unresolved?: number;   // citation tokens that didn't resolve to a source
}
```

**`GroundingResource`** — one citation/source:
```typescript
interface GroundingResource {
  source_type: string;          // e.g. "lab_note", "literature_review"
  source_id?: string | null;    // UUID of the source record
  display_label?: string | null;
  excerpt?: string | null;      // supporting text excerpt
  cited_text?: string | null;   // exact verbatim span backing the claim
  char_start?: number | null;   // char offset in source
  char_end?: number | null;
  support_score?: number | null;     // 0–1 confidence for this claim↔span
  support_status?: 'supported' | 'partial' | 'unsupported' | null;
  grounding?: 'native' | 'heuristic' | 'none' | null;
  relevance?: number;
  source_url?: string | null;
}
```

**`SseEvent`** — discriminated union:
```typescript
type SseEvent =
  | { event: "run_started"; data: RunStartedPayload }
  | { event: "thinking"; data: ThinkingPayload }
  | { event: "token"; data: TokenPayload }
  | { event: "tool_start"; data: ToolStartPayload }
  | { event: "tool_call"; data: ToolCallPayload }
  | { event: "tool_result"; data: ToolResultPayload }
  | { event: "artifact"; data: ArtifactPayload }
  | { event: "graph"; data: GraphPayload }
  | { event: "citations_manifest"; data: CitationsManifestPayload }
  | { event: "done"; data: DonePayload }
  | { event: "error"; data: ErrorPayload }
  // ... (see lib/agent-stream-types.ts for full union)
```

---

## Frontend Components

| File | Role |
|------|------|
| `hooks/use-agent-stream.ts` | Core SSE parser. Reads from `/api/agent/stream`, dispatches typed `SseEvent` objects. |
| `hooks/use-smooth-text-stream.ts` | RAF-batched token rendering (8ms min-delay) to smooth streaming text. |
| `components/catalyst/chat-message.tsx` | Renders one completed assistant message: answer bubble, citations panel, reasoning panel, tool cards. |
| `components/catalyst/agent-stream-reply.tsx` | Renders the in-flight streaming turn: live token stream, live tool cards, synthesis checklist. |
| `components/catalyst/agent-tool-cards.tsx` | Cursor-style tool call cards: args preview → running spinner → result + source names + latency. Collapses to "Used N tools" when settled. |
| `components/catalyst/agent-reasoning-panel.tsx` | Chain-of-thought `thinking_token` buffer, shown separately from the answer bubble. |
| `lib/agent-stream-types.ts` | All TypeScript types + `isSseEvent()` guard + `sourceNamesFromEvent()` extractor. |
| `lib/catalyst-client.ts` | Low-level fetch helpers for the Catalyst backend. |

---

## Chat Sessions

Chat conversations are persisted in `chat_sessions` and `chat_messages` (see `docs/DATA_MODEL.md`). The `metadata` JSONB column on `chat_messages` carries the full structured payload for assistant messages (citations, grounding, artifact refs, tool call summaries).

Sessions can optionally carry a `protocol_id` for protocol-context conversations.

### Rolling summarization

Long sessions are periodically summarized into `chat_episode_summaries` with vector embeddings for semantic recall. This prevents the chat from ever hitting a hard history cap — the agent always has access to past context via the summary layer. See memory note `feedback_never_break_the_chat.md`.

---

## Citations and Grounding

Catalyst uses a field-value provenance system (not Anthropic native citations — that approach was rejected; see memory note `project_citation_redesign_2026_06.md`).

1. **Backend** binds each `[N]` citation token in the answer to a specific field in a DB row, producing `cited_text`, `char_start/end`, and a `support_score`.
2. **Frontend** receives citations via the `done.resources` array (or `citations_manifest` for streaming).
3. **UI** renders inline `[N]` chips, a citations panel, a span-highlight viewer, and a `grounding` badge (native / heuristic / none).

Citation health is reported via `done.citations_health` (`ok` / `degraded` / `floor` / `failed`) and `done.tokens_unresolved`. The UI shows an amber badge for degraded/failed states.

---

## Artifacts

When the agent generates a file (PDF, DOCX, XLSX, chart), it emits an `artifact` SSE event:

```typescript
interface ArtifactPayload {
  data_id: string;        // experiment_data row ID
  file_name: string;
  mime_type: string;
  size_bytes?: number;
  signed_url?: string;    // pre-signed download URL
  draft?: boolean;        // true = staged, needs user confirmation to save
  experiment_id?: string; // set when already attached to an experiment
  generator?: string;     // which tool generated it
  kind?: string;          // "figure", "report", etc.
}
```

Draft artifacts (`draft: true`) show a "Save to Data files" action in the chat UI. The user picks a project + experiment to attach them to. The draft cleanup cron (`AGENT_DRAFT_CLEANUP_BATCH`, `AGENT_DRAFT_CLEANUP_MAX_ROWS`) purges unclaimed drafts after a TTL.

---

## Scope and Context

The agent request body includes a `scope` field that carries the user's current context (organization_id, project_ids, experiment_ids) so the agent knows which records to search. The `/api/resolve-scope` route resolves this from the user's JWT and URL parameters.

Tagged records (papers, samples, lab notes, etc.) can be attached via the `options.tags` field. These are forwarded to the agent so it can retrieve them directly.

---

## Stop / Cancel

When `run_started` arrives, the frontend stores the `run_id`. The Stop button fires `POST /api/agent/runs/{run_id}/cancel`, which signals the backend to abort the current tool calls and end the stream early.

---

## Graph Events

The `graph` SSE event carries `{ nodes, edges }` for map_relationships results. The frontend renders these as inline dagre graphs using ReactFlow, replacing what previously arrived as a static matplotlib PNG. Graphs are also persisted to `metadata.graphs` on the chat message for replay.

---

## Feature Flags (Catalyst-specific)

| Flag | Default | Effect |
|------|---------|--------|
| `NOTES9_INTENT_HARD_GATE` | off | Pre-flight intent tool gating (removed as root cause of bugs) |
| `NOTES9_PREFLIGHT_STEER` | off | Pre-flight steering prompt injection |
| `HARNESS_SAFETY_ENFORCE` | off | Hard-block safety enforcement (shadow-only by default) |
| `NOTES9_CORE_THINKING_BUDGET` | 0 | Extended thinking token budget (0 = disabled) |
