import { describe, it, expect } from "vitest"
import type { Table } from "@/lib/data-analysis/engine/resolver"
import type { AnalysisSpec, FigureKind } from "@/lib/data-analysis/spec/analysis-spec"
import {
  CHART_TYPE_TO_FIGURE_KIND,
  FIGURE_KIND_TO_CHART_TYPE,
  chartStateFromSpec,
  specFromChartState,
  tableFromChartRows,
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
    // alpha, tails and the reference level are the statistics panel's, not the
    // rail's, so they are not what this round trip is about.
    expect(round.analysis.groupColumn).toBe(spec.analysis.groupColumn)
    expect(round.analysis.responseColumns).toEqual(spec.analysis.responseColumns)
    expect(round.analysis.test).toBe(spec.analysis.test)
    expect(round.analysis.postHoc).toBe(spec.analysis.postHoc)
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
      "test",
      "postHoc",
      "alpha",
      "tails",
      "referenceLevel",
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
