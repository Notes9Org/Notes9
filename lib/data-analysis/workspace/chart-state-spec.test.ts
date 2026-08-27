import { readFileSync } from "node:fs"
import { describe, it, expect } from "vitest"
import type { Table } from "@/lib/data-analysis/engine/resolver"
import type { AnalysisSpec, FigureKind } from "@/lib/data-analysis/spec/analysis-spec"
import type { TestCapability } from "@/lib/data-analysis/semantic/infer"
import {
  CHART_TYPE_TO_FIGURE_KIND,
  PIPELINE_FOR_NEW_SHEET,
  FIGURE_KIND_TO_CHART_TYPE,
  chartStateFromSpec,
  specFromChartState,
  recommendTestForChart,
  tableFromChartRows,
  recomputeSignature,
  railControlMutation,
  seriesStyleMutation,
  type ChartState,
  type RailControlKey,
} from "./chart-state-spec"
import { applyMutation, mutationPath, requiresRecompute, type SpecMutation } from "@/lib/data-analysis/spec/mutations"

const table: Table = tableFromChartRows(
  ["Treatment", "Viability"],
  ["Vehicle", "10 uM", "50 uM"].flatMap((t, gi) =>
    Array.from({ length: 6 }, (_, i) => ({ Treatment: t, Viability: 90 - gi * 20 + i }))
  )
)

const base: ChartState = {
  chartType: "bar",
  xKey: "Treatment",
  yKeys: ["Viability"],
  title: "Viability",
  xLabel: "Treatment",
  yLabel: "Viability",
  paletteName: "okabe-ito",
  errorMode: "sem",
}

describe("the chart type map is total", () => {
  // A chart the user can pick that the spec cannot name is a figure that
  // silently fails to save.
  const OFFERED = [
    "line", "scatter", "area", "bubble", "bar", "barStacked", "barH", "pie", "box", "violin",
    "histogram", "ecdf", "qq", "heatmap", "corrMatrix", "volcano", "blandAltman", "roc", "km",
    "forest", "scatter3d", "mesh3d",
  ]

  it.each(OFFERED)("maps %s to a figure kind", (chartType) => {
    expect(CHART_TYPE_TO_FIGURE_KIND[chartType]).toBeTruthy()
  })

  it("round-trips every mapping", () => {
    for (const [chart, kind] of Object.entries(CHART_TYPE_TO_FIGURE_KIND)) {
      expect(FIGURE_KIND_TO_CHART_TYPE[kind]).toBe(chart)
    }
  })
})

describe("deriving a spec from the rail", () => {
  it("carries the chart type through", () => {
    expect(specFromChartState({ ...base, chartType: "violin" }, table).figure.kind).toBe("violin")
    expect(specFromChartState({ ...base, chartType: "barH" }, table).figure.kind).toBe("horizontal-bar")
  })

  it("keeps the user's column mapping over what was inferred", () => {
    const spec = specFromChartState({ ...base, xKey: "Treatment", yKeys: ["Viability"] }, table)
    expect(spec.analysis.groupColumn).toBe("Treatment")
    expect(spec.analysis.responseColumns).toEqual(["Viability"])
  })

  it("carries titles, labels and units", () => {
    const spec = specFromChartState(
      { ...base, title: "Fig 1", xLabel: "Dose", xUnit: "uM", yLabel: "Viability", yUnit: "%" },
      table
    )
    expect(spec.figure.title).toBe("Fig 1")
    expect(spec.figure.x.unit).toBe("uM")
    expect(spec.figure.y.unit).toBe("%")
  })

  it("carries the log axis and manual ranges", () => {
    const spec = specFromChartState({ ...base, yLog: true, yMin: "0", yMax: "120" }, table)
    expect(spec.figure.y.scale).toBe("log10")
    expect(spec.figure.y.min).toBe(0)
    expect(spec.figure.y.max).toBe(120)
  })

  it("ignores a blank or non-numeric range instead of failing", () => {
    const spec = specFromChartState({ ...base, yMin: "", yMax: "auto" }, table)
    expect(spec.figure.y.min).toBeNull()
    expect(spec.figure.y.max).toBeNull()
  })

  it("carries per-series styling, which is the lab's figure look", () => {
    const spec = specFromChartState(
      {
        ...base,
        seriesStyles: {
          Viability: { color: "#ff0000", width: 3, dash: "dot", marker: "square", size: 9, opacity: 0.5, axis: "y2" },
        },
      },
      table
    )
    const series = spec.figure.series.find((s) => s.key === "Viability")!
    expect(series.colour).toBe("#ff0000")
    expect(series.lineWidth).toBe(3)
    expect(series.lineStyle).toBe("dot")
    expect(series.pointShape).toBe("square")
    expect(series.pointSize).toBe(9)
    expect(series.opacity).toBe(0.5)
    expect(series.axis).toBe("right")
  })

  it("falls back rather than rejecting an unknown style value", () => {
    const spec = specFromChartState(
      { ...base, seriesStyles: { Viability: { dash: "squiggle", marker: "blob" } } },
      table
    )
    const series = spec.figure.series[0]
    expect(series.lineStyle).toBe("solid")
    expect(series.pointShape).toBe("circle")
  })

  it("carries the error-bar choice and the palette", () => {
    const spec = specFromChartState({ ...base, errorMode: "ci99", paletteName: "nature" }, table)
    expect(spec.figure.errorBars).toBe("ci99")
    expect(spec.figure.palette).toBe("nature")
  })

  it("stamps a data version that moves when the data does", () => {
    const a = specFromChartState(base, table).dataset.versionHash
    const edited = tableFromChartRows(
      ["Treatment", "Viability"],
      [{ Treatment: "Vehicle", Viability: 1 }]
    )
    expect(specFromChartState(base, edited).dataset.versionHash).not.toBe(a)
  })
})

