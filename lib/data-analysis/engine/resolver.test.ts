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

  it("collapses an even number of replicates to the midpoint, not the upper value", () => {
    // Two technical replicates is the common case, and it is exactly where
    // picking sorted[n/2] goes wrong: it returns the larger reading, biasing
    // every collapsed row upward. S1 must be 11, not 12.
    const t = table([
      { sample: "S1", rep: 1, v: 10 }, { sample: "S1", rep: 2, v: 12 },
      { sample: "S2", rep: 1, v: 20 }, { sample: "S2", rep: 2, v: 30 },
    ])
    const out = resolvePayload(
      spec(
        { test: "descriptives", responseColumns: ["v"] },
        { transforms: [{ kind: "collapseReplicates", by: ["sample"], statistic: "median" }] }
      ),
      t
    )
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "columns") return
    expect(out.payload.columns.v).toEqual([11, 25])
  })

  it("folds a wide plate layout into long form", () => {
    // A plate reader writes one column per plate column. Everything below the
    // resolver is long, so without this the raw export is unanalysable.
    const t = table([
      { row: "A", "1": 0.5, "2": 0.6 },
      { row: "B", "1": 0.7, "2": 0.8 },
    ])
    const out = resolvePayload(
      spec(
        { test: "descriptives", responseColumns: ["signal"] },
        { transforms: [{ kind: "pivotLonger", columns: ["1", "2"], namesTo: "col", valuesTo: "signal" }] }
      ),
      t
    )
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "columns") return
    expect(out.payload.columns.signal).toEqual([0.5, 0.6, 0.7, 0.8])
    // The carried column survives the fold, so "row A" is still addressable.
    expect(out.payload.plotRows.map((r) => r.values.row)).toEqual(["A", "A", "B", "B"])
    expect(out.payload.plotRows.map((r) => r.values.col)).toEqual(["1", "2", "1", "2"])
    // Ids are extended, not reused, so a folded point stays hit-testable.
    expect(new Set(out.payload.rowIds).size).toBe(4)
  })

  it("summarises a column that only exists after a transform", () => {
    // The value column is invented at step 2; reading the pre-transform column
    // list would report "nothing numeric" about a table that is entirely numeric.
    const out = resolvePayload(
      spec(
        { test: "descriptives", responseColumns: [] },
        { transforms: [{ kind: "pivotLonger", columns: ["1"], namesTo: "col", valuesTo: "signal" }] }
      ),
      table([{ row: "A", "1": 0.5 }, { row: "B", "1": 0.7 }])
    )
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "columns") return
    expect(out.payload.columns.signal).toEqual([0.5, 0.7])
  })

  it("normalises to the control on the same plate, not the control overall", () => {
    // The whole point of an on-plate control: plate 2 reads high across the
    // board, and normalising per plate must remove that drift rather than
    // reporting plate 2 as a treatment effect.
    const t = table([
      { plate: "P1", cond: "Vehicle", v: 100 },
      { plate: "P1", cond: "Drug", v: 50 },
      { plate: "P2", cond: "Vehicle", v: 200 },
      { plate: "P2", cond: "Drug", v: 100 },
    ])
    const out = resolvePayload(
      spec(
        { test: "descriptives", responseColumns: ["v"] },
        {
          transforms: [
            { kind: "normaliseToControl", column: "v", groupColumn: "cond", controlLevel: "Vehicle", per: ["plate"], as: "percent" },
          ],
        }
      ),
      t
    )
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "columns") return
    // Both drugs are 50% of their own plate's vehicle despite the 2× offset.
    expect(out.payload.columns.v).toEqual([100, 50, 100, 50])
  })

  it("yields null rather than a number when a bucket has no control", () => {
    // A plate silently normalised against nothing is the error worth blocking:
    // a missing reference is not a reference of zero.
    //
    // "leave" so the assertion is about the transform. Under the default
    // listwise strategy the null row is now dropped from the computation
    // outright — that is what listwise means, and it is only visible here
    // because the strategy stopped being decorative.
    const t = table([
      { plate: "P1", cond: "Vehicle", v: 100 },
      { plate: "P1", cond: "Drug", v: 50 },
      { plate: "P2", cond: "Drug", v: 80 },
    ])
    const out = resolvePayload(
      spec(
        { test: "descriptives", responseColumns: ["v"], missingValues: "leave" },
        {
          transforms: [
            { kind: "normaliseToControl", column: "v", groupColumn: "cond", controlLevel: "Vehicle", per: ["plate"], as: "ratio" },
          ],
        }
      ),
      t
    )
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "columns") return
    expect(out.payload.columns.v).toEqual([1, 0.5, null])
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

describe("a named level is a level, not a column", () => {
  // A blank group and a fold-change baseline name a LEVEL — "Blank", "Ctrl" —
  // and the column that holds it is resolved from the spec. Reading the level as
  // a column name matches every row, which silently averages the whole table and
  // returns a grand mean wearing a baseline's name.
  const plate = table([
    { cond: "Blank", od: 100 },
    { cond: "Blank", od: 300 },
    { cond: "Sample", od: 1000 },
    { cond: "Sample", od: 1400 },
  ])

  it("subtracts the blank group's mean, not the whole table's", () => {
    const out = resolvePayload(
      spec(
        { test: "descriptives", responseColumns: ["od"], groupColumn: "cond" },
        { transforms: [{ kind: "baselineSubtract", column: "od", blankGroup: "Blank", blankValue: null }] }
      ),
      plate
    )
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "columns") return
    // Blank mean is 200. The grand mean is 700, which would report the samples
    // as 300 and 700 and push both blanks far below zero.
    expect(out.payload.columns.od).toEqual([-100, 100, 800, 1200])
  })

  it("divides a fold-change by the baseline level's mean, not every row's", () => {
    const out = resolvePayload(
      spec(
        { test: "descriptives", responseColumns: ["v"], groupColumn: "g" },
        { transforms: [{ kind: "foldChange", column: "v", baseline: "Ctrl" }] }
      ),
      table([
        { g: "Ctrl", v: 10 }, { g: "Ctrl", v: 10 },
        { g: "Drug", v: 30 }, { g: "Drug", v: 50 },
      ])
    )
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "columns") return
    // Control mean 10. Against the grand mean of 25 the drug rows read 1.2 and
    // 2.0 — an effect divided into itself, and plausible enough to publish.
    expect(out.payload.columns.v).toEqual([1, 1, 3, 5])
  })

  it("finds the level through a role-tagged column when no group column is declared", () => {
    const out = resolvePayload(
      spec(
        { test: "descriptives", responseColumns: ["od"] },
        {
          roles: [{ column: "cond", role: "treatment", unit: null, source: "user", confidence: null }],
          transforms: [{ kind: "baselineSubtract", column: "od", blankGroup: "Blank", blankValue: null }],
        }
      ),
      plate
    )
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "columns") return
    expect(out.payload.columns.od).toEqual([-100, 100, 800, 1200])
  })

  it("blocks rather than falling back to a table-wide mean", () => {
    // "treatment" is a column name here, not a level — exactly the mistake the
    // old code accepted and answered with the grand mean of all 24 rows.
    const out = resolvePayload(
      spec(
        { test: "descriptives", responseColumns: ["value"], groupColumn: "treatment" },
        { transforms: [{ kind: "baselineSubtract", column: "value", blankGroup: "treatment", blankValue: null }] }
      ),
      twoGroups
    )
    expect(out.ok).toBe(false)
    if (out.ok || !("blocked" in out)) throw new Error("expected blocked")
    expect(out.blocked[0].code).toBe("level-not-found")
  })
})

