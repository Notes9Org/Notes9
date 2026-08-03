import type { AnalysisSpec, ExclusionReasonKind } from "@/lib/data-analysis/spec/analysis-spec"
import type { EngineResult } from "@/lib/data-analysis/engine/contract"
import type { AppliedMutation } from "@/lib/data-analysis/spec/mutations"

/**
 * Provenance (§6.7) and the auto-drafted figure legend (§2 Output).
 *
 * Both are pure functions of (spec, engine result). That is not an
 * implementation convenience — it is Law 2 made operational. The legend states
 * n, the test, the correction, the effect size and p; every one of those values
 * is READ from the engine result and inserted by template. Nothing here
 * generates a number, and nothing here may be replaced by a model writing prose,
 * because the moment a language model composes the sentence, the numbers in it
 * stop being guaranteed.
 *
 * The assistant is welcome to rephrase a legend for a journal's house style —
 * but it must start from this string, and the values in it must survive.
 */

/* ── Provenance card (§6.7, §10.5) ─────────────────────────────────────────*/

export interface ProvenanceEntry {
  label: string
  value: string
  /** Set when the entry is a warning the reader must not miss. */
  emphasis?: boolean
}

export interface ProvenanceCard {
  source: ProvenanceEntry[]
  data: ProvenanceEntry[]
  analysis: ProvenanceEntry[]
  engine: ProvenanceEntry[]
  exclusions: {
    count: number
    rows: { rowId: string; reason: string; by: string; at: string }[]
  }
  history: { description: string; origin: "user" | "ai"; at: string }[]
}

const REASON_LABEL: Record<ExclusionReasonKind, string> = {
  "technical-failure": "Technical failure",
  contamination: "Contamination",
  "instrument-error": "Instrument error",
  "pre-registered-criterion": "Pre-registered criterion",
  "statistical-outlier": "Statistical outlier",
  other: "Other",
}

function describeTransform(t: AnalysisSpec["transforms"][number]): string {
  switch (t.kind) {
    case "log10":
      return `log₁₀(${t.column})`
    case "ln":
      return `ln(${t.column})`
    case "percent":
      return `${t.column} as % of ${t.of}`
    case "zscore":
      return `z-score(${t.column})`
    case "foldChange":
      return `${t.column} fold-change vs ${t.baseline}`
    case "normalise":
      return `${t.column} normalised to ${t.min}–${t.max}`
    case "normaliseToControl":
      return (
        `${t.column} as ${t.as === "percent" ? "% of" : "ratio to"} ${t.controlLevel}` +
        // The scope is the claim: "% of vehicle" and "% of vehicle on the same
        // plate" are different numbers, and a reader must be able to tell which.
        (t.per.length ? ` within ${t.per.join(", ")}` : "")
      )
    case "baselineSubtract":
      return `${t.column} minus ${t.blankGroup ?? t.blankValue ?? "blank"}`
    case "collapseReplicates":
      return `replicates collapsed by ${t.by.join(", ")} (${t.statistic})`
    case "calculatedColumn":
      return `calculated column ${t.name}`
    case "pivotLonger":
      // The column names themselves are not listed: a 96-well fold would bury
      // the rest of the card under twelve labels that say nothing a reader needs.
      return `${t.columns.length} wide columns folded into ${t.namesTo}/${t.valuesTo}`
  }
}

/**
 * Everything a reader needs to judge a figure, one click from it (§10.5).
 *
 * The card is deliberately exhaustive rather than tasteful: its job is to make a
 * figure defensible eighteen months later, and the thing a reviewer asks about
 * is almost always the thing that would have been trimmed for tidiness.
 */
