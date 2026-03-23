'use client';

import { useState, useCallback, useRef } from 'react';
import type {
  ThinkingPayload,
  RagChunksPayload,
  DonePayload,
} from '@/lib/agent-stream-types';
import { buildNotes9AgentRequestBody } from '@/lib/notes9-agent-request';

/** Request shape for POST /notes9 (proxied via /api/agent/run). */
export interface AgentStreamParams {
  query: string;
  session_id: string;
  history?: Array<{ role: string; content: string }>;
  scope?: object | null;
  options?: { debug?: boolean; max_retries?: number };
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

      try {
        const response = await fetch('/api/agent/run', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(buildNotes9AgentRequestBody(params)),
          signal,
        });

        const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;

        if (!response.ok) {
          const errMsg =
            typeof raw.error === 'string'
              ? raw.error
              : `Request failed: ${response.status}`;
          setState((s) => ({
            ...s,
            error: errMsg,
            isStreaming: false,
          }));
          return { donePayload: null, error: errMsg };
        }

        const donePayload = normalizeNotes9AgentResponse(raw);
        setState((s) => ({
          ...s,
          donePayload,
          streamedAnswer: donePayload.content,
          isStreaming: false,
        }));
        return { donePayload, error: null };
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setState((s) => ({ ...s, isStreaming: false }));
          return { donePayload: null, error: null };
        }
        const errMsg = err instanceof Error ? err.message : 'Agent request failed';
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
