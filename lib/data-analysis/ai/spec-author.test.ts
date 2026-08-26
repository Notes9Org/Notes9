import { describe, it, expect } from "vitest"
import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import {
  buildContextBundle,
  containsFabricatedStatistic,
  sanitiseRationale,
  screenRequest,
  validateProposal,
  trimHistory,
  SPEC_AUTHOR_HISTORY_MAX_TURNS,
  SPEC_AUTHOR_HISTORY_MAX_CHARS,
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

describe("Law 2, no statistic may originate from the model", () => {
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

  // The gate used to be a list of known statistic phrasings, so anything phrased
  // around the list reached the screen. Each probe below is a phrasing that got
  // through; they are asserted one by one so a regression names the shape it lost.
  it.each([
    ["a p value spelled with a space", "The p value of 0.03 means the effect is real."],
    ["a fold change", "Treated cells show a 3.4-fold increase over vehicle."],
    ["a mean difference", "The mean difference is 4.7 units; did you want that comparison?"],
    ["a confidence interval", "The 95% CI is 1.2 to 4.5, which arm did you mean?"],
    ["a bare significance level", "This is significant at 0.03."],
    ["r squared written out", "r squared is 0.91 here."],
    ["a difference with a unit", "The difference of 12.6 nM is what I based this on."],
    ["a sample size and an effect size", "n = 8 per group, and the effect size came out at 0.82."],
    ["a p value with an operator", "The result is significant, p = 0.03."],
    ["a half-maximal concentration", "EC50 of 120 nM."],
  ])("catches %s", (_label, prose) => {
    expect(containsFabricatedStatistic(prose)).toBe(true)
  })

  // The inverted gate defaults to removing, so these prove it did not swallow
  // everything: prose the researcher should still get to read.
  it.each([
    ["a plain count", "There are 3 groups, so ANOVA is appropriate."],
    ["a sample size on a figure label", "n = 8 wells"],
    ["a column name carrying digits", "Plotting OD600 against time."],
    ["a plate format", "Rows come from a 384-well plate."],
    ["a year", "Filtered to the 2024 batch."],
    ["no digits at all", "Switched to Welch because the equal-variance check failed."],
  ])("lets %s through", (_label, prose) => {
    expect(containsFabricatedStatistic(prose)).toBe(false)
  })

  it("holds the rationale to the same standard as the clarification", () => {
    const { text, removed } = sanitiseRationale("Switched to Welch. The p value of 0.03 supports it.")
    expect(removed).toBe(true)
    expect(text).toContain("Switched to Welch.")
    expect(text).not.toContain("0.03")
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

  it("says so when the explanation is replaced whole", () => {
    // The sentence carrying the reasoning is the sentence carrying the number,
    // so nothing survives. The replacement used to be a bare "See the results
    // panel for the computed values." — which reads as the assistant having
    // nothing to say, on the one surface whose entire job is saying why. A
    // researcher who is not told the explanation went missing cannot ask for it
    // again.
    const { text, removed } = sanitiseRationale(
      "Filtered to concentrations above 0.5 uM, where the assay is linear."
    )
    expect(removed).toBe(true)
    expect(text).not.toContain("0.5")
    expect(text).toMatch(/withheld/i)
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

  it("refuses a calculatedColumn transform the resolver would silently ignore", () => {
    // The resolver deliberately does not evaluate formulas, so this mutation would
    // apply, report as applied, and change nothing. Refusing it keeps the applied list
    // honest; a sibling transform on the same path still goes through.
    const result = validateProposal({
      rationale: "Deriving a ratio column.",
      mutations: [
        { kind: "data.addTransform", transform: { kind: "calculatedColumn", name: "ratio", formula: "a/b" } },
        { kind: "data.addTransform", transform: { kind: "log10", column: "OD450" } },
      ],
    })
    expect(result.mutations).toHaveLength(1)
    expect(result.mutations[0]).toMatchObject({ transform: { kind: "log10" } })
    expect(result.rejected[0].reason).toContain("sheet's own formulas")
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

  it("carries the mutation contract, the offerable tests, and the current filters", () => {
    const s = spec()
    const bundle = buildContextBundle({
      prompt: "compare the groups",
      spec: s,
      profile: { fileName: "plate.xlsx", rowCount: 24, columns: [] },
      offerableTests: [{ test: "t-paired", legal: true, recommended: true }],
    })

    // Non-empty prose derived from mutation-schema.ts, not hand-copied here
    // see mutation-schema.test.ts for the drift guarantee itself.
    expect(typeof bundle.contract).toBe("string")
    expect((bundle.contract as string).length).toBeGreaterThan(0)

    expect(bundle.offerableTests).toEqual([{ test: "t-paired", legal: true, recommended: true }])

    // Whole filter objects, because `data.setFilters` replaces the array wholesale.
    expect(bundle.filters).toEqual(s.filters)
  })

  it("defaults offerableTests to an empty array when the caller has none to offer", () => {
    const bundle = buildContextBundle({
      prompt: "compare the groups",
      spec: spec(),
      profile: { fileName: "plate.xlsx", rowCount: 24, columns: [] },
    })
    expect(bundle.offerableTests).toEqual([])
  })
})

/* ── History trimming (ADR-014 / the failure-mode table) ──────────────────── */

describe("trimHistory", () => {
  const turn = (content: string) => ({ role: "user" as const, content })

  it("keeps a short conversation whole", () => {
    const turns = [turn("a"), turn("b")]
    expect(trimHistory(turns)).toEqual({ turns, dropped: 0 })
  })

  it("keeps the most recent turns and reports how many it dropped", () => {
    const turns = Array.from({ length: SPEC_AUTHOR_HISTORY_MAX_TURNS + 3 }, (_, i) =>
      turn(`turn ${i}`),
    )
    const { turns: kept, dropped } = trimHistory(turns)
    expect(kept).toHaveLength(SPEC_AUTHOR_HISTORY_MAX_TURNS)
    expect(dropped).toBe(3)
    // Oldest out, newest kept — a conversation trimmed from the wrong end is
    // one that forgets what was just said.
    expect(kept[kept.length - 1].content).toBe(`turn ${turns.length - 1}`)
  })

  it("spends the character budget on the newest turns", () => {
    const big = "x".repeat(SPEC_AUTHOR_HISTORY_MAX_CHARS - 10)
    const { turns: kept, dropped } = trimHistory([turn(big), turn("the latest question")])
    expect(kept).toEqual([turn("the latest question")])
    expect(dropped).toBe(1)
  })

  it("drops a single turn that cannot fit at all rather than sending it", () => {
    const huge = "x".repeat(SPEC_AUTHOR_HISTORY_MAX_CHARS + 1)
    expect(trimHistory([turn(huge)])).toEqual({ turns: [], dropped: 1 })
  })
})

describe("L3 — the model can see the figure it is being asked to change", () => {
  /**
   * The bundle used to carry `figure: spec.figure.kind` and nothing else, so
   * "extend the y-axis top a bit" was unanswerable: the model could emit an
   * `axis.set` but had no current maximum to extend. The rolling window of
   * recent edits was the only mitigation, and it describes the last ten changes
   * rather than the state — empty on a reopened analysis, which is exactly the
   * "must work as the 15th edit" case.
   */
  const styled = (): AnalysisSpec => {
    const s = spec()
    return {
      ...s,
      figure: {
        ...s.figure,
        y: { ...s.figure.y, label: "Viability", unit: "%", scale: "log10" as const, min: 0, max: 110, tickCount: 6 },
        palette: "viridis",
        fontFamily: "serif" as const,
        legendPosition: "right" as const,
        errorBars: "ci95" as const,
        series: [
          { key: "Control", colour: "#112233", pointShape: "square" as const, pointSize: 8, opacity: 0.9, jitter: 0, lineStyle: "dash" as const, lineWidth: 3, axis: "left" as const },
        ],
      },
    }
  }

  const figureOf = (target: AnalysisSpec) =>
    (buildContextBundle({
      prompt: "extend the y axis a bit",
      spec: target,
      profile: { fileName: "p.xlsx", rowCount: 10, columns: [] },
    }).currentSpec as { figure: Record<string, unknown> }).figure

  it("carries the current axis limits, scale, units and tick count", () => {
    expect(figureOf(styled()).y).toEqual({
      label: "Viability",
      unit: "%",
      scale: "log10",
      min: 0,
      max: 110,
      tickCount: 6,
    })
  })

  it("carries the style the researcher chose", () => {
    const figure = figureOf(styled())
    expect(figure.palette).toBe("viridis")
    expect(figure.fontFamily).toBe("serif")
    expect(figure.legendPosition).toBe("right")
    expect(figure.errorBars).toBe("ci95")
    expect(figure.series).toEqual([
      { key: "Control", colour: "#112233", pointShape: "square", pointSize: 8, opacity: 0.9, lineStyle: "dash", lineWidth: 3, axis: "left" },
    ])
  })

  it("still names the figure kind, which is all it used to send", () => {
    expect(figureOf(styled()).kind).toBe(spec().figure.kind)
  })

  it("summarises annotations and brackets rather than sending their geometry", () => {
    const s = styled()
    const withMarks: AnalysisSpec = {
      ...s,
      figure: {
        ...s.figure,
        annotations: [{ kind: "text", id: "note-1", x: 1, y: 2, text: "outlier", fontSize: 12, colour: "#000000" }],
        brackets: [{ id: "AB", fromGroup: "A", toGroup: "B", offsetY: 12, derived: false, display: "stars" }],
      },
    }
    const figure = figureOf(withMarks)
    // Ids, because that is what a mutation naming one needs.
    expect(figure.annotationIds).toEqual(["note-1"])
    expect(figure.bracketIds).toEqual(["AB"])
    // Not the coordinates, which would dominate the payload.
    expect(JSON.stringify(figure)).not.toContain("offsetY")
  })

  it("adds no data to the bundle", () => {
    // Widening the figure must not weaken the §11 privacy claim above: the
    // figure holds style, and every number in it is a style value.
    const bundle = buildContextBundle({
      prompt: "tidy up",
      spec: styled(),
      profile: { fileName: "p.xlsx", rowCount: 10, columns: [] },
    })
    expect(bundle).not.toHaveProperty("rows")
    expect(JSON.stringify(bundle)).not.toContain("plotData")
  })
})
