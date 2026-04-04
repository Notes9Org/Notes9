'use client';

import { useState, useCallback, useRef } from 'react';
import type { Notes9AgentHistoryItem } from '@/lib/notes9-agent-request';
import {
  type LiteratureAgentDonePayload,
  type PaperAnalyzerReference,
  type PaperAnalyzerSource,
  normalizeLiteratureAgentResponse,
} from '@/lib/literature-agent-types';

export type {
  PaperAnalyzerReference,
  PaperAnalyzerSource,
  LiteratureAgentDonePayload,
};

export interface LiteratureAgentStreamState {
  donePayload: LiteratureAgentDonePayload | null;
  error: string | null;
  isStreaming: boolean;
}

/** Biomni (`/biomni/literature`) options; compare mode only uses `debug` upstream. */
export type LiteratureAgentRequestBody = {
  query: string;
  session_id: string;
  history?: Notes9AgentHistoryItem[];
  literature_review_ids: string[];
  options?: {
    debug?: boolean;
    skip_clarify?: boolean;
    max_clarify_rounds?: number;
    include_reasoning_trace?: boolean;
  };
};

export function useLiteratureAgentStream() {
  const [state, setState] = useState<LiteratureAgentStreamState>({
    donePayload: null,
    error: null,
    isStreaming: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const runRequest = useCallback(
    async (
      endpoint: 'compare' | 'biomni',
      body: LiteratureAgentRequestBody,
      token: string
    ): Promise<{ donePayload: LiteratureAgentDonePayload | null; error: string | null }> => {
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      setState({
        donePayload: null,
        error: null,
        isStreaming: true,
      });

      try {
        const path =
          endpoint === 'compare'
            ? '/api/literature/agent/compare'
            : '/api/literature/agent/biomni';
        const payload =
          endpoint === 'biomni'
            ? { ...body, mode: 'research_design' as const }
            : body;

        const response = await fetch(path, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
          signal,
        });

        const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;

        if (!response.ok) {
          const errMsg =
            typeof raw.error === 'string'
              ? raw.error
              : `Request failed: ${response.status}`;
          setState((s) => ({ ...s, error: errMsg, isStreaming: false }));
          return { donePayload: null, error: errMsg };
        }

        const donePayload = normalizeLiteratureAgentResponse(raw);
        setState((s) => ({
          ...s,
          donePayload,
          isStreaming: false,
        }));
        return { donePayload, error: null };
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setState((s) => ({ ...s, isStreaming: false }));
          return { donePayload: null, error: null };
        }
        const errMsg = err instanceof Error ? err.message : 'Literature agent request failed';
        setState((s) => ({ ...s, error: errMsg, isStreaming: false }));
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
      donePayload: null,
      error: null,
      isStreaming: false,
    });
  }, []);

  return {
    ...state,
    runRequest,
    abort,
    reset,
  };
}