// ADR-025: a chart type used to pick a statistical test outright, and the
// artefact recorded that a test was run with no human having chosen it —
// the most serious of the root causes for an electronic lab notebook.
// `recommendTestForChart` now only offers a recommendation (surfaced as a
// `PrepOffer`); `specFromChartState` must never call it or substitute its
// answer for `analysis.test`.
describe("recommendTestForChart offers a recommendation, evidence attached", () => {
  it("recommends the design's own best answer, with a rationale, when the chart implies nothing specific", () => {
    const capabilities: TestCapability[] = [
      { test: "anova-one-way", legal: true, recommended: true },
      { test: "t-unpaired", legal: true, recommended: false },
    ]
    const recommendation = recommendTestForChart("bar", capabilities)
    expect(recommendation?.test).toBe("anova-one-way")
    expect(recommendation?.rationale).toBeTruthy()
  })

  it("recommends the test a chart type asks for, when the data can support it", () => {
    const capabilities: TestCapability[] = [{ test: "kaplan-meier", legal: true, recommended: true }]
    expect(recommendTestForChart("km", capabilities)?.test).toBe("kaplan-meier")
  })

  it("never recommends a test this data cannot support", () => {
    // A survival chart over data with no duration or event column must not
    // recommend a log-rank the resolver would refuse.
    const capabilities: TestCapability[] = [{ test: "kaplan-meier", legal: false, recommended: false }]
    expect(recommendTestForChart("km", capabilities)).toBeNull()
  })

  it("returns null, not a written choice, when there is nothing to recommend", () => {
    const capabilities: TestCapability[] = [{ test: "t-unpaired", legal: false, recommended: false }]
    expect(recommendTestForChart("line", capabilities)).toBeNull()
  })
})

describe("specFromChartState never substitutes a recommendation for the researcher's choice", () => {
  it("leaves analysis.test as \"none\" when nothing was chosen, whatever the chart type implies", () => {
    // The bug this closes: a bar chart over three replicated groups used to
    // write "anova-one-way" into the artefact with no human having chosen it.
    expect(specFromChartState({ ...base, chartType: "bar" }, table).analysis.test).toBe("none")
    expect(specFromChartState({ ...base, chartType: "km" }, table).analysis.test).toBe("none")
    const thin = tableFromChartRows(["Note"], [{ Note: "hello" }])
    expect(specFromChartState({ ...base, chartType: "line" }, thin).analysis.test).toBe("none")
  })

  it("does not pair a post-hoc correction to a test nobody chose", () => {
    expect(specFromChartState({ ...base, chartType: "bar" }, table).analysis.postHoc).toBe("none")
  })
})

/** A rail with every control moved off its default, so nothing survives by luck. */
const styled: ChartState = {
  ...base,
  subtitle: "n = 6 per group",
  caption: "Mean ± 95% CI.",
  xUnit: "uM",
  yUnit: "%",
  xLog: true,
  yLog: true,
  xMin: 1,
  xMax: 100,
  yMin: 0,
  yMax: 120,
  nticks: 6,
  errorMode: "ci95",
  paletteName: "nature",
  showGrid: false,
  showLegend: false,
  legendPos: "right",
  fontFamily: "serif",
  titleSize: 20,
  axisTitleSize: 11,
  width: 640,
  height: 480,
  seriesStyles: {
    Viability: { color: "#ff0000", width: 3, dash: "dot", marker: "square", size: 9, opacity: 0.5, axis: "y2" },
  },
}

/** The styled rail as a spec of the given kind, whether or not a control selects it. */
function specOfKind(kind: FigureKind): AnalysisSpec {
  const spec = specFromChartState({ ...styled, chartType: FIGURE_KIND_TO_CHART_TYPE[kind] ?? "bar" }, table)
  return { ...spec, figure: { ...spec.figure, kind } }
}

