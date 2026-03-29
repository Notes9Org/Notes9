'use client';

import { useState, useCallback, useRef } from 'react';
import type { Notes9AgentHistoryItem } from '@/lib/notes9-agent-request';

/** Reference entry from POST /paper-analyzer `structured.references`. */
export type PaperAnalyzerReference = {
  index: number;
  literature_review_id: string;
  title?: string | null;
  doi?: string | null;
  pmid?: string | null;
  supporting_sentences?: string[];
  note?: string | null;
};

/** Source card from POST /paper-analyzer `sources`. */
export type PaperAnalyzerSource = {
  literature_review_id: string;
  title?: string | null;
  authors?: string | null;
  journal?: string | null;
  publication_year?: number | null;
  doi?: string | null;
  pmid?: string | null;
  abstract?: string | null;
  catalog_placement?: string | null;
  has_extracted_text?: boolean;
  extracted_text_char_count?: number;
  context_sent_to_model_was_truncated?: boolean;
};

export type LiteratureAgentDonePayload = {
  role: string;
  content: string;
  answer: string;
  session_id?: string;
  structured?: { references?: PaperAnalyzerReference[] };
  sources?: PaperAnalyzerSource[];
  debug?: unknown;
};

export interface LiteratureAgentStreamState {
  donePayload: LiteratureAgentDonePayload | null;
  error: string | null;
  isStreaming: boolean;
}

function normalizeResponse(raw: Record<string, unknown>): LiteratureAgentDonePayload {
  const content =
    typeof raw.content === 'string'
      ? raw.content
      : typeof raw.answer === 'string'
        ? raw.answer
        : typeof raw.message === 'string'
          ? raw.message
          : '';
  const role = typeof raw.role === 'string' ? raw.role : 'assistant';
  const structured =
    raw.structured && typeof raw.structured === 'object' && !Array.isArray(raw.structured)
      ? (raw.structured as LiteratureAgentDonePayload['structured'])
      : undefined;
  const sources = Array.isArray(raw.sources) ? (raw.sources as PaperAnalyzerSource[]) : undefined;
  const session_id = typeof raw.session_id === 'string' ? raw.session_id : undefined;
  const debug = raw.debug;
  return {
    role,
    content,
    answer: content,
    ...(session_id ? { session_id } : {}),
    ...(structured ? { structured } : {}),
    ...(sources ? { sources } : {}),
    ...(debug !== undefined ? { debug } : {}),
  };
}

export type LiteratureAgentRequestBody = {
  query: string;
  session_id: string;
  history?: Notes9AgentHistoryItem[];
  literature_review_ids: string[];
  options?: { debug?: boolean };
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

        const donePayload = normalizeResponse(raw);
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
