import { describe, it, expect } from "vitest"
import { bracketId, parseSpec, type AnalysisSpec } from "./analysis-spec"
import {
  applyAiPatch,
  applyMutation,
  canRedo,
  canUndo,
  describeHistorySince,
  dispatchMutation,
  initHistory,
  redo,
  requiresRecompute,
  undo,
} from "./mutations"

function baseSpec(): AnalysisSpec {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: null,
      fileName: "plate.xlsx",
      sheet: null,
      versionHash: "sha256:abcd1234",
      rowCount: 96,
      columnCount: 4,
    },
    design: { source: "inferred" },
    analysis: { test: "anova-one-way" },
    figure: { kind: "bar-scatter-error", x: {}, y: {} },
    export: {},
  })
  if (!parsed.ok) throw new Error("fixture invalid")
  return parsed.spec
}

describe("applyMutation is pure", () => {
  it("never mutates the input spec", () => {
    const spec = baseSpec()
    const before = JSON.stringify(spec)
    applyMutation(spec, { kind: "figure.setTitle", value: "Changed" })
    expect(JSON.stringify(spec)).toBe(before)
  })

  it("creates a series style on first edit and merges on the second", () => {
    let spec = baseSpec()
    spec = applyMutation(spec, {
      kind: "figure.setSeriesStyle",
      seriesKey: "Control",
      patch: { colour: "#0072B2" },
    })
    expect(spec.figure.series).toHaveLength(1)
    expect(spec.figure.series[0].colour).toBe("#0072B2")
    expect(spec.figure.series[0].pointSize).toBe(6) // default preserved

    spec = applyMutation(spec, {
      kind: "figure.setSeriesStyle",
      seriesKey: "Control",
      patch: { pointSize: 10 },
    })
    expect(spec.figure.series).toHaveLength(1)
    expect(spec.figure.series[0].colour).toBe("#0072B2") // earlier edit survives
    expect(spec.figure.series[0].pointSize).toBe(10)
  })

  // This replaces an earlier test that asserted the overwrite ("replaces rather
  // than duplicates when a row is excluded twice") as correct behaviour. It was
  // not: §8.1 keeps an exclusion BECAUSE it names who left the point out, when,
  // and why, and replacing the record in place destroyed all three with nothing
  // in history naming the loss. A test whose premise is the defect is worse than
  // no test, so it is gone.
  it("refuses to overwrite the governance record when a row is excluded twice", () => {
    const first = {
      rowId: "A7",
      reasonKind: "contamination" as const,
      reasonText: "plate edge, visible film",
      method: null,
      excludedBy: "aisha@lab.org",
      excludedAt: "2026-07-30T10:00:00Z",
    }
    const second = {
      rowId: "A7",
      reasonKind: "instrument-error" as const,
      reasonText: "reader lamp drift",
      method: null,
      excludedBy: "someone-else@lab.org",
      excludedAt: "2026-08-04T16:00:00Z",
    }
    const excluded = applyMutation(baseSpec(), { kind: "data.excludeRow", exclusion: first })
    const again = applyMutation(excluded, { kind: "data.excludeRow", exclusion: second })

    // Every field of the original survives, not merely its count.
    expect(again.exclusions).toHaveLength(1)
    expect(again.exclusions[0]).toEqual(first)
    // Identical spec, so the commit path treats it as "nothing happened" rather
    // than writing a history entry for an edit that did not land.
    expect(again).toBe(excluded)

    // Refusing is not a dead end: restoring first, then excluding again, records
    // the new reason AND leaves both events in history.
    const restored = applyMutation(again, { kind: "data.restoreRow", rowId: "A7" })
    const reExcluded = applyMutation(restored, { kind: "data.excludeRow", exclusion: second })
    expect(reExcluded.exclusions).toEqual([second])
  })

  it("marks a dragged bracket as no longer engine-derived", () => {
    let spec = baseSpec()
    spec = {
      ...spec,
      figure: {
        ...spec.figure,
        brackets: [
          { id: "b1", fromGroup: "A", toGroup: "B", offsetY: 0, derived: true, display: "stars" },
        ],
      },
    }
    spec = applyMutation(spec, { kind: "figure.moveBracket", id: "b1", offsetY: 14 })
    // A recompute may reposition derived brackets; this one must stay put.
    expect(spec.figure.brackets[0].derived).toBe(false)
    expect(spec.figure.brackets[0].offsetY).toBe(14)
  })

  it("gives a derived bracket a row the first time it is dragged", () => {
    // The significant pairs are recomputed on every result, so the spec holds no
    // bracket until someone moves one. Without the upsert the drag would be a
    // no-op against an empty array and the offset would be lost silently.
    const base = baseSpec()
    expect(base.figure.brackets).toHaveLength(0)
    const moved = applyMutation(base, {
      kind: "figure.moveBracket",
      id: bracketId("Control", "Treated"),
      offsetY: -8,
    })
    expect(moved.figure.brackets).toEqual([
      {
        id: bracketId("Control", "Treated"),
        fromGroup: "Control",
        toGroup: "Treated",
        offsetY: -8,
        derived: false,
        display: "stars",
      },
    ])
    // Dragging it again updates the row rather than adding a second one.
    const again = applyMutation(moved, {
      kind: "figure.moveBracket",
      id: bracketId("Control", "Treated"),
      offsetY: 3,
    })
    expect(again.figure.brackets).toHaveLength(1)
    expect(again.figure.brackets[0].offsetY).toBe(3)

    // An id that is not a pair id (a hand-authored "b1") has no groups to
    // recover, so it stays a no-op rather than inventing a comparison.
    expect(
      applyMutation(base, { kind: "figure.moveBracket", id: "b1", offsetY: 3 }).figure.brackets
    ).toHaveLength(0)
  })
})

