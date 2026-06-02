'use client';

import { useState, useCallback, useRef } from 'react';
import type { Notes9AgentHistoryItem } from '@/lib/notes9-agent-request';
import { splitSseBuffer, parseSseDataJson } from '@/lib/sse-event-blocks';
import {
  extractSseTokenPiece,
  mergeTokenBufferIntoAssistantRaw,
} from '@/lib/sse-stream-assistant-merge';
import {
  type LiteratureAgentDonePayload,
  type PaperAnalyzerReference,
  type PaperAnalyzerSource,
  normalizeLiteratureAgentResponse,
} from '@/lib/literature-agent-types';
import type { CitationsManifest } from '@/hooks/use-agent-stream';

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
  /** Which upstream emitted `clarify` (for retry + finalize tag). */
  clarifySource: 'compare' | 'biomni';
};

export interface LiteratureAgentStreamState {
  donePayload: LiteratureAgentDonePayload | null;
  error: string | null;
  isStreaming: boolean;
  steps: string[];
  clarify: LiteratureClarifyPending | null;
  /** Live token text from paper-analyzer or Biomni SSE (`token` events). */
  streamedAnswer: string;
  /** Last time we saw throttled upstream SSE/HTTP activity (bytes or ping); null before first signal. */
  upstreamActivityAt: number | null;
  /** Citation map for inline `[N]` chips (from the `citations_manifest` SSE event). */
  citationsManifest: CitationsManifest | null;
}

export type LiteratureClarifyContinuationResult = {
  donePayload: LiteratureAgentDonePayload | null;
  error: string | null;
  /** When set, pass to `finalizeLiteratureAssistant(..., tag)` after clarify. */
  finalizeTag?: 'compare' | 'biomni';
  /** Citation map for the resumed answer (preserved across clarify → result). */
  citationsManifest?: CitationsManifest | null;
};

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

/**
 * Some Lambdas emit the final JSON on `done` only, or split `result` + `done`.
 * Empty `done` payloads must not wipe a prior `result`.
 */
function mergeBiomniFinalPayloads(
  prior: Record<string, unknown> | null,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const layer = resultEventToRaw(incoming);
  const layerHasText = typeof layer.content === 'string' && layer.content.trim() !== '';
  const layerHasStructured =
    layer.structured != null && typeof layer.structured === 'object';
  const layerHasRefs =
    Array.isArray(layer.references) && (layer.references as unknown[]).length > 0;
  const layerHasSources =
    Array.isArray(layer.sources) && (layer.sources as unknown[]).length > 0;
  const layerMeaningful =
    layerHasText || layerHasStructured || layerHasRefs || layerHasSources;

  if (!layerMeaningful) {
    return prior ?? {};
  }
  if (!prior) return layer;

  const priorText =
    (typeof prior.content === 'string' && prior.content.trim()) ||
    (typeof prior.answer === 'string' && prior.answer.trim());
  const pickText = layerHasText ? String(layer.content) : priorText || '';

  return {
    ...prior,
    ...layer,
    content: pickText,
    answer: pickText,
    structured: layerHasStructured ? layer.structured : prior.structured,
    references: layerHasRefs ? layer.references : prior.references,
    sources: layerHasSources ? layer.sources : prior.sources,
  };
}

