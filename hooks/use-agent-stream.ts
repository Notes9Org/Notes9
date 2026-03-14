'use client';

import { useState, useCallback, useRef } from 'react';
import type {
  ThinkingPayload,
  SqlPayload,
  RagChunksPayload,
  TokenPayload,
  DonePayload,
  ErrorPayload,
} from '@/lib/agent-stream-types';

/** Request shape for POST /agent/stream (same as /agent/run). */
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

const TOKEN_THROTTLE_MS = 80;

function parseEventBlock(block: string): { event: string; data: unknown } | null {
  const lines = block.split(/\r?\n/);
  let event = '';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  const dataJson = dataLines.join('\n').trim();
  if (!event || !dataJson) return null;
  try {
    const data = JSON.parse(dataJson);
    return { event, data };
  } catch {
    return null;
  }
}

/** Yield to event loop so React can render between updates (ChatGPT-style incremental display).
 *  When backend buffers, we get all events at once - this delay makes steps appear one-by-one. */
const YIELD_MS = 80;

function parseSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: string, data: unknown) => void | Promise<void>
): Promise<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  let fullBody = '';

  return (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        fullBody += chunk;
      }
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const parsed = parseEventBlock(block);
        if (parsed) {
          await onEvent(parsed.event, parsed.data);
          await new Promise((r) => setTimeout(r, YIELD_MS));
        }
      }
      if (done) {
        const parsed = buffer.trim() ? parseEventBlock(buffer) : null;
        if (parsed) {
          await onEvent(parsed.event, parsed.data);
        }
        break;
      }
    }
    return fullBody;
  })();
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
  const tokenBufferRef = useRef('');
  const tokenFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushTokenBuffer = useCallback(() => {
    if (tokenBufferRef.current) {
      const text = tokenBufferRef.current;
      tokenBufferRef.current = '';
      setState((s) => ({
        ...s,
        streamedAnswer: s.streamedAnswer + text,
      }));
    }
  }, []);

  const appendToken = useCallback(
    (text: string) => {
      tokenBufferRef.current += text;
      if (!tokenFlushRef.current) {
        tokenFlushRef.current = setTimeout(() => {
          tokenFlushRef.current = null;
          flushTokenBuffer();
        }, TOKEN_THROTTLE_MS);
      }
    },
    [flushTokenBuffer]
  );

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
      tokenBufferRef.current = '';
      if (tokenFlushRef.current) {
        clearTimeout(tokenFlushRef.current);
        tokenFlushRef.current = null;
      }

      try {
        const response = await fetch('/api/agent/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(params),
          signal,
        });

        if (!response.ok) {
          const errText = await response.text();
          let errMsg = errText;
          try {
            const parsed = JSON.parse(errText) as { error?: string };
            if (parsed.error) errMsg = parsed.error;
          } catch {
            /* use raw text */
          }
          setState((s) => ({
            ...s,
            error: errMsg,
            isStreaming: false,
          }));
          return { donePayload: null, error: errMsg };
        }

        const reader = response.body?.getReader();
        if (!reader) {
          setState((s) => ({
            ...s,
            error: 'No response body',
            isStreaming: false,
          }));
          return { donePayload: null, error: 'No response body' };
        }

        let finalDone: DonePayload | null = null;
        let finalError: string | null = null;
        let receivedAnyEvent = false;

        const fullBody = await parseSSE(reader, async (event, data) => {
          receivedAnyEvent = true;
          switch (event) {
            case 'thinking':
              setState((s) => ({
                ...s,
                thinkingSteps: [...s.thinkingSteps, data as ThinkingPayload],
                sql: (data as ThinkingPayload).sql ?? s.sql,
              }));
              break;
            case 'sql':
              setState((s) => ({
                ...s,
                sql: (data as SqlPayload).query ?? s.sql,
              }));
              break;
            case 'rag_chunks':
              setState((s) => ({
                ...s,
                ragChunks: data as RagChunksPayload,
              }));
              break;
            case 'token':
              appendToken((data as TokenPayload).text ?? '');
              break;
            case 'done':
              flushTokenBuffer();
              finalDone = data as DonePayload;
              setState((s) => ({
                ...s,
                donePayload: data as DonePayload,
                isStreaming: false,
              }));
              break;
            case 'error':
              finalError = (data as ErrorPayload).error ?? 'Unknown error';
              setState((s) => ({
                ...s,
                error: finalError,
                isStreaming: false,
              }));
              break;
            case 'ping':
              // keep-alive, no-op
              break;
            default:
              break;
          }
        });

        flushTokenBuffer();

        if (!receivedAnyEvent && !finalDone && !finalError) {
          if (fullBody?.trim().startsWith('{')) {
            try {
              const json = JSON.parse(fullBody) as DonePayload & { error?: string };
              if (json.error) {
                finalError = json.error;
                setState((s) => ({ ...s, error: json.error!, isStreaming: false }));
              } else if (typeof json.answer === 'string') {
                finalDone = json;
                setState((s) => ({
                  ...s,
                  donePayload: json,
                  streamedAnswer: json.answer,
                  isStreaming: false,
                }));
              }
            } catch {
              /* ignore parse error */
            }
          }
        }

        setState((s) => {
          if (s.donePayload) return s;
          return { ...s, isStreaming: false };
        });
        return { donePayload: finalDone ?? null, error: finalError ?? null };
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          flushTokenBuffer();
          setState((s) => ({ ...s, isStreaming: false }));
          return { donePayload: null, error: null };
        }
        const errMsg = err instanceof Error ? err.message : 'Stream failed';
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
    [appendToken, flushTokenBuffer]
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
    tokenBufferRef.current = '';
    if (tokenFlushRef.current) {
      clearTimeout(tokenFlushRef.current);
      tokenFlushRef.current = null;
    }
  }, []);

  return {
    ...state,
    runStream,
    abort,
    reset,
  };
}
