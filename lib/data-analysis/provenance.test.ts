import { describe, it, expect } from "vitest"
import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import { ENGINE_VERSION, type EngineResult } from "@/lib/data-analysis/engine/contract"
import {
  buildProvenanceCard,
  draftFigureLegend,
  draftMethodsSentence,
  type JournalStyle,
} from "./provenance"

function spec(overrides: Record<string, unknown> = {}): AnalysisSpec {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: null,
      fileName: "viability_48h.xlsx",
      sheet: "Plate 1",
      versionHash: "sha256:abcd1234",
      rowCount: 24,
      columnCount: 3,
    },
    design: { source: "project-record" },
    analysis: { test: "anova-one-way", postHoc: "tukey", alpha: 0.05 },
    figure: { kind: "bar-scatter-error", x: {}, y: {}, errorBars: "sem", title: "Viability at 48 h" },
    export: {},
    ...overrides,
  })
  if (!parsed.ok) throw new Error("fixture invalid")
  return parsed.spec
}

const anovaResult: EngineResult = {
  engineVersion: ENGINE_VERSION,
  dataVersionHash: "sha256:abcd1234",
  specHash: "0123456789abcdef0123",
  computedAt: "2026-07-30T10:00:00Z",
  durationMs: 120,
  descriptives: [],
  test: {
    test: "One-way ANOVA",
    statistic: 224.667,
    df: "2, 12",
    pValue: 0.000000123,
    effectSizes: [{ name: "eta-squared", value: 0.974, ciLow: null, ciHigh: null }],
    assumptions: [
      {
        name: "Normality (Shapiro-Wilk)",
        statistic: 0.95,
        pValue: 0.1,
        passed: true,
        verdict: "Residuals are consistent with a normal distribution.",
        alternative: null,
      },
      {
        name: "Equal variance (Levene)",
        statistic: 4.2,
        pValue: 0.02,
        passed: false,
        verdict: "Group variances differ appreciably.",
        alternative: "Welch's correction",
      },
    ],
    pairwise: [
      {
        groupA: "Control",
        groupB: "Treated",
        meanDifference: -2.1,
        ciLow: -2.4,
        ciHigh: -1.8,
        pValue: 1e-10,
        pAdjusted: 2.2e-10,
        correctionMethod: "tukey",
        significant: true,
      },
    ],
    terms: [],
    groupSizes: { Control: 8, Treated: 8, High: 8 },
    reportSentence: "",
  },
  curveFit: null,
  survival: null,
  testRan: null,
  error: null,
  exclusionImpact: null,
  plotData: [],
  warnings: [],
}

describe("figure legend (§2 Output) contains every required element", () => {
  it("states n, test, correction, effect size and p", () => {
    const legend = draftFigureLegend(spec(), anovaResult, { figureNumber: "Figure 2B" })
    expect(legend).toContain("Figure 2B")
    expect(legend).toContain("Viability at 48 h")
    expect(legend).toContain("n = 8 (Control)")
    expect(legend).toContain("One-way ANOVA")
    expect(legend).toContain("p < 0.0001")
    expect(legend).toContain("η² = 0.974")
    expect(legend).toContain("tukey")
  })

  it("always states what the error bars represent", () => {
    expect(draftFigureLegend(spec(), anovaResult)).toContain("mean ± SEM")
    const sd = spec({ figure: { kind: "bar-scatter-error", x: {}, y: {}, errorBars: "sd" } })
    expect(draftFigureLegend(sd, anovaResult)).toContain("mean ± SD")
  })

  it("discloses exclusions, as §8.1 requires of exported legends", () => {
    const withExclusions = spec({
      exclusions: [
        {
          rowId: "A7",
          reasonKind: "technical-failure",
          reasonText: "plate edge effect",
          method: null,
          excludedBy: "user-1",
          excludedAt: "2026-07-30T09:00:00Z",
        },
        {
          rowId: "B3",
          reasonKind: "contamination",
          reasonText: null,
          method: null,
          excludedBy: "user-1",
          excludedAt: "2026-07-30T09:01:00Z",
        },
      ],
    })
    const legend = draftFigureLegend(withExclusions, anovaResult)
    expect(legend).toContain("2 data points excluded")
    expect(legend).toContain("technical failure")
    expect(legend).toContain("contamination")
  })

  it("reports an EC50 with its asymmetric CI for a curve fit", () => {
    const curveResult: EngineResult = {
      ...anovaResult,
      test: null,
      curveFit: {
        model: "4PL",
        parameters: {
          ec50: { value: 116.24, stderr: null, ciLow: 113.69, ciHigh: 118.84 },
        },
        ec50: 116.24,
        rSquared: 0.99998,
        adjustedRSquared: 0.99997,
        aicc: -80.2,
        syx: 0.006,
        curve: { x: [], y: [] },
        confidenceBand: null,
        interpolated: null,
        converged: true,
        iterations: 12,
      },
    }
    const legend = draftFigureLegend(
      spec({ analysis: { test: "nonlinear-regression", nonlinear: { model: "4pl", weighting: "1/Y^2" } } }),
      curveResult
    )
    expect(legend).toContain("4PL nonlinear regression")
    expect(legend).toContain("EC50 = 116.2")
    expect(legend).toContain("95% CI 113.7 to 118.8")
    expect(legend).toContain("R² = 1.0000")
    expect(legend).toContain("weighted by 1/Y^2")
  })
})

