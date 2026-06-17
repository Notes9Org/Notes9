// MIRROR of AI/catalyst/agents/core/sse_schema.py — keep in sync (golden contract tests will fail otherwise)

// ── Payload types ─────────────────────────────────────────────────────────────

/** SSE event: thinking – agent reasoning step */
export interface ThinkingPayload {
  status: string;
  message: string;
  node?: string;
  /** High-level phase label. Canonical stages:
   * understanding → searching → reading → designing → drafting → done
   * (legacy: analyzing / synthesizing / composing / validating). */
  stage?: string;
  detail?: string;
  intent?: string;
  conclusion?: string;
  decision?: string;
  rationale?: string;
  confidence?: number;
  sql?: string;
  verdict?: string;
  issues?: string[];
  // ── Long-run progress / heartbeat (emitted during Cat-Bio synthesis) ──────
  /** Fractional progress 0–1 for the current long-running stage, when known. */
  progress?: number;
  /** Monotonic heartbeat flag: a no-op keep-alive so a 60s run never looks
   * frozen. When true the client should keep the current step "active" without
   * appending a new visible line. */
  heartbeat?: boolean;
  /** Elapsed wall-clock seconds since the stage started, if the backend tracks it. */
  elapsed_s?: number;
  [key: string]: unknown;
}

/** SSE event: thinking_token – reasoning delta, appended to thinkingTokenBuffer only */
export interface ThinkingTokenPayload {
  delta: string;
}

/**
 * SSE event: token – streaming answer chunk.
 * Canonical wire field is `delta`; `text` and `token` are accepted by the
 * parser for legacy compatibility only.
 */
export interface TokenPayload {
  /** Canonical wire field. */
  delta: string;
  /** Legacy alias — accepted by parser for back-compat. */
  text?: string;
  /** Legacy alias — accepted by parser for back-compat. */
  token?: string;
}

/** SSE event: text_reset – backend signals the visible answer buffer should be cleared */
export type TextResetPayload = Record<string, never>;

/** SSE event: tool_start – a tool invocation has begun */
export interface ToolStartPayload {
  /** Stable opaque correlation key — do NOT display; use `label` instead. */
  tool: string;
  /** Researcher-facing narration supplied by Tool.narrate_start(). */
  label: string;
  args_preview?: string;
  [key: string]: unknown;
}

/** SSE event: tool_call – tool completed (summary card data) */
export interface ToolCallPayload {
  tool: string;
  label: string;
  status: string;
  citations_count: number;
  latency_ms: number;
  // NOTE: `quality` was stripped in routes.py and is intentionally absent here.
  [key: string]: unknown;
}

/** SSE event: tool_result – tool result detail */
export interface ToolResultPayload {
  tool: string;
  label: string;
  status: string;
  citations_count: number;
  latency_ms: number;
  source_names?: string[];
  preview?: string;
  [key: string]: unknown;
}

/** SSE event: artifact – a file the agent generated (PDF/DOCX/XLSX/chart/figure).
 * `draft` true ⇒ staged for review, NOT yet in any experiment's Data files
 * (the UI shows a "Save to Data files" action). `draft` false ⇒ already attached
 * to `experiment_id`. */
export interface ArtifactPayload {
  data_id: string;
  file_name: string;
  mime_type: string;
  size_bytes?: number;
  signed_url?: string | null;
  draft?: boolean;
  experiment_id?: string | null;
  generator?: string | null;
  kind?: string | null;
  [key: string]: unknown;
}

/** SSE event: citations_manifest – full citation map for the completed answer */
export interface CitationsManifestPayload {
  manifest: Record<string, unknown>;
}

/** SSE event: citations_update – running citation count during tool execution */
export interface CitationsUpdatePayload {
  count: number;
}

/** One step in a synthesis plan checklist. */
export interface SynthesisPlanStepPayload {
  id: string;
  label: string;
  /** Backend seeds every step as "pending"; promoted via synthesis_step. */
  status?: 'pending' | 'active' | 'done';
}

