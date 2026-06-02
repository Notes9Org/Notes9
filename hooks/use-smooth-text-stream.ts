'use client';

import { useEffect, useRef, useState } from 'react';

export interface UseSmoothTextStreamOptions {
  /** Minimum delay between character renders (ms). Default: 8ms (~120 chars/sec) */
  minDelay?: number;
  /** Maximum queue size before forcing immediate flush. Default: 500 chars */
  maxQueueSize?: number;
  /** Enable smoothing (disable for testing). Default: true */
  enabled?: boolean;
}

/**
 * Smooths rapid token bursts from SSE streams using RAF-based rendering.
 * Prevents janky UI updates when backend sends 20+ tokens/sec.
 */
export function useSmoothTextStream(
  incomingText: string,
  options: UseSmoothTextStreamOptions = {}
) {
  const {
    enabled = true,
  } = options;
  // Clamp to sane bounds so a misconfigured 0/negative value can't break the
  // flush logic (never-flush or always-flush). Defaults are unchanged for
  // valid inputs.
  const minDelay = Math.max(0, options.minDelay ?? 8);
  const maxQueueSize = Math.max(1, options.maxQueueSize ?? 500);

  const [displayText, setDisplayText] = useState('');
  // Ref mirror of displayText — read inside effects/RAF without re-triggering deps.
  const displayTextRef = useRef('');
  const queueRef = useRef<string>('');
  const lastRenderRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);

  // When smoothing is disabled, pass through immediately.
  useEffect(() => {
    if (!enabled) {
      setDisplayText(incomingText);
      displayTextRef.current = incomingText;
    }
  }, [incomingText, enabled]);

  // Add new text to queue. Does NOT list displayText as a dep — reads via ref
  // instead to avoid re-scheduling a second RAF on every setDisplayText call.
  useEffect(() => {
    if (!enabled) return;

    const newChars = incomingText.slice(displayTextRef.current.length);
    if (!newChars) return;

    queueRef.current += newChars;

    // Force flush if queue is too large.
    if (queueRef.current.length > maxQueueSize) {
      displayTextRef.current = incomingText;
      setDisplayText(incomingText);
      queueRef.current = '';
      return;
    }

    // Start rendering loop only when one isn't already running.
    if (queueRef.current.length > 0 && rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(renderLoop);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingText, enabled, maxQueueSize]);

  const renderLoop = (timestamp: number) => {
    if (!enabled) return;

    const elapsed = timestamp - lastRenderRef.current;

    if (elapsed < minDelay) {
      rafIdRef.current = requestAnimationFrame(renderLoop);
      return;
    }

    if (queueRef.current.length === 0) {
      rafIdRef.current = null;
      return;
    }

    // Render next chunk (3-5 chars for smooth feel).
    const chunkSize = Math.min(5, queueRef.current.length);
    const chunk = queueRef.current.slice(0, chunkSize);
    queueRef.current = queueRef.current.slice(chunkSize);

    const next = displayTextRef.current + chunk;
    displayTextRef.current = next;
    setDisplayText(next);
    lastRenderRef.current = timestamp;

    rafIdRef.current = requestAnimationFrame(renderLoop);
  };

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  // Sync displayText when incoming text is finalized (stream ends).
  useEffect(() => {
    if (!enabled) return;

    const timer = setTimeout(() => {
      if (displayTextRef.current !== incomingText && queueRef.current.length === 0) {
        displayTextRef.current = incomingText;
        setDisplayText(incomingText);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [incomingText, enabled]);

  return enabled ? displayText : incomingText;
}
