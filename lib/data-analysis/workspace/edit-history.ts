import type { AppliedMutation } from "@/lib/data-analysis/spec/mutations"

/**
 * Undo over the rail.
 *
 * `mutations.ts` already has undo/redo, and it is the right shape for a surface
 * that DISPATCHES every edit onto a spec. This rail does not: it holds its
 * settings in React state and derives the spec from them, so the thing that has
 * to be restored is the configuration `buildConfig` serialises. That is also the
 * only representation that carries the pieces no mutation names, the AI overlay
 * and the plate model among them, so a spec-level undo would silently leave
 * them behind.
 *
 * What makes one stack cover both authors is that nothing here looks at who
 * made the edit. An assistant patch and a hand edit each arrive as one
 * `ConfigCommit` with its `AppliedMutation`s attached, and undo reverses them by
 * the same three lines. The mutations ride along untouched so the provenance
 * card and the undo stack read from one history rather than two that can drift.
 */

export interface ConfigCommit {
  /** The configuration before the edit, and after it. Whole, not diffed. */
  before: Record<string, unknown>
  after: Record<string, unknown>
  /** What the edit was, in the same typed form L6 uses. Origin travels with it. */
  applied: AppliedMutation[]
}

export interface ConfigHistory {
  past: ConfigCommit[]
  future: ConfigCommit[]
}

export const emptyHistory: ConfigHistory = { past: [], future: [] }

/**
 * The keys the commit actually moved.
 *
 * Undo restores these and no others, applied over whatever the configuration is
 * NOW. Restoring `before` wholesale would be simpler and wrong: a knob turned by
 * hand after the commit would be dragged back with it, because this rail has no
 * record of that knob having been touched.
 */
function movedKeys(commit: ConfigCommit): string[] {
  const keys = new Set([...Object.keys(commit.before), ...Object.keys(commit.after)])
  return [...keys].filter(
    (k) => JSON.stringify(commit.before[k]) !== JSON.stringify(commit.after[k])
  )
}

function patchFrom(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const k of keys) patch[k] = source[k]
  return patch
}

export function commit(history: ConfigHistory, entry: ConfigCommit): ConfigHistory {
  // A commit that moved nothing is not an edit, and an undo that appears to do
  // nothing reads as a broken button.
  if (movedKeys(entry).length === 0) return history
  // Copied, not held by reference: a caller that keeps editing the object it
  // handed in would otherwise rewrite history behind this module's back, and
  // the failure would show up as an undo that restores the wrong value.
  const snapshot = { before: { ...entry.before }, after: { ...entry.after }, applied: entry.applied }
  // Any new edit invalidates the redo branch, as in every editor and as
  // `dispatchMutation` already does for the spec-level history.
  return { past: [...history.past, snapshot], future: [] }
}

/** The patch to merge over the current configuration, or null if there is none. */
export function undo(history: ConfigHistory): {
  history: ConfigHistory
  patch: Record<string, unknown> | null
} {
  const entry = history.past[history.past.length - 1]
  if (!entry) return { history, patch: null }
  return {
    history: { past: history.past.slice(0, -1), future: [entry, ...history.future] },
    patch: patchFrom(entry.before, movedKeys(entry)),
  }
}

export function redo(history: ConfigHistory): {
  history: ConfigHistory
  patch: Record<string, unknown> | null
} {
  const entry = history.future[0]
  if (!entry) return { history, patch: null }
  return {
    history: { past: [...history.past, entry], future: history.future.slice(1) },
    patch: patchFrom(entry.after, movedKeys(entry)),
  }
}

export const canUndo = (h: ConfigHistory) => h.past.length > 0
export const canRedo = (h: ConfigHistory) => h.future.length > 0

/** Chronological, for the provenance card's edit history (§10.5). */
export const historyMutations = (h: ConfigHistory): AppliedMutation[] =>
  h.past.flatMap((e) => e.applied)
