import { describe, it, expect } from "vitest"
import {
  ANALYSIS_SPEC_SCHEMA_VERSION,
  AnalysisSpec,
  Exclusion,
  parseSpec,
  migrateSpec,
  BRACKET_STYLE_FIELDS,
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

  it("still parses a collapseReplicates saved before columns/countTo existed", () => {
    // The two new fields are additive: an already-saved spec omits them and
    // must keep opening, picking up the documented defaults.
    const result = parseSpec({
      ...minimalSpec(),
      transforms: [{ kind: "collapseReplicates", by: ["sample"], statistic: "mean" }],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const t = result.spec.transforms[0]
    expect(t.kind).toBe("collapseReplicates")
    if (t.kind !== "collapseReplicates") return
    expect(t.columns).toEqual([])
    expect(t.countTo).toBe("n")
  })

  it("accepts sd and sem as collapse statistics, and the pivotWider reshape", () => {
    const result = parseSpec({
      ...minimalSpec(),
      transforms: [
        { kind: "pivotWider", namesFrom: "timepoint", valuesFrom: "value" },
        { kind: "collapseReplicates", by: ["sample"], statistic: "sem", columns: ["v"] },
      ],
    })
    expect(result.ok).toBe(true)
  })

  it("reports issues rather than throwing, so the AI repair loop can run", () => {
    // §6.6: invalid specs are rejected and repaired, never rendered.
    const result = parseSpec({ schemaVersion: 1, dataset: {} })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.length).toBeGreaterThan(0)
  })
})

/* -- Additive schema growth (T0.6 / T0.20 / T0.27) -------------------------
   Every field these tests cover was added after specs were already being saved.
   The rule is that an already-saved spec must still parse, unchanged, and mean
   what it meant. Each field is therefore optional rather than defaulted: a
   default would also parse, but it would make the field REQUIRED at every
   construction site through `z.infer`, which is how a "purely additive" schema
   change breaks code that never mentioned it. */

describe("additive spec fields", () => {
  function withBrackets(brackets: unknown[]): Record<string, unknown> {
    const s = minimalSpec() as Record<string, unknown>
    s.figure = { ...(s.figure as Record<string, unknown>), brackets }
    return s
  }

  it("parses a spec written before joins, datasetColumn or bracket styling existed", () => {
    const parsed = parseSpec(minimalSpec())
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.spec.joins).toBeUndefined()
    expect(parsed.spec.analysis.nonlinear?.datasetColumn).toBeUndefined()
    expect(parsed.spec.schemaVersion).toBe(ANALYSIS_SPEC_SCHEMA_VERSION)
  })

  it("keeps an old bracket parsing, with no style overrides on it", () => {
    // Exactly the shape `figure.moveBracket` has always produced.
    const parsed = parseSpec(withBrackets([
      { id: "CtrlDrug", fromGroup: "Ctrl", toGroup: "Drug", offsetY: 12, derived: false, display: "stars" },
    ]))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const b = parsed.spec.figure.brackets[0]
    expect(b.offsetY).toBe(12)
    // Absent, not null: nothing was overridden, so the renderer's own tokens win
    // and a later theme change still reaches this bracket.
    expect(b.colour).toBeUndefined()
    expect(b.lineWidth).toBeUndefined()
    expect(b.fontSize).toBeUndefined()
    expect(b.capLength).toBeUndefined()
    expect(b.hidden).toBeUndefined()
  })

  it("accepts a restyled bracket and round-trips every override", () => {
    const parsed = parseSpec(withBrackets([
      {
        id: "CtrlDrug", fromGroup: "Ctrl", toGroup: "Drug", offsetY: 0, derived: true,
        display: "both", colour: "#0072B2", lineWidth: 2.5, fontSize: 14, capLength: 6, hidden: true,
      },
    ]))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.spec.figure.brackets[0]).toMatchObject({
      display: "both", colour: "#0072B2", lineWidth: 2.5, fontSize: 14, capLength: 6, hidden: true,
    })
  })

  it("rejects a bracket colour that is not a hex triplet", () => {
    expect(parseSpec(withBrackets([{ id: "ab", fromGroup: "a", toGroup: "b", colour: "red" }])).ok).toBe(false)
  })

  it("lists exactly the fields regeneration must carry across", () => {
    // The renderer re-derives brackets from the post-hoc result on every change.
    // Anything NOT in this list is a property of the fresh result; anything in it
    // is the researcher's own decision and has to survive. `offsetY` is handled
    // separately because it is a position, not a style.
    expect([...BRACKET_STYLE_FIELDS]).toEqual([
      "display", "colour", "lineWidth", "fontSize", "capLength", "hidden",
    ])
  })

  it("accepts a cross-file join and pins the joined file by its own hash", () => {
    const s = minimalSpec() as Record<string, unknown>
    s.joins = [{
      right: { fileId: "11111111-2222-3333-4444-555555555555", fileName: "map.xlsx", sheet: null, versionHash: "sha256:beef5678", rowCount: 96, columnCount: 3 },
      on: [{ left: "well", right: "Well" }],
    }]
    const parsed = parseSpec(s)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const j = parsed.spec.joins![0]
    // Law 4: a result depends on BOTH files, so both versions are in the spec.
    expect(j.right.versionHash).toBe("sha256:beef5678")
    expect(j.type).toBe("left")
    expect(j.suffix).toBe("_r")
    expect(j.columns).toEqual([])
  })

  it("rejects a join with no key columns", () => {
    const s = minimalSpec() as Record<string, unknown>
    s.joins = [{
      right: { fileId: null, fileName: "map.xlsx", sheet: null, versionHash: "sha256:beef5678", rowCount: 1, columnCount: 1 },
      on: [],
    }]
    expect(parseSpec(s).ok).toBe(false)
  })

  it("accepts a dataset column on a nonlinear fit, for a global fit", () => {
    const s = minimalSpec() as Record<string, unknown>
    s.analysis = {
      test: "nonlinear-regression",
      responseColumns: ["dose", "signal"],
      nonlinear: { model: "4pl", datasetColumn: "compound", sharedParameters: ["hillSlope"] },
    }
    const parsed = parseSpec(s)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.spec.analysis.nonlinear?.datasetColumn).toBe("compound")
    expect(parsed.spec.analysis.nonlinear?.sharedParameters).toEqual(["hillSlope"])
  })

  it("still accepts ROUT as a named exclusion method", () => {
    // ROUT was never removed from this enum, so analyses saved when the dialog
    // still offered it keep parsing. It is a real method again as of T0.10.
    const ok = Exclusion.safeParse({
      rowId: "r7", reasonKind: "statistical-outlier", method: { name: "ROUT", params: { Q: 0.01 } },
      excludedBy: "u1", excludedAt: "2026-01-01T00:00:00.000Z",
    })
    expect(ok.success).toBe(true)
  })
})
