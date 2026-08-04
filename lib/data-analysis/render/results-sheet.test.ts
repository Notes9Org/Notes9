import { describe, it, expect } from "vitest"
import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import { ENGINE_VERSION, type EngineResult } from "@/lib/data-analysis/engine/contract"
import { buildResultsSheet } from "./results-sheet"

function spec(analysis: Record<string, unknown> = {}): AnalysisSpec {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: null,
      fileName: "counts.xlsx",
      sheet: "Sheet1",
      versionHash: "sha256:abcd1234",
      rowCount: 24,
      columnCount: 3,
    },
    design: { source: "project-record" },
    analysis: { test: "fisher-exact", postHoc: "none", alpha: 0.05, ...analysis },
    figure: { kind: "bar-scatter-error", x: {}, y: {}, errorBars: "sd" },
    export: {},
  })
  if (!parsed.ok) throw new Error("fixture invalid")
  return parsed.spec
}

function result(overrides: Partial<EngineResult> = {}): EngineResult {
  return {
    engineVersion: ENGINE_VERSION,
    dataVersionHash: "sha256:abcd1234",
    specHash: "0123456789abcdef0123",
    computedAt: "2026-07-30T10:00:00Z",
    durationMs: 12,
    descriptives: [],
    test: null,
    curveFit: null,
    survival: null,
    testRan: null,
    error: null,
    exclusionImpact: null,
    plotData: [],
    warnings: [],
    ...overrides,
  }
}

/** Flatten to one searchable string; the sheet is array-of-arrays. */
function cells(rows: (string | number | null)[][]): string[] {
  return rows.flat().map((c) => (c === null ? "" : String(c)))
}

describe("buildResultsSheet — the engine error channel (B6)", () => {
  it("states the failure in its own section rather than among the warnings", () => {
    const rows = buildResultsSheet(
      spec({ test: "nonlinear-regression" }),
      result({
        error: {
          code: "test-failed",
          test: "nonlinear-regression",
          message: "The nonlinear-regression calculation could not be completed on this data.",
          detail: "OverflowError: (68, 'Result not representable')",
        },
      })
    )
    const flat = cells(rows)
    expect(flat).toContain("Error")
    expect(flat).toContain(
      "The nonlinear-regression calculation could not be completed on this data."
    )
    // Warnings is where a scientist reads caveats about a result that exists.
    expect(flat).not.toContain("Warnings")
  })

  it("keeps the Python exception out of the sheet entirely", () => {
    const rows = buildResultsSheet(
      spec({ test: "nonlinear-regression" }),
      result({
        error: {
          code: "test-failed",
          test: "nonlinear-regression",
          message: "The nonlinear-regression calculation could not be completed on this data.",
          detail: "OverflowError: (68, 'Result not representable')",
        },
      })
    )
    expect(cells(rows).join("\n")).not.toContain("OverflowError")
  })

  it("writes no Error section for a run that simply had nothing to report", () => {
    const rows = buildResultsSheet(spec({ test: "none" }), result())
    expect(cells(rows)).not.toContain("Error")
  })
})

describe("buildResultsSheet — records the test that ran (B7)", () => {
  it("names the substituted test alongside the requested one", () => {
    const rows = buildResultsSheet(spec(), result({ testRan: "chi-square" }))
    const flat = cells(rows)
    expect(flat).toContain("Test requested")
    expect(flat).toContain("fisher-exact")
    expect(flat).toContain("Test performed")
    expect(flat).toContain("chi-square")
  })

  it("does not repeat itself when the engine ran what was asked", () => {
    const rows = buildResultsSheet(spec(), result({ testRan: "fisher-exact" }))
    expect(cells(rows)).not.toContain("Test performed")
  })
})
