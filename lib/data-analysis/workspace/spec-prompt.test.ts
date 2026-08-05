import { describe, expect, it } from "vitest"
import { applyOverlay, railEditsFromSpec, splitApprovedMutations } from "./spec-prompt"
import { specFromChartState, tableFromChartRows, type ChartState } from "./chart-state-spec"
import { applyAiPatch, applyMutation, initHistory, type SpecMutation } from "@/lib/data-analysis/spec/mutations"
import { bracketId } from "@/lib/data-analysis/spec/analysis-spec"

const table = tableFromChartRows(
  ["group", "value"],
  [
    { group: "A", value: 1 },
    { group: "A", value: 2 },
    { group: "B", value: 5 },
    { group: "B", value: 6 },
  ]
)

const state: ChartState = {
  chartType: "bar",
  xKey: "group",
  yKeys: ["value"],
  title: "Signal by group",
  xLabel: "Group",
  yLabel: "Signal",
  paletteName: "n9",
  errorMode: "sem",
  fontFamily: "system-ui, -apple-system, sans-serif",
}

const base = specFromChartState(state, table)

describe("railEditsFromSpec", () => {
  it("writes back only the field a style mutation moved", () => {
    const next = applyMutation(base, { kind: "figure.setPalette", value: "viridis" })
    expect(railEditsFromSpec(base, next, table)).toEqual({ paletteName: "viridis" })
  })

  it("hands axis limits back as the text the rail's inputs hold", () => {
    const next = applyMutation(base, { kind: "axis.set", axis: "y", patch: { scale: "log10", min: 0.1 } })
    expect(railEditsFromSpec(base, next, table)).toEqual({ yLog: true, yMin: "0.1" })
  })

  it("carries a chosen test back so the next derivation cannot recompute it away", () => {
    const next = applyMutation(base, { kind: "analysis.setTest", value: "mann-whitney" })
    expect(railEditsFromSpec(base, next, table)).toEqual({ test: "mann-whitney" })
  })

  it("is empty when nothing moved", () => {
    expect(railEditsFromSpec(base, base, table)).toEqual({})
  })

  // P4, the bridge: `data.setFilters` / `data.addTransform` land on the spec
  // (the resolver already implements every op), but `ChartState` had no field
  // to carry them, so `chartStateFromSpec` dropped them and the diff below
  // came back empty. The reply card said "Filters updated" while nothing
  // changed. These fail on the old `ChartState` and pass once it carries the
  // pipeline through.
  it("writes back a filter patch as a non-empty edits.filters", () => {
    const next = applyMutation(base, {
      kind: "data.setFilters",
      filters: [{ column: "group", op: "eq", value: "A" }],
    })
    const edits = railEditsFromSpec(base, next, table)
    expect(edits.filters).toEqual([{ column: "group", op: "eq", value: "A" }])
  })

  it("writes back a transform patch as a non-empty edits.transforms", () => {
    const next = applyMutation(base, {
      kind: "data.addTransform",
      transform: { kind: "log10", column: "value" },
    })
    const edits = railEditsFromSpec(base, next, table)
    expect(edits.transforms).toEqual([{ kind: "log10", column: "value" }])
  })
})

/**
 * P3 Execute. The plan the user reads is every mutation the model authored, so
 * Execute has to run every one of them. It used to run only the ones the rail
 * could hold: `railEditsFromSpec` diffs through `ChartState`, which has no
 * member for annotations, the nonlinear fit, the missing-value policy,
 * show-excluded, the design or the roles, so those were dropped AFTER the user
 * approved them while the card still listed them as done.
 *
 * The re-derivation below is the workspace's own `derivedSpec` memo, spelled
 * out: rail state through `specFromChartState`, then the overlay. Asserting
 * against that rather than against the patched spec is the point, because a
 * change that only survives until the next render is the defect itself.
 */
