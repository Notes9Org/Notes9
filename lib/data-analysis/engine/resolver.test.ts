import { describe, it, expect } from "vitest"
import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import { resolvePayload, type Table } from "./resolver"

/**
 * The resolver is the boundary between model-chosen semantics and deterministic
 * computation. These tests pin the guards, because a guard that silently stops
 * working turns a refusal into a wrong statistic.
 */

function spec(analysis: Record<string, unknown>, extra: Record<string, unknown> = {}): AnalysisSpec {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: { fileId: null, fileName: "t.xlsx", sheet: null, versionHash: "sha256:aaaa1111", rowCount: 12, columnCount: 4 },
    design: { source: "inferred" },
    analysis,
    figure: { kind: "bar-scatter-error", x: {}, y: {} },
    export: {},
    ...extra,
  })
  if (!parsed.ok) throw new Error("fixture invalid: " + JSON.stringify(parsed.issues.slice(0, 2)))
  return parsed.spec
}

function table(rows: Record<string, number | string | null>[]): Table {
  return {
    columns: Object.keys(rows[0] ?? {}),
    rows: rows.map((values, i) => ({ rowId: `r${i + 1}`, values })),
  }
}

const twoGroups = table([
  { treatment: "Ctrl", subject: "s1", value: 10 },
  { treatment: "Ctrl", subject: "s2", value: 12 },
  { treatment: "Ctrl", subject: "s3", value: 11 },
  { treatment: "Drug", subject: "s1", value: 20 },
  { treatment: "Drug", subject: "s2", value: 22 },
  { treatment: "Drug", subject: "s3", value: 21 },
])

const fourGroups = table([
  { g: "A", v: 1 }, { g: "A", v: 2 },
  { g: "B", v: 3 }, { g: "B", v: 4 },
  { g: "C", v: 5 }, { g: "C", v: 6 },
  { g: "D", v: 7 }, { g: "D", v: 8 },
])

describe("shaping", () => {
  it("shapes a two-group comparison into groups", () => {
    const out = resolvePayload(
      spec({ test: "t-welch", groupColumn: "treatment", responseColumns: ["value"] }),
      twoGroups
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.payload.shape).toBe("groups")
    if (out.payload.shape !== "groups") return
    expect(Object.keys(out.payload.groups)).toEqual(["Ctrl", "Drug"])
    expect(out.payload.groups.Ctrl).toEqual([10, 12, 11])
    // Welch by default; Student only on a deliberate choice.
    expect(out.payload.equalVariance).toBe(false)
  })

  it("aligns a paired test by subject", () => {
    const out = resolvePayload(
      spec(
        { test: "t-paired", groupColumn: "treatment", responseColumns: ["value"] },
        { design: { source: "project-record", paired: true, subjectColumn: "subject" } }
      ),
      twoGroups
    )
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "pairs") return
    expect(out.payload.pairs).toEqual([[10, 20], [12, 22], [11, 21]])
    expect(out.payload.labels).toEqual(["Ctrl", "Drug"])
  })

  it("counts unmatched subjects rather than dropping them silently", () => {
    const lopsided = table([
      { treatment: "Ctrl", subject: "s1", value: 10 },
      { treatment: "Ctrl", subject: "s2", value: 12 },
      { treatment: "Ctrl", subject: "s9", value: 13 },
      { treatment: "Drug", subject: "s1", value: 20 },
      { treatment: "Drug", subject: "s2", value: 22 },
    ])
    const out = resolvePayload(
      spec(
        { test: "t-paired", groupColumn: "treatment", responseColumns: ["value"] },
        { design: { source: "inferred", paired: true, subjectColumn: "subject" } }
      ),
      lopsided
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.warnings.join(" ")).toMatch(/1 subject .*no matching pair/)
  })

  it("builds a complete-cases matrix for repeated measures and reports drops", () => {
    const rm = table([
      { cond: "T0", subject: "s1", v: 1 }, { cond: "T1", subject: "s1", v: 2 },
      { cond: "T0", subject: "s2", v: 3 }, { cond: "T1", subject: "s2", v: 4 },
      { cond: "T0", subject: "s3", v: 5 }, // s3 missing T1
    ])
    const out = resolvePayload(
      spec(
        { test: "anova-rm", groupColumn: "cond", responseColumns: ["v"] },
        { design: { source: "inferred", repeatedMeasures: true, subjectColumn: "subject" } }
      ),
      rm
    )
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "matrix") return
    expect(out.payload.matrix).toEqual([[1, 2], [3, 4]])
    expect(out.warnings.join(" ")).toContain("mixed-effects")
  })

  it("counts a contingency table from two categoricals", () => {
    const t = table([
      { exposed: "yes", outcome: "sick" }, { exposed: "yes", outcome: "sick" },
      { exposed: "yes", outcome: "well" }, { exposed: "no", outcome: "well" },
      { exposed: "no", outcome: "well" }, { exposed: "no", outcome: "sick" },
    ])
    const out = resolvePayload(spec({ test: "fisher-exact", responseColumns: ["exposed", "outcome"] }), t)
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "contingency") return
    expect(out.payload.rowLevels).toEqual(["yes", "no"])
    expect(out.payload.table).toEqual([[2, 1], [1, 2]])
  })

  it("keeps only pairwise-complete rows for correlation", () => {
    const t = table([
      { x: 1, y: 2 }, { x: 2, y: null }, { x: 3, y: 6 }, { x: 4, y: 8 },
    ])
    const out = resolvePayload(spec({ test: "correlation-pearson", responseColumns: ["x", "y"] }), t)
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "xy") return
    expect(out.payload.x).toEqual([1, 3, 4])
    expect(out.payload.rowIds).toEqual(["r1", "r3", "r4"])
  })
})