describe("methods sentence (§6.8)", () => {
  it("names the test, the correction and the engine that produced it", () => {
    const sentence = draftMethodsSentence(spec(), anovaResult)
    expect(sentence).toContain("one-way anova")
    expect(sentence).toContain("tukey correction")
    expect(sentence).toContain("α = 0.05")
    // Reproducibility depends on naming the engine.
    expect(sentence).toContain(ENGINE_VERSION)
  })

  it("returns nothing rather than inventing prose when there is no result", () => {
    expect(draftMethodsSentence(spec(), null)).toBe("")
  })
})

describe("provenance card (§6.7)", () => {
  it("carries source, version hash, row counts and engine stamp", () => {
    const card = buildProvenanceCard(spec(), anovaResult, { revisionNo: 3, isFrozen: true })
    const flat = [...card.source, ...card.data, ...card.analysis, ...card.engine]
    const find = (label: string) => flat.find((e) => e.label === label)?.value

    expect(find("Source file")).toBe("viability_48h.xlsx")
    expect(find("Data version")).toBe("sha256:abcd1234")
    expect(find("Revision")).toBe("v3 (frozen)")
    expect(find("Engine")).toBe(ENGINE_VERSION)
    expect(find("Error bars")).toBe("SEM")
  })

  it("emphasises a failed assumption rather than listing it flatly", () => {
    const card = buildProvenanceCard(spec(), anovaResult)
    const levene = card.analysis.find((e) => e.label.startsWith("Equal variance"))
    expect(levene?.emphasis).toBe(true)
    expect(levene?.value).toContain("Welch's correction")
  })

  it("records every exclusion with its reason and author", () => {
    const withExclusion = spec({
      exclusions: [
        {
          rowId: "A7",
          reasonKind: "statistical-outlier",
          reasonText: null,
          method: { name: "ROUT", params: { Q: 0.01 } },
          excludedBy: "user-1",
          excludedAt: "2026-07-30T09:00:00Z",
        },
      ],
    })
    const card = buildProvenanceCard(withExclusion, anovaResult)
    expect(card.exclusions.count).toBe(1)
    // A statistical exclusion must name its method and parameters.
    expect(card.exclusions.rows[0].reason).toContain("ROUT")
    expect(card.exclusions.rows[0].reason).toContain("Q=0.01")
    expect(card.exclusions.rows[0].by).toBe("user-1")
    // Row counts reflect the exclusion and flag it.
    const rowsUsed = card.data.find((e) => e.label === "Rows used")
    expect(rowsUsed?.value).toBe("23 of 24")
    expect(rowsUsed?.emphasis).toBe(true)
  })

  it("states detachment when the source file is gone", () => {
    const card = buildProvenanceCard(spec(), anovaResult, { sourceDetached: true })
    const status = card.source.find((e) => e.label === "Status")
    expect(status?.value).toContain("Detached from source")
    expect(status?.emphasis).toBe(true)
  })

  it("lists transforms in pipeline order", () => {
    const withTransforms = spec({
      transforms: [
        { kind: "baselineSubtract", column: "OD450", blankGroup: "Blank", blankValue: null },
        { kind: "log10", column: "OD450" },
      ],
    })
    const card = buildProvenanceCard(withTransforms, anovaResult)
    const transforms = card.data.find((e) => e.label === "Transforms")?.value ?? ""
    // Order matters: these operations do not commute.
    expect(transforms.indexOf("minus")).toBeLessThan(transforms.indexOf("log₁₀"))
  })
})