/** SSE event: synthesis_plan – Biomni-style ordered checklist the synthesis
 * will tick off as it works. `tool` is the synthesis correlation id. */
export interface SynthesisPlanPayload {
  /** Correlation id of the synthesis run (named `tool` on the wire). */
  tool: string;
  title: string;
  steps: SynthesisPlanStepPayload[];
  [key: string]: unknown;
}

/** SSE event: synthesis_step – one plan step's status changed. */
export interface SynthesisStepPayload {
  /** Correlation id of the synthesis run (named `tool` on the wire). */
  tool: string;
  /** Id of the step whose status changed. */
  id: string;
  status: 'pending' | 'active' | 'done';
  [key: string]: unknown;
}

/** Grounding item returned inside DonePayload.resources */
export interface GroundingResource {
  display_label?: string | null;
  source_type: string;
  source_name?: string | null;
  relevance?: number;
  excerpt?: string | null;
  source_id?: string | null;
  chunk_id?: string | null;
  page_number?: number | null;
  content_surface?: string | null;
  source_url?: string | null;
  excerpt_source?: string | null;
  match_kind?: string | null;
  cite_label?: string | null;
  // ── Per-claim, span-level grounding (unified wire contract) ───────────────
  /** Verbatim supporting span for THIS citation. Prefer over `excerpt` for
   * highlighting — it pinpoints the exact sentence backing the claim. */
  cited_text?: string | null;
  /** Char offset into the stripped source where `cited_text` begins (advisory). */
  char_start?: number | null;
  /** Char offset (exclusive) where `cited_text` ends (advisory). */
  char_end?: number | null;
  /** Support strength 0–1 for this specific claim↔span pairing. */
  support_score?: number | null;
  /** Grounding verdict for the claim. Display as a subtle signal, never "wrong". */
  support_status?: 'supported' | 'partial' | 'unsupported' | null;
  /** How the span was located: model-native citation, heuristic match, or none. */
  grounding?: 'native' | 'heuristic' | 'none' | null;
}

/** @deprecated Use GroundingResource; kept for imports that still say Citation */
export type Citation = GroundingResource;

/** SSE event: done – final agent response */
export interface DonePayload {
  role?: string;
  content: string;
  resources?: GroundingResource[];
  /** Legacy alias; mirrors content when normalised on the client. */
  answer?: string;
  /** Legacy streaming shape; prefer resources. */
  citations?: GroundingResource[];
  confidence?: number;
  tool_used?: string;
  debug?: Record<string, unknown> | null;
  /** Citation health envelope (fail-open observability). Single discriminated
   * state derived server-side from token-resolution counters. Lets the UI flag
   * degraded/failed attribution instead of silently rendering an uncited answer. */
  citations_health?: 'ok' | 'degraded' | 'floor' | 'failed';
  /** Count of citation tokens the model wrote that did not resolve to a source. */
  tokens_unresolved?: number;
  [key: string]: unknown;
}

/** SSE event: error */
export interface ErrorPayload {
  error: string;
}

/** SSE event: ping – keep-alive */
export interface PingPayload {
  ts?: number;
  [key: string]: unknown;
}

/** Emitted once at the start of an agent run, carrying the run identifier. */
export interface RunStartedPayload {
  run_id?: string;
  [key: string]: unknown;
}

// ── Legacy payload types (old LangGraph pipeline — kept for back-compat) ──────

/** @deprecated LangGraph pipeline removed; kept so old imports compile */
export interface SqlPayload {
  query: string;
}

/** @deprecated LangGraph pipeline removed */
export interface RagChunk {
  source_type: string;
  source_id: string;
  source_name?: string;
  chunk_id?: string | null;
  page_number?: number | null;
  excerpt: string;
  relevance: number;
  content_surface?: string | null;
}

/** @deprecated LangGraph pipeline removed */
export interface RagChunksPayload {
  message: string;
  count: number;
  chunks: RagChunk[];
}