async function drainLiteratureAgentSse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  body: LiteratureAgentRequestBody,
  clarifySource: 'compare' | 'biomni',
  onStep: (line: string) => void,
  onToken: (piece: string) => void,
  onUpstreamActivity?: () => void
): Promise<{
  donePayload: LiteratureAgentDonePayload | null;
  error: string | null;
  clarify: LiteratureClarifyPending | null;
  citationsManifest: CitationsManifest | null;
}> {
  const decoder = new TextDecoder();
  let buffer = '';
  let errored = false;
  let errorMessage: string | null = null;
  let resultRaw: Record<string, unknown> | null = null;
  let clarifyPending: LiteratureClarifyPending | null = null;
  let citationsManifest: CitationsManifest | null = null;
  let tokenBuffer = '';
  let lastUpstreamSignal = 0;
  const signalUpstream = () => {
    if (!onUpstreamActivity) return;
    const n = Date.now();
    if (n - lastUpstreamSignal < 1500) return;
    lastUpstreamSignal = n;
    onUpstreamActivity();
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (value.byteLength) signalUpstream();
    const { blocks, rest } = splitSseBuffer(buffer);
    buffer = rest;

    for (const block of blocks) {
      const payload = parseSseDataJson(block.data);

      switch (block.event) {
        case 'ping':
        case 'started':
          signalUpstream();
          break;
        case 'step':
        case 'thinking': {
          const text = stepTextFromPayload(payload);
          if (text) {
            onStep(text);
            signalUpstream();
          }
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
            clarifySource,
          };
          break;
        }
        case 'result':
          if (payload) {
            resultRaw = mergeBiomniFinalPayloads(resultRaw, payload);
          }
          break;
        case 'done':
          if (payload) {
            resultRaw = mergeBiomniFinalPayloads(resultRaw, payload);
          }
          break;
        case 'citations_manifest': {
          // Inline `[N]` chip map for the completed answer. Guard the wire shape
          // before trusting the cast — `manifest.manifest` must be a plain object
          // map (not null / array / scalar). Mirrors the main agent hook.
          const manifest = payload as CitationsManifest | null;
          if (
            typeof manifest?.manifest === 'object' &&
            manifest.manifest !== null &&
            !Array.isArray(manifest.manifest)
          ) {
            citationsManifest = manifest;
          }
          break;
        }
        case 'token': {
          const piece = extractSseTokenPiece(payload);
          if (piece) {
            tokenBuffer += piece;
            onToken(piece);
            // Yield so React can commit/paint between tokens (avoids one giant batch at EOF).
            await new Promise<void>((resolve) => {
              queueMicrotask(resolve);
            });
          }
          break;
        }
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
        default:
          break;
      }
    }
  }

  if (clarifyPending && !errored) {
    return { donePayload: null, error: null, clarify: clarifyPending, citationsManifest };
  }

  if (errored) {
    return {
      donePayload: null,
      error: errorMessage || 'Stream error',
      clarify: null,
      citationsManifest,
    };
  }

  resultRaw = mergeTokenBufferIntoAssistantRaw(resultRaw, tokenBuffer);

  if (resultRaw) {
    const donePayload = normalizeLiteratureAgentResponse(resultRaw);
    const hasPersistableBody =
      Boolean(donePayload.content?.trim()) ||
      Boolean(donePayload.structured?.references?.length) ||
      Boolean(donePayload.sources?.length) ||
      donePayload.needs_clarification === true;
    if (hasPersistableBody) {
      return { donePayload, error: null, clarify: null, citationsManifest };
    }
  }

  return {
    donePayload: null,
    error: 'Agent stream closed without a response.',
    clarify: null,
    citationsManifest,
  };
}

