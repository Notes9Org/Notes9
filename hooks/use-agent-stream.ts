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
const DIRECT_STREAM_URL =
  (process.env.NEXT_PUBLIC_CHAT_API_URL?.replace(/\/$/, '') || '') + '/notes9/stream';
const PROXY_STREAM_URL = '/api/agent/stream';

/** Request shape for POST /notes9/stream (proxied via /api/agent/stream). */
export interface AgentStreamParams {
  query: string;
  session_id: string;
  history?: Array<{ role: string; content: string }>;
  scope?: object | null;
  options?: {
    debug?: boolean;
    max_retries?: number;
    tags?: Array<{ kind: string; id: string; title: string }>;
  };
}

export interface CitationsManifest {
  manifest: Record<string, {
    source_type: string;
    source_id: string;
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

const TOOL_LABELS: Record<string, { label: string }> = {
  nlp_to_sql_tool:        { label: 'Querying workspace records' },
  rag_tool:               { label: 'Searching notes & documents' },
  web_search_tool:        { label: 'Searching the web' },
  full_record_fetch_tool: { label: 'Fetching document' },
  document_analysis_tool: { label: 'Analyzing literature' },
  biomni_tool:            { label: 'Designing experiment (Biomni)' },
  biomni_full_tool:       { label: 'Running Biomni full' },
  llm_chat_tool:          { label: 'Reasoning' },
  extract_data_tool:      { label: 'Extracting data' },
  episodic_memory_tool:   { label: 'Checking memory' },
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
        const streamUrl = DIRECT_STREAM_URL || PROXY_STREAM_URL;
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
                  const stage = normalizeStage((payload as Record<string, unknown>)?.stage);
                  const detail =
                    typeof (payload as Record<string, unknown>)?.detail === 'string'
                      ? (payload as Record<string, unknown>).detail as string
                      : undefined;
                  setState((s) => ({
                    ...s,
                    thinkingSteps: [...s.thinkingSteps, step],
                    currentStage: stage ?? s.currentStage,
                    currentThinkingMessage: step.message,
                    currentThinkingDetail: detail ?? null,
                  }));
                }
                break;
              }
              case 'tool_start': {
                if (payload && typeof payload === 'object') {
                  const p = payload as Record<string, unknown>;
                  const toolId = typeof p.tool === 'string' ? p.tool : 'unknown';
                  const labelEntry = TOOL_LABELS[toolId] ?? { icon: '🔧', label: toolId };
                  const card: ToolCard = {
                    id: toolId,
                    label: labelEntry.label,
                    args_preview: typeof p.args_preview === 'string' ? p.args_preview : undefined,
                    status: 'running',
                  };
                  setState((s) => ({
                    ...s,
                    // Replace existing card for this tool (re-runs), or append
                    toolCards: [
                      ...s.toolCards.filter((c) => c.id !== toolId || c.status === 'done' || c.status === 'error'),
                      card,
                    ],
                  }));
                }
                break;
              }
              case 'tool_call':
              case 'tool_result': {
                if (payload && typeof payload === 'object') {
                  const p = payload as Record<string, unknown>;
                  const toolId = typeof p.tool === 'string' ? p.tool : 'unknown';
                  const status = (p.status === 'error' ? 'error' : 'done') as 'done' | 'error';
                  setState((s) => ({
                    ...s,
                    toolCards: s.toolCards.map((c) =>
                      c.id === toolId && c.status === 'running'
                        ? {
                            ...c,
                            status,
                            summary: typeof p.summary === 'string' ? p.summary : undefined,
                            citations_count: typeof p.citations_count === 'number' ? p.citations_count : undefined,
                            latency_ms: typeof p.latency_ms === 'number' ? p.latency_ms : undefined,
                          }
                        : c
                    ),
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
                if (rag) setState((s) => ({ ...s, ragChunks: rag }));
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
                  const toolOutput: ToolOutput = {
                    tool: (payload as { tool?: string }).tool || 'unknown',
                    success: (payload as { success?: boolean }).success ?? true,
                    details: payload as Record<string, unknown>,
                  };
                  setState((s) => ({
                    ...s,
                    toolOutputs: [...s.toolOutputs, toolOutput],
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
          setState((s) => ({ ...s, isStreaming: false }));
          return { donePayload: null, error: null };
        }
        const errMsg = err instanceof Error ? err.message : 'Agent stream failed';
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
