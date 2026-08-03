import { describe, expect, it } from "vitest"
import { railEditsFromSpec } from "./spec-prompt"
import { specFromChartState, tableFromChartRows, type ChartState } from "./chart-state-spec"
import { applyMutation } from "@/lib/data-analysis/spec/mutations"

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
})
