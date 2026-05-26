'use client';

import { useState, useCallback, useRef } from 'react';
import type {
  ThinkingPayload,
  RagChunksPayload,
  DonePayload,
  RagChunk,
} from '@/lib/agent-stream-types';
import { buildNotes9AgentRequestBody } from '@/lib/notes9-agent-request';
import { splitSseBuffer, parseSseDataJson } from '@/lib/sse-event-blocks';
import { recordRumEvent } from '@/lib/rum';
import {
  extractSseTokenPiece,
  mergeTokenBufferIntoAssistantRaw,
} from '@/lib/sse-stream-assistant-merge';
import {
  coalesceAgentExcerpt,
  coalesceAgentSourceId,
  normalizeAgentRelevance0to1,
} from '@/lib/document-highlight';

/**
 * Direct backend URL used for SSE streaming — the browser holds this connection
 * open itself, so there is no Vercel function timeout regardless of how long the
 * agent takes. Falls back to the Vercel proxy only when the public URL is absent.
 */
const BACKEND_BASE = process.env.NEXT_PUBLIC_CHAT_API_URL?.replace(/\/$/, '') || '';
const DIRECT_STREAM_URL = BACKEND_BASE ? `${BACKEND_BASE}/notes9/stream` : '';
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
    tags?: Array<{ kind: string; id: string; title: string }>;
    web_search?: 'on' | 'off';
  };
}