describe("guards — the resolver fails closed", () => {
  it("asks rather than picking two of four groups for a t-test", () => {
    // A t-test on four groups is the canonical wrong-test error. Silently
    // choosing a pair would be worse than refusing.
    const out = resolvePayload(spec({ test: "t-welch", groupColumn: "g", responseColumns: ["v"] }), fourGroups)
    expect(out.ok).toBe(false)
    if (out.ok || !("question" in out)) throw new Error("expected a question")
    expect(out.question.question).toContain("4 groups")
    expect(out.question.options).toEqual(["A", "B", "C", "D"])
  })

  it("blocks an ANOVA on two groups", () => {
    const out = resolvePayload(
      spec({ test: "anova-one-way", groupColumn: "treatment", responseColumns: ["value"] }),
      twoGroups
    )
    expect(out.ok).toBe(false)
    if (out.ok || !("blocked" in out)) throw new Error("expected blocked")
    expect(out.blocked[0].code).toBe("too-few-levels")
    expect(out.blocked[0].fix).toContain("two-group test")
  })

  it("asks for the control group when Dunnett is requested without one", () => {
    const out = resolvePayload(
      spec({ test: "anova-one-way", postHoc: "dunnett", groupColumn: "g", responseColumns: ["v"] }),
      fourGroups
    )
    expect(out.ok).toBe(false)
    if (out.ok || !("question" in out)) throw new Error("expected a question")
    expect(out.question.question).toContain("control")
  })

  it("blocks a paired test with no subject column", () => {
    const out = resolvePayload(
      spec({ test: "t-paired", groupColumn: "treatment", responseColumns: ["value"] }),
      twoGroups
    )
    expect(out.ok).toBe(false)
    if (out.ok || !("blocked" in out)) throw new Error("expected blocked")
    expect(out.blocked[0].code).toBe("no-subject")
  })

  it("blocks a two-way ANOVA with only one factor", () => {
    const out = resolvePayload(
      spec({ test: "anova-two-way", groupColumn: "g", responseColumns: ["v"] }),
      fourGroups
    )
    expect(out.ok).toBe(false)
    if (out.ok || !("blocked" in out)) throw new Error("expected blocked")
    expect(out.blocked[0].code).toBe("no-second-factor")
  })

  it("blocks a curve fit with too few points for the model", () => {
    const t = table([{ c: 1, s: 0.1 }, { c: 10, s: 0.5 }, { c: 100, s: 0.9 }])
    const out = resolvePayload(
      spec({
        test: "nonlinear-regression",
        responseColumns: ["c", "s"],
        nonlinear: { model: "5pl", weighting: "none", sharedParameters: [], constraints: {}, confidenceBands: true, interpolate: false },
      }),
      t
    )
    expect(out.ok).toBe(false)
    if (out.ok || !("blocked" in out)) throw new Error("expected blocked")
    expect(out.blocked[0].message).toContain("5PL")
  })
})