/** @deprecated LangGraph pipeline removed */
export interface ToolOutputPayload {
  tool: "sql" | "rag" | "web_search" | string;
  success: boolean;
  row_count?: number;
  chunk_count?: number;
  file_names?: string[];
  document_names?: string[];
  execution_time_ms?: number;
  avg_similarity?: number;
}

// ── Discriminated union ───────────────────────────────────────────────────────

export type SseEvent =
  | { event: "run_started"; data: RunStartedPayload }
  | { event: "thinking"; data: ThinkingPayload }
  | { event: "thinking_token"; data: ThinkingTokenPayload }
  | { event: "token"; data: TokenPayload }
  | { event: "text_reset"; data: TextResetPayload }
  | { event: "tool_start"; data: ToolStartPayload }
  | { event: "tool_call"; data: ToolCallPayload }
  | { event: "tool_result"; data: ToolResultPayload }
  | { event: "artifact"; data: ArtifactPayload }
  | { event: "citations_manifest"; data: CitationsManifestPayload }
  | { event: "citations_update"; data: CitationsUpdatePayload }
  | { event: "synthesis_plan"; data: SynthesisPlanPayload }
  | { event: "synthesis_step"; data: SynthesisStepPayload }
  | { event: "done"; data: DonePayload }
  | { event: "error"; data: ErrorPayload }
  | { event: "ping"; data: PingPayload };

// ── Source-name normalizer (AD1: structured fields → view model) ──────────────
//
// The ONE place a source-bearing SSE event becomes the `source_names` shown on a
// tool card. UI state is derived ONLY from typed wire fields here — never by
// parsing human-readable `thinking` prose (that heuristic was fragile: any copy
// change silently emptied the cards). Keeping the extraction in a single typed
// function means a wording change on the backend can never break the cards, and
// every source-bearing event (`tool_result`, `tool_output`, `rag_chunks`) flows
// through the same dedupe/truncate rules.

/**
 * Clean a raw list of source/document names for display: keep strings only,
 * trim, drop blanks, dedupe case-insensitively (first spelling wins), and
 * truncate each to `maxLen` chars. `max` caps the count (Infinity = keep all).
 */
export function normalizeSourceNames(
  raw: unknown,
  { max = Infinity, maxLen = 80 }: { max?: number; maxLen?: number } = {},
): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name.length > maxLen ? name.slice(0, maxLen - 1) + "…" : name);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Extract the display source names from a source-bearing SSE event, using ONLY
 * its structured fields. Returns `[]` for events that carry no structured
 * sources — including `thinking`, whose message text must never be parsed.
 */
export function sourceNamesFromEvent(
  eventType: string,
  payload: Record<string, unknown>,
): string[] {
  switch (eventType) {
    case "tool_result":
      return normalizeSourceNames(payload.source_names);
    case "tool_output":
      return normalizeSourceNames(payload.document_names ?? payload.file_names);
    case "rag_chunks": {
      const chunks = Array.isArray(payload.chunks) ? payload.chunks : [];
      const names = chunks.map((c) =>
        c && typeof c === "object"
          ? (c as Record<string, unknown>).source_name
          : null,
      );
      return normalizeSourceNames(names, { max: 5 });
    }
    default:
      return [];
  }
}

// ── Type guard ────────────────────────────────────────────────────────────────

const KNOWN_EVENT_TYPES = new Set([
  "run_started",
  "thinking",
  "thinking_token",
  "token",
  "text_reset",
  "tool_start",
  "tool_call",
  "tool_result",
  "artifact",
  "citations_manifest",
  "citations_update",
  "synthesis_plan",
  "synthesis_step",
  "done",
  "error",
  "ping",
] as const);

/**
 * Returns true when `raw` has a known `event` string and a non-null `data`
 * object — i.e. it is a recognised SseEvent discriminated-union member.
 * Used by the contract test to verify fixture entries are accepted.
 */
export function isSseEvent(raw: unknown): raw is SseEvent {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.event === "string" &&
    KNOWN_EVENT_TYPES.has(r.event as never) &&
    typeof r.data === "object" &&
    r.data !== null
  );
}
