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

export interface AgentStreamState {
  thinkingSteps: ThinkingPayload[];
  sql: string | null;
  ragChunks: RagChunksPayload | null;
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

export function useAgentStream() {
  const [state, setState] = useState<AgentStreamState>({
    thinkingSteps: [],
    sql: null,
    ragChunks: null,
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
        sql: null,
        ragChunks: null,
        streamedAnswer: '',
        donePayload: null,
        error: null,
        isStreaming: true,
      });

      let donePayload: DonePayload | null = null;
      let streamError: string | null = null;
      let tokenBuffer = '';

      try {
        const response = await fetch('/api/agent/stream', {
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
                  setState((s) => ({
                    ...s,
                    thinkingSteps: [...s.thinkingSteps, step],
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
      sql: null,
      ragChunks: null,
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