export function useLiteratureAgentStream() {
  const [state, setState] = useState<LiteratureAgentStreamState>({
    donePayload: null,
    error: null,
    isStreaming: false,
    steps: [],
    clarify: null,
    streamedAnswer: '',
    upstreamActivityAt: null,
    citationsManifest: null,
  });

  // Single source of truth for the "begin a fresh stream" reset. Sets every
  // field of LiteratureAgentStreamState, so it fully replaces prior state — the
  // three stream entry points previously duplicated this object literal.
  const STREAMING_RESET: LiteratureAgentStreamState = {
    donePayload: null,
    error: null,
    isStreaming: true,
    steps: [],
    clarify: null,
    streamedAnswer: '',
    upstreamActivityAt: null,
    citationsManifest: null,
  };

  const abortControllerRef = useRef<AbortController | null>(null);
  const clarifyRef = useRef<LiteratureClarifyPending | null>(null);

  const consumePaperAnalyzerSse = useCallback(
    async (
      body: LiteratureAgentRequestBody,
      token: string,
      skipClarify: boolean,
      signal: AbortSignal,
      onStep: (line: string) => void,
      onToken: (piece: string) => void,
      onUpstreamActivity?: () => void
    ): Promise<{
      donePayload: LiteratureAgentDonePayload | null;
      error: string | null;
      clarify: LiteratureClarifyPending | null;
      citationsManifest: CitationsManifest | null;
    }> => {
      const mergedOptions = {
        ...body.options,
        skip_clarify: skipClarify || body.options?.skip_clarify === true,
      };

      const response = await fetch('/api/literature/agent/compare-stream', {
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
        return { donePayload: null, error: errMsg, clarify: null, citationsManifest: null };
      }

      const reader = response.body?.getReader();
      if (!reader) {
        return { donePayload: null, error: 'No response body', clarify: null, citationsManifest: null };
      }

      return drainLiteratureAgentSse(reader, body, 'compare', onStep, onToken, onUpstreamActivity);
    },
    []
  );

  const consumeBiomniSse = useCallback(
    async (
      body: LiteratureAgentRequestBody,
      token: string,
      skipClarify: boolean,
      signal: AbortSignal,
      onStep: (line: string) => void,
      onToken: (piece: string) => void,
      onUpstreamActivity?: () => void
    ): Promise<{
      donePayload: LiteratureAgentDonePayload | null;
      error: string | null;
      clarify: LiteratureClarifyPending | null;
      citationsManifest: CitationsManifest | null;
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
        return { donePayload: null, error: errMsg, clarify: null, citationsManifest: null };
      }

      const reader = response.body?.getReader();
      if (!reader) {
        return { donePayload: null, error: 'No response body', clarify: null, citationsManifest: null };
      }

      return drainLiteratureAgentSse(reader, body, 'biomni', onStep, onToken, onUpstreamActivity);
    },
    []
  );

  const runRequest = useCallback(
    async (
      endpoint: 'compare' | 'biomni',
      body: LiteratureAgentRequestBody,
      token: string,
      options?: { skipClarify?: boolean }
    ): Promise<{
      donePayload: LiteratureAgentDonePayload | null;
      error: string | null;
      citationsManifest?: CitationsManifest | null;
    }> => {
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      clarifyRef.current = null;

      setState({ ...STREAMING_RESET });

      try {
        const skipClarify = options?.skipClarify === true;
        const onStep = (line: string) => {
          setState((s) => ({ ...s, steps: [...s.steps, line] }));
        };
        const onToken = (piece: string) => {
          setState((s) => ({ ...s, streamedAnswer: s.streamedAnswer + piece }));
        };
        const onUpstreamActivity = () => {
          setState((s) => ({ ...s, upstreamActivityAt: Date.now() }));
        };

        const { donePayload, error, clarify, citationsManifest } =
          endpoint === 'compare'
            ? await consumePaperAnalyzerSse(
                body,
                token,
                skipClarify,
                signal,
                onStep,
                onToken,
                onUpstreamActivity
              )
            : await consumeBiomniSse(
                body,
                token,
                skipClarify,
                signal,
                onStep,
                onToken,
                onUpstreamActivity
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
            streamedAnswer: '',
            upstreamActivityAt: null,
            // Preserve any manifest seen before the clarify gate fired.
            citationsManifest: citationsManifest ?? s.citationsManifest,
          }));
          return { donePayload: null, error: null };
        }

        setState((s) => ({
          ...s,
          donePayload,
          error,
          isStreaming: false,
          clarify: null,
          streamedAnswer: '',
          upstreamActivityAt: null,
          citationsManifest: citationsManifest ?? s.citationsManifest,
        }));
        abortControllerRef.current = null;
        return { donePayload, error, citationsManifest };
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setState((s) => ({
            ...s,
            isStreaming: false,
            clarify: null,
            streamedAnswer: '',
            upstreamActivityAt: null,
          }));
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
          streamedAnswer: '',
          upstreamActivityAt: null,
        }));
        abortControllerRef.current = null;
        clarifyRef.current = null;
        return { donePayload: null, error: errMsg };
      }
    },
    [consumePaperAnalyzerSse, consumeBiomniSse]
  );

  const answerClarify = useCallback(
    async (answer: string, token: string): Promise<LiteratureClarifyContinuationResult> => {
      const c = clarifyRef.current;
      if (!c) {
        return { donePayload: null, error: 'No pending clarification' };
      }

      const finalizeTag = c.clarifySource;

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

      setState({ ...STREAMING_RESET });

      try {
        const onStep = (line: string) => {
          setState((s) => ({ ...s, steps: [...s.steps, line] }));
        };
        const onToken = (piece: string) => {
          setState((s) => ({ ...s, streamedAnswer: s.streamedAnswer + piece }));
        };
        const onUpstreamActivity = () => {
          setState((s) => ({ ...s, upstreamActivityAt: Date.now() }));
        };

        const runSse =
          finalizeTag === 'compare'
            ? consumePaperAnalyzerSse(body, token, false, signal, onStep, onToken, onUpstreamActivity)
            : consumeBiomniSse(body, token, false, signal, onStep, onToken, onUpstreamActivity);

        const { donePayload, error, clarify, citationsManifest } = await runSse;

        if (clarify) {
          clarifyRef.current = clarify;
          abortControllerRef.current = null;
          setState((s) => ({
            ...s,
            donePayload: null,
            error: null,
            isStreaming: false,
            clarify,
            streamedAnswer: '',
            upstreamActivityAt: null,
            citationsManifest: citationsManifest ?? s.citationsManifest,
          }));
          return { donePayload: null, error: null };
        }

        setState((s) => ({
          ...s,
          donePayload,
          error,
          isStreaming: false,
          clarify: null,
          streamedAnswer: '',
          upstreamActivityAt: null,
          citationsManifest: citationsManifest ?? s.citationsManifest,
        }));
        abortControllerRef.current = null;
        if (donePayload && !error) {
          return { donePayload, error: null, finalizeTag, citationsManifest };
        }
        return { donePayload, error, citationsManifest };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Request failed';
        setState((s) => ({
          ...s,
          error: errMsg,
          isStreaming: false,
          clarify: null,
          streamedAnswer: '',
          upstreamActivityAt: null,
        }));
        abortControllerRef.current = null;
        clarifyRef.current = null;
        return { donePayload: null, error: errMsg };
      }
    },
    [consumeBiomniSse, consumePaperAnalyzerSse]
  );

  const skipClarify = useCallback(
    async (token: string): Promise<LiteratureClarifyContinuationResult> => {
      const c = clarifyRef.current;
      if (!c) {
        return { donePayload: null, error: 'No pending clarification' };
      }

      const finalizeTag = c.clarifySource;

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

      setState({ ...STREAMING_RESET });

      try {
        const onStep = (line: string) => {
          setState((s) => ({ ...s, steps: [...s.steps, line] }));
        };
        const onToken = (piece: string) => {
          setState((s) => ({ ...s, streamedAnswer: s.streamedAnswer + piece }));
        };
        const onUpstreamActivity = () => {
          setState((s) => ({ ...s, upstreamActivityAt: Date.now() }));
        };

        const runSse =
          finalizeTag === 'compare'
            ? consumePaperAnalyzerSse(body, token, true, signal, onStep, onToken, onUpstreamActivity)
            : consumeBiomniSse(body, token, true, signal, onStep, onToken, onUpstreamActivity);

        const { donePayload, error, clarify, citationsManifest } = await runSse;

        if (clarify) {
          clarifyRef.current = clarify;
          abortControllerRef.current = null;
          setState((s) => ({
            ...s,
            donePayload: null,
            error: null,
            isStreaming: false,
            clarify,
            streamedAnswer: '',
            upstreamActivityAt: null,
            citationsManifest: citationsManifest ?? s.citationsManifest,
          }));
          return { donePayload: null, error: null };
        }

        setState((s) => ({
          ...s,
          donePayload,
          error,
          isStreaming: false,
          clarify: null,
          streamedAnswer: '',
          upstreamActivityAt: null,
          citationsManifest: citationsManifest ?? s.citationsManifest,
        }));
        abortControllerRef.current = null;
        if (donePayload && !error) {
          return { donePayload, error: null, finalizeTag, citationsManifest };
        }
        return { donePayload, error, citationsManifest };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Request failed';
        setState((s) => ({
          ...s,
          error: errMsg,
          isStreaming: false,
          clarify: null,
          streamedAnswer: '',
          upstreamActivityAt: null,
        }));
        abortControllerRef.current = null;
        clarifyRef.current = null;
        return { donePayload: null, error: errMsg };
      }
    },
    [consumeBiomniSse, consumePaperAnalyzerSse]
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
      streamedAnswer: '',
      upstreamActivityAt: null,
      citationsManifest: null,
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