export interface CitationsManifest {
  manifest: Record<string, {
    /** Display number `[N]` the answer text uses (also the key). */
    index?: number;
    /** Stable per-source token from Option C citations (`lit_7c4f`, `lab_a1b2`).
     * Present even when the answer renders numerics — lets the chip stay bound
     * to source identity if display numbering shifts during a re-render. */
    token?: string;
    source_type: string;
    /** Server-side identity for the source. Backend intentionally omits raw
     * UUIDs from the wire payload (see CitationResponse), so this is almost
     * always absent in practice — kept optional so consumers don't crash on
     * the missing field. Bind chips to `token`, not `source_id`. */
    source_id?: string;
    source_name?: string;
    source_url?: string;
    excerpt?: string;
  }>;
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

/** Thinking stage values emitted by the backend */
export type ThinkingStage =
  | 'understanding'
  | 'searching'
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
  /** Live tool cards — keyed by tool id */
  toolCards: ToolCard[];
  sql: string | null;
  ragChunks: RagChunksPayload | null;
  citationsManifest: CitationsManifest | null;
  toolOutputs: ToolOutput[];
  streamedAnswer: string;
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
  return {
    role,
    content,
    answer: content,
    resources,
    citations,
    confidence,
    tool_used: tool_used ?? 'none',
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
  'understanding', 'searching', 'analyzing', 'synthesizing',
  'composing', 'validating', 'done',
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
    toolCards: [],
    sql: null,
    ragChunks: null,
    citationsManifest: null,
    toolOutputs: [],
    streamedAnswer: '',
    donePayload: null,
    error: null,
    isStreaming: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const runStream = useCallback(
    async (
      params: AgentStreamParams,
      token: string
    ): Promise<{ donePayload: DonePayload | null; error: string | null }> => {
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      setState({
        thinkingSteps: [],
        currentStage: null,
        currentThinkingMessage: null,
        currentThinkingDetail: null,
        toolCards: [],
        sql: null,
        ragChunks: null,
        citationsManifest: null,
        toolOutputs: [],
        streamedAnswer: '',
        donePayload: null,
        error: null,
        isStreaming: true,
      });

      let donePayload: DonePayload | null = null;
      let streamError: string | null = null;
      let tokenBuffer = '';

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
          return { donePayload: null, error: errMsg };
        }

        if (!response.body) {
          const errMsg = 'Agent stream returned an empty body';
          setState((s) => ({ ...s, error: errMsg, isStreaming: false }));
          return { donePayload: null, error: errMsg };
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
              case 'thinking': {
                const step = thinkingFromPayload(payload);
                if (step) {
                  const p = payload as Record<string, unknown>;
                  const stage = normalizeStage(p?.stage);
                  const detail = typeof p?.detail === 'string' ? p.detail as string : undefined;
                  const node = typeof p?.node === 'string' ? p.node : '';
                  const status = typeof p?.status === 'string' ? p.status : '';
                  const message = step.message || '';

                  setState((s) => {
                    let toolCards = s.toolCards;

                    // Extract names from RAG completed thinking message: "Retrieved N chunk(s) from: Name1, Name2"
                    if (node === 'rag' && status === 'completed' && message.includes(' from: ')) {
                      const afterFrom = message.split(' from: ')[1] || '';
                      const rawNames = afterFrom.replace(' and more', '').split(', ').filter(Boolean);
                      if (rawNames.length > 0) {
                        toolCards = s.toolCards.map((c) =>
                          c.id === 'rag_tool' && (!c.source_names || c.source_names.length === 0)
                            ? { ...c, source_names: rawNames }
                            : c
                        );
                      }
                    }

                    // Extract names from SQL completed thinking message: "Found N results: Name1, Name2"
                    if (node === 'sql' && status === 'completed' && message.includes(': ')) {
                      const afterColon = message.split(': ').slice(1).join(': ');
                      const rawNames = afterColon.replace(/ and \d+ more$/, '').split(', ').filter(Boolean);
                      if (rawNames.length > 0) {
                        toolCards = s.toolCards.map((c) =>
                          c.id === 'nlp_to_sql_tool' && (!c.source_names || c.source_names.length === 0)
                            ? { ...c, source_names: rawNames }
                            : c
                        );
                      }
                    }

                    return {
                      ...s,
                      toolCards,
                      thinkingSteps: [...s.thinkingSteps, step],
                      currentStage: stage ?? s.currentStage,
                      currentThinkingMessage: step.message,
                      currentThinkingDetail: detail ?? null,
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
                  const quality = typeof p.quality === 'string' ? p.quality : '';
                  const status = (quality === 'error' || p.status === 'error' ? 'error' : 'done') as 'done' | 'error';
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
                  const quality = typeof p.quality === 'string' ? p.quality : '';
                  const status = (quality === 'error' || p.status === 'error' ? 'error' : 'done') as 'done' | 'error';
                  const serverLabel = typeof p.label === 'string' ? p.label : '';

                  const sourceNames = Array.isArray(p.source_names)
                    ? (p.source_names as unknown[]).filter((n): n is string => typeof n === 'string')
                    : [];

                  setState((s) => ({
                    ...s,
                    toolCards: s.toolCards.map((c) => {
                      if (c.id !== toolId) return c;
                      return {
                        ...c,
                        label: serverLabel || c.label,
                        status: c.status === 'running' ? status : c.status,
                        citations_count: typeof p.citations_count === 'number' ? p.citations_count : c.citations_count,
                        latency_ms: typeof p.latency_ms === 'number' ? p.latency_ms : c.latency_ms,
                        summary: typeof p.preview === 'string' ? p.preview : c.summary,
                        source_names: sourceNames.length > 0 ? sourceNames : c.source_names,
                      };
                    }),
                  }));
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
                  // Extract unique source names from chunks to display in tool card
                  const seenRag = new Set<string>();
                  const ragSourceNames: string[] = [];
                  for (const chunk of rag.chunks) {
                    const n = chunk.source_name?.trim();
                    if (n && !seenRag.has(n.toLowerCase())) {
                      seenRag.add(n.toLowerCase());
                      ragSourceNames.push(n.length > 80 ? n.slice(0, 77) + '…' : n);
                    }
                    if (ragSourceNames.length >= 5) break;
                  }
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
                // Citation manifest for inline [N] resolution
                const manifest = payload as CitationsManifest | null;
                if (manifest?.manifest) {
                  setState((s) => ({ ...s, citationsManifest: manifest }));
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

                  // Extract source names from document_names (RAG) or file_names (SQL)
                  const documentNames = Array.isArray(p.document_names)
                    ? (p.document_names as unknown[]).filter((n): n is string => typeof n === 'string')
                    : [];
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
                  setState((s) => ({ ...s, streamedAnswer: s.streamedAnswer + t }));
                }
                break;
              }
              case 'text_reset': {
                // Backend signals end of an intermediate ReAct turn that
                // streamed reasoning preamble before a tool_use. Wipe the
                // streamed answer so the next turn's text starts on a
                // clean slate — keeps the chat message free of "thinking"
                // leaks while preserving live streaming during each turn.
                tokenBuffer = '';
                setState((s) => ({ ...s, streamedAnswer: '' }));
                break;
              }
              case 'done': {
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
          return { donePayload: null, error: streamError };
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
            return { donePayload: synthetic, error: null };
          }
          const errMsg = 'No response from agent stream';
          setState((s) => ({ ...s, error: errMsg, isStreaming: false }));
          return { donePayload: null, error: errMsg };
        }

        setState((s) => ({ ...s, isStreaming: false }));
        return { donePayload, error: null };
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          recordRumEvent('agent_stream_aborted', {});
          setState((s) => ({ ...s, isStreaming: false }));
          return { donePayload: null, error: null };
        }
        const errMsg = err instanceof Error ? err.message : 'Agent stream failed';
        recordRumEvent('agent_stream_error', { message: errMsg });
        setState((s) => ({
          ...s,
          error: errMsg,
          isStreaming: false,
        }));
        return { donePayload: null, error: errMsg };
      } finally {
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

  const reset = useCallback(() => {
    setState({
      thinkingSteps: [],
      currentStage: null,
      currentThinkingMessage: null,
      currentThinkingDetail: null,
      toolCards: [],
      sql: null,
      ragChunks: null,
      citationsManifest: null,
      toolOutputs: [],
      streamedAnswer: '',
      donePayload: null,
      error: null,
      isStreaming: false,
    });
  }, []);

  return {
    ...state,
    runStream,
    abort,
    reset,
  };
}
