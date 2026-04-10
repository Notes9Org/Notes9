'use client';

import { useState, useCallback, useRef } from 'react';
import type { Notes9AgentHistoryItem } from '@/lib/notes9-agent-request';
import { splitSseBuffer, parseSseDataJson } from '@/lib/sse-event-blocks';
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

export interface LiteratureAgentRequestBody {
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
}

export type LiteratureClarifyPending = {
  question: string;
  options: string[];
  pendingQuery: string;
  pendingSessionId: string;
  pendingHistory: Notes9AgentHistoryItem[];
  pendingLiteratureIds: string[];
  pendingOptions: LiteratureAgentRequestBody['options'];
};

export interface LiteratureAgentStreamState {
  donePayload: LiteratureAgentDonePayload | null;
  error: string | null;
  isStreaming: boolean;
  steps: string[];
  clarify: LiteratureClarifyPending | null;
}

function stepTextFromPayload(payload: Record<string, unknown> | null): string {
  if (!payload) return '';
  const c = payload.content;
  if (typeof c === 'string' && c.trim()) return c.trim();
  const t = payload.text;
  if (typeof t === 'string' && t.trim()) return t.trim();
  return '';
}

function resultEventToRaw(payload: Record<string, unknown>): Record<string, unknown> {
  const content =
    typeof payload.content === 'string'
      ? payload.content
      : typeof payload.answer === 'string'
        ? payload.answer
        : '';
  const raw: Record<string, unknown> = {
    role: typeof payload.role === 'string' ? payload.role : 'assistant',
    content,
    answer: content,
  };
  if (payload.session_id) raw.session_id = payload.session_id;
  if (payload.structured && typeof payload.structured === 'object') {
    raw.structured = payload.structured;
  }
  if (Array.isArray(payload.references)) {
    raw.references = payload.references;
  }
  if (Array.isArray(payload.sources)) raw.sources = payload.sources;
  if (payload.debug !== undefined) raw.debug = payload.debug;
  return raw;
}