describe("an exclusion is reported as applied only when it applied", () => {
  const excl = (rowId: string) => ({
    rowId,
    reasonKind: "technical-failure" as const,
    reasonText: "edge effect",
    method: null,
    excludedBy: "u1",
    excludedAt: new Date("2026-07-31T09:00:00Z").toISOString(),
  })

  it("does not claim an exclusion that a reshape orphaned", () => {
    const t = table([
      { sample: "S1", v: 10 }, { sample: "S1", v: 90 },
      { sample: "S2", v: 20 }, { sample: "S2", v: 22 },
    ])
    const out = resolvePayload(
      spec(
        { test: "descriptives", responseColumns: ["v"] },
        {
          transforms: [{ kind: "collapseReplicates", by: ["sample"], statistic: "mean" }],
          exclusions: [excl("r2")],
        }
      ),
      t
    )
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "columns") return
    // collapseReplicates rewrote "r2" to "r1+r2", so the outlier is still in the
    // mean. Saying "1 point excluded" here is the false statement §8.1 cannot
    // afford; the honest answer names what did not happen.
    expect(out.payload.columns.v).toEqual([50, 21])
    expect(out.payload.plotRows.every((r) => !r.excluded)).toBe(true)
    expect(out.warnings.join(" ")).not.toContain("point excluded")
    expect(out.warnings.join(" ")).toContain("NOT applied")
  })

  it("counts the ones that applied separately from the ones that did not", () => {
    const out = resolvePayload(
      spec({ test: "descriptives", responseColumns: ["value"] }, { exclusions: [excl("r1"), excl("gone")] }),
      twoGroups
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.warnings.join(" ")).toContain("1 point excluded")
    expect(out.warnings.join(" ")).toContain("1 exclusion was NOT applied")
  })
})