describe("driving the rail from a spec", () => {
  const ROUND_TRIPPABLE: FigureKind[] = [
    "bar-scatter-error",
    "box",
    "xy-scatter-fit",
    "kaplan-meier",
    "heatmap",
  ]

  it.each(ROUND_TRIPPABLE)("round-trips a %s figure", (kind) => {
    const spec = specOfKind(kind)
    const round = specFromChartState({ ...styled, ...chartStateFromSpec(spec, table) }, table)
    expect(round.figure).toEqual(spec.figure)
  })

  it.each(ROUND_TRIPPABLE)("round-trips the columns and test of a %s figure", (kind) => {
    const spec = specOfKind(kind)
    const round = specFromChartState({ ...styled, ...chartStateFromSpec(spec, table) }, table)
    expect(round.analysis.groupColumn).toBe(spec.analysis.groupColumn)
    expect(round.analysis.responseColumns).toEqual(spec.analysis.responseColumns)
    expect(round.analysis.test).toBe(spec.analysis.test)
    expect(round.analysis.postHoc).toBe(spec.analysis.postHoc)
    expect(round.analysis.alpha).toBe(spec.analysis.alpha)
    expect(round.analysis.tails).toBe(spec.analysis.tails)
    expect(round.analysis.referenceLevel).toBe(spec.analysis.referenceLevel)
  })

  it("returns every chart type the rail can select", () => {
    for (const [chart, kind] of Object.entries(CHART_TYPE_TO_FIGURE_KIND)) {
      expect(chartStateFromSpec(specOfKind(kind), table).chartType).toBe(chart)
    }
  })

  it("leaves the chart control alone for a kind no control selects", () => {
    // dose-response is a spec kind with no button on the rail. Guessing the
    // nearest chart would quietly redraw the figure as a different one.
    const spec = specOfKind("dose-response")
    const state = chartStateFromSpec(spec, table)
    expect(Object.keys(state)).not.toContain("chartType")

    const round = specFromChartState({ ...styled, ...state }, table)
    expect(round.figure.kind).toBe(CHART_TYPE_TO_FIGURE_KIND[styled.chartType])
    expect({ ...round.figure, kind: spec.figure.kind }).toEqual(spec.figure)
  })

  it("omits what the rail has no control for, rather than assigning undefined", () => {
    const state = chartStateFromSpec(specOfKind("box"), table)
    const keys = Object.keys(state)
    for (const absent of [
      "y2",
      "brackets",
      "annotations",
      "showExcludedPoints",
      "showConfidenceBands",
      "volcanoFoldChange",
    ]) {
      expect(keys).not.toContain(absent)
    }
  })

  it("leaves a required control standing when the spec is silent", () => {
    const spec = specOfKind("box")
    const quiet: AnalysisSpec = {
      ...spec,
      figure: { ...spec.figure, title: null, x: { ...spec.figure.x, label: null } },
    }
    const keys = Object.keys(chartStateFromSpec(quiet, table))
    expect(keys).not.toContain("title")
    expect(keys).not.toContain("xLabel")
    expect(keys).toContain("yLabel")
  })

  it("does not point the chart at a column the sheet no longer has", () => {
    const spec = specOfKind("box")
    const stale: AnalysisSpec = {
      ...spec,
      analysis: { ...spec.analysis, groupColumn: "Batch", responseColumns: ["Absorbance"] },
    }
    const state = chartStateFromSpec(stale, table)
    expect(Object.keys(state)).not.toContain("xKey")
    expect(Object.keys(state)).not.toContain("yKeys")
  })

  it("carries the styling the figure was saved with", () => {
    const state = chartStateFromSpec(specOfKind("box"), table)
    expect(state.paletteName).toBe("nature")
    expect(state.errorMode).toBe("ci95")
    expect(state.legendPos).toBe("right")
    expect(state.showGrid).toBe(false)
    expect(state.yLog).toBe(true)
    expect(state.yMax).toBe(120)
    expect(state.nticks).toBe(6)
    expect(state.fontFamily).toBe("serif")
    expect(state.width).toBe(640)
    expect(state.seriesStyles?.Viability).toEqual({
      color: "#ff0000",
      width: 3,
      dash: "dot",
      marker: "square",
      size: 9,
      opacity: 0.5,
      axis: "y2",
    })
  })
})