/* ── Journal house styles ──────────────────────────────────────────────────*/

describe("draftFigureLegend, journal styles", () => {
  const legend = (style: JournalStyle) =>
    draftFigureLegend(spec(), anovaResult, { figureNumber: "Fig. 1", journalStyle: style })

  it("leaves the default wording exactly as it was", () => {
    // The style dimension is additive: a caller that does not ask for one gets
    // the string this function has always produced.
    expect(draftFigureLegend(spec(), anovaResult, { figureNumber: "Fig. 1" })).toBe(
      legend("default")
    )
    expect(legend("default")).toContain("One-way ANOVA (2, 12) = 224.667, p < 0.0001.")
    expect(legend("default")).toContain("η² = 0.974.")
  })

  it("renders APA: no leading zero on p, symbol form, effect inline", () => {
    const text = legend("apa")
    expect(text).toContain("One-way ANOVA: F(2, 12) = 224.67")
    expect(text).toContain("p < .001")
    expect(text).not.toContain("p < 0.001")
    // η² is bounded by 1, so APA drops its leading zero too, and the effect
    // rides in the same clause as the test.
    expect(text).toContain("p < .001, η² = .97.")
  })

  it("renders Nature: capital P, leading zero, sidedness stated", () => {
    const text = legend("nature")
    expect(text).toContain("One-way ANOVA (two-sided): F(2, 12) = 224.67, P < 0.001.")
    expect(text).toContain("η² = 0.97.")
    expect(text).not.toContain("p <")
  })

  it("renders Cell Press: lowercase p, leading zero, no sidedness", () => {
    const text = legend("cell")
    expect(text).toContain("One-way ANOVA: F(2, 12) = 224.67, p < 0.001.")
    expect(text).not.toContain("two-sided")
    expect(text).not.toContain("P <")
  })

  it("brackets the confidence interval only under APA", () => {
    const withCi = {
      ...anovaResult,
      test: {
        ...anovaResult.test!,
        effectSizes: [{ name: "cohens-d" as const, value: 1.08, ciLow: 0.1, ciHigh: 2.06 }],
      },
    }
    const apa = draftFigureLegend(spec(), withCi, { journalStyle: "apa" })
    const cell = draftFigureLegend(spec(), withCi, { journalStyle: "cell" })
    expect(apa).toContain("Cohen's d = 1.08, 95% CI [0.10, 2.06]")
    expect(cell).toContain("Cohen's d = 1.08 (95% CI 0.10 to 2.06)")
    // d can exceed 1, so it keeps its leading zero even under APA.
    expect(apa).toContain("[0.10, 2.06]")
  })

  it("drops the symbol when the engine reported no statistic to hang it on", () => {
    const pOnly: EngineResult = {
      ...anovaResult,
      test: { ...anovaResult.test!, statistic: null, df: null },
    }
    const text = draftFigureLegend(
      spec({ analysis: { test: "chi-square", postHoc: "none", alpha: 0.05 } }),
      pOnly,
      { journalStyle: "apa" }
    )
    // Not "chi-square test: χ², p = ...", which reads as a missing number.
    expect(text).not.toContain("χ²,")
    expect(text).toContain("One-way ANOVA, p < .001,")
  })

  it("spaces the symbol from its value when there is no df", () => {
    const noDf: EngineResult = {
      ...anovaResult,
      test: { ...anovaResult.test!, test: "Mann-Whitney U test", statistic: 12, df: null },
    }
    const text = draftFigureLegend(
      spec({ analysis: { test: "mann-whitney", postHoc: "none", alpha: 0.05 } }),
      noDf,
      { journalStyle: "cell" }
    )
    expect(text).toContain("Mann-Whitney U test: U = 12.00")
  })

  it("spells the test name where the spec's test has no single symbol", () => {
    const fisher = draftFigureLegend(
      spec({ analysis: { test: "fisher-exact", postHoc: "none", alpha: 0.05 } }),
      anovaResult,
      { journalStyle: "apa" }
    )
    // No made-up symbol: the test name takes the symbol's place.
    expect(fisher).toContain("One-way ANOVA (2, 12) = 224.67")
  })

  /**
   * Law 2, asserted rather than asserted-about.
   *
   * Every numeral that reaches the page must be traceable to a field of the
   * engine result or the spec. If a style could introduce one -- a rounded
   * constant, a "typical" n, anything -- it would show up here as a token with
   * no source.
   */
  it("emits no number that does not come from the engine result or the spec", () => {
    const s = spec()
    const t = anovaResult.test!
    const allowed = new Set<string>()
    const add = (v: number) => {
      for (const dp of [0, 2, 3, 4]) {
        allowed.add(v.toFixed(dp))
        allowed.add(v.toFixed(dp).replace(/^0\./, "."))
      }
      allowed.add(String(v))
    }
    // Engine numbers.
    for (const n of Object.values(t.groupSizes)) add(n)
    add(t.statistic!)
    for (const part of String(t.df).split(", ")) add(Number(part))
    add(t.pValue!)
    for (const e of t.effectSizes) add(e.value)
    // Spec numbers, and the p floors the styles round to.
    add((1 - s.analysis.alpha) * 100)
    add(s.exclusions.length)
    for (const floor of [0.0001, 0.001]) add(floor)
    allowed.add("1") // the figure number
    // The user's own title is quoted verbatim, so any numeral in it is theirs.
    for (const token of (s.figure.title ?? "").match(/\d+(?:\.\d+)?/g) ?? []) allowed.add(token)

    for (const style of ["default", "apa", "nature", "cell"] as JournalStyle[]) {
      const text = draftFigureLegend(s, anovaResult, {
        figureNumber: "Fig. 1",
        journalStyle: style,
      })
      for (const token of text.match(/\d+(?:\.\d+)?|\.\d+/g) ?? []) {
        expect(allowed.has(token), `${style}: "${token}" has no source in spec or result`).toBe(
          true
        )
      }
    }
  })

  it("moves every number when the engine's numbers move", () => {
    const moved: EngineResult = {
      ...anovaResult,
      test: {
        ...anovaResult.test!,
        statistic: 3.111,
        df: "1, 9",
        pValue: 0.0431,
        effectSizes: [{ name: "eta-squared" as const, value: 0.512, ciLow: null, ciHigh: null }],
        groupSizes: { Control: 5, Treated: 4 },
      },
    }
    for (const style of ["default", "apa", "nature", "cell"] as JournalStyle[]) {
      const text = draftFigureLegend(spec(), moved, { journalStyle: style })
      expect(text, style).toContain("1, 9")
      expect(text, style).toContain("3.11")
      expect(text, style).toContain("n = 5 (Control), 4 (Treated).")
      expect(text, style).not.toContain("224")
    }
  })
})