describe("the declared missing-value strategy is the one that runs", () => {
  // Provenance and the exported results sheet both print this setting. Two
  // strategies returning identical numbers made that print a falsehood.
  const holed = table([{ v: 10 }, { v: null }, { v: 20 }])
  const withStrategy = (missingValues: AnalysisSpec["analysis"]["missingValues"]) =>
    resolvePayload(spec({ test: "descriptives", responseColumns: ["v"], missingValues }), holed)

  it("drops the row under listwise and says so", () => {
    const out = withStrategy("listwise")
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "columns") return
    expect(out.payload.columns.v).toEqual([10, 20])
    expect(out.warnings.join(" ")).toContain("listwise deletion")
  })

  it("fills the hole under mean-impute instead of dropping it", () => {
    const out = withStrategy("mean-impute")
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "columns") return
    expect(out.payload.columns.v).toEqual([10, 15, 20])
    expect(out.warnings.join(" ")).toContain("filled with the column mean")
  })

  it("fills with the median under median-impute", () => {
    const out = resolvePayload(
      spec({ test: "descriptives", responseColumns: ["v"], missingValues: "median-impute" }),
      table([{ v: 1 }, { v: 2 }, { v: 9 }, { v: null }])
    )
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "columns") return
    // Median of 1, 2, 9 is 2 — the mean would be 4 and would drag the centre
    // toward the outlier, which is the reason to pick this strategy at all.
    expect(out.payload.columns.v).toEqual([1, 2, 9, 2])
  })

  it("drops a whole row under listwise where pairwise keeps the value that was present", () => {
    const t = table([{ x: 1, y: 5 }, { x: 2, y: null }])
    const cols = (s: AnalysisSpec["analysis"]["missingValues"]) => {
      const out = resolvePayload(spec({ test: "descriptives", responseColumns: ["x", "y"], missingValues: s }), t)
      if (!out.ok || out.payload.shape !== "columns") throw new Error("expected columns")
      return out.payload.columns
    }
    // Listwise takes x=2 down with the missing y; pairwise keeps it.
    expect(cols("listwise")).toEqual({ x: [1], y: [5] })
    expect(cols("pairwise")).toEqual({ x: [1, 2], y: [5, null] })
  })
})

describe("a curve fit needs distinct concentrations, not just points", () => {
  const fourPl = {
    model: "4pl" as const,
    weighting: "none" as const,
    sharedParameters: [],
    constraints: {},
    confidenceBands: true,
    interpolate: false,
  }

  it("blocks sixteen points sitting at two concentrations", () => {
    // Replicates buy precision, not identifiability. This passed the point count
    // and then died inside the optimiser as `OverflowError: Result not
    // representable`, which tells a bench scientist nothing.
    const rows: Record<string, number>[] = []
    for (let i = 0; i < 8; i++) rows.push({ c: 1, s: 0.1 + i / 100 }, { c: 100, s: 0.9 + i / 100 })
    const out = resolvePayload(
      spec({ test: "nonlinear-regression", responseColumns: ["c", "s"], nonlinear: fourPl }),
      table(rows)
    )
    expect(out.ok).toBe(false)
    if (out.ok || !("blocked" in out)) throw new Error("expected blocked")
    expect(out.blocked[0].code).toBe("too-few-concentrations")
    expect(out.blocked[0].message).toContain("only 2")
    expect(out.blocked[0].fix).toContain("replicates")
  })

  it("accepts a real dose–response with four doses in duplicate", () => {
    const rows: Record<string, number>[] = []
    for (const c of [1, 10, 100, 1000]) rows.push({ c, s: Math.log10(c) }, { c, s: Math.log10(c) + 0.1 })
    const out = resolvePayload(
      spec({ test: "nonlinear-regression", responseColumns: ["c", "s"], nonlinear: fourPl }),
      table(rows)
    )
    expect(out.ok).toBe(true)
    if (!out.ok || out.payload.shape !== "curve") return
    expect(new Set(out.payload.x).size).toBe(4)
  })
})
