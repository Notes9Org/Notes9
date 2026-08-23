import { describe, expect, it } from "vitest"

import {
  canRedo,
  canUndo,
  commit,
  auditRecords,
  emptyHistory,
  historyMutations,
  redo,
  undo,
  type ConfigHistory,
} from "./edit-history"
import { applyOverlay, railEditsFromSpec, splitApprovedMutations } from "./spec-prompt"
import { specFromChartState, tableFromChartRows, type ChartState } from "./chart-state-spec"
import {
  applyAiPatch,
  dispatchMutation,
  initHistory,
  type AppliedMutation,
  type SpecMutation,
} from "@/lib/data-analysis/spec/mutations"
import { Exclusion } from "@/lib/data-analysis/spec/analysis-spec"
import { buildProvenanceCard } from "@/lib/data-analysis/provenance"

/**
 * The live workspace's edit path, reassembled from the same functions
 * `data-analysis-workspace.tsx` calls, in the same order.
 *
 * The component holds its configuration in ~30 pieces of React state and derives
 * the spec from them; this harness holds the same configuration as one object
 * and derives the spec the same way (`specFromChartState` then `applyOverlay`),
 * so what is exercised below is the real seam rather than a model of it.
 */

const table = tableFromChartRows(
  ["group", "value"],
  [
    { group: "A", value: 1 },
    { group: "A", value: 2 },
    { group: "B", value: 5 },
    { group: "B", value: 40 },
  ]
)

const initialConfig: Record<string, unknown> = {
  chartType: "bar",
  xKey: "group",
  yKeys: ["value"],
  title: "Signal by group",
  xLabel: "Group",
  yLabel: "Signal",
  paletteName: "n9",
  errorMode: "sem",
  fontFamily: "system-ui, -apple-system, sans-serif",
  filters: [],
  transforms: [],
  exclusions: [],
  aiOverlay: [],
}

const deriveSpec = (config: Record<string, unknown>) =>
  applyOverlay(
    specFromChartState(config as unknown as ChartState, table, { fileName: "plate.xlsx" }),
    (config.aiOverlay ?? []) as AppliedMutation[]
  )

/** `buildConfig` / `applyConfig` / `commitEdits` / `undoEdits` / `redoEdits`. */
function makeRail() {
  let config = { ...initialConfig }
  let history: ConfigHistory = emptyHistory

  const commitEdits = (applied: AppliedMutation[], patch: Record<string, unknown>) => {
    const before = { ...config }
    const after = { ...before, ...patch }
    config = after
    history = commit(history, { before, after, applied })
  }

  return {
    config: () => config,
    spec: () => deriveSpec(config),
    history: () => history,

    /** `applySpecMutation`: what a control or a chip's × does. */
    human(mutation: SpecMutation) {
      const spec = deriveSpec(config)
      const dispatched = dispatchMutation(initHistory(spec), mutation, "user")
      const edits = railEditsFromSpec(spec, dispatched.spec, table)
      commitEdits(
        dispatched.past.map((entry) => entry.applied),
        edits
      )
    },

    /** `executeProposal`: what pressing Execute on an approved plan does. */
    ai(mutations: SpecMutation[]) {
      const spec = deriveSpec(config)
      const patched = applyAiPatch(initHistory(spec), mutations)
      const approved = patched.history.past.map((entry) => entry.applied)
      const { edits, overlay } = splitApprovedMutations(spec, approved, table)
      commitEdits(approved, {
        ...edits,
        aiOverlay: [...((config.aiOverlay ?? []) as AppliedMutation[]), ...overlay],
      })
    },

    undo() {
      const outcome = undo(history)
      if (!outcome.patch) return false
      config = { ...config, ...outcome.patch }
      history = outcome.history
      return true
    },

    redo() {
      const outcome = redo(history)
      if (!outcome.patch) return false
      config = { ...config, ...outcome.patch }
      history = outcome.history
      return true
    },
  }
}

const goodExclusion: Exclusion = {
  rowId: "row-5",
  reasonKind: "technical-failure",
  reasonText: "Plate edge effect, confirmed on the run sheet",
  method: null,
  excludedBy: "rana@notes9.com",
  excludedAt: "2026-08-04T10:00:00.000Z",
}

