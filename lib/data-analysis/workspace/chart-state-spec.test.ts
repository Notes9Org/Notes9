import { describe, it, expect } from "vitest"
import type { Table } from "@/lib/data-analysis/engine/resolver"
import type { AnalysisSpec, FigureKind } from "@/lib/data-analysis/spec/analysis-spec"
import {
  CHART_TYPE_TO_FIGURE_KIND,
  FIGURE_KIND_TO_CHART_TYPE,
  chartStateFromSpec,
  specFromChartState,
  tableFromChartRows,
  recomputeSignature,
  type ChartState,
} from "./chart-state-spec"

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

describe("the test follows the chart's question", () => {
  it("asks for a comparison when the chart compares groups", () => {
    // Three groups, six replicates each: a one-way ANOVA is what the bar chart
    // is posing.
    expect(specFromChartState({ ...base, chartType: "bar" }, table).analysis.test).toBe("anova-one-way")
  })

  it("pairs the correction with the test", () => {
    expect(specFromChartState({ ...base, chartType: "bar" }, table).analysis.postHoc).toBe("tukey")
  })

  it("never requests a test this data cannot support", () => {
    // A survival chart over data with no duration or event column must not
    // request a log-rank the resolver would refuse.
    expect(specFromChartState({ ...base, chartType: "km" }, table).analysis.test).not.toBe("kaplan-meier")
  })

  it("asks for nothing when nothing is supportable", () => {
    const thin = tableFromChartRows(["Note"], [{ Note: "hello" }])
    expect(specFromChartState({ ...base, chartType: "line" }, thin).analysis.test).toBe("none")
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
    // on every derivation, so a chosen test — an AI answering "compare treated
    // vs control", or the panel — was overwritten on the very next render.
    const chosen = specFromChartState({ ...base, test: "kruskal-wallis" }, table)
    expect(chosen.analysis.test).toBe("kruskal-wallis")

    const state = chartStateFromSpec(chosen, table)
    expect(state.test).toBe("kruskal-wallis")
    expect(specFromChartState({ ...base, ...state }, table).analysis.test).toBe("kruskal-wallis")
  })

  it("still derives the test from the chart type when none is chosen", () => {
    expect(specFromChartState(base, table).analysis.test).toBe("anova-one-way")
    expect(specFromChartState({ ...base, test: undefined }, table).analysis.test).toBe("anova-one-way")
  })

  it("falls back to the derived test when the chosen one is illegal here", () => {
    // t-unpaired compares two groups; this table has three. Carrying the
    // choice through would hand the resolver a spec it can only reject, so an
    // impossible test must not survive the way a legal one does.
    expect(specFromChartState({ ...base, test: "t-unpaired" }, table).analysis.test).toBe("anova-one-way")
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
    const analysis = specFromChartState(base, table).analysis
    expect(analysis.postHoc).toBe("tukey")
    expect(analysis.alpha).toBe(0.05)
    expect(analysis.tails).toBe("two")
    expect(analysis.referenceLevel).toBeNull()
  })
})

// P4 — the bridge: `ChartState` had no field for filters, transforms or
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
