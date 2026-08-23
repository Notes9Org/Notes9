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
  userEditedPaths,
  ownsUndo,
  undoShortcut,
  MAX_UNDO_DEPTH,
  type ConfigHistory,
} from "./edit-history"
import { applyOverlay, railEditsFromSpec, splitApprovedMutations } from "./spec-prompt"
import {
  railControlMutation,
  specFromChartState,
  tableFromChartRows,
  type ChartState,
  type RailControlKey,
} from "./chart-state-spec"
import {
  appliedMutation,
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
  // The workspace's clock, made explicit so the coalescing window is a fact of
  // the test rather than of how fast the machine ran.
  let clock = 0

  const commitEdits = (applied: AppliedMutation[], patch: Record<string, unknown>) => {
    const before = { ...config }
    const after = { ...before, ...patch }
    config = after
    history = commit(history, { before, after, applied }, { now: clock })
  }

  return {
    config: () => config,
    spec: () => deriveSpec(config),
    history: () => history,
    /** Advance the clock, in ms, between gestures. */
    tick(ms: number) {
      clock += ms
    },

    /**
     * A bare `useState` setter: the picture moves and nothing is recorded.
     * The defect, kept as a negative control so the tests below can show that
     * routing is what fixes it rather than something else in the harness.
     */
    setConfig(patch: Record<string, unknown>) {
      config = { ...config, ...patch }
    },

    /**
     * `railEdit`: what a style control in the Chart Studio rail does now.
     *
     * The control sets its own state and the edit is recorded as the typed
     * mutation it means. Before this existed the control did only the first
     * half, which is the whole of the Tier 0 defect: no undo entry, no audit
     * row, and nothing for `applyAiPatch` to find in the sticky set.
     */
    rail(key: RailControlKey, patch: Record<string, unknown>) {
      const before = { ...config }
      const mutation = railControlMutation(key, { ...before, ...patch } as unknown as ChartState)
      if (!mutation) return
      commitEdits([appliedMutation(mutation, "user")], patch)
    },

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
      // The sticky set, derived from the audit log exactly as the workspace
      // derives it. `initHistory(spec)` alone — an empty set — is what made L6
      // unreachable.
      const patched = applyAiPatch(initHistory(spec, userEditedPaths(history)), mutations)
      const approved = patched.history.past.map((entry) => entry.applied)
      const { edits, overlay } = splitApprovedMutations(spec, approved, table)
      commitEdits(approved, {
        ...edits,
        aiOverlay: [...((config.aiOverlay ?? []) as AppliedMutation[]), ...overlay],
      })
      return patched.overrides
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

/* ── Tier 0: the rail dispatches ───────────────────────────────────────────── */

describe("L6 — a hand edit is sticky against a later AI patch", () => {
  it("preserves the researcher's series colour and announces the override", () => {
    const rail = makeRail()
    // The hand edit, through the rail control, as the workspace does it.
    rail.rail("paletteName", { paletteName: "viridis" })
    expect(rail.spec().figure.palette).toBe("viridis")

    // "Tidy up the figure": the assistant proposes a different palette and a
    // subtitle nobody has touched.
    const overrides = rail.ai([
      { kind: "figure.setPalette", value: "okabe-ito" },
      { kind: "figure.setSubtitle", value: "n = 4" },
    ])

    // Preserved, not overwritten.
    expect(rail.spec().figure.palette).toBe("viridis")
    // Not silently: the collision is reported, with the sentence the card shows.
    expect(overrides.map((o) => o.path)).toEqual(["figure.setPalette"])
    expect(overrides[0].description).toContain("okabe-ito")
    // And the change that collided with nothing still lands.
    expect(rail.spec().figure.subtitle).toBe("n = 4")
  })

  it("is the routing that does it — an unrouted control is overwritten", () => {
    // The negative control. Same patch, same assistant, but the palette was
    // never recorded as a hand edit — which is precisely the state the whole
    // rail was in before this change, and why `overrides` was always empty.
    const rail = makeRail()
    const bypass = makeRail()
    rail.rail("paletteName", { paletteName: "viridis" })
    // `bypass` sets the same value with no mutation recorded, the way a bare
    // `setPaletteName` did.
    bypass.setConfig({ paletteName: "viridis" })

    expect(rail.ai([{ kind: "figure.setPalette", value: "okabe-ito" }])).toHaveLength(1)
    expect(bypass.ai([{ kind: "figure.setPalette", value: "okabe-ito" }])).toHaveLength(0)
    expect(rail.spec().figure.palette).toBe("viridis")
    expect(bypass.spec().figure.palette).toBe("okabe-ito")
  })

  it("defends only the axis that was touched", () => {
    const rail = makeRail()
    rail.rail("yLabel", { yLabel: "OD₄₅₀" })
    const overrides = rail.ai([
      { kind: "axis.set", axis: "y", patch: { label: "Signal (a.u.)" } },
      { kind: "axis.set", axis: "x", patch: { label: "Dose" } },
    ])
    expect(overrides.map((o) => o.path)).toEqual(["figure.axis.y"])
    expect(rail.spec().figure.y.label).toBe("OD₄₅₀")
    expect(rail.spec().figure.x.label).toBe("Dose")
  })

  it("stops defending an edit the researcher undid", () => {
    // Stickiness is about decisions that still stand. An edit taken back is not
    // one, and the `reverted` flag on the audit entry is what says so.
    const rail = makeRail()
    rail.rail("paletteName", { paletteName: "viridis" })
    rail.undo()
    expect(userEditedPaths(rail.history()).has("figure.setPalette")).toBe(false)
    expect(rail.ai([{ kind: "figure.setPalette", value: "okabe-ito" }])).toHaveLength(0)
    expect(rail.spec().figure.palette).toBe("okabe-ito")
  })

  it("does not make an AI edit sticky against a later AI edit", () => {
    const rail = makeRail()
    rail.ai([{ kind: "figure.setPalette", value: "viridis" }])
    expect(rail.ai([{ kind: "figure.setPalette", value: "okabe-ito" }])).toHaveLength(0)
    expect(rail.spec().figure.palette).toBe("okabe-ito")
  })

  it("survives the round trip a saved analysis makes", () => {
    // The sticky set is read off the log, and the log is persisted with the
    // revision — so a reopened analysis still defends the edits made in the
    // session that produced it. "Must work as the 15th edit, not just the first."
    const rail = makeRail()
    rail.rail("yLabel", { yLabel: "OD₄₅₀" })
    const persisted: ConfigHistory = JSON.parse(JSON.stringify(rail.history()))
    expect(userEditedPaths(persisted)).toEqual(new Set(["figure.axis.y"]))
  })
})

describe("T0.31 — a style edit is undoable", () => {
  it("undoes a colour, an axis label and a font, and redoes them", () => {
    const rail = makeRail()
    const before = rail.spec()

    rail.rail("paletteName", { paletteName: "viridis" })
    rail.tick(1000)
    rail.rail("yLabel", { yLabel: "OD₄₅₀" })
    rail.tick(1000)
    rail.rail("titleSize", { titleSize: 24 })

    expect(canUndo(rail.history())).toBe(true)
    rail.undo()
    expect(rail.spec().figure.titleFontSize).toBe(before.figure.titleFontSize)
    rail.undo()
    expect(rail.spec().figure.y.label).toBe(before.figure.y.label)
    rail.undo()
    expect(rail.spec().figure.palette).toBe(before.figure.palette)
    expect(canUndo(rail.history())).toBe(false)

    rail.redo()
    expect(rail.spec().figure.palette).toBe("viridis")
    rail.redo()
    rail.redo()
    expect(rail.spec().figure.titleFontSize).toBe(24)
  })

  it("puts style edits on the provenance card, undone ones included", () => {
    const rail = makeRail()
    rail.rail("paletteName", { paletteName: "viridis" })
    rail.tick(1000)
    rail.rail("titleSize", { titleSize: 24 })
    rail.undo()
    const records = auditRecords(rail.history())
    expect(records.map((r) => [r.applied[0].description, r.reverted])).toEqual([
      ["Palette changed to viridis", false],
      ["Typography changed", true],
    ])
  })
})

describe("the undo stack is capped and the log is not", () => {
  it("keeps the most recent MAX_UNDO_DEPTH steps", () => {
    const rail = makeRail()
    // Distinct gestures: the clock moves past the coalescing window each time.
    for (let i = 0; i < MAX_UNDO_DEPTH + 20; i++) {
      rail.tick(1000)
      rail.rail("titleSize", { titleSize: 12 + (i % 16) })
    }
    expect(rail.history().past).toHaveLength(MAX_UNDO_DEPTH)
    // The record is complete even though the stack is not. An edit that can no
    // longer be undone still happened, and provenance is not a rolling window.
    expect(rail.history().log).toHaveLength(MAX_UNDO_DEPTH + 20)
  })
})

describe("a continuous control is one undo step", () => {
  it("coalesces a slider drag and reverses all of it at once", () => {
    const rail = makeRail()
    const before = rail.spec().figure.titleFontSize
    // Sixty frames of a drag, 8ms apart.
    for (let size = 12; size <= 26; size++) {
      rail.tick(8)
      rail.rail("titleSize", { titleSize: size })
    }
    expect(rail.spec().figure.titleFontSize).toBe(26)
    expect(rail.history().past).toHaveLength(1)
    expect(rail.history().log).toHaveLength(1)
    rail.undo()
    expect(rail.spec().figure.titleFontSize).toBe(before)
  })

  it("coalesces keystrokes in a text field", () => {
    const rail = makeRail()
    for (const text of ["O", "OD", "OD₄", "OD₄₅", "OD₄₅₀"]) {
      rail.tick(60)
      rail.rail("yLabel", { yLabel: text })
    }
    expect(rail.history().past).toHaveLength(1)
    rail.undo()
    expect(rail.spec().figure.y.label).toBe("Signal")
  })

  it("keeps two deliberate nudges apart", () => {
    const rail = makeRail()
    rail.tick(10)
    rail.rail("titleSize", { titleSize: 18 })
    rail.tick(2000)
    rail.rail("titleSize", { titleSize: 19 })
    expect(rail.history().past).toHaveLength(2)
  })

  it("never merges an assistant edit into a hand edit", () => {
    // The one merge that would erase the distinction the provenance card exists
    // to show. Same path, same instant, different author.
    const rail = makeRail()
    rail.rail("paletteName", { paletteName: "viridis" })
    rail.ai([{ kind: "figure.setSubtitle", value: "n = 4" }])
    expect(rail.history().past).toHaveLength(2)
    expect(historyMutations(rail.history()).map((m) => m.origin)).toEqual(["user", "ai"])
  })

  it("leaves nothing behind when a drag returns to where it started", () => {
    const rail = makeRail()
    rail.setConfig({ titleSize: 17 })
    const before = rail.spec().figure.titleFontSize
    rail.tick(10)
    rail.rail("titleSize", { titleSize: 24 })
    rail.tick(10)
    rail.rail("titleSize", { titleSize: before })
    expect(rail.history().past).toHaveLength(0)
    expect(rail.history().log).toHaveLength(0)
    expect(canUndo(rail.history())).toBe(false)
  })
})

describe("the undo shortcut", () => {
  const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) =>
    ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods })

  it.each([
    ["Cmd-Z", key("z", { metaKey: true }), "undo"],
    ["Ctrl-Z", key("z", { ctrlKey: true }), "undo"],
    ["Cmd-Shift-Z", key("z", { metaKey: true, shiftKey: true }), "redo"],
    ["Ctrl-Shift-Z", key("z", { ctrlKey: true, shiftKey: true }), "redo"],
    ["Ctrl-Y", key("y", { ctrlKey: true }), "redo"],
    ["capital Z", key("Z", { metaKey: true }), "undo"],
  ])("%s", (_label, event, expected) => {
    expect(undoShortcut(event)).toBe(expected)
  })

  it.each([
    ["a bare z", key("z")],
    ["Escape, which the dialogs own", key("Escape")],
    ["Alt-Cmd-Z", key("z", { metaKey: true, altKey: true })],
    ["Cmd-Y, which is not a redo anywhere", key("y", { metaKey: true })],
  ])("is not %s", (_label, event) => {
    expect(undoShortcut(event)).toBeNull()
  })

  it("leaves the keystroke to whatever owns its own undo", () => {
    const sheet = document.createElement("div")
    sheet.setAttribute("data-n9-sheet", "")
    const canvas = document.createElement("canvas")
    sheet.appendChild(canvas)
    const input = document.createElement("input")
    const editable = document.createElement("div")
    // The attribute, as TipTap and the browser both write it.
    editable.setAttribute("contenteditable", "true")
    const insideEditable = document.createElement("span")
    editable.appendChild(insideEditable)
    const plain = document.createElement("div")

    // The spreadsheet, however deep the focus sits inside it.
    expect(ownsUndo(canvas)).toBe(true)
    expect(ownsUndo(sheet)).toBe(true)
    expect(ownsUndo(input)).toBe(true)
    expect(ownsUndo(editable)).toBe(true)
    expect(ownsUndo(insideEditable)).toBe(true)
    // Anything else is ours.
    expect(ownsUndo(plain)).toBe(false)
    expect(ownsUndo(null)).toBe(false)
  })
})