describe("an exclusion made through the live path", () => {
  // §8.1. The dialog's disabled button is not the guarantee; the schema is, and
  // `confirmExclusion` parses through it before the mutation is ever dispatched.
  it("is refused without a reason of its own", () => {
    expect(
      Exclusion.safeParse({ ...goodExclusion, reasonKind: "other", reasonText: null }).success
    ).toBe(false)
    expect(
      Exclusion.safeParse({ ...goodExclusion, reasonKind: "other", reasonText: "   " }).success
    ).toBe(false)
  })

  it("is refused when a statistical outlier does not name its method", () => {
    expect(
      Exclusion.safeParse({ ...goodExclusion, reasonKind: "statistical-outlier", method: null })
        .success
    ).toBe(false)
    expect(
      Exclusion.safeParse({
        ...goodExclusion,
        reasonKind: "statistical-outlier",
        method: { name: "ROUT", params: { Q: 0.01 } },
      }).success
    ).toBe(true)
  })

  it("reaches the spec and appears on the provenance card, with its reason and its author", () => {
    const rail = makeRail()
    expect(buildProvenanceCard(rail.spec(), null).exclusions.count).toBe(0)

    rail.human({ kind: "data.excludeRow", exclusion: goodExclusion })

    const card = buildProvenanceCard(rail.spec(), null, { history: historyMutations(rail.history()) })
    expect(card.exclusions.count).toBe(1)
    expect(card.exclusions.rows[0]).toMatchObject({
      rowId: "row-5",
      by: "rana@notes9.com",
      at: "2026-08-04T10:00:00.000Z",
    })
    expect(card.exclusions.rows[0].reason).toContain("Technical failure")
    expect(card.exclusions.rows[0].reason).toContain("Plate edge effect")
    // And it is one entry in the edit history the same card renders.
    expect(card.history).toHaveLength(1)
    expect(card.history[0].origin).toBe("user")
  })
})

describe("undo", () => {
  it("reverses an AI edit and a human edit identically", () => {
    const rail = makeRail()
    const start = rail.spec()

    rail.ai([{ kind: "figure.setPalette", value: "viridis" }])
    const afterAi = rail.spec()
    expect(afterAi.figure.palette).toBe("viridis")

    rail.human({ kind: "data.excludeRow", exclusion: goodExclusion })
    expect(rail.spec().exclusions).toHaveLength(1)

    // Both commits are ordinary entries: nothing here names an author, and the
    // same three lines take each one back.
    expect(rail.history().past).toHaveLength(2)
    expect(rail.history().past.map((e) => e.applied[0].origin)).toEqual(["ai", "user"])

    expect(rail.undo()).toBe(true)
    expect(rail.spec().exclusions).toHaveLength(0)
    expect(rail.spec().figure.palette).toBe("viridis") // the AI edit is untouched

    expect(rail.undo()).toBe(true)
    expect(rail.spec().figure.palette).toBe(start.figure.palette)

    expect(canUndo(rail.history())).toBe(false)
    expect(rail.undo()).toBe(false)
  })

  it("redoes both in the order they were made", () => {
    const rail = makeRail()
    rail.ai([{ kind: "figure.setPalette", value: "viridis" }])
    rail.human({ kind: "data.excludeRow", exclusion: goodExclusion })
    rail.undo()
    rail.undo()

    expect(canRedo(rail.history())).toBe(true)
    rail.redo()
    expect(rail.spec().figure.palette).toBe("viridis")
    expect(rail.spec().exclusions).toHaveLength(0)
    rail.redo()
    expect(rail.spec().exclusions).toHaveLength(1)
    expect(canRedo(rail.history())).toBe(false)
  })

  it("leaves a control turned by hand after the commit alone", () => {
    // The reason undo restores only the keys its own commit moved: this rail
    // keeps no record of a knob having been turned, so restoring the whole
    // configuration would drag an unrelated edit back with it.
    const rail = makeRail()
    rail.human({ kind: "data.excludeRow", exclusion: goodExclusion })
    const config = rail.config()
    config.title = "Renamed by hand"

    rail.undo()

    expect(rail.config().title).toBe("Renamed by hand")
    expect(rail.spec().exclusions).toHaveLength(0)
  })

  it("ignores a commit that moved nothing, so the button never lies", () => {
    const rail = makeRail()
    rail.human({ kind: "figure.setPalette", value: "n9" })
    expect(canUndo(rail.history())).toBe(false)
  })
})

/**
 * The audit log is not the undo stack.
 *
 * These were one object, and reading provenance out of `past` meant an edit the
 * researcher tried and reversed left no trace: the card showed a tidied history
 * rather than the real one. The two collections answer different questions and
 * this block pins the difference.
 */
