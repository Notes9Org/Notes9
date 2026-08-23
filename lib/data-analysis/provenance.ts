import type { AnalysisSpec, ExclusionReasonKind } from "@/lib/data-analysis/spec/analysis-spec"
import type { EffectSize, EngineResult } from "@/lib/data-analysis/engine/contract"
import type { AppliedMutation } from "@/lib/data-analysis/spec/mutations"

/**
 * Provenance (§6.7) and the auto-drafted figure legend (§2 Output).
 *
 * Both are pure functions of (spec, engine result). That is not an
 * implementation convenience, it is Law 2 made operational. The legend states
 * n, the test, the correction, the effect size and p; every one of those values
 * is READ from the engine result and inserted by template. Nothing here
 * generates a number, and nothing here may be replaced by a model writing prose,
 * because the moment a language model composes the sentence, the numbers in it
 * stop being guaranteed.
 *
 * The assistant is welcome to rephrase a legend for a journal's house style
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
  history: {
    description: string
    origin: "user" | "ai"
    at: string
    /**
     * The edit was made and later taken back. It stays on the card: a tidied
     * history is not a record, and "we tried it and reversed it" is exactly the
     * kind of thing a reviewer asks about eighteen months later.
     */
    reverted: boolean
  }[]
}

/**
 * One entry of the append-only edit audit log.
 *
 * Lives here rather than in `workspace/edit-history.ts` because it is a
 * provenance concept that the workspace happens to produce, and because the
 * persisted copy on a revision has to be readable without importing the
 * workspace's undo machinery.
 */
