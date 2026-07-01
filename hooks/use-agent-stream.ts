'use client';

import { useState, useCallback, useRef } from 'react';
import type {
  ThinkingPayload,
  RagChunksPayload,
  DonePayload,
  RagChunk,
} from '@/lib/agent-stream-types';
import { normalizeSourceNames } from '@/lib/agent-stream-types';
import { buildNotes9AgentRequestBody } from '@/lib/notes9-agent-request';
import { splitSseBuffer, parseSseDataJson } from '@/lib/sse-event-blocks';
import { recordRumEvent } from '@/lib/rum';
import {
  extractSseTokenPiece,
  maskCiteTokensForStream,
  createStreamCiteMasker,
  mergeTokenBufferIntoAssistantRaw,
} from '@/lib/sse-stream-assistant-merge';
import {
  coalesceAgentExcerpt,
  coalesceAgentSourceId,
  normalizeAgentRelevance0to1,
} from '@/lib/document-highlight';


const PROXY_STREAM_URL = '/api/agent/stream';

/** Workspace entity the user explicitly tagged for this turn. Catalyst preflights
 * each via fetch_full_records before the LLM loop runs. */
export type AgentAttachment = {
  kind:
    | 'lab_note'
    | 'literature_review'
    | 'protocol'
    | 'experiment'
    | 'project'
    | 'sample'
    | 'report';
  id: string;
  title?: string;
};

/** User-uploaded file (image or PDF) for the chat. Catalyst fetches the URL
 * server-side, magic-byte verifies, base64-encodes, and forwards to the LLM
 * as a multi-modal content block. The signed URL never reaches the LLM. */
export type AgentFileAttachment = {
  url: string;
  name: string;
  content_type:
    | 'image/jpeg'
    | 'image/png'
    | 'image/gif'
    | 'image/webp'
    | 'application/pdf'
    | 'text/csv'
    | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  size: number;
};

/** Request shape for POST /notes9/stream (proxied via /api/agent/stream). */
export interface AgentStreamParams {
  query: string;
  session_id: string;
  history?: Array<{ role: string; content: string }>;
  scope?: object | null;
  /** Tagged workspace records. Backend preflight-loads each via
   * fetch_full_records before the first LLM turn so the LLM never burns a
   * tool call rediscovering them. */
  attachments?: AgentAttachment[];
  /** User-uploaded files (images, PDFs). Forwarded to catalyst which
   * fetches + verifies + base64-encodes before passing to the LLM. */
  file_attachments?: AgentFileAttachment[];
  options?: {
    debug?: boolean;
    max_retries?: number;
    web_search?: 'on' | 'off';
  };
}

/** One resolved citation in the manifest. Keyed in `manifest` by its full
 * `cite_label` (e.g. "3" or the hierarchical "3.2"). Per the shared wire
 * contract, `source_id`, `cite_label`, `match_kind`, and `relevance` are now
 * reliably present, so chips can navigate by identity without a title lookup. */
export interface CitationsManifestEntry {
  /** Display number `[N]` the answer text uses. */
  index?: number;
  /** Stable per-source token from Option C citations (`lit_7c4f`, `lab_a1b2`). */
  token?: string;
  /** Full display label ("3", "3.2"); also the manifest key. */
  cite_label?: string;
  source_type: string;
  /** Server-side identity for the source — now reliably present on the wire. */
  source_id?: string;
  source_name?: string;
  source_url?: string;
  excerpt?: string;
  /** 'exact' → direct record (no % match); otherwise semantic similarity. */
  match_kind?: string;
  /** Semantic similarity 0–1 (or 0–100; normalize at the UI). */
  relevance?: number;
  // ── Per-claim, span-level grounding (unified wire contract) ───────────────
  /** Verbatim supporting span for THIS sub-citation. Prefer over `excerpt`
   * when highlighting so [3.1] and [3.2] land on different sentences. */
  cited_text?: string;
  /** Char offset into the stripped source where `cited_text` begins (advisory). */
  char_start?: number;
  /** Char offset (exclusive) where `cited_text` ends (advisory). */
  char_end?: number;
  /** Support strength 0–1 for this specific claim↔span pairing. */
  support_score?: number;
  /** Grounding verdict for the claim. Subtle signal, never "wrong". */
  support_status?: 'supported' | 'partial' | 'unsupported' | null;
  /** How the span was located: model-native citation, heuristic match, or none. */
  grounding?: 'native' | 'heuristic' | 'none' | null;
}

export interface CitationsManifest {
  manifest: Record<string, CitationsManifestEntry>;
}

export interface ToolOutput {
  tool: string;
  success: boolean;
  details: Record<string, unknown>;
}

/** A single live tool card — open while running, settled once result arrives */
export interface ToolCard {
  /** Unique key — tool name (e.g. "nlp_to_sql_tool") */
  id: string;
  /** Human label from TOOL_LABELS map */
  label: string;
  /** Preview of args if provided */
  args_preview?: string;
  /** "running" while tool_start; "done" or "error" after tool_result/tool_call */
  status: 'running' | 'done' | 'error';
  /** Summary text from tool_result / tool_call */
  summary?: string;
  /** Number of sources returned */
  citations_count?: number;
  /** Latency in ms */
  latency_ms?: number;
  /** Actual document/source names found (from tool_output event) */
  source_names?: string[];
  /** Row count for SQL results */
  row_count?: number;
}

