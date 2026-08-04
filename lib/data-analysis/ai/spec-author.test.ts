import { describe, it, expect } from "vitest"
import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import {
  buildContextBundle,
  containsFabricatedStatistic,
  sanitiseRationale,
  screenRequest,
  validateProposal,
} from "./spec-author"

function spec(): AnalysisSpec {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: null,
      fileName: "plate.xlsx",
      sheet: null,
      versionHash: "sha256:abcd1234",
      rowCount: 24,
      columnCount: 3,
    },
    design: { source: "project-record", paired: true },
    analysis: { test: "t-paired", groupColumn: "treatment", responseColumns: ["viability"] },
    figure: { kind: "bar-scatter-error", x: {}, y: {} },
    export: {},
  })
  if (!parsed.ok) throw new Error("fixture invalid")
  return parsed.spec
}

describe("guardrails (§8.1, §7 adversarial set)", () => {
  it("refuses to remove points until the result is significant", () => {
    const screen = screenRequest("remove the outlier so it's significant")
    expect(screen.allowed).toBe(false)
    expect(screen.reason).toBe("p-hacking")
    // A refusal that offers nothing just gets worked around.
    expect(screen.alternative).toContain("sensitivity analysis")
  })

  it("refuses significance shopping", () => {
    expect(screenRequest("can you make it significant?").allowed).toBe(false)
    expect(screenRequest("get p below 0.05").allowed).toBe(false)
    expect(screenRequest("try every test until one works").allowed).toBe(false)
  })

  it("refuses to exclude points itself, and explains whose act that is", () => {
    const screen = screenRequest("drop the outlier from well A7")
    expect(screen.allowed).toBe(false)
    expect(screen.reason).toBe("exclusion-by-assistant")
    expect(screen.response).toContain("reason")
    expect(screen.alternative).toContain("yourself")
  })

  it("allows ordinary analysis requests through", () => {
    expect(screenRequest("compare viability across the three doses").allowed).toBe(true)
    expect(screenRequest("make the y axis log scale").allowed).toBe(true)
    expect(screenRequest("fit a 4PL curve and show the confidence band").allowed).toBe(true)
    // Mentioning outliers in a legitimate, non-removal sense is fine.
    expect(screenRequest("does this data have any outliers?").allowed).toBe(true)
  })
})

describe("Law 2 — no statistic may originate from the model", () => {
  it("detects an invented p-value in the rationale", () => {
    expect(containsFabricatedStatistic("The groups differ, p = 0.03.")).toBe(true)
    expect(containsFabricatedStatistic("R² = 0.98 so the fit is good.")).toBe(true)
    expect(containsFabricatedStatistic("F(2, 12) = 45.1 indicates an effect.")).toBe(true)
    expect(containsFabricatedStatistic("EC50 of 120 nM.")).toBe(true)
  })

  it("does not flag ordinary prose", () => {
    expect(
      containsFabricatedStatistic("I switched to a paired t-test because the record shows the same subjects.")
    ).toBe(false)
    expect(containsFabricatedStatistic("There are 3 groups, so ANOVA is appropriate.")).toBe(false)
  })

  it("strips the offending sentence but keeps the reasoning", () => {
    const { text, removed } = sanitiseRationale(
      "I chose a paired t-test because the same subjects appear twice. The result is significant, p = 0.03."
    )
    expect(removed).toBe(true)
    expect(text).toContain("paired t-test")
    expect(text).not.toContain("0.03")
    expect(text).toContain("results panel")
  })

  it("leaves a clean rationale untouched", () => {
    const clean = "Switched to Welch's t-test because the equal-variance check failed."
    expect(sanitiseRationale(clean)).toEqual({ text: clean, removed: false })
  })
})