describe("splitApprovedMutations", () => {
  /** What the next render derives, given the rail edits Execute wrote. */
  const reRender = (edits: Record<string, unknown>, overlay: Parameters<typeof applyOverlay>[1]) =>
    applyOverlay(specFromChartState({ ...state, ...edits } as ChartState, table), overlay)

  it("lands the whole approved list, and it is still there on the next render", () => {
    const proposed: SpecMutation[] = [
      { kind: "analysis.setNonlinear", patch: { model: "4pl", interpolate: true } },
      {
        kind: "figure.addAnnotation",
        annotation: { kind: "text", id: "a1", x: 1, y: 2, text: "outlier", fontSize: 12, colour: "#000000" },
      },
      { kind: "design.set", patch: { paired: true } },
      // One the rail DOES hold, so the split is exercised in both directions.
      { kind: "figure.setPalette", value: "viridis" },
    ]
    // Exactly what the workspace does: `applyAiPatch` computes the plan, and
    // the sentences on the card and the list Execute runs are both taken from
    // its result.
    const patched = applyAiPatch(initHistory(base), proposed)
    const approved = patched.history.past.map((entry) => entry.applied)
    expect(approved.every((entry) => entry.origin === "ai")).toBe(true)

    const { edits, overlay } = splitApprovedMutations(base, approved, table)
    const live = reRender(edits, overlay)

    // The three the rail cannot hold, each changed and each still changed.
    expect(base.analysis.nonlinear).toBeNull()
    expect(live.analysis.nonlinear).toMatchObject({ model: "4pl", interpolate: true })
    expect(base.figure.annotations).toEqual([])
    expect(live.figure.annotations).toEqual([
      { kind: "text", id: "a1", x: 1, y: 2, text: "outlier", fontSize: 12, colour: "#000000" },
    ])
    expect(base.design.paired).toBe(false)
    expect(live.design.paired).toBe(true)
    // And the one it can, through the rail rather than the overlay.
    expect(edits.paletteName).toBe("viridis")
    expect(live.figure.palette).toBe("viridis")

    // The count the card reports is the count that lands: the live spec is the
    // spec the plan described, mutation for mutation, nothing dropped.
    expect(patched.applied).toHaveLength(4)
    expect(live).toEqual(proposed.reduce(applyMutation, base))
  })

  it("leaves a mutation the rail holds out of the overlay, so the control still wins afterwards", () => {
    // The overlay is replayed on every derivation, so anything in it overrides
    // the rail forever. A setting with a control behind it must therefore go to
    // the control, or the user's next click on it would do nothing.
    const patched = applyAiPatch(initHistory(base), [{ kind: "figure.setPalette", value: "viridis" }])
    const { edits, overlay } = splitApprovedMutations(base, patched.history.past.map((e) => e.applied), table)
    expect(overlay).toEqual([])
    expect(edits).toEqual({ paletteName: "viridis" })
    // Discard is byte-identical because nothing here mutates the spec it reads.
    expect(base).toEqual(specFromChartState(state, table))
  })
})

/**
 * The round-trip invariant, over every mutation kind there is.
 *
 * Execute promises one thing: the spec the user read on the card is the spec
 * they get. That makes the invariant an equality, not a spot check:
 *
 *     re-derive(split(approved))  ===  approved list applied to the spec
 *
 * and the left side is the workspace's real `derivedSpec` path (rail state
 * through `specFromChartState`, then the overlay), so a change that survives
 * Execute but not the next render fails here.
 *
 * The table is `Record<SpecMutation["kind"], …>`, so a kind added to the union
 * without a case below is a TYPE error, not a silently uncovered path. That
 * matters because the defect this catches was invisible to a hand-picked few:
 * `analysis.setColumns` writes three fields and `ChartState` has a home for
 * two, so classifying the whole mutation as rail-carried dropped the second
 * factor while the card still reported it applied.
 */