describe("the statistics slice survives a round trip", () => {
  it("keeps an explicitly chosen test", () => {
    // The bug this covers: the test used to be recomputed from the chart type
    // on every derivation, so a chosen test, an AI answering "compare treated
    // vs control", or the panel, was overwritten on the very next render.
    const chosen = specFromChartState({ ...base, test: "kruskal-wallis" }, table)
    expect(chosen.analysis.test).toBe("kruskal-wallis")

    const state = chartStateFromSpec(chosen, table)
    expect(state.test).toBe("kruskal-wallis")
    expect(specFromChartState({ ...base, ...state }, table).analysis.test).toBe("kruskal-wallis")
  })

  it("never derives the test from the chart type, chosen or not (ADR-025)", () => {
    // This is the artefact-records-a-test-no-human-chose failure ADR-025
    // exists to close: analysis.test stays "none", never a chart-type guess.
    expect(specFromChartState(base, table).analysis.test).toBe("none")
    expect(specFromChartState({ ...base, test: undefined }, table).analysis.test).toBe("none")
  })

  it("falls back to \"none\", not a recommendation, when the chosen test is illegal here", () => {
    // t-unpaired compares two groups; this table has three. Carrying the
    // choice through would hand the resolver a spec it can only reject, and
    // substituting a recommendation instead would be the same
    // artefact-records-a-choice-nobody-made failure, one step removed.
    expect(specFromChartState({ ...base, test: "t-unpaired" }, table).analysis.test).toBe("none")
  })

  it("keeps the correction, alpha, tails and reference level", () => {
    const chosen = { postHoc: "dunn", alpha: 0.01, tails: "greater", referenceLevel: "Vehicle" } as const
    const spec = specFromChartState({ ...base, ...chosen }, table)
    expect(spec.analysis).toMatchObject(chosen)

    const state = chartStateFromSpec(spec, table)
    expect(state).toMatchObject(chosen)
    expect(specFromChartState({ ...base, ...state }, table).analysis).toMatchObject(chosen)
  })

  it("leaves the derived defaults alone when the rail chose nothing", () => {
    // postHoc is "none" because it is derived from analysis.test, which is
    // itself "none" now that nothing substitutes a chart-type guess for it.
    const analysis = specFromChartState(base, table).analysis
    expect(analysis.postHoc).toBe("none")
    expect(analysis.alpha).toBe(0.05)
    expect(analysis.tails).toBe("two")
    expect(analysis.referenceLevel).toBeNull()
  })
})

// P4, the bridge: `ChartState` had no field for filters, transforms or
// exclusions, so `data.setFilters` / `data.addTransform` landed on the spec
// and vanished the moment `chartStateFromSpec` diffed it back through the
// rail. These prove the round trip, and the guard that keeps a stale filter
// from silently dropping every row once the named column is gone.
describe("the data pipeline round-trips through the rail", () => {
  const filters: NonNullable<ChartState["filters"]> = [{ column: "Treatment", op: "eq", value: "Vehicle" }]
  const transforms: NonNullable<ChartState["transforms"]> = [{ kind: "log10", column: "Viability" }]
  const exclusions: NonNullable<ChartState["exclusions"]> = [
    {
      rowId: "row-2",
      reasonKind: "technical-failure",
      reasonText: null,
      method: null,
      excludedBy: "user",
      excludedAt: "2026-08-03T00:00:00.000Z",
    },
  ]

  it("carries filters, transforms and exclusions from the rail onto the spec", () => {
    const spec = specFromChartState({ ...base, filters, transforms, exclusions }, table)
    expect(spec.filters).toEqual(filters)
    expect(spec.transforms).toEqual(transforms)
    expect(spec.exclusions).toEqual(exclusions)
  })

  it("carries them back off the spec and through a second derivation unchanged", () => {
    const spec = specFromChartState({ ...base, filters, transforms, exclusions }, table)
    const state = chartStateFromSpec(spec, table)
    expect(state.filters).toEqual(filters)
    expect(state.transforms).toEqual(transforms)
    expect(state.exclusions).toEqual(exclusions)

    const round = specFromChartState({ ...base, ...state }, table)
    expect(round.filters).toEqual(filters)
    expect(round.transforms).toEqual(transforms)
    expect(round.exclusions).toEqual(exclusions)
  })

  it("drops a filter naming a column the current sheet doesn't have", () => {
    const stale: NonNullable<ChartState["filters"]> = [{ column: "Batch", op: "eq", value: "1" }]
    const spec = specFromChartState({ ...base, filters: stale }, table)
    expect(chartStateFromSpec(spec, table).filters).toEqual([])
  })
})

describe("recomputeSignature", () => {
  it("changes when only spec.filters changes", () => {
    const spec = specFromChartState(base, table)
    const withFilter = { ...spec, filters: [{ column: "Treatment", op: "eq" as const, value: "Vehicle" }] }
    expect(recomputeSignature(withFilter)).not.toBe(recomputeSignature(spec))
  })

  it("does not change when only figure.kind changes", () => {
    const spec = specFromChartState(base, table)
    const otherKind = { ...spec, figure: { ...spec.figure, kind: "box" as const } }
    expect(recomputeSignature(otherKind)).toBe(recomputeSignature(spec))
  })
})

/* ── A sheet swap and the §8.1 record (Blocker 3) ──────────────────────────*/

/**
 * The one door that says "these rows are gone".
 *
 * Both checks read the shell's source because a 3,800-line React component
 * cannot be mounted here, and a decision that is written down but not applied is
 * not a fix. Deliberately NOT tested here: that `row-5` names a different
 * measurement in sheet A than in sheet B. It does, and it is the whole reason
 * this door exists, but an assertion on it would pin positional row identity in
 * place -- a later round that gives row ids a dataset would have to delete the
 * test to ship the better fix, and a test whose premise is the defect is worse
 * than no test. The reasoning lives on `PIPELINE_FOR_NEW_SHEET` instead.
 */
