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
    minDelay = 8,
    maxQueueSize = 500,
    enabled = true,
  } = options;

  const [displayText, setDisplayText] = useState('');
  const queueRef = useRef<string>('');
  const lastRenderRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);

  // When smoothing is disabled, pass through immediately
  useEffect(() => {
    if (!enabled) {
      setDisplayText(incomingText);
      return;
    }
  }, [incomingText, enabled]);

  // Add new text to queue
  useEffect(() => {
    if (!enabled) return;

    const newChars = incomingText.slice(displayText.length);
    if (!newChars) return;

    queueRef.current += newChars;

    // Force flush if queue is too large
    if (queueRef.current.length > maxQueueSize) {
      setDisplayText(incomingText);
      queueRef.current = '';
      return;
    }

    // Start rendering loop if not already running
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(renderLoop);
    }
  }, [incomingText, displayText, enabled, maxQueueSize]);

  const renderLoop = (timestamp: number) => {
    if (!enabled) return;

    const elapsed = timestamp - lastRenderRef.current;

    if (elapsed < minDelay) {
      // Too soon, wait for next frame
      rafIdRef.current = requestAnimationFrame(renderLoop);
      return;
    }

    if (queueRef.current.length === 0) {
      // Queue empty, stop loop
      rafIdRef.current = null;
      return;
    }

    // Render next chunk (3-5 chars for smooth feel)
    const chunkSize = Math.min(5, queueRef.current.length);
    const chunk = queueRef.current.slice(0, chunkSize);
    queueRef.current = queueRef.current.slice(chunkSize);

    setDisplayText((prev) => prev + chunk);
    lastRenderRef.current = timestamp;

    // Continue loop
    rafIdRef.current = requestAnimationFrame(renderLoop);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // Sync displayText when incoming text is finalized (stream ends)
  useEffect(() => {
    if (!enabled) return;

    // If incoming text hasn't changed for 500ms and queue is empty, sync
    const timer = setTimeout(() => {
      if (displayText !== incomingText && queueRef.current.length === 0) {
        setDisplayText(incomingText);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [incomingText, displayText, enabled]);

  return enabled ? displayText : incomingText;
}