export function useLiteratureAgentStream() {
  const [state, setState] = useState<LiteratureAgentStreamState>({
    donePayload: null,
    error: null,
    isStreaming: false,
    steps: [],
    clarify: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const clarifyRef = useRef<LiteratureClarifyPending | null>(null);

  const runCompareJson = useCallback(
    async (
      body: LiteratureAgentRequestBody,
      token: string,
      signal: AbortSignal
    ): Promise<{ donePayload: LiteratureAgentDonePayload | null; error: string | null }> => {
      const response = await fetch('/api/literature/agent/compare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        const errMsg =
          typeof raw.error === 'string' ? raw.error : `Request failed: ${response.status}`;
        return { donePayload: null, error: errMsg };
      }

      return { donePayload: normalizeLiteratureAgentResponse(raw), error: null };
    },
    []
  );

  const consumeBiomniSse = useCallback(
    async (
      body: LiteratureAgentRequestBody,
      token: string,
      skipClarify: boolean,
      signal: AbortSignal,
      onStep: (line: string) => void
    ): Promise<{
      donePayload: LiteratureAgentDonePayload | null;
      error: string | null;
      clarify: LiteratureClarifyPending | null;
    }> => {
      const mergedOptions = {
        ...body.options,
        skip_clarify: skipClarify || body.options?.skip_clarify === true,
      };

      const response = await fetch('/api/literature/agent/biomni-stream', {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: body.query,
          session_id: body.session_id,
          history: body.history ?? [],
          literature_review_ids: body.literature_review_ids,
          mode: 'research_design',
          options: mergedOptions,
        }),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = errText || `Request failed: ${response.status}`;
        try {
          const j = JSON.parse(errText) as { error?: string };
          if (typeof j.error === 'string') errMsg = j.error;
        } catch {
          /* plain */
        }
        return { donePayload: null, error: errMsg, clarify: null };
      }

      const reader = response.body?.getReader();
      if (!reader) {
        return { donePayload: null, error: 'No response body', clarify: null };
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let errored = false;
      let errorMessage: string | null = null;
      let resultRaw: Record<string, unknown> | null = null;
      let clarifyPending: LiteratureClarifyPending | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { blocks, rest } = splitSseBuffer(buffer);
        buffer = rest;

        for (const block of blocks) {
          const payload = parseSseDataJson(block.data);

          switch (block.event) {
            case 'ping':
            case 'started':
              break;
            case 'step':
            case 'thinking': {
              const text = stepTextFromPayload(payload);
              if (text) onStep(text);
              break;
            }
            case 'clarify': {
              if (!payload) break;
              const question =
                typeof payload.question === 'string'
                  ? payload.question
                  : typeof (payload as { clarify_question?: string }).clarify_question === 'string'
                    ? (payload as { clarify_question: string }).clarify_question
                    : '';
              const options = Array.isArray(payload.options)
                ? payload.options.filter((o): o is string => typeof o === 'string')
                : [];
              clarifyPending = {
                question: question || 'Please provide more detail.',
                options,
                pendingQuery: body.query,
                pendingSessionId: body.session_id,
                pendingHistory: body.history ?? [],
                pendingLiteratureIds: body.literature_review_ids,
                pendingOptions: body.options,
              };
              break;
            }
            case 'result':
              if (payload) resultRaw = resultEventToRaw(payload);
              break;
            case 'error': {
              errored = true;
              const msg =
                typeof payload?.message === 'string'
                  ? payload.message
                  : typeof payload?.error === 'string'
                    ? payload.error
                    : 'Stream error';
              errorMessage = msg;
              break;
            }
            case 'done':
              break;
            default:
              break;
          }
        }
      }

      if (clarifyPending && !errored) {
        return { donePayload: null, error: null, clarify: clarifyPending };
      }

      if (errored) {
        return { donePayload: null, error: errorMessage || 'Stream error', clarify: null };
      }

      if (resultRaw) {
        return {
          donePayload: normalizeLiteratureAgentResponse(resultRaw),
          error: null,
          clarify: null,
        };
      }

      return {
        donePayload: null,
        error: null,
        clarify: null,
      };
    },
    []
  );

  const runRequest = useCallback(
    async (
      endpoint: 'compare' | 'biomni',
      body: LiteratureAgentRequestBody,
      token: string,
      options?: { skipClarify?: boolean }
    ): Promise<{ donePayload: LiteratureAgentDonePayload | null; error: string | null }> => {
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      clarifyRef.current = null;

      setState({
        donePayload: null,
        error: null,
        isStreaming: true,
        steps: [],
        clarify: null,
      });

      try {
        if (endpoint === 'compare') {
          const { donePayload, error } = await runCompareJson(body, token, signal);
          setState((s) => ({
            ...s,
            donePayload,
            error,
            isStreaming: false,
            steps: [],
            clarify: null,
          }));
          abortControllerRef.current = null;
          return { donePayload, error };
        }

        const skipClarify = options?.skipClarify === true;
        const onStep = (line: string) => {
          setState((s) => ({ ...s, steps: [...s.steps, line] }));
        };

        const { donePayload, error, clarify } = await consumeBiomniSse(
          body,
          token,
          skipClarify,
          signal,
          onStep
        );

        if (clarify) {
          clarifyRef.current = clarify;
          abortControllerRef.current = null;
          setState((s) => ({
            ...s,
            donePayload: null,
            error: null,
            isStreaming: false,
            clarify,
          }));
          return { donePayload: null, error: null };
        }

        setState((s) => ({
          ...s,
          donePayload,
          error,
          isStreaming: false,
          clarify: null,
        }));
        abortControllerRef.current = null;
        return { donePayload, error };
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setState((s) => ({ ...s, isStreaming: false, clarify: null }));
          abortControllerRef.current = null;
          clarifyRef.current = null;
          return { donePayload: null, error: null };
        }
        const errMsg = err instanceof Error ? err.message : 'Literature agent request failed';
        setState((s) => ({
          ...s,
          error: errMsg,
          isStreaming: false,
          clarify: null,
        }));
        abortControllerRef.current = null;
        clarifyRef.current = null;
        return { donePayload: null, error: errMsg };
      }
    },
    [runCompareJson, consumeBiomniSse]
  );

  const answerClarify = useCallback(
    async (answer: string, token: string) => {
      const c = clarifyRef.current;
      if (!c) return { donePayload: null as LiteratureAgentDonePayload | null, error: 'No pending clarification' };

      const newHistory: Notes9AgentHistoryItem[] = [
        ...c.pendingHistory,
        { role: 'assistant', content: c.question },
        { role: 'user', content: answer },
      ];

      const body: LiteratureAgentRequestBody = {
        query: c.pendingQuery,
        session_id: c.pendingSessionId,
        history: newHistory,
        literature_review_ids: c.pendingLiteratureIds,
        options: c.pendingOptions,
      };

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      clarifyRef.current = null;

      setState((s) => ({
        ...s,
        clarify: null,
        isStreaming: true,
        error: null,
        donePayload: null,
        steps: [],
      }));

      try {
        const onStep = (line: string) => {
          setState((s) => ({ ...s, steps: [...s.steps, line] }));
        };

        const { donePayload, error, clarify } = await consumeBiomniSse(body, token, false, signal, onStep);

        if (clarify) {
          clarifyRef.current = clarify;
          abortControllerRef.current = null;
          setState((s) => ({
            ...s,
            donePayload: null,
            error: null,
            isStreaming: false,
            clarify,
          }));
          return { donePayload: null, error: null };
        }

        setState((s) => ({
          ...s,
          donePayload,
          error,
          isStreaming: false,
          clarify: null,
        }));
        abortControllerRef.current = null;
        return { donePayload, error };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Request failed';
        setState((s) => ({ ...s, error: errMsg, isStreaming: false, clarify: null }));
        abortControllerRef.current = null;
        clarifyRef.current = null;
        return { donePayload: null, error: errMsg };
      }
    },
    [consumeBiomniSse]
  );

  const skipClarify = useCallback(
    async (token: string) => {
      const c = clarifyRef.current;
      if (!c) return { donePayload: null as LiteratureAgentDonePayload | null, error: 'No pending clarification' };

      const body: LiteratureAgentRequestBody = {
        query: c.pendingQuery,
        session_id: c.pendingSessionId,
        history: c.pendingHistory,
        literature_review_ids: c.pendingLiteratureIds,
        options: c.pendingOptions,
      };

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      clarifyRef.current = null;

      setState((s) => ({
        ...s,
        clarify: null,
        isStreaming: true,
        error: null,
        donePayload: null,
        steps: [],
      }));

      try {
        const onStep = (line: string) => {
          setState((s) => ({ ...s, steps: [...s.steps, line] }));
        };

        const { donePayload, error, clarify } = await consumeBiomniSse(body, token, true, signal, onStep);

        if (clarify) {
          clarifyRef.current = clarify;
          abortControllerRef.current = null;
          setState((s) => ({
            ...s,
            donePayload: null,
            error: null,
            isStreaming: false,
            clarify,
          }));
          return { donePayload: null, error: null };
        }

        setState((s) => ({
          ...s,
          donePayload,
          error,
          isStreaming: false,
          clarify: null,
        }));
        abortControllerRef.current = null;
        return { donePayload, error };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Request failed';
        setState((s) => ({ ...s, error: errMsg, isStreaming: false, clarify: null }));
        abortControllerRef.current = null;
        clarifyRef.current = null;
        return { donePayload: null, error: errMsg };
      }
    },
    [consumeBiomniSse]
  );

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const reset = useCallback(() => {
    clarifyRef.current = null;
    setState({
      donePayload: null,
      error: null,
      isStreaming: false,
      steps: [],
      clarify: null,
    });
  }, []);

  return {
    ...state,
    runRequest,
    answerClarify,
    skipClarify,
    abort,
    reset,
  };
}