describe("draftFigureLegend, correction disclosure", () => {
  const noPairwise: EngineResult = {
    ...anovaResult,
    test: { ...anovaResult.test!, pairwise: [] },
  }

  /**
   * The gap: the correction used to be announced only when the engine also
   * returned a pairwise family, so a correction applied anywhere else vanished
   * from the legend and the result read as uncorrected.
   */
  it("states the correction even when no pairwise family came back", () => {
    const text = draftFigureLegend(spec(), noPairwise)
    expect(text).toContain("corrected for multiple comparisons by tukey")
  })

  it("still prefers the engine's own correction name when it has one", () => {
    expect(draftFigureLegend(spec(), anovaResult)).toContain(
      `corrected by ${anovaResult.test!.pairwise[0].correctionMethod}`
    )
  })

  it("says nothing about a correction when none was applied", () => {
    const uncorrected = spec({ analysis: { test: "anova-one-way", postHoc: "none", alpha: 0.05 } })
    expect(draftFigureLegend(uncorrected, noPairwise).toLowerCase()).not.toContain("correct")
  })

  it("capitalises the correction sentence's p to match the style", () => {
    expect(draftFigureLegend(spec(), noPairwise, { journalStyle: "nature" })).toContain(
      "P-values corrected for multiple comparisons by tukey."
    )
  })
})