/** A file the agent generated, surfaced via the `artifact` SSE event. */
export interface AgentArtifact {
  /** Stable id (experiment_data.id or draft id). Use as React key + commit arg. */
  dataId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Short-lived (~1h) download URL; re-fetch if expired. */
  signedUrl?: string | null;
  /** True ⇒ not yet saved to Data files; show "Save to Data files". */
  draft: boolean;
  /** Set once committed (or if attached directly). */
  experimentId?: string | null;
  /** Tool that produced it, e.g. create_pdf_report. */
  generator?: string | null;
  /** Human kind label, e.g. "PDF report". */
  kind?: string | null;
}

/** A structured relationship graph the agent produced via map_relationships,
 * surfaced through the `graph` SSE event for native dagre rendering in chat. */
export interface AgentGraphNode {
  id: string;
  kind: string;
  entityId?: string;
  label: string;
}
export interface AgentGraphEdge {
  source: string;
  target: string;
  relation: string;
}
export interface AgentGraph {
  nodes: AgentGraphNode[];
  edges: AgentGraphEdge[];
  truncated: boolean;
}

export interface SynthesisStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done';
}

export interface SynthesisPlan {
  /** Correlation id of the synthesis run (tool field). */
  id: string;
  title: string;
  steps: SynthesisStep[];
}

/** Thinking stage values emitted by the backend.
 * Canonical staged flow:  understanding → searching → reading → designing →
 * drafting → done.  The older analyzing/synthesizing/composing/validating
 * names are retained for back-compat with messages mid-migration. */
export type ThinkingStage =
  | 'understanding'
  | 'searching'
  | 'reading'
  | 'designing'
  | 'drafting'
  | 'analyzing'
  | 'synthesizing'
  | 'composing'
  | 'validating'
  | 'done';

export interface AgentStreamState {
  thinkingSteps: ThinkingPayload[];
  /** Latest stage emitted via thinking events — drives ThinkingBar */
  currentStage: ThinkingStage | null;
  /** Latest thinking message */
  currentThinkingMessage: string | null;
  /** Latest thinking detail */
  currentThinkingDetail: string | null;
  /** Fractional progress 0–1 for the current long-running stage (Cat-Bio
   * synthesis), or null when the backend hasn't reported one. */
  currentStageProgress: number | null;
  /** Elapsed seconds reported by the backend for the current stage, or null. */
  currentStageElapsedS: number | null;
  /** Live tool cards — keyed by tool id */
  toolCards: ToolCard[];
  /** Files the agent generated this turn (PDF/DOCX/XLSX/chart/figure), in the
   * order they were produced. Drafts carry `draft: true` and can be saved to an
   * experiment's Data files from the UI. */
  artifacts: AgentArtifact[];
  /** Relationship graphs the agent produced this turn (map_relationships),
   * rendered natively (interactive dagre) instead of as a static PNG. */
  graphs: AgentGraph[];
  /** Biomni-style synthesis checklist — the ordered steps the design works
   * through, each ticked off live as its section is written. Null until the
   * backend emits a `synthesis_plan`. */
  synthesisPlan: SynthesisPlan | null;
  sql: string | null;
  ragChunks: RagChunksPayload | null;
  citationsManifest: CitationsManifest | null;
  toolOutputs: ToolOutput[];
  streamedAnswer: string;
  /** Accumulated thinking/reasoning tokens from `thinking_token` events. */
  thinkingTokenBuffer: string;
  /** Running count of resolved sources, updated live via `citations_update`
   * after each tool call. Drives the "Gathering sources… N" ticker while the
   * turn is in flight; superseded by the final manifest once `done` arrives. */
  liveCitationCount: number;
  /** Cancellation handle for this run, set from the `run_started` event (only
   * emitted when NOTES9_AGENT_HITL is enabled). Null ⇒ no server-side cancel
   * available, so the Stop button stays hidden. */
  runId: string | null;
  donePayload: DonePayload | null;
  error: string | null;
  isStreaming: boolean;
}

function normalizeNotes9AgentResponse(raw: Record<string, unknown>): DonePayload {
  const content =
    typeof raw.content === 'string'
      ? raw.content
      : typeof raw.answer === 'string'
        ? raw.answer
        : '';
  const role = typeof raw.role === 'string' ? raw.role : 'assistant';
  const resources = Array.isArray(raw.resources)
    ? (raw.resources as DonePayload['resources'])
    : undefined;
  const citations = Array.isArray(raw.citations)
    ? (raw.citations as DonePayload['citations'])
    : undefined;
  const confidence = typeof raw.confidence === 'number' ? raw.confidence : undefined;
  const tool_used = raw.tool_used as DonePayload['tool_used'];
  // Carry the citation-health envelope through normalization. This function
  // rebuilds the payload field-by-field, so anything not copied here is dropped
  // before any consumer sees it — which is exactly why the signal was dead.
  const citations_health =
    raw.citations_health === 'ok' ||
    raw.citations_health === 'degraded' ||
    raw.citations_health === 'floor' ||
    raw.citations_health === 'failed'
      ? raw.citations_health
      : undefined;
  const tokens_unresolved =
    typeof raw.tokens_unresolved === 'number' ? raw.tokens_unresolved : undefined;
  return {
    role,
    content,
    answer: content,
    resources,
    citations,
    confidence,
    tool_used: tool_used ?? 'none',
    citations_health,
    tokens_unresolved,
  };
}