describe("splitApprovedMutations reproduces the approved spec exactly", () => {
  // Two factors and a numeric response: the shape a two-way ANOVA needs, and
  // the shape the second-factor defect actually appears in.
  const twoFactorTable = tableFromChartRows(
    ["treatment", "time", "value"],
    [
      { treatment: "drug", time: "0h", value: 1 },
      { treatment: "drug", time: "0h", value: 2 },
      { treatment: "drug", time: "24h", value: 7 },
      { treatment: "drug", time: "24h", value: 8 },
      { treatment: "vehicle", time: "0h", value: 1 },
      { treatment: "vehicle", time: "0h", value: 2 },
      { treatment: "vehicle", time: "24h", value: 2 },
      { treatment: "vehicle", time: "24h", value: 3 },
    ]
  )
  const twoFactorState: ChartState = {
    chartType: "bar",
    xKey: "treatment",
    yKeys: ["value"],
    title: "Signal by treatment",
    xLabel: "Treatment",
    yLabel: "Signal",
    paletteName: "n9",
    errorMode: "sem",
    fontFamily: "system-ui, -apple-system, sans-serif",
  }
  const twoFactorBase = specFromChartState(twoFactorState, twoFactorTable)

  /** The workspace's `derivedSpec` memo: rail state, then the overlay. */
  const reRender = (edits: Record<string, unknown>, overlay: Parameters<typeof applyOverlay>[1]) =>
    applyOverlay(
      specFromChartState({ ...twoFactorState, ...edits } as ChartState, twoFactorTable),
      overlay
    )

  const excludedAt = "2026-08-04T10:00:00.000Z"
  const annotation = {
    kind: "text" as const,
    id: "a1",
    x: 1,
    y: 2,
    text: "outlier",
    fontSize: 12,
    colour: "#000000",
  }

  // Every literal below is COMPLETE, defaults included: the rail half of the
  // split re-parses (schema defaults filled in) and the overlay half does not,
  // so a half-written literal would fail on the parse rather than on the split.
  const cases: Record<SpecMutation["kind"], SpecMutation[]> = {
    "figure.setKind": [{ kind: "figure.setKind", value: "violin" }],
    "figure.setTitle": [{ kind: "figure.setTitle", value: null }],
    "figure.setCaption": [{ kind: "figure.setCaption", value: "Mean ± SEM, n = 2." }],
    "figure.setSubtitle": [{ kind: "figure.setSubtitle", value: "Plate 3" }],
    "figure.setPalette": [{ kind: "figure.setPalette", value: "viridis" }],
    "figure.setLegend": [{ kind: "figure.setLegend", show: false, position: "right" }],
    "figure.setGridlines": [{ kind: "figure.setGridlines", value: false }],
    "figure.setDimensions": [{ kind: "figure.setDimensions", width: 900, height: 600 }],
    "figure.setFont": [{ kind: "figure.setFont", family: "serif", titleSize: 22, axisSize: 15 }],
    // `jitter` has no home on `ChartState`, so this is the second-factor bug
    // wearing a different hat: the rest of the patch is rail-shaped.
    "figure.setSeriesStyle": [
      { kind: "figure.setSeriesStyle", seriesKey: "value", patch: { colour: "#112233", jitter: 0.3 } },
    ],
    "figure.addAnnotation": [{ kind: "figure.addAnnotation", annotation }],
    "figure.updateAnnotation": [
      { kind: "figure.addAnnotation", annotation },
      { kind: "figure.updateAnnotation", id: "a1", patch: { text: "excluded well" } },
    ],
    "figure.removeAnnotation": [
      { kind: "figure.addAnnotation", annotation },
      { kind: "figure.addAnnotation", annotation: { ...annotation, id: "a2" } },
      { kind: "figure.removeAnnotation", id: "a1" },
    ],
    "figure.moveBracket": [
      { kind: "figure.moveBracket", id: bracketId("drug", "vehicle"), offsetY: 12 },
    ],
    "figure.setShowExcluded": [{ kind: "figure.setShowExcluded", value: false }],
    "axis.set": [{ kind: "axis.set", axis: "y", patch: { scale: "log10", min: 0.1, max: 100 } }],
    "figure.setErrorBars": [{ kind: "figure.setErrorBars", value: "sd" }],
    "analysis.setTest": [{ kind: "analysis.setTest", value: "anova-two-way" }],
    "analysis.setPostHoc": [{ kind: "analysis.setPostHoc", value: "bonferroni" }],
    "analysis.setTails": [{ kind: "analysis.setTails", value: "greater" }],
    "analysis.setAlpha": [{ kind: "analysis.setAlpha", value: 0.01 }],
    // THE headline case. `ChartState` holds the response and group columns and
    // has no home for the second factor, so the whole mutation used to route to
    // the rail and the second factor was erased on the next derivation. The
    // group column has to MOVE for the case to bite: it is the rail edit that
    // made the old classifier call the whole mutation rail-carried.
    "analysis.setColumns": [
      { kind: "analysis.setColumns", response: ["value"], group: "time", secondFactor: "treatment" },
    ],
    "analysis.setReferenceLevel": [{ kind: "analysis.setReferenceLevel", value: "vehicle" }],
    "analysis.setMissingValues": [{ kind: "analysis.setMissingValues", value: "pairwise" }],
    "analysis.setNonlinear": [
      { kind: "analysis.setNonlinear", patch: { model: "4pl", interpolate: true } },
    ],
    "data.addTransform": [{ kind: "data.addTransform", transform: { kind: "log10", column: "value" } }],
    "data.removeTransform": [
      { kind: "data.addTransform", transform: { kind: "log10", column: "value" } },
      { kind: "data.addTransform", transform: { kind: "zscore", column: "value" } },
      { kind: "data.removeTransform", index: 0 },
    ],
    "data.setFilters": [
      { kind: "data.setFilters", filters: [{ column: "treatment", op: "eq", value: "drug" }] },
    ],
    "data.excludeRow": [
      {
        kind: "data.excludeRow",
        exclusion: {
          rowId: "row-2",
          reasonKind: "technical-failure",
          reasonText: null,
          method: null,
          excludedBy: "tester",
          excludedAt,
        },
      },
    ],
    "data.restoreRow": [
      {
        kind: "data.excludeRow",
        exclusion: {
          rowId: "row-2",
          reasonKind: "technical-failure",
          reasonText: null,
          method: null,
          excludedBy: "tester",
          excludedAt,
        },
      },
      {
        kind: "data.excludeRow",
        exclusion: {
          rowId: "row-3",
          reasonKind: "contamination",
          reasonText: null,
          method: null,
          excludedBy: "tester",
          excludedAt,
        },
      },
      { kind: "data.restoreRow", rowId: "row-2" },
    ],
    "design.set": [{ kind: "design.set", patch: { paired: true, subjectColumn: "treatment" } }],
    "roles.set": [
      {
        kind: "roles.set",
        roles: [
          { column: "treatment", role: "treatment", unit: null, source: "user", confidence: null },
          { column: "time", role: "time", unit: "h", source: "user", confidence: null },
          { column: "value", role: "response", unit: "AU", source: "user", confidence: null },
        ],
      },
    ],
  }

  for (const [kind, mutations] of Object.entries(cases)) {
    it(kind, () => {
      const approvedSpec = mutations.reduce(applyMutation, twoFactorBase)
      // A case that changes nothing would pass the equality below while proving
      // nothing, so the table has to earn its own assertion first.
      expect(approvedSpec).not.toEqual(twoFactorBase)

      const patched = applyAiPatch(initHistory(twoFactorBase), mutations)
      expect(patched.applied).toHaveLength(mutations.length)
      const approved = patched.history.past.map((entry) => entry.applied)

      const { edits, overlay } = splitApprovedMutations(twoFactorBase, approved, twoFactorTable)
      expect(reRender(edits, overlay)).toEqual(approvedSpec)
    })
  }

  it("keeps the second factor a two-way ANOVA was chosen for", () => {
    // The reviewer's own path, both mutations together: the test lands on the
    // rail, the columns land on the rail AND the overlay, and the factor the
    // test is named for is still there on the next render.
    const mutations: SpecMutation[] = [
      { kind: "analysis.setTest", value: "anova-two-way" },
      { kind: "analysis.setColumns", response: ["value"], group: "time", secondFactor: "treatment" },
    ]
    const patched = applyAiPatch(initHistory(twoFactorBase), mutations)
    const { edits, overlay } = splitApprovedMutations(
      twoFactorBase,
      patched.history.past.map((entry) => entry.applied),
      twoFactorTable
    )
    const live = reRender(edits, overlay)

    expect(twoFactorBase.analysis.secondFactorColumn).toBeNull()
    expect(live.analysis.test).toBe("anova-two-way")
    expect(live.analysis.secondFactorColumn).toBe("treatment")
    expect(live).toEqual(mutations.reduce(applyMutation, twoFactorBase))
  })

  /**
   * L6 says manual edits are STICKY: a later AI change preserves them or
   * announces the override. The overlay used to invert that. It replays after
   * every derivation, so a mutation the rail held only PARTLY put its whole
   * self on the overlay and permanently pinned the half the rail DOES hold —
   * a later hand edit moved the control and nothing else, on every render, with
   * no way to clear it. Only the residue may be replayed.
   */
  const split = (mutations: SpecMutation[]) => {
    const patched = applyAiPatch(initHistory(twoFactorBase), mutations)
    return splitApprovedMutations(
      twoFactorBase,
      patched.history.past.map((entry) => entry.applied),
      twoFactorTable
    )
  }

  it("lets a later rail edit beat the AI edit that shared its control", () => {
    // The reviewer's path: the AI moves the group column (a control the rail
    // HAS) and the second factor (one it has not) in a single mutation, and the
    // user then moves the group column back by hand.
    const { edits, overlay } = split([
      { kind: "analysis.setColumns", response: ["value"], group: "time", secondFactor: "treatment" },
    ])
    expect(edits).toMatchObject({ xKey: "time" })
    const live = reRender({ ...edits, xKey: "treatment" }, overlay)

    expect(live.analysis.groupColumn).toBe("treatment")
    // and the half the rail cannot express is still carried.
    expect(live.analysis.secondFactorColumn).toBe("treatment")
  })

  it("composes two AI edits to the same control without pinning either", () => {
    // The residue is what used to need a "once overlaid, always overlaid" rule:
    // the overlay replays after the rail, so an entry carrying a field the rail
    // ALSO holds would beat the later edit to it. Carrying only the residue
    // makes the two halves disjoint, and the rule unnecessary.
    const mutations: SpecMutation[] = [
      { kind: "figure.setSeriesStyle", seriesKey: "value", patch: { colour: "#ff0000", jitter: 0.3 } },
      { kind: "figure.setSeriesStyle", seriesKey: "value", patch: { colour: "#0000ff" } },
    ]
    const { edits, overlay } = split(mutations)
    const live = reRender(edits, overlay)
    const series = live.figure.series.find((s) => s.key === "value")

    expect(live).toEqual(mutations.reduce(applyMutation, twoFactorBase))
    expect(series?.colour).toBe("#0000ff")
    expect(series?.jitter).toBe(0.3)
  })

  it("lets a later colour pick beat the AI colour that shared its picker", () => {
    const { edits, overlay } = split([
      {
        kind: "figure.setSeriesStyle",
        seriesKey: "value",
        patch: { colour: "#ff0000", jitter: 0.3 },
      },
    ])
    // The user then picks blue in the rail's series style picker.
    const live = reRender(
      { ...edits, seriesStyles: { value: { color: "#0000ff" } } },
      overlay
    )
    const series = live.figure.series.find((s) => s.key === "value")

    expect(series?.colour).toBe("#0000ff")
    expect(series?.jitter).toBe(0.3)
  })
})