describe("the append-only audit log (L8)", () => {
  it("keeps an undone edit, marked reverted, instead of erasing it", () => {
    const rail = makeRail()
    rail.human({ kind: "data.excludeRow", exclusion: goodExclusion })
    rail.undo()

    // The undo stack forgot it. That is correct — it is a stack.
    expect(rail.history().past).toHaveLength(0)
    // The record did not. That is the fix.
    expect(auditRecords(rail.history())).toHaveLength(1)
    expect(auditRecords(rail.history())[0].reverted).toBe(true)
    // And it is still on the provenance card, which is the user-visible half.
    expect(historyMutations(rail.history())).toHaveLength(1)
  })

  it("puts a reverted edit on the card struck through, not missing", () => {
    const rail = makeRail()
    rail.human({ kind: "data.excludeRow", exclusion: goodExclusion })
    rail.undo()

    const card = buildProvenanceCard(rail.spec(), null, {
      auditLog: auditRecords(rail.history()),
    })
    expect(card.history).toHaveLength(1)
    expect(card.history[0].reverted).toBe(true)
    // The exclusion itself is gone from the spec: the edit was genuinely
    // reversed. Only the RECORD of it survives, which is the point.
    expect(card.exclusions.count).toBe(0)
  })

  it("clears the flag on redo rather than logging the edit twice", () => {
    const rail = makeRail()
    rail.human({ kind: "data.excludeRow", exclusion: goodExclusion })
    rail.undo()
    rail.redo()

    const log = auditRecords(rail.history())
    // The edit was made once. A log that grew an entry per Ctrl-Y would
    // overstate what happened, which is its own kind of false record.
    expect(log).toHaveLength(1)
    expect(log[0].reverted).toBe(false)
  })

  it("keeps an edit that undo discarded from the redo branch", () => {
    // Undo, then a NEW edit: the redo branch is thrown away. The undone edit is
    // now unreachable by any button, and would previously have vanished from
    // provenance entirely.
    const rail = makeRail()
    rail.human({ kind: "data.excludeRow", exclusion: goodExclusion })
    rail.undo()
    rail.human({ kind: "figure.setPalette", value: "viridis" })

    expect(rail.history().future).toHaveLength(0)
    const log = auditRecords(rail.history())
    expect(log).toHaveLength(2)
    expect(log.map((e) => e.reverted)).toEqual([true, false])
  })

  it("records both authors, and undoing one does not hide it", () => {
    const rail = makeRail()
    rail.ai([{ kind: "figure.setPalette", value: "viridis" }])
    rail.human({ kind: "data.excludeRow", exclusion: goodExclusion })
    rail.undo() // takes back the human edit

    const card = buildProvenanceCard(rail.spec(), null, {
      auditLog: auditRecords(rail.history()),
    })
    expect(card.history.map((h) => h.origin)).toEqual(["ai", "user"])
    expect(card.history.map((h) => h.reverted)).toEqual([false, true])
  })

  it("reads chronologically, oldest first", () => {
    const rail = makeRail()
    rail.human({ kind: "figure.setPalette", value: "viridis" })
    rail.human({ kind: "data.excludeRow", exclusion: goodExclusion })

    const log = auditRecords(rail.history())
    expect(log).toHaveLength(2)
    expect(log[0].applied[0].description).not.toBe(log[1].applied[0].description)
  })

  it("survives a history restored from an older build with no log", () => {
    // A `workspace_state` written before the log existed deserialises as
    // {past, future}. It must degrade to an empty record, not throw.
    const legacy = { past: [], future: [] } as unknown as ConfigHistory
    expect(auditRecords(legacy)).toEqual([])
    expect(historyMutations(legacy)).toEqual([])
    expect(() => commit(legacy, {
      before: { title: "a" },
      after: { title: "b" },
      applied: [],
    })).not.toThrow()
  })

  it("logs nothing for a commit that moved nothing", () => {
    const rail = makeRail()
    rail.human({ kind: "figure.setPalette", value: "n9" })
    expect(auditRecords(rail.history())).toHaveLength(0)
  })
})

describe("the legacy `history` option still reads as standing", () => {
  it("reports un-flagged mutations as not reverted", () => {
    // Callers that have not adopted `auditLog` pass a bare mutation list, which
    // carries no reverted flag. Reporting those as standing is the only thing
    // that shape can honestly say.
    const rail = makeRail()
    rail.human({ kind: "data.excludeRow", exclusion: goodExclusion })
    const card = buildProvenanceCard(rail.spec(), null, {
      history: historyMutations(rail.history()),
    })
    expect(card.history).toHaveLength(1)
    expect(card.history[0].reverted).toBe(false)
  })
})