export interface EditAuditRecord {
  applied: AppliedMutation[]
  reverted: boolean
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
    /**
     * Legacy shape: the edits, with no record of which were reverted. Prefer
     * `auditLog`, which is the append-only log and knows.
     */
    history?: AppliedMutation[]
    /** The append-only edit audit log. Takes precedence over `history`. */
    auditLog?: EditAuditRecord[]
    revisionNo?: number
    isFrozen?: boolean
    sourceDetached?: boolean
    /**
     * Who authored the revision and when it was cut. Read from the revision
     * row rather than React state, which is why the card now survives a reload:
     * the actor and the timestamp used to exist only in memory (L8).
     */
    author?: { id: string | null; label?: string | null } | null
    savedAt?: string | null
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
      value: "Detached from source, opened from the stored snapshot",
      emphasis: true,
    })
  }
  if (options.revisionNo !== undefined) {
    source.push({
      label: "Revision",
      value: `v${options.revisionNo}${options.isFrozen ? " (frozen)" : ""}`,
    })
  }
  /**
   * Who and when, from the stored revision (L8).
   *
   * These two lines are the whole reason the card used to evaporate on reload:
   * the actor and the timestamp lived in React state and nowhere else, so a
   * refresh left a provenance card that could describe the recipe but not who
   * had run it. Read from the revision row, they survive a reload and a reopen.
   *
   * "Unknown" is shown rather than the row omitted. A deleted profile nulls
   * author_id (117), and silently dropping the line would read as "nobody
   * changed this", which is a stronger and falser claim than "we no longer
   * know who".
   */
  if (options.savedAt) {
    source.push({ label: "Saved", value: new Date(options.savedAt).toLocaleString() })
  }
  if (options.author !== undefined && options.author !== null) {
    source.push({
      label: "Saved by",
      value: options.author.label || options.author.id || "Unknown (account removed)",
      emphasis: !options.author.label && !options.author.id,
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
    /**
     * `auditLog` wins when it is given, because it is the append-only record
     * and it knows which edits were reverted. `history` is the older shape — a
     * bare mutation list with no reverted flag — and is kept because callers
     * still pass it; those entries are reported as standing, which is the only
     * thing that shape can honestly say.
     */
    history: (options.auditLog
      ? options.auditLog.flatMap((entry) =>
          entry.applied.map((h) => ({ mutation: h, reverted: entry.reverted }))
        )
      : (options.history ?? []).map((h) => ({ mutation: h, reverted: false }))
    ).map(({ mutation, reverted }) => ({
      description: mutation.description,
      origin: mutation.origin,
      at: mutation.at,
      reverted,
    })),
  }
}

/* ── Figure legend (§2 Output, §6.8) ───────────────────────────────────────*/

/* ── Journal house styles ──────────────────────────────────────────────────*/

/**
 * The house styles the legend can be drafted in.
 *
 * "In the target journal's style" is a formatting question, not a content one:
 * every style below states the same numbers, read from the same engine fields,
 * and differs only in how they are spelled. That is what keeps Law 2 intact
 * across the whole dimension — a style cannot introduce a value, only re-render
 * one, because a style is a table of punctuation rules and nothing else.
 *
 * `default` is the wording this function has always produced and stays the
 * fallback, so a caller that does not ask for a style gets what it got before.
 */
export type JournalStyle = "default" | "apa" | "nature" | "cell"

interface StyleRules {
  /** Shown in a style picker. */
  label: string
  /** Where the conventions below come from, so they can be re-checked. */
  source: string
  /** The letter on the p-value. Nature capitalises it; APA and Cell do not. */
  pLetter: "p" | "P"
  /**
   * APA drops the zero before the decimal point on any statistic that cannot
   * exceed 1 (Publication Manual 7th ed., section 6.44). Everyone else keeps it.
   */
  leadingZero: boolean
  /** Decimal places on p, and the floor below which "<" is used instead. */
  pDecimals: number
  /** Decimal places on the test statistic and on effect sizes. */
  statDecimals: number
  /**
   * Whether to write the statistic under its symbol -- t(18) = 2.41 -- rather
   * than spelling the test name where the symbol goes. The symbol comes from
   * the spec's closed test enum, never from parsing the engine's test string.
   */
  useSymbol: boolean
  /** Effect size in the same clause as the test, or in a sentence of its own. */
  effectPlacement: "inline" | "sentence"
  /** APA brackets a confidence interval: 95% CI [0.10, 2.06]. */
  ciFormat: "bracket" | "prose"
  /**
   * Nature Portfolio requires the legend to say whether the test was one- or
   * two-sided. The value is read from `spec.analysis.tails`, like every other
   * number here.
   */
  statesTails: boolean
}

export const JOURNAL_STYLES: Record<JournalStyle, StyleRules> = {
  default: {
    label: "Notes9 default",
    source: "This app's own wording; the fallback when no journal is chosen.",
    pLetter: "p",
    leadingZero: true,
    pDecimals: 4,
    statDecimals: 3,
    useSymbol: false,
    effectPlacement: "sentence",
    ciFormat: "prose",
    statesTails: false,
  },
  apa: {
    label: "APA 7th edition",
    source:
      "APA Publication Manual, 7th ed., section 6.44 (no leading zero on a statistic that cannot exceed 1) and Table 6.5.",
    pLetter: "p",
    leadingZero: false,
    pDecimals: 3,
    statDecimals: 2,
    useSymbol: true,
    effectPlacement: "inline",
    ciFormat: "bracket",
    statesTails: false,
  },
  nature: {
    label: "Nature Portfolio / Springer Nature",
    source:
      "Nature Portfolio statistics-reporting guidance: italic capital P, exact values, and the sidedness of the test stated.",
    pLetter: "P",
    leadingZero: true,
    pDecimals: 3,
    statDecimals: 2,
    useSymbol: true,
    effectPlacement: "sentence",
    ciFormat: "prose",
    statesTails: true,
  },
  cell: {
    label: "Cell Press",
    source: "Cell Press figure guidelines (cell.com/figure-guidelines): lowercase p, leading zero retained.",
    pLetter: "p",
    leadingZero: true,
    pDecimals: 3,
    statDecimals: 2,
    useSymbol: true,
    effectPlacement: "sentence",
    ciFormat: "prose",
    statesTails: false,
  },
}

/**
 * The statistic's symbol, keyed on the spec's closed test enum.
 *
 * Keyed on the ENUM and not on `result.test.test`, which is a free-text name
 * the engine composes. Matching against that string would be a heuristic, and a
 * heuristic that guesses wrong prints the wrong symbol for the test that was
 * actually run -- a factual error about the analysis, in a legend whose whole
 * point is that it cannot contain one.
 *
 * null means "no single symbol": either the test has no statistic (Fisher's
 * exact reports only p), or it has one per term (regression, mixed models), or
 * the family covers several statistics (normality). Those fall back to spelling
 * the test name, which is what every style did before.
 */
const STATISTIC_SYMBOL: Record<AnalysisSpec["analysis"]["test"], string | null> = {
  descriptives: null,
  normality: null,
  "t-one-sample": "t",
  "t-unpaired": "t",
  "t-welch": "t",
  "t-paired": "t",
  "mann-whitney": "U",
  "wilcoxon-signed-rank": "W",
  "kruskal-wallis": "H",
  friedman: "χ²",
  "anova-one-way": "F",
  "anova-two-way": "F",
  "anova-rm": "F",
  "mixed-effects": null,
  "chi-square": "χ²",
  "fisher-exact": null,
  "correlation-pearson": "r",
  "correlation-spearman": "ρ",
  "linear-regression": null,
  "nonlinear-regression": null,
  "kaplan-meier": null,
  none: null,
}

/**
 * Effect sizes that are bounded by 1, and so lose their leading zero under APA.
 *
 * Cohen's d, Hedges' g and the ratio measures are NOT in here: they can exceed
 * 1, so APA keeps the zero on them. Getting this set wrong is the difference
 * between APA style and something that merely looks like it.
 */
const BOUNDED_BY_ONE = new Set<EffectSize["name"]>([
  "eta-squared",
  "partial-eta-squared",
  "omega-squared",
  "epsilon-squared",
  "r-squared",
  "pearson-r",
  "spearman-rho",
  "rank-biserial",
  "kendalls-w",
  "cramers-v",
  "phi",
])

/** "0.027" -> ".027" when the style drops the leading zero. */
function dropZero(text: string, rules: StyleRules): string {
  return rules.leadingZero ? text : text.replace(/^(-?)0\./, "$1.")
}

function formatP(p: number | null, rules: StyleRules): string {
  if (p === null || !Number.isFinite(p)) return `${rules.pLetter} = n/a`
  const floor = Number(`1e-${rules.pDecimals}`)
  const value = p < floor ? floor : p
  const rendered = dropZero(value.toFixed(rules.pDecimals), rules)
  return `${rules.pLetter} ${p < floor ? "<" : "="} ${rendered}`
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
 * because §8.1 requires exported legends to disclose them, a figure that hides
 * its exclusions is the exact failure mode the governance exists to prevent.
 */
export function draftFigureLegend(
  spec: AnalysisSpec,
  result: EngineResult | null,
  options: { figureNumber?: string; journalStyle?: JournalStyle } = {}
): string {
  const rules = JOURNAL_STYLES[options.journalStyle ?? "default"]
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

    // The symbol form -- "Welch's t-test: t(18) = 2.41" -- names the test AND
    // gives the statistic the letter a journal expects. Where the spec's test
    // has no single symbol the test name takes the symbol's place, which is
    // what every style did before there were styles.
    // The symbol is dropped when there is no statistic to hang it on: a test
    // that reports only p (Fisher's exact, or any test whose statistic the
    // engine left null) would otherwise read "chi-square test: χ², p = 0.03".
    const symbol =
      rules.useSymbol && t.statistic !== null ? STATISTIC_SYMBOL[spec.analysis.test] : null
    const sidedness = rules.statesTails
      ? ` (${spec.analysis.tails === "two" ? "two-sided" : "one-sided"})`
      : ""

    let testClause = symbol ? `${t.test}${sidedness}: ${symbol}` : `${t.test}${sidedness}`
    if (t.statistic !== null) {
      const value = t.statistic.toFixed(rules.statDecimals)
      // A symbol binds tight to its parenthesised df -- "t(18)" -- where a
      // spelled-out test name needs the space: "Welch's t-test (18)".
      testClause += t.df !== null ? `${symbol ? "" : " "}(${t.df}) = ${value}` : ` = ${value}`
    }

    // Every effect size is stated, not just the first. A factorial design has one
    // per term, and naming only one of them would let the legend imply the whole
    // model was tested by a single number.
    const ciPct = `${+((1 - spec.analysis.alpha) * 100).toFixed(4)}% CI`
    const effects = t.effectSizes.filter((e) => Number.isFinite(e.value))
    const rendered = effects.map((effect) => {
      const label = EFFECT_LABEL[effect.name] ?? effect.name
      const named = effect.term ? `${label} (${effect.term})` : label
      // Only an effect size that cannot exceed 1 loses its leading zero under
      // APA; d and the ratio measures keep theirs.
      const bounded = BOUNDED_BY_ONE.has(effect.name)
      const scale = (v: number) => {
        const text = v.toFixed(2)
        return bounded ? dropZero(text, rules) : text
      }
      const ci =
        effect.ciLow !== null && effect.ciHigh !== null
          ? rules.ciFormat === "bracket"
            ? `, ${ciPct} [${scale(effect.ciLow)}, ${scale(effect.ciHigh)}]`
            : ` (${ciPct} ${scale(effect.ciLow)} to ${scale(effect.ciHigh)})`
          : ""
      const value = effect.value.toFixed(rules.statDecimals)
      return `${named} = ${bounded ? dropZero(value, rules) : value}${ci}`
    })

    if (rules.effectPlacement === "inline" && rendered.length > 0) {
      parts.push(`${testClause}, ${formatP(t.pValue, rules)}, ${rendered.join(", ")}.`)
    } else {
      parts.push(`${testClause}, ${formatP(t.pValue, rules)}.`)
      if (rendered.length > 0) parts.push(`${rendered.join("; ")}.`)
    }

    /**
     * The correction is stated whenever one was APPLIED, not only when a
     * pairwise family came back.
     *
     * The old condition also required `t.pairwise.length > 0`, so a correction
     * applied outside a pairwise family -- across the terms of a factorial
     * model, or to a family the engine reports somewhere other than `pairwise`
     * -- vanished from the legend entirely. A legend that omits the correction
     * overstates the result, which is the one direction it must never fail in.
     * The engine's own `correctionMethod` still wins when it is there; the
     * spec's `postHoc` is the fallback, and both are read, never composed.
     */
    if (spec.analysis.postHoc !== "none") {
      const method = t.pairwise[0]?.correctionMethod ?? spec.analysis.postHoc
      parts.push(
        t.pairwise.length > 0
          ? `Pairwise comparisons corrected by ${method}; adjusted ${rules.pLetter}-values shown.`
          : `${rules.pLetter}-values corrected for multiple comparisons by ${method}.`
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
    // R² cannot exceed 1, so it takes the same leading-zero rule as a bounded
    // effect size. The four decimals stay: a fit is reported more precisely
    // than a test statistic, in every style.
    parts.push(
      `Curve fitted by ${f.model} nonlinear regression; ${ecText}, ` +
        `R² = ${dropZero(f.rSquared.toFixed(4), rules)}.`
    )
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