describe("patch validation (§6.6: invalid rejected and repaired, never rendered)", () => {
  it("accepts known mutation kinds", () => {
    const result = validateProposal({
      rationale: "Three groups, so ANOVA with Tukey.",
      mutations: [
        { kind: "analysis.setTest", value: "anova-one-way" },
        { kind: "analysis.setPostHoc", value: "tukey" },
      ],
    })
    expect(result.ok).toBe(true)
    expect(result.mutations).toHaveLength(2)
    expect(result.rejected).toHaveLength(0)
  })

  it("drops an unknown mutation kind but keeps the valid ones", () => {
    const result = validateProposal({
      rationale: "…",
      mutations: [
        { kind: "analysis.setTest", value: "anova-one-way" },
        { kind: "figure.explode", value: true },
      ],
    })
    expect(result.mutations).toHaveLength(1)
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].reason).toContain("Unknown mutation kind")
  })

  it("refuses an exclusion authored by the assistant", () => {
    // The capability does not exist on this path, whatever the model emits.
    const result = validateProposal({
      rationale: "Removing the outlier.",
      mutations: [{ kind: "data.excludeRow", exclusion: { rowId: "A7" } }],
    })
    expect(result.mutations).toHaveLength(0)
    expect(result.rejected[0].reason).toContain("may not author")
  })

  it("refuses to move a significance bracket", () => {
    const result = validateProposal({
      rationale: "Tidying the figure.",
      mutations: [{ kind: "figure.moveBracket", id: "b1", offsetY: 20 }],
    })
    expect(result.mutations).toHaveLength(0)
  })

  it("treats a malformed proposal as not ok rather than throwing", () => {
    const result = validateProposal({ nonsense: true })
    expect(result.ok).toBe(false)
    expect(result.rejected).toHaveLength(1)
  })

  it("accepts a clarification with no mutations", () => {
    // Asking one specific question is a valid outcome, not a failure.
    const result = validateProposal({
      rationale: "The design is ambiguous.",
      mutations: [],
      clarificationNeeded: "Were these the same wells measured twice, or different wells?",
    })
    expect(result.ok).toBe(true)
    expect(result.clarificationNeeded).toContain("same wells")
  })
})

describe("context bundle (§11 decision 10: what the model sees)", () => {
  it("sends the data profile but never raw rows", () => {
    const bundle = buildContextBundle({
      prompt: "compare the groups",
      spec: spec(),
      profile: {
        fileName: "plate.xlsx",
        rowCount: 24,
        columns: [
          { name: "viability", kind: "numeric", missing: 0, summary: { n: 24, min: 40, max: 100, mean: 78, sd: 12 } },
          { name: "treatment", kind: "categorical", levels: ["Control", "Low", "High"], missing: 0 },
        ],
      },
    })

    const serialised = JSON.stringify(bundle)
    expect(serialised).toContain("viability")
    expect(serialised).toContain("Control")
    // The privacy claim depends on this: no row-level values are present.
    expect(bundle).not.toHaveProperty("rows")
    expect(serialised).not.toContain("plotData")
  })

  it("passes the recorded design so test choice can be project-aware", () => {
    const bundle = buildContextBundle({
      prompt: "compare before and after",
      spec: spec(),
      profile: { fileName: "p.xlsx", rowCount: 10, columns: [] },
      project: {
        projectName: "HEK293T expression",
        recordedDesign: { paired: true, subjectColumn: "subject" },
      },
    })
    const current = bundle.currentSpec as { design: { paired: boolean } }
    expect(current.design.paired).toBe(true)
    expect((bundle.project as { recordedDesign: { paired: boolean } }).recordedDesign.paired).toBe(true)
  })

  it("passes failed assumption checks as verdicts, not as statistics", () => {
    const bundle = buildContextBundle({
      prompt: "is this ok?",
      spec: spec(),
      profile: { fileName: "p.xlsx", rowCount: 10, columns: [] },
      result: {
        engineVersion: "notes9-stats 1.0.0 (pyodide 0.28.3)",
        dataVersionHash: "h",
        specHash: "s",
        computedAt: "2026-07-30T10:00:00Z",
        durationMs: 10,
        descriptives: [],
        test: {
          test: "One-way ANOVA",
          statistic: 224.6,
          df: "2, 12",
          pValue: 0.000001,
          effectSizes: [],
          assumptions: [
            {
              name: "Equal variance (Levene)",
              statistic: 4.2,
              pValue: 0.02,
              passed: false,
              verdict: "Group variances differ appreciably.",
              alternative: "Welch's correction",
            },
          ],
          pairwise: [],
          terms: [],
          groupSizes: {},
          reportSentence: "",
        },
        curveFit: null,
        survival: null,
        testRan: null,
        error: null,
        exclusionImpact: null,
        plotData: [],
        warnings: [],
      },
    })

    const flags = bundle.assumptionFlags as { check: string; alternative: string }[]
    expect(flags).toHaveLength(1)
    expect(flags[0].alternative).toBe("Welch's correction")
    // The F statistic and p-value must not travel to the model.
    const serialised = JSON.stringify(bundle)
    expect(serialised).not.toContain("224.6")
    expect(serialised).not.toContain("0.000001")
  })
})
