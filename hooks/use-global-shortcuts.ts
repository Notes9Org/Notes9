'use client';

import { useEffect, useRef } from 'react';
import { BOUND_SHORTCUTS, LEADER_TIMEOUT_MS } from '@/lib/shortcuts/registry';
import {
  isMacPlatform,
  isSequence,
  isTypingTarget,
  matchesCombo,
  normalizeEventKey,
} from '@/lib/shortcuts/match';
import type { ShortcutActionMap } from '@/lib/shortcuts/types';

/** Any modifier at all. Leaders are bare keys, so any of these disqualifies one. */
function hasModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
}

/**
 * Binds every `handled: 'registry'` shortcut through ONE window listener.
 *
 * Ids come from the registry and are looked up in `actions`; an id with no
 * handler stays completely inert — no preventDefault, no throw — so a
 * half-wired surface degrades to the browser default instead of eating keys.
 *
 * `actions` is held in a ref, so callers may rebuild the map every render
 * without re-binding the listener.
 */
export function useGlobalShortcuts(actions: ShortcutActionMap): void {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const leaderRef = useRef<string | null>(null);
  const leaderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const isMac = isMacPlatform();
    // Partition once — the registry is static for the lifetime of the app.
    const combos = BOUND_SHORTCUTS.filter((def) => def.keys.length === 1);
    const sequences = BOUND_SHORTCUTS.filter((def) => isSequence(def.keys));
    const leaderKeys = new Set(sequences.map((def) => def.keys[0]));

    const disarm = () => {
      if (leaderTimerRef.current) clearTimeout(leaderTimerRef.current);
      leaderTimerRef.current = null;
      leaderRef.current = null;
    };

    /** Runs the handler for `id`. False when nothing is wired to it. */
    const run = (id: string, event: KeyboardEvent): boolean => {
      const action = actionsRef.current[id];
      if (!action) return false;
      event.preventDefault();
      action();
      return true;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // Mid-IME-composition keystrokes still fire keydown, so without this a
      // Japanese/Chinese/Korean typist loses characters to our shortcuts.
      if (event.isComposing) return;

      const typing = isTypingTarget(event.target);
      const key = normalizeEventKey(event.key);

      if (key === 'escape') disarm();

      // An armed leader consumes this key: it either completes the sequence or
      // cancels, and then the key carries on as an ordinary key.
      const leader = leaderRef.current;
      if (leader) {
        disarm();
        if (!typing && !hasModifier(event)) {
          const match = sequences.find(
            (def) => def.keys[0] === leader && def.keys[1] === key,
          );
          if (match && run(match.id, event)) return;
        }
      }

      for (const def of combos) {
        if (typing && !def.allowInInput) continue;
        if (!matchesCombo(event, def.keys[0], isMac)) continue;
        if (run(def.id, event)) return;
      }

      // Arm last, so a leader letter can never shadow a real combo above.
      if (!typing && !hasModifier(event) && leaderKeys.has(key)) {
        leaderRef.current = key;
        leaderTimerRef.current = setTimeout(disarm, LEADER_TIMEOUT_MS);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      disarm();
    };
  }, []);
}