export function buildProvenanceCard(
  spec: AnalysisSpec,
  result: EngineResult | null,
  options: {
    history?: AppliedMutation[]
    revisionNo?: number
    isFrozen?: boolean
    sourceDetached?: boolean
  } = {}
): ProvenanceCard {
  const source: ProvenanceEntry[] = [
    { label: "Source file", value: spec.dataset.fileName },
  ]
  if (spec.dataset.sheet) source.push({ label: "Sheet", value: spec.dataset.sheet })
  source.push({ label: "Data version", value: spec.dataset.versionHash })
  source.push({
    label: "Shape",
    value: `${spec.dataset.rowCount} rows × ${spec.dataset.columnCount} columns`,
  })
  if (options.sourceDetached) {
    source.push({
      label: "Status",
      value: "Detached from source — opened from the stored snapshot",
      emphasis: true,
    })
  }
  if (options.revisionNo !== undefined) {
    source.push({
      label: "Revision",
      value: `v${options.revisionNo}${options.isFrozen ? " (frozen)" : ""}`,
    })
  }

  const included = spec.dataset.rowCount - spec.exclusions.length
  const data: ProvenanceEntry[] = [
    {
      label: "Rows used",
      value: `${included} of ${spec.dataset.rowCount}`,
      emphasis: spec.exclusions.length > 0,
    },
  ]
  if (spec.filters.length > 0) {
    data.push({
      label: "Filters",
      value: spec.filters.map((f) => `${f.column} ${f.op} ${String(f.value)}`).join("; "),
    })
  }
  data.push({
    label: "Transforms",
    value:
      spec.transforms.length === 0
        ? "None"
        : spec.transforms.map(describeTransform).join(" → "),
  })
  data.push({ label: "Missing values", value: spec.analysis.missingValues })

  const analysis: ProvenanceEntry[] = []
  if (result?.test) {
    analysis.push({ label: "Test", value: result.test.test })
    if (spec.analysis.postHoc !== "none") {
      analysis.push({ label: "Post-hoc", value: spec.analysis.postHoc })
    }
    analysis.push({ label: "Tails", value: spec.analysis.tails })
    analysis.push({ label: "Alpha", value: String(spec.analysis.alpha) })
    for (const a of result.test.assumptions) {
      analysis.push({
        label: a.name,
        value: a.passed ? a.verdict : `${a.verdict} ${a.alternative ? `Consider ${a.alternative}.` : ""}`.trim(),
        emphasis: !a.passed,
      })
    }
  }
  if (result?.curveFit) {
    analysis.push({ label: "Model", value: result.curveFit.model })
    analysis.push({ label: "R²", value: result.curveFit.rSquared.toFixed(4) })
    if (spec.analysis.nonlinear?.weighting && spec.analysis.nonlinear.weighting !== "none") {
      analysis.push({ label: "Weighting", value: spec.analysis.nonlinear.weighting })
    }
  }
  analysis.push({ label: "Error bars", value: spec.figure.errorBars.toUpperCase() })

  const engine: ProvenanceEntry[] = result
    ? [
        { label: "Engine", value: result.engineVersion },
        { label: "Computed", value: new Date(result.computedAt).toLocaleString() },
        { label: "Spec hash", value: result.specHash.slice(0, 16) },
      ]
    : [{ label: "Engine", value: "Not yet computed" }]
  if (spec.analysis.randomSeed !== null) {
    engine.push({ label: "Random seed", value: String(spec.analysis.randomSeed) })
  }

  return {
    source,
    data,
    analysis,
    engine,
    exclusions: {
      count: spec.exclusions.length,
      rows: spec.exclusions.map((e) => ({
        rowId: e.rowId,
        reason: e.method
          ? `${REASON_LABEL[e.reasonKind]} (${e.method.name} ${Object.entries(e.method.params)
              .map(([k, v]) => `${k}=${v}`)
              .join(", ")})`
          : `${REASON_LABEL[e.reasonKind]}${e.reasonText ? `: ${e.reasonText}` : ""}`,
        by: e.excludedBy,
        at: e.excludedAt,
      })),
    },
    history: (options.history ?? []).map((h) => ({
      description: h.description,
      origin: h.origin,
      at: h.at,
    })),
  }
}

/* ── Figure legend (§2 Output, §6.8) ───────────────────────────────────────*/

function formatP(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return "p = n/a"
  return p < 0.0001 ? "p < 0.0001" : `p = ${p.toFixed(4)}`
}

const ERROR_BAR_PHRASE: Record<AnalysisSpec["figure"]["errorBars"], string> = {
  sd: "mean ± SD",
  sem: "mean ± SEM",
  ci90: "mean with 90% CI",
  ci95: "mean with 95% CI",
  ci99: "mean with 99% CI",
  range: "mean with range",
  iqr: "median with IQR",
  mad: "median ± MAD",
  none: "mean",
}

export const EFFECT_LABEL: Record<string, string> = {
  "cohens-d": "Cohen's d",
  "hedges-g": "Hedges' g",
  "eta-squared": "η²",
  "partial-eta-squared": "partial η²",
  "omega-squared": "ω²",
  "cohens-f": "Cohen's f",
  "rank-biserial": "rank-biserial r",
  "epsilon-squared": "ε²",
  "kendalls-w": "Kendall's W",
  "cramers-v": "Cramér's V",
  phi: "φ",
  "odds-ratio": "OR",
  "risk-ratio": "RR",
  "hazard-ratio": "HR",
  "pearson-r": "r",
  "spearman-rho": "ρ",
  "r-squared": "R²",
}

/**
 * Draft the figure legend from engine output.
 *
 * Contains, by construction, every element §2 requires: exact n, the test used,
 * the correction applied, the effect size, and p. Exclusions are stated too,
 * because §8.1 requires exported legends to disclose them — a figure that hides
 * its exclusions is the exact failure mode the governance exists to prevent.
 */
