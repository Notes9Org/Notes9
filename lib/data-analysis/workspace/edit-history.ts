import { mutationPath, type AppliedMutation } from "@/lib/data-analysis/spec/mutations"
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
  /**
   * Wall clock at commit, stamped by `commit`. Read only by the coalescing rule
   * below — a continuous control fires this function sixty times a second, and
   * "how long ago was the last one" is what separates one drag from two edits.
   */
  at?: number
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

/**
 * How many undo steps are kept.
 *
 * Each step holds two whole configurations, so an unbounded stack is a leak
 * that only stayed invisible while the rail's style controls bypassed this
 * module entirely. Now that a colour picker commits, a long session would keep
 * every snapshot it ever produced.
 *
 * ponytail: a flat count, not a byte budget. A configuration is a few kB of
 * scalars; measure before making this adaptive.
 */
export const MAX_UNDO_DEPTH = 50

/**
 * How long a continuous control has to keep pushing before its edits stop
 * reading as one gesture. A slider drag emits an event per animation frame and
 * a text field one per keystroke; sixty undo steps for one drag is a broken
 * Ctrl-Z, and so is a single step for two deliberate nudges a second apart.
 */
export const COALESCE_WITHIN_MS = 500

/**
 * Whether this commit continues the one on top of the stack rather than
 * starting a new one.
 *
 * Three conditions, all necessary. ONE mutation each side, because a multi-part
 * change (an approved AI plan) is authored as a unit and merging the next edit
 * into it would misreport what that unit did. The same spec PATH, which is what
 * makes "the same control" a fact about the edit rather than a guess about the
 * widget. The same ORIGIN, so an assistant patch can never be absorbed into a
 * hand edit — that would erase the one distinction the provenance card exists
 * to show.
 */
function continues(previous: ConfigCommit | undefined, entry: ConfigCommit, now: number, windowMs: number): boolean {
  if (!previous || windowMs <= 0) return false
  if (previous.at === undefined || now - previous.at > windowMs) return false
  if (previous.applied.length !== 1 || entry.applied.length !== 1) return false
  const a = previous.applied[0]
  const b = entry.applied[0]
  return a.origin === b.origin && mutationPath(a.mutation) === mutationPath(b.mutation)
}

