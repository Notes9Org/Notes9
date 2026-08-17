import { describe, expect, it } from "vitest"
import { buildProposalPreview, verifyApplied } from "@/lib/data-analysis/workspace/spec-prompt"
import { specFromChartState, tableFromChartRows, type ChartState } from "@/lib/data-analysis/workspace/chart-state-spec"
import type { SpecMutation } from "@/lib/data-analysis/spec/mutations"

/**
 * ADR-022: the preview path (proposed chart plus a settings diff) and the
 * post-commit "applied but the figure didn't change" detection, both made
 * real by this slice.
 */
const state: ChartState = {
  chartType: "bar",
  xKey: "group",
  yKeys: ["signal"],
  title: "Signal by group",
  xLabel: "Group",
  yLabel: "Signal",
  paletteName: "okabe-ito",
  errorMode: "sem",
}
const table = tableFromChartRows(
  ["group", "signal"],
  [
    { group: "A", signal: 1 },
    { group: "A", signal: 2 },
    { group: "B", signal: 3 },
    { group: "B", signal: 4 },
  ]
)
const spec = specFromChartState(state, table)

describe("buildProposalPreview", () => {
  it("applies a legal mutation and reports it in the settings diff", () => {
    const mutation: SpecMutation = { kind: "figure.setPalette", value: "nature" }
    const preview = buildProposalPreview(spec, [mutation], table)
    expect(preview.overlaySpec.figure.palette).toBe("nature")
    expect(preview.unresolved).toEqual([])
    expect(preview.settingsDiff).toContainEqual({ field: "figure.palette", from: "okabe-ito", to: "nature" })
  })

  it("rejects a malformed mutation from the model — never applied, listed under unresolved", () => {
    // Missing the required "seriesKey" field: parseMutation must reject it
    // rather than crash or silently no-op.
    const malformed = { kind: "figure.setSeriesStyle", patch: { colour: "#ff0000" } } as unknown as SpecMutation
    const preview = buildProposalPreview(spec, [malformed], table)
    expect(preview.overlaySpec).toEqual(spec)
    expect(preview.unresolved).toHaveLength(1)
    expect(preview.unresolved[0].mutation).toBe(malformed)
    expect(preview.unresolved[0].reason).toBeTruthy()
  })

  it("rejects a mutation of a kind the schema does not recognise", () => {
    const bogus = { kind: "figure.doesNotExist" } as unknown as SpecMutation
    const preview = buildProposalPreview(spec, [bogus], table)
    expect(preview.unresolved).toHaveLength(1)
    expect(preview.overlaySpec).toEqual(spec)
  })

  it("dispatches nothing new the second time the same mutation is accepted (idempotent)", () => {
    const mutation: SpecMutation = { kind: "figure.setPalette", value: "nature" }
    const first = buildProposalPreview(spec, [mutation], table)
    const second = buildProposalPreview(first.overlaySpec, [mutation], table)
    expect(second.settingsDiff).toEqual([])
    expect(second.overlaySpec).toEqual(first.overlaySpec)
  })
})

describe("verifyApplied — 'applied' is a claim about the figure, not the spec (ADR-022)", () => {
  it("reports a mutation with no rendered target as visible", () => {
    const mutation: SpecMutation = { kind: "figure.setPalette", value: "nature" }
    const [result] = verifyApplied([mutation], new Set())
    expect(result).toEqual({ mutation, visible: true, reason: null })
  })

  it("reports a mutation whose target is not in the rendered entity set as applied but not visible", () => {
    const mutation: SpecMutation = {
      kind: "figure.setSeriesStyle",
      seriesKey: "signal",
      patch: { colour: "#ff0000" },
    }
    const [result] = verifyApplied([mutation], new Set(["other-series"]))
    expect(result.visible).toBe(false)
    expect(result.reason).toContain("signal")
  })

  it("reports the same mutation as visible once its target is actually drawn", () => {
    const mutation: SpecMutation = {
      kind: "figure.setSeriesStyle",
      seriesKey: "signal",
      patch: { colour: "#ff0000" },
    }
    const [result] = verifyApplied([mutation], new Set(["signal"]))
    expect(result).toEqual({ mutation, visible: true, reason: null })
  })

  it("never replays a stale overlay silently — a version-skewed target is always reported, not just dropped", () => {
    // Version skew: a stored overlay names a series the current figure no
    // longer draws. The caller decides whether to prune; verifyApplied must
    // never say "visible" without evidence in renderedEntityKeys.
    const stale: SpecMutation = { kind: "figure.setSeriesStyle", seriesKey: "old-series", patch: {} }
    const results = verifyApplied([stale], new Set())
    expect(results).toHaveLength(1)
    expect(results[0].visible).toBe(false)
    expect(results[0].reason).not.toBeNull()
  })
})