export function draftFigureLegend(
  spec: AnalysisSpec,
  result: EngineResult | null,
  options: { figureNumber?: string } = {}
): string {
  const parts: string[] = []
  const prefix = options.figureNumber ? `${options.figureNumber}. ` : ""

  if (spec.figure.title) parts.push(`${prefix}${spec.figure.title}.`)
  else if (prefix) parts.push(prefix.trim())

  // What the marks represent, always stated (§2: the error-bar choice must
  // appear on the figure).
  if (spec.figure.errorBars !== "none") {
    parts.push(`Data are ${ERROR_BAR_PHRASE[spec.figure.errorBars]}.`)
  }

  if (result?.test) {
    const t = result.test
    const sizes = Object.entries(t.groupSizes)
    if (sizes.length > 0) {
      parts.push(`n = ${sizes.map(([g, n]) => `${n} (${g})`).join(", ")}.`)
    }

    const stat: string[] = [t.test]
    if (t.statistic !== null && t.df !== null) {
      stat.push(`(${t.df}) = ${t.statistic.toFixed(3)}`)
    } else if (t.statistic !== null) {
      stat.push(`= ${t.statistic.toFixed(3)}`)
    }
    parts.push(`${stat.join(" ")}, ${formatP(t.pValue)}.`)

    // Every effect size is stated, not just the first. A factorial design has one
    // per term, and naming only one of them would let the legend imply the whole
    // model was tested by a single number.
    const ciPct = `${+((1 - spec.analysis.alpha) * 100).toFixed(4)}% CI`
    const effects = t.effectSizes.filter((e) => Number.isFinite(e.value))
    if (effects.length > 0) {
      parts.push(
        effects
          .map((effect) => {
            const label = EFFECT_LABEL[effect.name] ?? effect.name
            const named = effect.term ? `${label} (${effect.term})` : label
            const ci =
              effect.ciLow !== null && effect.ciHigh !== null
                ? ` (${ciPct} ${effect.ciLow.toFixed(2)} to ${effect.ciHigh.toFixed(2)})`
                : ""
            return `${named} = ${effect.value.toFixed(3)}${ci}`
          })
          .join("; ") + "."
      )
    }

    if (spec.analysis.postHoc !== "none" && t.pairwise.length > 0) {
      parts.push(
        `Pairwise comparisons corrected by ${t.pairwise[0].correctionMethod}; adjusted p-values shown.`
      )
    }
  }

  if (result?.curveFit) {
    const f = result.curveFit
    const ec = f.parameters.ec50
    const ecText =
      ec && ec.ciLow !== null && ec.ciHigh !== null
        ? `EC50 = ${f.ec50?.toPrecision(4)} (95% CI ${ec.ciLow.toPrecision(4)} to ${ec.ciHigh.toPrecision(4)})`
        : `EC50 = ${f.ec50?.toPrecision(4)}`
    parts.push(`Curve fitted by ${f.model} nonlinear regression; ${ecText}, R² = ${f.rSquared.toFixed(4)}.`)
    if (spec.analysis.nonlinear?.weighting && spec.analysis.nonlinear.weighting !== "none") {
      parts.push(`Fit weighted by ${spec.analysis.nonlinear.weighting}.`)
    }
  }

  // §8.1: exported figure legends state exclusions.
  if (spec.exclusions.length > 0) {
    const reasons = new Map<string, number>()
    for (const e of spec.exclusions) {
      const key = REASON_LABEL[e.reasonKind].toLowerCase()
      reasons.set(key, (reasons.get(key) ?? 0) + 1)
    }
    const summary = [...reasons.entries()].map(([r, n]) => `${n} ${r}`).join(", ")
    parts.push(
      `${spec.exclusions.length} data point${spec.exclusions.length === 1 ? "" : "s"} excluded (${summary}).`
    )
  }

  return parts.join(" ")
}

/**
 * The methods-section sentence (§6.8). Shorter and differently framed from the
 * legend: it names what was done and with what, not what the figure shows.
 */
export function draftMethodsSentence(
  spec: AnalysisSpec,
  result: EngineResult | null
): string {
  if (!result) return ""
  const bits: string[] = []

  if (result.test) {
    bits.push(`Data were analysed by ${result.test.test.toLowerCase()}`)
    if (spec.analysis.postHoc !== "none") {
      bits.push(`with ${spec.analysis.postHoc} correction for multiple comparisons`)
    }
    bits.push(`(α = ${spec.analysis.alpha}, ${spec.analysis.tails}-tailed)`)
  } else if (result.curveFit) {
    bits.push(
      `Concentration-response data were fitted with a ${result.curveFit.model} model by nonlinear least squares`
    )
    if (spec.analysis.nonlinear?.weighting && spec.analysis.nonlinear.weighting !== "none") {
      bits.push(`with ${spec.analysis.nonlinear.weighting} weighting`)
    }
  } else {
    return ""
  }

  // The engine version belongs in methods: it is what makes the analysis
  // reproducible by someone else, which is the point of the section.
  bits.push(`using ${result.engineVersion}`)
  return `${bits.join(" ")}.`
}