function thinkingFromPayload(data: Record<string, unknown> | null): ThinkingPayload | null {
  if (!data || typeof data.message !== 'string') return null;
  return {
    node: typeof data.node === 'string' ? data.node : 'step',
    status: typeof data.status === 'string' ? data.status : '',
    message: data.message,
    intent: typeof data.intent === 'string' ? data.intent : undefined,
    conclusion: typeof data.conclusion === 'string' ? data.conclusion : undefined,
    decision: typeof data.decision === 'string' ? data.decision : undefined,
    rationale: typeof data.rationale === 'string' ? data.rationale : undefined,
    confidence: typeof data.confidence === 'number' ? data.confidence : undefined,
    sql: typeof data.sql === 'string' ? data.sql : undefined,
    verdict: typeof data.verdict === 'string' ? data.verdict : undefined,
    issues: Array.isArray(data.issues)
      ? data.issues.filter((x): x is string => typeof x === 'string')
      : undefined,
  };
}

function ragFromPayload(data: Record<string, unknown> | null): RagChunksPayload | null {
  if (!data || typeof data.message !== 'string') return null;
  const chunksRaw = data.chunks;
  if (!Array.isArray(chunksRaw)) return null;
  const chunks: RagChunk[] = [];
  for (const item of chunksRaw) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    const sourceType = typeof c.source_type === 'string' ? c.source_type : null;
    const sourceId = coalesceAgentSourceId(c);
    const excerpt = coalesceAgentExcerpt(c);
    if (!sourceType || !sourceId || !excerpt) continue;
    let relevance = 0;
    if (typeof c.relevance === 'number' && Number.isFinite(c.relevance)) {
      relevance = normalizeAgentRelevance0to1(c.relevance);
    } else if (typeof c.score === 'number' && Number.isFinite(c.score)) {
      relevance = normalizeAgentRelevance0to1(c.score);
    }
    chunks.push({
      source_type: sourceType,
      source_id: sourceId,
      source_name: typeof c.source_name === 'string' ? c.source_name : undefined,
      chunk_id: typeof c.chunk_id === 'string' || c.chunk_id === null ? (c.chunk_id as string | null) : undefined,
      page_number:
        typeof c.page_number === 'number' && Number.isFinite(c.page_number)
          ? c.page_number
          : typeof c.page === 'number' && Number.isFinite(c.page)
            ? c.page
            : undefined,
      excerpt,
      relevance,
      content_surface:
        typeof c.content_surface === 'string'
          ? c.content_surface
          : c.content_surface === null
            ? null
            : undefined,
    });
  }
  return {
    message: data.message,
    count: typeof data.count === 'number' ? data.count : chunks.length,
    chunks,
  };
}

// LEGACY FALLBACK ONLY.
// The core agent supplies researcher-friendly labels directly in every
// tool_start / tool_call / tool_result payload (the `label` field). This map
// is kept only so requests routed through the deprecated NOTES9_AGENT=legacy
// pipeline still get readable card labels.
const TOOL_LABELS: Record<string, { label: string }> = {
  nlp_to_sql_tool:        { label: 'Looking through your workspace' },
  rag_tool:               { label: 'Reading your notes and documents' },
  web_search_tool:        { label: 'Checking external sources' },
  full_record_fetch_tool: { label: 'Opening a document' },
  document_analysis_tool: { label: 'Analyzing literature' },
  biomni_tool:            { label: 'Drafting an experiment design' },
  biomni_full_tool:       { label: 'Drafting an experiment design' },
  llm_chat_tool:          { label: 'Thinking' },
  extract_data_tool:      { label: 'Pulling out the relevant data' },
  episodic_memory_tool:   { label: 'Checking past sessions' },
};

const THINKING_STAGES: ThinkingStage[] = [
  'understanding', 'searching', 'reading', 'designing', 'drafting',
  'analyzing', 'synthesizing', 'composing', 'validating', 'done',
];

function normalizeStage(raw: unknown): ThinkingStage | null {
  if (typeof raw !== 'string') return null;
  const s = raw.toLowerCase() as ThinkingStage;
  return THINKING_STAGES.includes(s) ? s : null;
}