export function commit(
  history: ConfigHistory,
  entry: ConfigCommit,
  options: { now?: number; coalesceWithinMs?: number } = {}
): ConfigHistory {
  // A commit that moved nothing is not an edit, and an undo that appears to do
  // nothing reads as a broken button.
  if (movedKeys(entry).length === 0) return history
  const now = options.now ?? Date.now()
  const windowMs = options.coalesceWithinMs ?? COALESCE_WITHIN_MS
  const log = logOf(history)
  const previous = history.past[history.past.length - 1]

  if (continues(previous, entry, now, windowMs)) {
    // The gesture is still running, so this is the SAME edit reaching further:
    // keep the `before` it started from and move only its endpoint. The audit
    // entry is updated in place rather than appended for the same reason redo
    // clears the reverted flag instead of adding a row — the edit happened
    // once, and a log that grew a row per animation frame would overstate it.
    const merged: ConfigCommit = {
      before: { ...previous.before },
      after: { ...entry.after },
      applied: entry.applied,
      auditId: previous.auditId,
      at: now,
    }
    // A drag that ends back where it started is not an edit at all. Both halves
    // go, and the log losing a row here is not the undo stack reaching into it:
    // it is `commit`'s own opening guard ("a commit that moved nothing is not an
    // edit") arriving one frame late, because a gesture is only known to be a
    // no-op once it finishes. Nothing that ever changed the figure is removed.
    if (movedKeys(merged).length === 0) {
      return {
        past: history.past.slice(0, -1),
        future: [],
        log: log.filter((e) => e.id !== previous.auditId),
      }
    }
    return {
      past: [...history.past.slice(0, -1), merged],
      future: [],
      log: log.map((e) => (e.id === previous.auditId ? { ...e, applied: entry.applied } : e)),
    }
  }

  // Copied, not held by reference: a caller that keeps editing the object it
  // handed in would otherwise rewrite history behind this module's back, and
  // the failure would show up as an undo that restores the wrong value.
  const auditId = (log[log.length - 1]?.id ?? 0) + 1
  const snapshot = {
    before: { ...entry.before },
    after: { ...entry.after },
    applied: entry.applied,
    auditId,
    at: now,
  }
  // Any new edit invalidates the redo branch, as in every editor and as
  // `dispatchMutation` already does for the spec-level history. The redo branch
  // is part of the undo stack, so discarding it is correct; the audit log keeps
  // those edits, still marked reverted, because they did happen.
  //
  // The stack is capped and the LOG IS NOT. Dropping the oldest snapshot costs
  // the ability to undo that far back; dropping its audit entry would cost the
  // record that it happened, which is the one thing this file exists to keep.
  const past = [...history.past, snapshot]
  return {
    past: past.length > MAX_UNDO_DEPTH ? past.slice(past.length - MAX_UNDO_DEPTH) : past,
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

/**
 * Whether a keystroke is the undo/redo shortcut, and which.
 *
 * Pure and exported so the rule can be tested without mounting a workspace.
 * `metaKey` for macOS and `ctrlKey` for everywhere else; Shift-Z is redo on
 * both, and Ctrl-Y is the Windows habit. `repeat` is allowed through: holding
 * the key to walk back through a session is the point of a history.
 */
export function undoShortcut(e: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}): "undo" | "redo" | null {
  if (e.altKey) return null
  if (!e.metaKey && !e.ctrlKey) return null
  const key = e.key.toLowerCase()
  if (key === "y" && e.ctrlKey && !e.metaKey) return "redo"
  if (key !== "z") return null
  return e.shiftKey ? "redo" : "undo"
}

/**
 * Whether this element owns its own undo and must keep the keystroke.
 *
 * The spreadsheet is the one that matters: Univer has a full undo stack over
 * cell edits, and stealing Cmd-Z from a focused grid would silently reverse a
 * figure setting while the researcher was looking at a cell they had just
 * mistyped. Text fields and contenteditables get the same courtesy, because the
 * browser's own per-field undo is what a user expects inside a caret.
 *
 * Walks up from the target rather than testing it alone: focus inside the grid
 * lands on a canvas, an overlay div or the cell editor depending on what the
 * sheet is doing, and none of those is a stable thing to name.
 */
export function ownsUndo(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null
  while (el) {
    if (el.hasAttribute("data-n9-sheet")) return true
    const tag = el.tagName
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
    // The attribute as well as the property: the property is inherited by
    // descendants (which the walk already covers) and is not implemented in
    // every DOM the tests run in, so an attribute check is what makes this
    // guard verifiable rather than merely plausible.
    if (el.getAttribute("contenteditable") === "" || el.getAttribute("contenteditable") === "true") return true
    if (el instanceof HTMLElement && el.isContentEditable) return true
    el = el.parentElement
  }
  return false
}

/**
 * The paths the researcher has edited by hand and not taken back. L6's sticky
 * set (`mutations.ts`: "manual edits are sticky, a subsequent AI change must
 * preserve them or explicitly announce the override").
 *
 * DERIVED from the audit log rather than accumulated in a second collection,
 * for three reasons. It cannot drift from the record, because it IS the record
 * read a different way. It survives everything the log survives, including the
 * round trip through a saved revision — which is what makes stickiness hold on
 * the fifteenth edit of a reopened analysis and not only inside one session.
 * And `reverted` gets the semantics right for free: a hand edit that has been
 * undone is no longer a decision the assistant has to preserve, and an edit
 * that scrolled off the capped undo stack still is.
 *
 * `SpecHistory.userEditedPaths` is the shape the mutation layer wants, so this
 * is what the workspace hands `initHistory` before calling `applyAiPatch`.
 * Without it that set is always empty, `overrides` is always `[]`, and the
 * assistant silently overwrites hand-picked settings 100% of the time.
 */
export function userEditedPaths(h: ConfigHistory): Set<string> {
  const paths = new Set<string>()
  for (const entry of logOf(h)) {
    if (entry.reverted) continue
    for (const applied of entry.applied) {
      if (applied.origin === "user") paths.add(mutationPath(applied.mutation))
    }
  }
  return paths
}