describe("replacing the sheet", () => {
  const shellSource = () =>
    readFileSync("components/data-analysis/data-analysis-workspace.tsx", "utf8")
  // Prose about a decision is not the decision.
  const withoutComments = (s: string) => s.replace(/^\s*\/\/.*$/gm, "")

  it("drops every pipeline field the swap invalidates", () => {
    const src = shellSource()
    const start = src.indexOf("const loadSnapshot = useCallback(")
    expect(start).toBeGreaterThan(-1)
    const body = withoutComments(src.slice(start, src.indexOf("\n  }, [])", start)))
    // Read off the constant, not a list copied beside it: a fourth pipeline
    // field added to `PIPELINE_FOR_NEW_SHEET` fails here until the shell clears
    // it too, which is the failure mode a hand-written list cannot catch.
    for (const field of Object.keys(PIPELINE_FOR_NEW_SHEET)) {
      expect(body).toContain(`PIPELINE_FOR_NEW_SHEET.${field}`)
    }
  })

  it("is not what appending a statistics sheet does", () => {
    // Same rows, one report tab added. Routing that through the swap door
    // deleted the §8.1 exclusions that produced the very numbers it had just
    // written, and recomputed the figure without them.
    const src = shellSource()
    const start = src.indexOf("const addStatsSheet = useCallback(")
    expect(start).toBeGreaterThan(-1)
    const body = withoutComments(src.slice(start, src.indexOf("\n  }, [", start)))
    expect(body).not.toContain("loadSnapshot(")
    // It must still show the new tab, so the remount is half the fix.
    expect(body).toContain("setMountKey(")
  })
})

/* ── The rail, as mutations (Tier 0: rail-over-spec) ───────────────────────── */

describe("railControlMutation reproduces the derivation exactly", () => {
  /**
   * The invariant that makes routing the rail through the mutation system safe,
   * and the backward-compatibility proof at the same time.
   *
   * `specFromChartState` is still the one derivation, unchanged, and every
   * saved analysis still opens through it. What `railControlMutation` claims is
   * only that it names the STEP between two of its outputs. So for each
   * control: derive the spec from the state before, apply the control's
   * mutation, and land on the spec derived from the state after — byte for
   * byte. A mutation that under-describes its control (a font change that
   * forgets the face, an axis limit parsed differently) fails here, which is
   * the class of bug a hand-written map is otherwise full of.
   */
  const CASES: { key: RailControlKey; before: Partial<ChartState>; after: Partial<ChartState> }[] = [
    { key: "title", before: { title: "Viability" }, after: { title: "Cell viability" } },
    { key: "subtitle", before: { subtitle: "" }, after: { subtitle: "n = 6" } },
    { key: "subtitle", before: { subtitle: "n = 6" }, after: { subtitle: "" } },
    { key: "caption", before: { caption: null }, after: { caption: "Mean ± SEM." } },
    { key: "caption", before: { caption: "Mean ± SEM." }, after: { caption: null } },
    { key: "xLabel", before: { xLabel: "Treatment" }, after: { xLabel: "Dose" } },
    { key: "xUnit", before: { xUnit: "" }, after: { xUnit: "µM" } },
    { key: "xUnit", before: { xUnit: "µM" }, after: { xUnit: "" } },
    { key: "yLabel", before: { yLabel: "Viability" }, after: { yLabel: "OD₄₅₀" } },
    { key: "yUnit", before: { yUnit: "" }, after: { yUnit: "%" } },
    { key: "xLog", before: { xLog: false }, after: { xLog: true } },
    { key: "xLog", before: { xLog: true }, after: { xLog: false } },
    { key: "yLog", before: { yLog: false }, after: { yLog: true } },
    { key: "xMin", before: { xMin: "" }, after: { xMin: "0.5" } },
    { key: "xMin", before: { xMin: "0.5" }, after: { xMin: "" } },
    { key: "xMax", before: { xMax: "" }, after: { xMax: "100" } },
    { key: "yMin", before: { yMin: "" }, after: { yMin: "-2" } },
    { key: "yMax", before: { yMax: "90" }, after: { yMax: "120" } },
    { key: "nticks", before: { nticks: "" }, after: { nticks: "8" } },
    { key: "nticks", before: { nticks: "8" }, after: { nticks: "" } },
    { key: "showGrid", before: { showGrid: true }, after: { showGrid: false } },
    { key: "showLegend", before: { showLegend: true }, after: { showLegend: false } },
    { key: "legendPos", before: { legendPos: "bottom" }, after: { legendPos: "right" } },
    { key: "legendPos", before: { legendPos: "right" }, after: { legendPos: "none" } },
    { key: "paletteName", before: { paletteName: "okabe-ito" }, after: { paletteName: "viridis" } },
    // The rail holds a CSS stack, the spec one of three faces. A control that
    // shipped the stack straight into the mutation would fail the schema.
    { key: "fontFamily", before: { fontFamily: "system-ui, sans-serif" }, after: { fontFamily: "serif" } },
    { key: "fontFamily", before: { fontFamily: "serif" }, after: { fontFamily: "system-ui, -apple-system, sans-serif" } },
    { key: "titleSize", before: { titleSize: 17 }, after: { titleSize: 22 } },
    { key: "axisTitleSize", before: { axisTitleSize: 13 }, after: { axisTitleSize: 11 } },
    { key: "errorMode", before: { errorMode: "sem" }, after: { errorMode: "sd" } },
  ]

  it.each(CASES)("$key: $before -> $after", ({ key, before, after }) => {
    const from = { ...base, ...before } as ChartState
    const to = { ...base, ...before, ...after } as ChartState
    const mutation = railControlMutation(key, to)
    expect(mutation).not.toBeNull()
    expect(applyMutation(specFromChartState(from, table), mutation!)).toEqual(
      specFromChartState(to, table)
    )
  })

  it("names the spec path the sticky rule defends", () => {
    // Two axes are two independent hand edits; the Y label the researcher wrote
    // must not be shielded by their having touched the X label.
    expect(mutationPath(railControlMutation("yLabel", base)!)).toBe("figure.axis.y")
    expect(mutationPath(railControlMutation("xLabel", base)!)).toBe("figure.axis.x")
    expect(mutationPath(railControlMutation("paletteName", base)!)).toBe("figure.setPalette")
  })

  it("does not misclassify a style edit as needing the engine (Law 5)", () => {
    // Every routed control except the error bars redraws; only the error bars
    // change what is drawn FROM the data. Read off `requiresRecompute` rather
    // than a second list, so the two classifications cannot drift.
    for (const { key } of CASES) {
      const mutation = railControlMutation(key, base)!
      expect([key, requiresRecompute(mutation)]).toEqual([key, key === "errorMode"])
    }
  })
})

