import { describe, it, expect } from "vitest"
import { AnalysisSpec, parseSpec } from "@/lib/data-analysis/spec/analysis-spec"
import { computeCacheKey, checkResultIntegrity, hashObject, ENGINE_VERSION } from "./contract"

function spec(overrides: Record<string, unknown> = {}): AnalysisSpec {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: null,
      fileName: "viability_48h.xlsx",
      sheet: null,
      versionHash: "sha256:aaaa1111",
      rowCount: 24,
      columnCount: 3,
    },
    design: { source: "inferred" },
    analysis: { test: "anova-one-way", postHoc: "tukey" },
    figure: { kind: "bar-scatter-error", x: {}, y: {} },
    export: {},
    ...overrides,
  })
  if (!parsed.ok) throw new Error("fixture spec is invalid")
  return parsed.spec
}

describe("cache key (§6.3)", () => {
  it("is stable across key ordering", async () => {
    // Two objects with the same content but different insertion order must hash
    // identically, or a reopened analysis would get a new provenance identity
    // for no reason.
    const a = await hashObject({ alpha: 1, beta: { x: 1, y: 2 } })
    const b = await hashObject({ beta: { y: 2, x: 1 }, alpha: 1 })
    expect(a).toBe(b)
  })

  it("changes when the data version changes", async () => {
    const base = await computeCacheKey(spec())
    const moved = await computeCacheKey(
      spec({
        dataset: {
          fileId: null,
          fileName: "viability_48h.xlsx",
          sheet: null,
          versionHash: "sha256:bbbb2222",
          rowCount: 24,
          columnCount: 3,
        },
      })
    )
    expect(moved.cacheKey).not.toBe(base.cacheKey)
  })

  it("changes when the test changes", async () => {
    const base = await computeCacheKey(spec())
    const other = await computeCacheKey(spec({ analysis: { test: "kruskal-wallis" } }))
    expect(other.specHash).not.toBe(base.specHash)
  })

  it("changes when an exclusion is added", async () => {
    // An exclusion moves the numbers, so it must invalidate the cached result.
    const base = await computeCacheKey(spec())
    const excluded = await computeCacheKey(
      spec({
        exclusions: [
          {
            rowId: "row-7",
            reasonKind: "instrument-error",
            excludedBy: "user-1",
            excludedAt: new Date("2026-07-30T09:00:00Z").toISOString(),
          },
        ],
      })
    )
    expect(excluded.specHash).not.toBe(base.specHash)
  })

  it("does NOT change when only style changes (Law 5)", async () => {
    // Style edits get a 16ms budget and must never trigger a recompute. If this
    // test fails, restyling has become expensive and the two latency paths have
    // collapsed into one.
    const base = await computeCacheKey(spec())
    const restyled = await computeCacheKey(
      spec({
        figure: {
          kind: "bar-scatter-error",
          x: {},
          y: {},
          palette: "viridis",
          titleFontSize: 24,
          showGridlines: false,
          title: "A different title",
        },
      })
    )
    expect(restyled.specHash).toBe(base.specHash)
  })

  it("DOES change when the error-bar choice changes", async () => {
    // Error bars look like styling but change what is drawn, so they belong on
    // the computational side of the line.
    const base = await computeCacheKey(spec())
    const sem = await computeCacheKey(
      spec({ figure: { kind: "bar-scatter-error", x: {}, y: {}, errorBars: "sem" } })
    )
    expect(sem.specHash).not.toBe(base.specHash)
  })
})

describe("integrity check on reopen (§3A.3 rule 3)", () => {
  const stored = {
    engineVersion: "notes9-stats 1.0.0 (pyodide 0.28.3)",
    dataVersionHash: "sha256:aaaa1111",
    specHash: "spec-hash-1",
  }

  it("passes when nothing has moved", () => {
    const check = checkResultIntegrity(stored, { ...stored })
    expect(check.valid).toBe(true)
  })

  it("flags an engine upgrade precisely", () => {
    const check = checkResultIntegrity(stored, {
      ...stored,
      engineVersion: "notes9-stats 1.1.0 (pyodide 0.28.3)",
    })
    expect(check.valid).toBe(false)
    expect(check.engineChanged).toBe(true)
    expect(check.dataChanged).toBe(false)
  })

  it("flags source-file drift precisely", () => {
    const check = checkResultIntegrity(stored, { ...stored, dataVersionHash: "sha256:cccc3333" })
    expect(check.valid).toBe(false)
    expect(check.dataChanged).toBe(true)
    expect(check.engineChanged).toBe(false)
  })

  it("names the current engine version so the banner can quote it", () => {
    expect(ENGINE_VERSION).toMatch(/^notes9-stats \d+\.\d+\.\d+ \(pyodide \d+\.\d+\.\d+\)$/)
  })
})
