import { describe, expect, it } from "vitest"

import {
  canRedo,
  canUndo,
  commit,
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