describe("seriesStyleMutation reproduces the derivation exactly", () => {
  const styled = (s: Record<string, unknown>): ChartState => ({
    ...base,
    seriesStyles: { Viability: s },
  })

  it.each([
    ["colour", { color: "#112233" }],
    ["line width", { width: 4 }],
    ["marker size", { size: 12 }],
    ["opacity", { opacity: 0.4 }],
    ["dash", { dash: "dash" }],
    ["marker", { marker: "square" }],
    ["second axis", { axis: "y2" }],
    // An unrecognised value must fall back exactly as the derivation does,
    // rather than reaching the schema and throwing.
    ["a marker the picker cannot produce", { marker: "hexagram" }],
  ])("%s", (_label, patch) => {
    const from = styled({ color: "#aabbcc" })
    const to = styled({ color: "#aabbcc", ...(patch as Record<string, unknown>) })
    expect(applyMutation(specFromChartState(from, table), seriesStyleMutation("Viability", to))).toEqual(
      specFromChartState(to, table)
    )
  })

  it("gives each series its own sticky path", () => {
    expect(mutationPath(seriesStyleMutation("Viability", base))).toBe("figure.series.Viability")
    expect(mutationPath(seriesStyleMutation("Toxicity", base))).toBe("figure.series.Toxicity")
  })
})

