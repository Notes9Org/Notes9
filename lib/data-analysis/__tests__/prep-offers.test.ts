import { describe, expect, it } from "vitest"
import { prepOffers, profilePreparation } from "@/lib/data-analysis/workspace/prep-offers"
import { specFromChartState, tableFromChartRows, type ChartState } from "@/lib/data-analysis/workspace/chart-state-spec"

/**
 * P5 §Edge cases — "Shape: no numeric columns / single column." No offer is
 * fabricated; the profile is computed and shown, and the offer strip is
 * simply empty. Colocated with `prep-offers.test.ts` because that file
 * already exercises the normal, offer-producing shapes; this one is scoped
 * to the failure mode ADR-025/P5 name explicitly.
 */
const state: ChartState = {
  chartType: "bar",
  xKey: "",
  yKeys: [],
  title: "Notes",
  xLabel: "",
  yLabel: "",
  paletteName: "okabe-ito",
  errorMode: "sem",
}

describe("prepOffers on a shape with nothing to prepare", () => {
  it("offers nothing for a table with no numeric column, rather than inventing a role", () => {
    const table = tableFromChartRows(["Note"], [{ Note: "hello" }, { Note: "world" }])
    const spec = specFromChartState(state, table)
    expect(prepOffers(spec, profilePreparation(table))).toEqual([])
  })

  it("offers nothing for a single numeric column with nothing to compare or transform", () => {
    const table = tableFromChartRows(["Signal"], [{ Signal: 1 }, { Signal: 2 }, { Signal: 3 }])
    const spec = specFromChartState(state, table)
    expect(prepOffers(spec, profilePreparation(table))).toEqual([])
  })
})