describe("Law 5, style never recomputes, data and analysis always do", () => {
  it("classifies style edits as no-recompute", () => {
    expect(requiresRecompute({ kind: "figure.setPalette", value: "viridis" })).toBe(false)
    expect(requiresRecompute({ kind: "figure.setTitle", value: "x" })).toBe(false)
    expect(requiresRecompute({ kind: "figure.setGridlines", value: false })).toBe(false)
    expect(
      requiresRecompute({ kind: "axis.set", axis: "y", patch: { scale: "log10" } })
    ).toBe(false)
    expect(
      requiresRecompute({ kind: "figure.setSeriesStyle", seriesKey: "A", patch: { opacity: 0.5 } })
    ).toBe(false)
  })

  it("classifies analysis and data edits as recompute", () => {
    expect(requiresRecompute({ kind: "analysis.setTest", value: "kruskal-wallis" })).toBe(true)
    expect(requiresRecompute({ kind: "analysis.setPostHoc", value: "tukey" })).toBe(true)
    expect(requiresRecompute({ kind: "data.setFilters", filters: [] })).toBe(true)
    expect(requiresRecompute({ kind: "design.set", patch: { paired: true } })).toBe(true)
  })

  it("treats the error-bar choice as a recompute, not styling", () => {
    // It looks like a style control and is not one: it changes what is drawn
    // from the data.
    expect(requiresRecompute({ kind: "figure.setErrorBars", value: "sem" })).toBe(true)
  })
})

describe("undo/redo across data, analysis and style (§6.5)", () => {
  it("walks backwards and forwards through mixed edit types", () => {
    let h = initHistory(baseSpec())
    expect(canUndo(h)).toBe(false)

    h = dispatchMutation(h, { kind: "figure.setTitle", value: "Viability" })
    h = dispatchMutation(h, { kind: "analysis.setTest", value: "kruskal-wallis" })
    h = dispatchMutation(h, { kind: "figure.setPalette", value: "viridis" })

    expect(h.spec.figure.palette).toBe("viridis")
    expect(canUndo(h)).toBe(true)

    h = undo(h)
    expect(h.spec.figure.palette).toBe("okabe-ito")
    expect(h.spec.analysis.test).toBe("kruskal-wallis") // only one step back

    h = undo(h)
    expect(h.spec.analysis.test).toBe("anova-one-way")
    expect(h.spec.figure.title).toBe("Viability")

    h = redo(h)
    expect(h.spec.analysis.test).toBe("kruskal-wallis")
    expect(canRedo(h)).toBe(true)
  })

  it("discards the redo branch once a new edit is made", () => {
    let h = initHistory(baseSpec())
    h = dispatchMutation(h, { kind: "figure.setTitle", value: "A" })
    h = undo(h)
    expect(canRedo(h)).toBe(true)
    h = dispatchMutation(h, { kind: "figure.setTitle", value: "B" })
    expect(canRedo(h)).toBe(false)
    expect(h.spec.figure.title).toBe("B")
  })

  it("produces a readable history, not a list of timestamps (§3A.4)", () => {
    let h = initHistory(baseSpec())
    h = dispatchMutation(h, { kind: "figure.setErrorBars", value: "sd" })
    h = dispatchMutation(h, {
      kind: "data.excludeRow",
      exclusion: {
        rowId: "A7",
        reasonKind: "technical-failure",
        reasonText: "plate edge effect",
        method: null,
        excludedBy: "user-1",
        excludedAt: "2026-07-30T10:00:00Z",
      },
    })
    h = dispatchMutation(h, { kind: "figure.setPalette", value: "okabe-ito" })

    const lines = describeHistorySince(h, 0)
    expect(lines[0]).toContain("Error bars changed to SD")
    // The reason travels with the description, per §8.1.
    expect(lines[1]).toContain("A7")
    expect(lines[1]).toContain("plate edge effect")
    expect(lines[2]).toContain("Palette")
  })
})