describe("the shipping rail dispatches", () => {
  /**
   * The Tier 0 regression guard.
   *
   * Every style control was a bare `useState` setter handed straight to a
   * widget's `onChange`, which is why none of them was undoable, sticky or
   * announceable. Asserting the source is the only way to check that from here
   * — the alternative is mounting a five-thousand-line component with Univer
   * and Plotly inside it — and it catches exactly the regression that matters:
   * someone adding a twenty-third control the lazy way.
   */
  const railSource = () =>
    readFileSync("components/data-analysis/data-analysis-workspace.tsx", "utf8")

  const SETTERS = [
    "setTitle", "setSubtitle", "setXLabel", "setXUnit", "setYLabel", "setYUnit",
    "setXLog", "setYLog", "setShowGrid", "setShowLegend", "setLegendPos",
    "setPaletteName", "setXMin", "setXMax", "setYMin", "setYMax", "setNticks",
    "setFontFamily", "setTitleSize", "setAxisTitleSize", "setErrorMode", "setCaption",
  ]

  it.each(SETTERS)("%s never reaches a control except through railEdit", (setter) => {
    // Every line that hands this setter to a widget must go through `railEdit`.
    // `onChange={setX}` and `onChange={(e) => setX(...)}` were the two shapes
    // the rail used, and both are the defect. The declaration and `applyConfig`
    // are the two legitimate bare uses, and neither is a control.
    const call = new RegExp(`\\b${setter}\\b`)
    const offenders = railSource()
      .split("\n")
      .filter((line) => call.test(line))
      .filter((line) => !/const \[\w+, set\w+\] = useState/.test(line))
      .filter((line) => !/^\s*(if \(|setCaption\(rail\.)/.test(line))
      .filter((line) => !line.includes("railEdit("))
    expect(offenders).toEqual([])
    // And it is actually wired, not merely absent.
    expect(railSource()).toMatch(new RegExp(`railEdit\\("\\w+", \\{[^}]*\\}, \\(\\) => [^)]*${setter}\\(`))
  })

  it("routes the per-series inspector through the recording setStyle", () => {
    const src = railSource()
    // `setSeriesStyles` is the raw setter; only `setStyle` may call it, and
    // `setStyle` is the one that writes the mutation.
    const inspector = src.slice(src.indexOf('id="cs-series"'), src.indexOf('id="cs-palette"'))
    expect(inspector).toContain("setStyle(editKey,")
    expect(inspector).not.toContain("setSeriesStyles(")
  })

  it("does not let a style edit approve the analysis and start a compute", () => {
    // Law 5, at the one place routing the rail could have broken it. Every
    // style control now reaches `recordEdit`, and `recordEdit` reaching
    // `setAnalysisApproved(true)` unconditionally would mean a font change on a
    // freshly loaded table flipping "loaded" to "approved" and firing the
    // Pyodide worker. The gate is `requiresRecompute` — the same classification
    // the compute effect uses, not a second opinion.
    const src = railSource()
    const start = src.indexOf("const recordEdit = useCallback(")
    expect(start).toBeGreaterThan(-1)
    const body = src.slice(start, src.indexOf("\n  )", start))
    expect(body).toMatch(/if \(applied\.some\(\(a\) => requiresRecompute\(a\.mutation\)\)\) setAnalysisApproved\(true\)/)

    // Every approval site is accounted for by WHAT it is, not by how many there
    // are. A bare count made adding a legitimate one — the explicit "Run it"
    // button in the figure layout — look identical to a style control sneaking
    // one in, which is the failure this test exists to catch.
    const APPROVED_BY: (string | RegExp)[] = [
      // The rail, gated on the recompute classification.
      "requiresRecompute(a.mutation)",
      // Restoring a revision whose result a human already approved.
      "human-approved analysis",
      // The researcher pressing a control whose own label states the effect —
      // the figure layout's empty-panel button and the toolbar's run control.
      // Pressing a button that says it will compute IS the consent Law 5 wants;
      // what must never appear here is a style setter.
      "onCompute=",
      /Compute( statistics)?|Run analysis|Run it|Run the statistics engine/,
    ]
    const lines = src.split("\n")
    const sites = lines
      .map((line, i) => ({ line: line.trim(), i }))
      .filter((l) => l.line.includes("setAnalysisApproved(true)"))
    expect(sites.length).toBeGreaterThan(0)
    for (const site of sites) {
      // The dozen lines above and the three below: a justification sits in the
      // comment or condition above, and for a control it can be the visible
      // label on the line after.
      const context = lines.slice(Math.max(0, site.i - 12), site.i + 4).join("\n")
      expect(
        APPROVED_BY.some((marker) =>
          typeof marker === "string" ? context.includes(marker) : marker.test(context)
        ),
        `unclassified approval on line ${site.i + 1}: ${site.line}`
      ).toBe(true)
      // And no style control is anywhere near one.
      expect(context).not.toContain("railEdit(")
      expect(context).not.toContain("setStyle(")
    }
  })

  it("hands the AI patch the sticky set instead of an empty one", () => {
    const src = railSource()
    // The single fact that made L6 dead code. Both call sites, or neither.
    expect(src).not.toMatch(/applyAiPatch\(initHistory\(derivedSpec\)/)
    expect(src.match(/applyAiPatch\(initHistory\(derivedSpec, userEditedPaths\(editHistory\)\)/g)).toHaveLength(2)
  })
})

describe("the bracket style control is routed, not held", () => {
  /**
   * T0.27's hand control. A panel that kept bracket style in `useState` would
   * draw correctly and record nothing — no history entry, no undo, nothing in
   * the saved spec — which is exactly the defect the rail refactor removed and
   * exactly what makes a restyle look like it worked and vanish on reopen.
   */
  const panel = readFileSync("components/data-analysis/workspace/brackets-panel.tsx", "utf8")
  const host = readFileSync("components/data-analysis/data-analysis-workspace.tsx", "utf8")

  it("emits figure.setBracketStyle and holds no figure state of its own", () => {
    expect(panel).toMatch(/kind: "figure\.setBracketStyle"/)
    expect(panel).not.toMatch(/useState/)
  })

  it("is mounted on the same applySpecMutation door every other hand edit uses", () => {
    expect(host).toMatch(/<BracketsPanel[\s\S]{0,200}onMutate=\{applySpecMutation\}/)
  })
})

describe("Law 5 — the two classifications agree", () => {
  /**
   * `requiresRecompute` (mutations.ts) and `recomputeSignature` (this file) are
   * two independent answers to "does this edit need the engine". They are each
   * tested on their own; nothing tested them against each other, and one of
   * them drifting is a Tier 0 defect in whichever direction it drifts.
   *
   * The direction asserted here is the dangerous one: if the SIGNATURE moves,
   * `requiresRecompute` must say so too. A signature change that
   * `requiresRecompute` calls style is a figure redrawn against numbers that
   * no longer match it — the false negative the comment in `mutations.ts`
   * names. The converse is deliberately allowed and documented: `figure.setKind`
   * recomputes without moving the signature, because the aggregation can change
   * while the inputs do not.
   */
  const before = specFromChartState(base, table)

  const EVERY_KIND: SpecMutation[] = [
    { kind: "figure.setKind", value: "box" },
    { kind: "figure.setTitle", value: "t" },
    { kind: "figure.setCaption", value: "c" },
    { kind: "figure.setSubtitle", value: "s" },
    { kind: "figure.setPalette", value: "viridis" },
    { kind: "figure.setLegend", show: false },
    { kind: "figure.setGridlines", value: false },
    { kind: "figure.setDimensions", width: 900 },
    { kind: "figure.setFont", family: "serif", titleSize: 20, axisSize: 11 },
    { kind: "figure.setSeriesStyle", seriesKey: "Viability", patch: { colour: "#123456" } },
    { kind: "figure.addAnnotation", annotation: { kind: "text", id: "n1", x: 1, y: 1, text: "hi", fontSize: 12, colour: "#000000" } },
    { kind: "figure.removeAnnotation", id: "n1" },
    { kind: "figure.moveBracket", id: "AB", offsetY: 8 },
    { kind: "figure.setBracketStyle", id: "AB", patch: { colour: "#ff0000", hidden: true } },
    { kind: "figure.setShowExcluded", value: false },
    { kind: "axis.set", axis: "x", patch: { label: "l", unit: "u", scale: "log10", min: 1, max: 9, tickCount: 5 } },
    { kind: "axis.set", axis: "y", patch: { scale: "log10" } },
    { kind: "figure.setErrorBars", value: "ci95" },
    { kind: "analysis.setTest", value: "t-welch" },
    { kind: "analysis.setPostHoc", value: "tukey" },
    { kind: "analysis.setTails", value: "greater" },
    { kind: "analysis.setAlpha", value: 0.01 },
    { kind: "analysis.setColumns", response: ["Viability"], group: "Treatment" },
    { kind: "analysis.setReferenceLevel", value: "Vehicle" },
    { kind: "analysis.setMissingValues", value: "pairwise" },
    { kind: "analysis.setNonlinear", patch: { model: "4pl" } },
    { kind: "data.addTransform", transform: { kind: "log10", column: "Viability" } },
    { kind: "data.setFilters", filters: [] },
    { kind: "data.excludeRow", exclusion: { rowId: "row-3", reasonKind: "technical-failure", reasonText: null, method: null, excludedBy: "t@x", excludedAt: "2026-01-01T00:00:00.000Z" } },
    { kind: "data.restoreRow", rowId: "row-3" },
    { kind: "design.set", patch: { paired: true } },
    { kind: "roles.set", roles: before.roles },
  ]

  it.each(EVERY_KIND.map((m) => [m.kind, m] as const))(
    "%s: a moved signature is never classified as style",
    (_kind, mutation) => {
      const after = applyMutation(before, mutation)
      const signatureMoved = recomputeSignature(after) !== recomputeSignature(before)
      if (signatureMoved) expect(requiresRecompute(mutation)).toBe(true)
    }
  )

  it("keeps the two documented exceptions", () => {
    // Both are deliberate, both are load-bearing, and both would look like bugs
    // to a future reader without an assertion saying otherwise.
    expect(requiresRecompute({ kind: "figure.setErrorBars", value: "sd" })).toBe(true)
    expect(requiresRecompute({ kind: "figure.setKind", value: "box" })).toBe(true)
    expect(
      recomputeSignature(applyMutation(before, { kind: "figure.setKind", value: "box" }))
    ).toBe(recomputeSignature(before))
  })

  it("leaves every routed style control off the engine's path entirely", () => {
    // The claim the whole change rests on: routing the rail through the
    // mutation system did not make a colour picker call Pyodide. Every rail
    // control except the error bars leaves the signature exactly where it was.
    for (const key of ["title", "subtitle", "caption", "xLabel", "yLabel", "xLog", "yLog",
      "xMin", "yMax", "nticks", "showGrid", "showLegend", "legendPos", "paletteName",
      "fontFamily", "titleSize", "axisTitleSize"] as RailControlKey[]) {
      const moved = { ...base, title: "T", subtitle: "S", caption: "C", xLabel: "X", yLabel: "Y",
        xLog: true, yLog: true, xMin: "1", yMax: "9", nticks: "7", showGrid: false,
        showLegend: false, legendPos: "top", paletteName: "viridis", fontFamily: "serif",
        titleSize: 20, axisTitleSize: 11 } as ChartState
      const mutation = railControlMutation(key, moved)!
      expect([key, recomputeSignature(applyMutation(before, mutation))]).toEqual([
        key,
        recomputeSignature(before),
      ])
    }
  })
})