describe("transforms and exclusions", () => {
  it("applies transforms in array order", () => {
    // Blank-subtract then log is not log then blank-subtract; the array order IS
    // the pipeline order, and this test would catch a reordering.
    const t = table([{ v: 101 }, { v: 1001 }])
    const out = resolvePayload(
      spec(
        { test: "descriptives", responseColumns: ["v"] },
        {
          transforms: [
            { kind: "baselineSubtract", column: "v", blankGroup: null, blankValue: 1 },
            { kind: "log10", column: "v" },
          ],
        }
      ),
      t
    )
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "columns") return
    expect(out.payload.columns.v).toEqual([2, 3]) // log10(100), log10(1000)
  })

  it("excludes rows from the computation but keeps them for the figure", () => {
    const out = resolvePayload(
      spec(
        { test: "descriptives", responseColumns: ["value"] },
        {
          exclusions: [
            {
              rowId: "r1",
              reasonKind: "technical-failure",
              reasonText: "edge effect",
              method: null,
              excludedBy: "u1",
              excludedAt: new Date("2026-07-31T09:00:00Z").toISOString(),
            },
          ],
        }
      ),
      twoGroups
    )
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "columns") return
    // Excluded from the numbers…
    expect(out.payload.columns.value).toHaveLength(5)
    // …but still drawn, marked, so §8.1's "greyed, never removed" holds.
    expect(out.payload.plotRows).toHaveLength(6)
    expect(out.payload.plotRows.find((r) => r.rowId === "r1")?.excluded).toBe(true)
    expect(out.warnings.join(" ")).toContain("1 point excluded")
  })

  it("collapses technical replicates when the transform says so", () => {
    const t = table([
      { sample: "S1", rep: 1, v: 10 }, { sample: "S1", rep: 2, v: 12 },
      { sample: "S2", rep: 1, v: 20 }, { sample: "S2", rep: 2, v: 22 },
    ])
    const out = resolvePayload(
      spec(
        { test: "descriptives", responseColumns: ["v"] },
        { transforms: [{ kind: "collapseReplicates", by: ["sample"], statistic: "mean" }] }
      ),
      t
    )
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "columns") return
    // n becomes the biological unit, not the well count.
    expect(out.payload.columns.v).toEqual([11, 21])
  })

  it("drops non-positive concentrations from a log-x fit and says so", () => {
    const t = table([
      { c: 0, s: 0.05 }, { c: 1, s: 0.1 }, { c: 10, s: 0.4 },
      { c: 100, s: 0.8 }, { c: 1000, s: 1.2 },
    ])
    const out = resolvePayload(
      spec({
        test: "nonlinear-regression",
        responseColumns: ["c", "s"],
        nonlinear: { model: "4pl", weighting: "none", sharedParameters: [], constraints: {}, confidenceBands: true, interpolate: false },
      }),
      t
    )
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "curve") return
    expect(out.payload.x).toEqual([1, 10, 100, 1000])
    expect(out.warnings.join(" ")).toContain("concentration ≤ 0")
  })
})

describe("an analysis with no test chosen still resolves", () => {
  // A timecourse or an exploratory scatter is a legitimate analysis with
  // nothing to test yet. Blocking it would make the figure undrawable until a
  // p-value is demanded, which is the testing-first pressure §8 resists.
  const rows = [
    { treatment: "Ctrl", viability: 100 },
    { treatment: "Ctrl", viability: 98 },
    { treatment: "Drug", viability: 60 },
  ]

  it("shapes the columns instead of refusing", () => {
    const outcome = resolvePayload(
      spec({ test: "none", responseColumns: ["viability"], groupColumn: "treatment" }),
      table(rows)
    )
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.payload.shape).toBe("columns")
    expect(outcome.payload.test).toBe("none")
  })

  it("still carries every row to the figure", () => {
    const outcome = resolvePayload(spec({ test: "none", responseColumns: ["viability"] }), table(rows))
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.payload.plotRows).toHaveLength(3)
  })
})
