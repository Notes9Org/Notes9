import type { AppliedMutation } from "@/lib/data-analysis/spec/mutations"
import type { EditAuditRecord } from "@/lib/data-analysis/provenance"

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
  /**
   * Stamped by `commit`. Ties this undo-stack entry to its audit-log entry so
   * undo can mark that entry reverted instead of deleting it. Callers do not
   * set it; it is optional only because they construct the input value.
   */
  auditId?: number
}

/**
 * The audit log, which is NOT the undo stack.
 *
 * These were one object, and that was the bug. `past` is a stack: undo pops
 * from it, which is exactly right for a Ctrl-Z and exactly wrong for a record
 * of what happened. Reading provenance out of `past` meant an edit the
 * researcher tried and reversed left no trace — the card showed a tidied
 * history rather than the real one, and "who changed what, and when" quietly
 * became "who changed what and did not later undo it".
 *
 * So the log is append-only. Nothing is ever removed from it. An undone edit
 * stays, with `reverted` set, because "this was tried and taken back" is a fact
 * about how the figure was made and a reviewer is entitled to it. Redo clears
 * the flag again rather than appending a second entry: the edit was made once.
 */
export interface AuditEntry {
  /** Stable within a session. Monotonic, so the log reads chronologically. */
  id: number
  applied: AppliedMutation[]
  /** True while the edit stands undone. Set by `undo`, cleared by `redo`. */
  reverted: boolean
}

export interface ConfigHistory {
  /** The undo stack. Shrinks. Never read this for provenance. */
  past: ConfigCommit[]
  future: ConfigCommit[]
  /** The audit log. Append-only. Read this for provenance. */
  log: AuditEntry[]
}

export const emptyHistory: ConfigHistory = { past: [], future: [], log: [] }

/**
 * Tolerates a history that predates the log — a value restored from a
 * `workspace_state` written by an older build arrives as `{past, future}`, and
 * an undefined `.log` must degrade to an empty record rather than throw.
 */
const logOf = (h: ConfigHistory): AuditEntry[] => h.log ?? []

const setReverted = (log: AuditEntry[], auditId: number | undefined, reverted: boolean) =>
  auditId === undefined ? log : log.map((e) => (e.id === auditId ? { ...e, reverted } : e))

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
  const log = logOf(history)
  const auditId = (log[log.length - 1]?.id ?? 0) + 1
  const snapshot = {
    before: { ...entry.before },
    after: { ...entry.after },
    applied: entry.applied,
    auditId,
  }
  // Any new edit invalidates the redo branch, as in every editor and as
  // `dispatchMutation` already does for the spec-level history. The redo branch
  // is part of the undo stack, so discarding it is correct; the audit log keeps
  // those edits, still marked reverted, because they did happen.
  return {
    past: [...history.past, snapshot],
    future: [],
    log: [...log, { id: auditId, applied: entry.applied, reverted: false }],
  }
}

/** The patch to merge over the current configuration, or null if there is none. */
export function undo(history: ConfigHistory): {
  history: ConfigHistory
  patch: Record<string, unknown> | null
} {
  const entry = history.past[history.past.length - 1]
  if (!entry) return { history, patch: null }
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [entry, ...history.future],
      // Marked, not removed. This is the whole point of the split.
      log: setReverted(logOf(history), entry.auditId, true),
    },
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
    history: {
      past: [...history.past, entry],
      future: history.future.slice(1),
      // Un-marked rather than re-appended: the edit was made once, and a log
      // that grew a duplicate on every Ctrl-Y would overstate what happened.
      log: setReverted(logOf(history), entry.auditId, false),
    },
    patch: patchFrom(entry.after, movedKeys(entry)),
  }
}

export const canUndo = (h: ConfigHistory) => h.past.length > 0
export const canRedo = (h: ConfigHistory) => h.future.length > 0

/**
 * Chronological, for the provenance card's edit history (§10.5).
 *
 * Reads the append-only LOG, not `past`. Reading `past` is what made an undone
 * edit disappear from provenance; the two collections answer different
 * questions and this one is the record.
 */
export const historyMutations = (h: ConfigHistory): AppliedMutation[] =>
  logOf(h).flatMap((e) => e.applied)

/**
 * The same log with the reverted flag intact, for the provenance card and for
 * the copy persisted onto a revision. `historyMutations` flattens the flag
 * away, which is right for callers that only want the edits and wrong for the
 * card, which has to say that an edit was taken back.
 */
export const auditRecords = (h: ConfigHistory): EditAuditRecord[] =>
  logOf(h).map((e) => ({ applied: e.applied, reverted: e.reverted }))