export function useAgentStream() {
  const [state, setState] = useState<AgentStreamState>({
    thinkingSteps: [],
    currentStage: null,
    currentThinkingMessage: null,
    currentThinkingDetail: null,
    currentStageProgress: null,
    currentStageElapsedS: null,
    toolCards: [],
    artifacts: [],
    graphs: [],
    synthesisPlan: null,
    sql: null,
    ragChunks: null,
    citationsManifest: null,
    toolOutputs: [],
    streamedAnswer: '',
    thinkingTokenBuffer: '',
    liveCitationCount: 0,
    runId: null,
    donePayload: null,
    error: null,
    isStreaming: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  /** Latest run id, mirrored outside React state so `cancel()` can read it
   * synchronously without depending on a re-render. */
  const runIdRef = useRef<string | null>(null);
  /** Bearer token from the active run, so `cancel()` can authorize the proxy
   * POST without the caller having to thread it through again. */
  const tokenRef = useRef<string | null>(null);

  const runStream = useCallback(
    async (
      params: AgentStreamParams,
      token: string
    ): Promise<{
      donePayload: DonePayload | null;
      error: string | null;
      artifacts: AgentArtifact[];
      citationsManifest: CitationsManifest | null;
      graphs: AgentGraph[];
    }> => {
      if (abortControllerRef.current) {
        try { abortControllerRef.current.abort(); } catch { /* ignore */ }
      }
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      runIdRef.current = null;
      tokenRef.current = token;

      // Collect artifacts in a LOCAL array (not just React state) so the caller
      // can read the FINAL list synchronously when the stream resolves. Reading
      // the hook's `state.artifacts` from the caller's closure returns the stale
      // (empty) value captured at render — which is exactly why generated charts
      // were persisted as nothing and vanished once streaming ended.
      const collectedArtifacts: AgentArtifact[] = [];
      // Same stale-closure trap applies to graphs — capture locally so the caller
      // gets the FINAL list synchronously when the stream resolves.
      const collectedGraphs: AgentGraph[] = [];
      // Same stale-closure trap applies to the citations manifest — capture it
      // locally so the caller persists the FINAL manifest, not the render-time null.
      let collectedManifest: CitationsManifest | null = null;

      setState({
        thinkingSteps: [],
        currentStage: null,
        currentThinkingMessage: null,
        currentThinkingDetail: null,
        currentStageProgress: null,
        currentStageElapsedS: null,
        toolCards: [],
        artifacts: [],
        graphs: [],
        synthesisPlan: null,
        sql: null,
        ragChunks: null,
        citationsManifest: null,
        toolOutputs: [],
        streamedAnswer: '',
        thinkingTokenBuffer: '',
        liveCitationCount: 0,
        runId: null,
        donePayload: null,
        error: null,
        isStreaming: true,
      });

      let donePayload: DonePayload | null = null;
      let streamError: string | null = null;
      let tokenBuffer = '';

      // Token throttle: accumulate masked deltas and flush to React state on a
      // ~80ms cadence instead of once per token. Per-token setState re-rendered
      // the entire sidebar and re-parsed markdown on every token — the primary
      // source of streaming jank. Flushed eagerly on text_reset / done / error
      // and after the read loop so no streamed text is lost.
      let pendingMasked = '';
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      // One stateful masker per stream run — handles cite tokens split across deltas.
      const maskDelta = createStreamCiteMasker();
      const flushTokens = () => {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        if (!pendingMasked) return;
        const chunk = pendingMasked;
        pendingMasked = '';
        setState((s) => ({ ...s, streamedAnswer: s.streamedAnswer + chunk }));
      };
      const scheduleFlush = () => {
        if (flushTimer) return;
        flushTimer = setTimeout(() => {
          flushTimer = null;
          flushTokens();
        }, 80);
      };

      try {
        const streamUrl = PROXY_STREAM_URL;
        const response = await fetch(streamUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(buildNotes9AgentRequestBody(params)),
          signal,
        });

        if (!response.ok) {
          const errText = await response.text();
          let errMsg = errText || `Request failed: ${response.status}`;
          try {
            const j = JSON.parse(errText) as { error?: string };
            if (typeof j.error === 'string') errMsg = j.error;
          } catch {
            /* keep errMsg */
          }
          setState((s) => ({
            ...s,
            error: errMsg,
            isStreaming: false,
          }));
          return { donePayload: null, error: errMsg, artifacts: collectedArtifacts, citationsManifest: collectedManifest, graphs: collectedGraphs };
        }

        if (!response.body) {
          const errMsg = 'Agent stream returned an empty body';
          setState((s) => ({ ...s, error: errMsg, isStreaming: false }));
          return { donePayload: null, error: errMsg, artifacts: collectedArtifacts, citationsManifest: collectedManifest, graphs: collectedGraphs };
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const { blocks, rest } = splitSseBuffer(sseBuffer);
          sseBuffer = rest;

          for (const block of blocks) {
            const payload = parseSseDataJson(block.data);
            const ev = block.event;

            switch (ev) {
              case 'ping':
                break;
              case 'run_started': {
                // Carries the cancel handle for this run. Only emitted when the
                // backend HITL flag is on; absent ⇒ the Stop button stays hidden.
                if (payload && typeof payload === 'object') {
                  const rid = (payload as Record<string, unknown>).run_id;
                  if (typeof rid === 'string' && rid) {
                    runIdRef.current = rid;
                    setState((s) => ({ ...s, runId: rid }));
                  }
                }
                break;
              }
              case 'thinking': {
                const step = thinkingFromPayload(payload);
                if (step) {
                  const p = payload as Record<string, unknown>;
                  const stage = normalizeStage(p?.stage);
                  const detail = typeof p?.detail === 'string' ? p.detail as string : undefined;
                  // Long-run progress signals (Cat-Bio synthesis): fractional
                  // progress 0–1 and elapsed seconds keep the current step
                  // visibly "alive" during a 60s run.
                  const progress =
                    typeof p?.progress === 'number' && Number.isFinite(p.progress)
                      ? Math.max(0, Math.min(1, p.progress as number))
                      : null;
                  const elapsedS =
                    typeof p?.elapsed_s === 'number' && Number.isFinite(p.elapsed_s)
                      ? (p.elapsed_s as number)
                      : null;
                  // A heartbeat is a keep-alive: refresh progress/stage but do
                  // NOT append another visible thinking line.
                  const isHeartbeat = p?.heartbeat === true;

                  // NOTE: source names are NEVER parsed out of this thinking
                  // message — they arrive as structured fields on tool_result /
                  // tool_output / rag_chunks and are applied there via
                  // normalizeSourceNames (AD1). The old "from: …" / ": …" regex
                  // was fragile (broke on any backend copy change) and is gone.
                  setState((s) => {
                    return {
                      ...s,
                      // Heartbeats keep the step list stable — only stage
                      // progress / elapsed are refreshed so the UI shows life
                      // without a flood of duplicate lines.
                      thinkingSteps: isHeartbeat
                        ? s.thinkingSteps
                        : [...s.thinkingSteps, step],
                      currentStage: stage ?? s.currentStage,
                      currentThinkingMessage: isHeartbeat
                        ? s.currentThinkingMessage
                        : step.message,
                      currentThinkingDetail: isHeartbeat
                        ? s.currentThinkingDetail
                        : detail ?? null,
                      // On a real stage transition, clear stale progress so the
                      // new stage starts fresh; heartbeats and same-stage steps
                      // keep the last known value.
                      currentStageProgress:
                        progress ??
                        (!isHeartbeat && stage && stage !== s.currentStage
                          ? null
                          : s.currentStageProgress),
                      currentStageElapsedS:
                        elapsedS ??
                        (!isHeartbeat && stage && stage !== s.currentStage
                          ? null
                          : s.currentStageElapsedS),
                    };
                  });
                }
                break;
              }
              case 'tool_start': {
                // Prefer the server-provided researcher-friendly label.
                // Fall back to TOOL_LABELS (legacy) only if no label was sent.
                if (payload && typeof payload === 'object') {
                  const p = payload as Record<string, unknown>;
                  const toolId = typeof p.tool === 'string' ? p.tool : 'unknown';
                  const serverLabel = typeof p.label === 'string' ? p.label : '';
                  const label = serverLabel || (TOOL_LABELS[toolId]?.label ?? toolId);
                  const card: ToolCard = {
                    id: toolId,
                    label,
                    args_preview: typeof p.args_preview === 'string' ? p.args_preview : undefined,
                    status: 'running',
                  };
                  setState((s) => ({
                    ...s,
                    toolCards: [
                      ...s.toolCards.filter((c) => c.id !== toolId || c.status === 'done' || c.status === 'error'),
                      card,
                    ],
                  }));
                }
                break;
              }
              case 'tool_call': {
                if (payload && typeof payload === 'object') {
                  const p = payload as Record<string, unknown>;
                  const toolId = typeof p.tool === 'string' ? p.tool : 'unknown';
                  const status = (p.status === 'error' ? 'error' : 'done') as 'done' | 'error';
                  const serverLabel = typeof p.label === 'string' ? p.label : '';
                  setState((s) => ({
                    ...s,
                    toolCards: s.toolCards.map((c) =>
                      c.id === toolId && c.status === 'running'
                        ? {
                            ...c,
                            // Server sends an updated label describing what came back —
                            // "Found 5 projects: …" — promote it onto the card.
                            label: serverLabel || c.label,
                            status,
                            citations_count: typeof p.citations_count === 'number' ? p.citations_count : c.citations_count,
                            latency_ms: typeof p.latency_ms === 'number' ? p.latency_ms : c.latency_ms,
                          }
                        : c
                    ),
                  }));
                }
                break;
              }
              case 'tool_result': {
                if (payload && typeof payload === 'object') {
                  const p = payload as Record<string, unknown>;
                  const toolId = typeof p.tool === 'string' ? p.tool : 'unknown';
                  const status = (p.status === 'error' ? 'error' : 'done') as 'done' | 'error';
                  const serverLabel = typeof p.label === 'string' ? p.label : '';

                  const sourceNames = normalizeSourceNames(p.source_names);
                  const citationsCount = typeof p.citations_count === 'number' ? p.citations_count : undefined;
                  const latencyMs = typeof p.latency_ms === 'number' ? p.latency_ms : undefined;
                  const previewSummary = typeof p.preview === 'string' ? p.preview : undefined;

                  setState((s) => {
                    // Self-heal: a tool_result whose tool_start never arrived (or was
                    // dropped) would otherwise no-op and the card would never show.
                    // Synthesize a settled card so the load still surfaces.
                    if (!s.toolCards.some((c) => c.id === toolId)) {
                      const card: ToolCard = {
                        id: toolId,
                        label: serverLabel || (TOOL_LABELS[toolId]?.label ?? toolId),
                        status,
                        citations_count: citationsCount,
                        latency_ms: latencyMs,
                        summary: previewSummary,
                        source_names: sourceNames.length > 0 ? sourceNames : undefined,
                      };
                      return { ...s, toolCards: [...s.toolCards, card] };
                    }
                    return {
                      ...s,
                      toolCards: s.toolCards.map((c) => {
                        if (c.id !== toolId) return c;
                        return {
                          ...c,
                          label: serverLabel || c.label,
                          status: c.status === 'running' ? status : c.status,
                          citations_count: citationsCount ?? c.citations_count,
                          latency_ms: latencyMs ?? c.latency_ms,
                          summary: previewSummary ?? c.summary,
                          source_names: sourceNames.length > 0 ? sourceNames : c.source_names,
                        };
                      }),
                    };
                  });
                }
                break;
              }
              case 'artifact': {
                if (payload && typeof payload === 'object') {
                  const p = payload as Record<string, unknown>;
                  const dataId = typeof p.data_id === 'string' ? p.data_id : '';
                  const fileName = typeof p.file_name === 'string' ? p.file_name : '';
                  if (dataId && fileName) {
                    const artifact: AgentArtifact = {
                      dataId,
                      fileName,
                      mimeType:
                        typeof p.mime_type === 'string' ? p.mime_type : 'application/octet-stream',
                      sizeBytes: typeof p.size_bytes === 'number' ? p.size_bytes : 0,
                      signedUrl: typeof p.signed_url === 'string' ? p.signed_url : null,
                      draft: p.draft === true,
                      experimentId: typeof p.experiment_id === 'string' ? p.experiment_id : null,
                      generator: typeof p.generator === 'string' ? p.generator : null,
                      kind: typeof p.kind === 'string' ? p.kind : null,
                    };
                    // Mirror into the local accumulator so runStream can return
                    // the final list (state reads in the caller's closure are stale).
                    {
                      const i = collectedArtifacts.findIndex((a) => a.dataId === dataId);
                      if (i >= 0) collectedArtifacts[i] = artifact;
                      else collectedArtifacts.push(artifact);
                    }
                    setState((s) => ({
                      ...s,
                      // Replace on duplicate data_id (idempotent re-emit), else append.
                      artifacts: s.artifacts.some((a) => a.dataId === dataId)
                        ? s.artifacts.map((a) => (a.dataId === dataId ? artifact : a))
                        : [...s.artifacts, artifact],
                    }));
                  }
                }
                break;
              }
              case 'graph': {
                if (payload && typeof payload === 'object') {
                  const p = payload as Record<string, unknown>;
                  const rawNodes = Array.isArray(p.nodes) ? p.nodes : [];
                  const rawEdges = Array.isArray(p.edges) ? p.edges : [];
                  const nodes: AgentGraphNode[] = rawNodes
                    .filter((n): n is Record<string, unknown> => !!n && typeof n === 'object')
                    .map((n) => ({
                      id: typeof n.id === 'string' ? n.id : '',
                      kind: typeof n.kind === 'string' ? n.kind : '',
                      entityId: typeof n.entity_id === 'string' ? n.entity_id : undefined,
                      label: typeof n.label === 'string' ? n.label : '',
                    }))
                    .filter((n) => n.id);
                  const edges: AgentGraphEdge[] = rawEdges
                    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
                    .map((e) => ({
                      source: typeof e.source === 'string' ? e.source : '',
                      target: typeof e.target === 'string' ? e.target : '',
                      relation: typeof e.relation === 'string' ? e.relation : '',
                    }))
                    .filter((e) => e.source && e.target);
                  if (nodes.length > 0) {
                    const graph: AgentGraph = { nodes, edges, truncated: p.truncated === true };
                    // Mirror into the local accumulator so runStream returns the
                    // final list (caller closure state reads are stale).
                    collectedGraphs.push(graph);
                    setState((s) => ({ ...s, graphs: [...s.graphs, graph] }));
                  }
                }
                break;
              }
              case 'synthesis_plan': {
                if (payload && typeof payload === 'object') {
                  const p = payload as Record<string, unknown>;
                  const rawSteps = Array.isArray(p.steps) ? p.steps : [];
                  const steps: SynthesisStep[] = rawSteps
                    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
                    .map((s) => ({
                      id: typeof s.id === 'string' ? s.id : '',
                      label: typeof s.label === 'string' ? s.label : '',
                      status: 'pending' as const,
                    }))
                    .filter((s) => s.id && s.label);
                  setState((s) => ({
                    ...s,
                    synthesisPlan: {
                      id: typeof p.tool === 'string' ? p.tool : 'cat_bio',
                      title: typeof p.title === 'string' ? p.title : 'Designing',
                      steps,
                    },
                  }));
                }
                break;
              }
              case 'synthesis_step': {
                if (payload && typeof payload === 'object') {
                  const p = payload as Record<string, unknown>;
                  const stepId = typeof p.id === 'string' ? p.id : '';
                  const status = (p.status === 'active' || p.status === 'done'
                    ? p.status
                    : 'pending') as SynthesisStep['status'];
                  if (stepId) {
                    setState((s) =>
                      s.synthesisPlan
                        ? {
                            ...s,
                            synthesisPlan: {
                              ...s.synthesisPlan,
                              steps: s.synthesisPlan.steps.map((st) =>
                                st.id === stepId ? { ...st, status } : st
                              ),
                            },
                          }
                        : s
                    );
                  }
                }
                break;
              }
              case 'sql': {
                const q =
                  payload && typeof (payload as { query?: string }).query === 'string'
                    ? (payload as { query: string }).query
                    : null;
                if (q) setState((s) => ({ ...s, sql: q }));
                break;
              }
              case 'rag_chunks': {
                const rag = ragFromPayload(payload);
                if (rag) {
                  // Source names come from the structured chunk fields via the
                  // single normalizer — never parsed from thinking prose (AD1).
                  const ragSourceNames = normalizeSourceNames(
                    rag.chunks.map((chunk) => chunk.source_name),
                    { max: 5 },
                  );
                  setState((s) => ({
                    ...s,
                    ragChunks: rag,
                    // Enrich the rag_tool card with source names from chunks
                    toolCards: s.toolCards.map((c) =>
                      c.id === 'rag_tool' && ragSourceNames.length > 0
                        ? { ...c, source_names: ragSourceNames }
                        : c
                    ),
                  }));
                }
                break;
              }
              case 'citations_manifest': {
                // Citation manifest for inline [N] resolution. Guard the wire
                // shape before trusting the cast — `manifest.manifest` must be a
                // plain object map (not null / array / scalar).
                const manifest = payload as CitationsManifest | null;
                if (
                  typeof manifest?.manifest === 'object' &&
                  manifest.manifest !== null &&
                  !Array.isArray(manifest.manifest)
                ) {
                  collectedManifest = manifest;
                  setState((s) => ({ ...s, citationsManifest: manifest }));
                }
                break;
              }
              case 'citations_update': {
                // Running source count emitted after each tool call. Drives the
                // live "Gathering sources… N" ticker; the final manifest at
                // `done` supersedes it. Never let the count tick backwards.
                if (payload && typeof payload === 'object') {
                  const count = (payload as Record<string, unknown>).count;
                  if (typeof count === 'number' && Number.isFinite(count)) {
                    setState((s) => ({
                      ...s,
                      liveCitationCount: Math.max(s.liveCitationCount, count),
                    }));
                  }
                }
                break;
              }
              case 'tool_output': {
                // Tool completion details (file names, counts, etc.)
                if (payload && typeof payload === 'object') {
                  const p = payload as Record<string, unknown>;
                  const toolId = typeof p.tool === 'string' ? p.tool : 'unknown';
                  const toolOutput: ToolOutput = {
                    tool: toolId,
                    success: (p.success as boolean) ?? true,
                    details: p,
                  };

                  // Structured document/file names → single normalizer (AD1).
                  // `file_names` is a fallback the old code dropped on the floor.
                  const documentNames = normalizeSourceNames(
                    (p.document_names ?? p.file_names) as unknown,
                  );
                  const rowCount = typeof p.row_count === 'number' ? p.row_count : undefined;

                  setState((s) => ({
                    ...s,
                    toolOutputs: [...s.toolOutputs, toolOutput],
                    // Enrich the matching tool card with source names
                    toolCards: s.toolCards.map((c) =>
                      c.id === toolId
                        ? {
                            ...c,
                            source_names: documentNames.length > 0 ? documentNames : c.source_names,
                            row_count: rowCount ?? c.row_count,
                          }
                        : c
                    ),
                  }));
                }
                break;
              }
              case 'token': {
                const t = extractSseTokenPiece(payload);
                if (t) {
                  tokenBuffer += t;
                  pendingMasked += maskDelta(t);
                  scheduleFlush();
                }
                break;
              }
              case 'text_reset': {
                // Backend signals end of an intermediate ReAct turn that
                // streamed reasoning preamble before a tool_use. Wipe the
                // streamed answer so the next turn's text starts on a
                // clean slate — keeps the chat message free of "thinking"
                // leaks while preserving live streaming during each turn.
                if (flushTimer) {
                  clearTimeout(flushTimer);
                  flushTimer = null;
                }
                pendingMasked = '';
                tokenBuffer = '';
                setState((s) => ({ ...s, streamedAnswer: '' }));
                break;
              }
              case 'thinking_token': {
                const delta = payload && typeof (payload as { delta?: string }).delta === 'string'
                  ? (payload as { delta: string }).delta
                  : '';
                if (delta) {
                  const maskedDelta = maskDelta(delta);
                  setState((s) => ({ ...s, thinkingTokenBuffer: s.thinkingTokenBuffer + maskedDelta }));
                }
                break;
              }
              case 'done': {
                flushTokens();
                if (payload) {
                  const finished = normalizeNotes9AgentResponse(payload);
                  donePayload = finished;
                  const answerOverride =
                    typeof payload.answer === 'string' ? payload.answer : '';
                  setState((s) => ({
                    ...s,
                    donePayload: finished,
                    streamedAnswer:
                      finished.content || answerOverride || s.streamedAnswer,
                  }));
                }
                break;
              }
              case 'error': {
                flushTokens();
                const msg =
                  payload && typeof (payload as { error?: string }).error === 'string'
                    ? (payload as { error: string }).error
                    : 'Agent stream error';
                streamError = msg;
                setState((s) => ({ ...s, error: msg }));
                break;
              }
              default:
                break;
            }
          }
        }

        if (streamError) {
          setState((s) => ({ ...s, isStreaming: false }));
          return { donePayload: null, error: streamError, artifacts: collectedArtifacts, citationsManifest: collectedManifest, graphs: collectedGraphs };
        }

        if (!donePayload) {
          const mergedFromTokens = mergeTokenBufferIntoAssistantRaw(null, tokenBuffer);
          if (mergedFromTokens) {
            const synthetic = normalizeNotes9AgentResponse(mergedFromTokens);
            donePayload = synthetic;
            setState((s) => ({
              ...s,
              donePayload: synthetic,
              streamedAnswer: synthetic.content,
              isStreaming: false,
            }));
            return { donePayload: synthetic, error: null, artifacts: collectedArtifacts, citationsManifest: collectedManifest, graphs: collectedGraphs };
          }
          const errMsg = 'No response from agent stream';
          setState((s) => ({ ...s, error: errMsg, isStreaming: false }));
          return { donePayload: null, error: errMsg, artifacts: collectedArtifacts, citationsManifest: collectedManifest, graphs: collectedGraphs };
        }

        setState((s) => ({ ...s, isStreaming: false }));
        return { donePayload, error: null, artifacts: collectedArtifacts, citationsManifest: collectedManifest, graphs: collectedGraphs };
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          recordRumEvent('agent_stream_aborted', {});
          // Stop should not discard what already streamed. Synthesize a done
          // payload from the accumulated tokens so the caller's normal save path
          // persists the partial answer as an assistant message.
          const abortedRaw = mergeTokenBufferIntoAssistantRaw(null, tokenBuffer);
          if (abortedRaw) {
            const partial = normalizeNotes9AgentResponse(abortedRaw);
            setState((s) => ({ ...s, streamedAnswer: partial.content, isStreaming: false }));
            return { donePayload: partial, error: null, artifacts: collectedArtifacts, citationsManifest: collectedManifest, graphs: collectedGraphs };
          }
          setState((s) => ({ ...s, isStreaming: false }));
          return { donePayload: null, error: null, artifacts: collectedArtifacts, citationsManifest: collectedManifest, graphs: collectedGraphs };
        }
        const errMsg = err instanceof Error ? err.message : 'Agent stream failed';
        recordRumEvent('agent_stream_error', { message: errMsg });
        setState((s) => ({
          ...s,
          error: errMsg,
          isStreaming: false,
        }));
        return { donePayload: null, error: errMsg, artifacts: collectedArtifacts, citationsManifest: collectedManifest, graphs: collectedGraphs };
      } finally {
        // Cancel any pending token flush so it can't fire after the run resolves
        // (done/error/text_reset already flushed the buffer synchronously).
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        abortControllerRef.current = null;
      }
    },
    []
  );

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  /** Stop an in-flight run: ask the backend to cancel it (best-effort, only
   * effective when a runId was emitted) and abort the local stream so the UI
   * settles immediately. Safe to call when no run is active. */
  const cancel = useCallback(() => {
    const rid = runIdRef.current;
    const tok = tokenRef.current;
    if (rid && tok) {
      // Fire-and-forget: the backend cancel flag is idempotent and the abort
      // below stops the stream regardless of whether this request lands.
      fetch(`/api/agent/runs/${encodeURIComponent(rid)}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}` },
      }).catch(() => { /* abort still settles the UI */ });
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      thinkingSteps: [],
      currentStage: null,
      currentThinkingMessage: null,
      currentThinkingDetail: null,
      currentStageProgress: null,
      currentStageElapsedS: null,
      toolCards: [],
      artifacts: [],
      graphs: [],
      synthesisPlan: null,
      sql: null,
      ragChunks: null,
      citationsManifest: null,
      toolOutputs: [],
      streamedAnswer: '',
      thinkingTokenBuffer: '',
      liveCitationCount: 0,
      runId: null,
      donePayload: null,
      error: null,
      isStreaming: false,
    });
    runIdRef.current = null;
  }, []);

  return {
    ...state,
    runStream,
    abort,
    cancel,
    reset,
  };
}