describe("L6, manual edits are sticky", () => {
  it("refuses an AI change that lands on a hand-edited path, and reports it", () => {
    let h = initHistory(baseSpec())
    // The user sets the Y axis label by hand.
    h = dispatchMutation(h, { kind: "axis.set", axis: "y", patch: { label: "OD₄₅₀" } }, "user")

    const result = applyAiPatch(h, [
      { kind: "axis.set", axis: "y", patch: { label: "Absorbance" } },
      { kind: "figure.setPalette", value: "viridis" },
    ])

    // The hand-set label survives.
    expect(result.history.spec.figure.y.label).toBe("OD₄₅₀")
    // The non-colliding change still lands.
    expect(result.history.spec.figure.palette).toBe("viridis")
    // And the refusal is announced rather than silent.
    expect(result.overrides).toHaveLength(1)
    expect(result.overrides[0].path).toBe("figure.axis.y")
    expect(result.applied).toHaveLength(1)
  })

  it("applies the override when the user explicitly asks for it", () => {
    let h = initHistory(baseSpec())
    h = dispatchMutation(h, { kind: "axis.set", axis: "y", patch: { label: "OD₄₅₀" } }, "user")

    const forced = applyAiPatch(
      h,
      [{ kind: "axis.set", axis: "y", patch: { label: "Absorbance" } }],
      { force: true }
    )
    expect(forced.history.spec.figure.y.label).toBe("Absorbance")
    expect(forced.overrides).toHaveLength(0)
    // The override is still in history, so it can be undone and explained.
    expect(canUndo(forced.history)).toBe(true)
  })

  it("does not make an AI edit sticky against a later AI edit", () => {
    // Only HUMAN edits are sticky; the assistant may freely revise its own work.
    let h = initHistory(baseSpec())
    const first = applyAiPatch(h, [{ kind: "figure.setPalette", value: "viridis" }])
    const second = applyAiPatch(first.history, [{ kind: "figure.setPalette", value: "grayscale" }])
    expect(second.overrides).toHaveLength(0)
    expect(second.history.spec.figure.palette).toBe("grayscale")
  })

  it("keeps a series restyle sticky per series, not globally", () => {
    let h = initHistory(baseSpec())
    h = dispatchMutation(
      h,
      { kind: "figure.setSeriesStyle", seriesKey: "Control", patch: { colour: "#0072B2" } },
      "user"
    )
    const result = applyAiPatch(h, [
      { kind: "figure.setSeriesStyle", seriesKey: "Control", patch: { colour: "#D55E00" } },
      { kind: "figure.setSeriesStyle", seriesKey: "Treated", patch: { colour: "#009E73" } },
    ])
    // The user's colour on Control holds; Treated is untouched territory.
    expect(result.overrides).toHaveLength(1)
    expect(result.applied).toHaveLength(1)
    const control = result.history.spec.figure.series.find((s) => s.key === "Control")
    const treated = result.history.spec.figure.series.find((s) => s.key === "Treated")
    expect(control?.colour).toBe("#0072B2")
    expect(treated?.colour).toBe("#009E73")
  })
})
