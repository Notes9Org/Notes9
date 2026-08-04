import { describe, it, expect } from "vitest"
import {
  ANALYSIS_SPEC_SCHEMA_VERSION,
  AnalysisSpec,
  Exclusion,
  parseSpec,
  migrateSpec,
} from "./analysis-spec"

/**
 * These tests exist to pin the invariants the master document calls
 * non-negotiable. They are not coverage for coverage's sake: each one
 * corresponds to a rule that, if it silently broke, would let the product make
 * a claim it cannot honour.
 */

function minimalSpec() {
  return {
    schemaVersion: ANALYSIS_SPEC_SCHEMA_VERSION,
    dataset: {
      fileId: null,
      fileName: "viability_48h.xlsx",
      sheet: "Plate 1",
      versionHash: "sha256:abcd1234",
      rowCount: 96,
      columnCount: 4,
    },
    design: { source: "inferred" as const },
    analysis: {},
    figure: {
      kind: "dose-response" as const,
      x: {},
      y: {},
    },
    export: {},
  }
}

describe("AnalysisSpec", () => {
  it("parses a minimal spec and fills the documented defaults", () => {
    const parsed = parseSpec(minimalSpec())
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    // §6.4: colour-blind-safe palette is the DEFAULT, not an option a user has
    // to discover.
    expect(parsed.spec.figure.palette).toBe("okabe-ito")
    // §2: excluded points stay visible unless deliberately hidden.
    expect(parsed.spec.figure.showExcludedPoints).toBe(true)
    // §8.1 baseline: nothing is excluded until someone gives a reason.
    expect(parsed.spec.exclusions).toEqual([])
    // Two-sided unless a one-sided test is a deliberate choice.
    expect(parsed.spec.analysis.tails).toBe("two")
    // Everything runs in the browser worker today; the field exists so a server
    // tier is a routing change, not a migration of every stored spec.
    expect(parsed.spec.runtime).toBe("browser")
  })

  it("opens a spec saved before `runtime` existed", () => {
    // The reason the field was added early: a spec written without it must still
    // parse, or the cheap change becomes an expensive one.
    const legacy = minimalSpec() as Record<string, unknown>
    expect("runtime" in legacy).toBe(false)

    const parsed = parseSpec(legacy)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.spec.runtime).toBe("browser")

    const migrated = migrateSpec({ ...legacy, schemaVersion: undefined })
    expect(migrated.ok).toBe(true)
    if (!migrated.ok) return
    expect(migrated.spec.runtime).toBe("browser")
  })

  it("rejects a spec with no dataset version hash", () => {
    // Law 4: a result is reproducible from (spec + data version). A spec with no
    // data version cannot honour that, so it must not parse.
    const bad = minimalSpec()
    // @ts-expect-error deliberately removing a required field
    delete bad.dataset.versionHash
    expect(parseSpec(bad).ok).toBe(false)
  })

  it("carries no field for a rendered image or a computed statistic", () => {
    // Law 1 (nothing is a picture) and Law 2 (no number reaches the user that
    // did not come from the engine) are enforced structurally: if either of
    // these keys ever appears in the schema, the separation has been broken.
    const shape = Object.keys(AnalysisSpec.shape)
    for (const forbidden of ["image", "png", "svg", "results", "pValue", "statistics"]) {
      expect(shape).not.toContain(forbidden)
    }
  })
})

describe("Exclusion governance (§8.1)", () => {
  const base = {
    rowId: "row-42",
    excludedBy: "user-123",
    excludedAt: new Date("2026-07-30T10:00:00Z").toISOString(),
  }

  it("accepts a reasoned exclusion from the named list", () => {
    const parsed = Exclusion.safeParse({
      ...base,
      reasonKind: "contamination",
      reasonText: "Visible precipitate in well A7",
    })
    expect(parsed.success).toBe(true)
  })

  it("refuses a free-text reason kind with no text", () => {
    // "other" with an empty reason is how an unreasoned exclusion would sneak
    // through the named-list requirement.
    const parsed = Exclusion.safeParse({ ...base, reasonKind: "other", reasonText: "   " })
    expect(parsed.success).toBe(false)
  })

  it("refuses a statistical outlier that does not name its method", () => {
    // §8.1: "Statistical outlier removal must name its method and parameters
    // (e.g. ROUT Q=1%), never be ad hoc."
    const parsed = Exclusion.safeParse({ ...base, reasonKind: "statistical-outlier" })
    expect(parsed.success).toBe(false)
  })

  it("accepts a statistical outlier that names method and parameters", () => {
    const parsed = Exclusion.safeParse({
      ...base,
      reasonKind: "statistical-outlier",
      method: { name: "ROUT", params: { Q: 0.01 } },
    })
    expect(parsed.success).toBe(true)
  })

  it("requires an author and a timestamp on every exclusion", () => {
    const noAuthor = Exclusion.safeParse({
      rowId: "row-1",
      reasonKind: "instrument-error",
      excludedAt: base.excludedAt,
    })
    expect(noAuthor.success).toBe(false)

    const noTimestamp = Exclusion.safeParse({
      rowId: "row-1",
      reasonKind: "instrument-error",
      excludedBy: "user-123",
    })
    expect(noTimestamp.success).toBe(false)
  })
})

describe("migrateSpec (§3A.6: never fail to open)", () => {
  it("forward-migrates an unversioned spec and logs the migration", () => {
    const legacy = { ...minimalSpec() } as Record<string, unknown>
    delete legacy.schemaVersion

    const migrated = migrateSpec(legacy)
    expect(migrated.ok).toBe(true)
    if (!migrated.ok) return
    expect(migrated.spec.schemaVersion).toBe(ANALYSIS_SPEC_SCHEMA_VERSION)
    // The migration is recorded rather than silent, so the revision history can
    // show that the stored spec was upgraded on open.
    expect(migrated.notes.length).toBeGreaterThan(0)
  })

  it("reports issues rather than throwing, so the AI repair loop can run", () => {
    // §6.6: invalid specs are rejected and repaired, never rendered.
    const result = parseSpec({ schemaVersion: 1, dataset: {} })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.length).toBeGreaterThan(0)
  })
})
