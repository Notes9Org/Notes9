'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Smart auto-scroll for chat-style surfaces.
 *
 * The default "scroll to bottom on every update" pattern fights the user the
 * moment they try to read earlier content while a response is streaming — the
 * viewport keeps yanking back to the latest token. This hook implements the
 * Cursor/Claude/ChatGPT convention instead:
 *
 *   1. Auto-scroll happens ONLY when the user is already pinned to the bottom
 *      (within `tolerancePx`).
 *   2. The instant the user scrolls upward, the pin is released and no
 *      further auto-scrolls fire until they return to the bottom (or call
 *      `scrollToBottom()` themselves).
 *   3. A `showJumpBottom` flag lets the caller render a "↓" button while
 *      the user is scrolled away so they can re-pin in one click.
 *
 * Pass `deps` for every changing value that should trigger an auto-scroll
 * attempt (messages array, streamed answer string, tool cards length, etc.).
 * Each will be honored only when the user is still pinned.
 */
export function usePinnedAutoScroll<E extends HTMLElement>(
  scrollRef: RefObject<E | null>,
  deps: unknown[],
  options?: { tolerancePx?: number; smooth?: boolean },
) {
  const tolerance = options?.tolerancePx ?? 80;
  const smooth = options?.smooth ?? false;

  const pinnedRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  const lastScrollHeightRef = useRef(0);
  const [showJumpBottom, setShowJumpBottom] = useState(false);

  const measurePin = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedRef.current = distFromBottom <= tolerance;
    setShowJumpBottom(distFromBottom > 120);
  }, [scrollRef, tolerance]);

  // Detect a session swap (scrollHeight shrinks dramatically) and re-pin so
  // the new conversation starts at its bottom rather than inheriting the
  // previous session's pin state.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const current = el.scrollHeight;
    const prev = lastScrollHeightRef.current;
    if (prev > 0 && current < prev * 0.5) {
      pinnedRef.current = true;
      el.scrollTop = el.scrollHeight;
      lastScrollTopRef.current = el.scrollHeight;
      setShowJumpBottom(false);
    }
    lastScrollHeightRef.current = current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  /** Attach to the scroll container's `onScroll`. */
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Only treat *user* scrolls as intent. When auto-scroll itself sets
    // scrollTop, that fires onScroll too; we still want to recompute the
    // pin flag (it would be ≈0) so this is safe.
    const prev = lastScrollTopRef.current;
    lastScrollTopRef.current = el.scrollTop;
    // If the user scrolled UP, release the pin immediately and don't even
    // wait for the tolerance check to decide.
    if (el.scrollTop < prev - 2) {
      pinnedRef.current = false;
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowJumpBottom(distFromBottom > 120);
      return;
    }
    measurePin();
  }, [measurePin, scrollRef]);

  /** Imperative jump — also re-pins. Call from a "Jump to bottom" button. */
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = true;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
    lastScrollTopRef.current = el.scrollHeight;
    setShowJumpBottom(false);
  }, [scrollRef, smooth]);

  /** Force the pin back on — call when sending a new user message. */
  const repin = useCallback(() => {
    pinnedRef.current = true;
    scrollToBottom();
  }, [scrollToBottom]);

  // Run an auto-scroll attempt whenever any tracked dep changes — but only
  // if the user is still pinned. Uses rAF so layout has settled.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (!pinnedRef.current) {
        // Even when not pinned, recompute the badge state so it appears /
        // disappears as content grows.
        measurePin();
        return;
      }
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
      lastScrollTopRef.current = el.scrollHeight;
      setShowJumpBottom(false);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Initial measurement once the container mounts.
  useEffect(() => {
    measurePin();
  }, [measurePin]);

  return { onScroll, scrollToBottom, repin, showJumpBottom };
}
