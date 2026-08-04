import type { AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"

/**
 * L4 — the compute engine's contract.
 *
 * The engine is a pure function of (spec, data snapshot, engine version). This
 * file defines what it returns and how a result is identified, and it is where
 * the architecture's Law 2 is made structural: EVERY number the user sees is
 * typed as part of `EngineResult`, and nothing in the spec layer may hold one.
 * If a statistic ever needs to be displayed, it has to arrive here first.
 *
 * §6.3 requires three things this file provides:
 *   - engine version pinned and stamped on every result;
 *   - deterministic seeding for any stochastic method;
 *   - result caching keyed on (spec, data version, engine version).
 */

/* ── Engine version ────────────────────────────────────────────────────────
   A published figure's numbers belong to a specific engine build. §3A.3 rule 3
   makes reopening compare this against the stored stamp and offer a choice
   rather than silently recomputing, so this string must change whenever
   anything that can move a p-value moves.

   It is composed of three parts, all of which can change independently:
     - the Pyodide runtime (which pins CPython and the compiled wheels),
     - the scientific packages we install on top,
     - our own Python engine source. */

export const PYODIDE_VERSION = "0.28.3" as const

/**
 * Packages installed into the runtime. Versions for prebuilt wheels are decided
 * by the Pyodide lock file for PYODIDE_VERSION; the pure-Python ones are pinned
 * here so a micropip resolution cannot drift under us.
 */
export const ENGINE_PACKAGES = {
  prebuilt: ["numpy", "scipy", "pandas", "statsmodels", "patsy"],
  /**
   * Deliberately empty. Everything Tier 0 needs is implemented on top of the
   * prebuilt wheels above, which Pyodide serves from the same lock file as the
   * runtime itself. Reaching out to PyPI at boot would mean a network hiccup
   * could turn "run my analysis" into "analysis unavailable", and it would put
   * a resolver we do not control in the path of a number we have to reproduce.
   */
  micropip: [] as readonly string[],
} as const

/**
 * Where the runtime and its wheels are fetched from.
 *
 * Everything else about the engine is local — sandboxed, network-isolated,
 * reproducible — but all of it holds only AFTER this one third-party fetch
 * succeeds. On a network that blocks the CDN the feature simply does not exist,
 * and a CDN outage is an outage of Data Analysis. Making the origin a
 * deployment decision rather than a compiled-in constant is what turns that
 * from an unfixable property into a configuration change.
 *
 * The default is the public CDN, so a deploy that sets nothing behaves exactly
 * as before. `scripts/utilities/fetch-pyodide.ts` mirrors the distribution into
 * `public/pyodide/` for an operator who needs same-origin hosting.
 *
 * The trailing slash is normalised because callers concatenate against this
 * value rather than resolving against it, and a missing one turns every asset
 * into a 404 that reads like a corrupt mirror.
 */
export function resolvePyodideBaseUrl(configured?: string): string {
  const base =
    configured?.trim() || `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`
  return base.endsWith("/") ? base : `${base}/`
}

/** Bump when the Python engine source changes in any way that can alter a number. */
export const ENGINE_SOURCE_VERSION = "1.2.0" as const

/**
 * The single string stamped onto every result and compared on reopen. Human
 * readable on purpose: it appears verbatim in the integrity banner the document
 * specifies ("The engine is now 1.5.0…"), so it has to be legible to a
 * researcher, not just to a diff.
 */
export const ENGINE_VERSION =
  `notes9-stats ${ENGINE_SOURCE_VERSION} (pyodide ${PYODIDE_VERSION})` as const

/* ── Results ───────────────────────────────────────────────────────────────*/

/**
 * One assumption check, surfaced rather than buried (§2 Tier 1.4). `verdict` is
 * plain language because the point is that a bench scientist reads it, and
 * `alternative` names the test to use instead when the check fails.
 */
export interface AssumptionCheck {
  name: string
  statistic: number | null
  pValue: number | null
  passed: boolean
  verdict: string
  alternative: string | null
}

/**
 * An effect size, reported alongside every comparison (§2).
 *
 * The name is a closed union on purpose: it is what the UI and the methods
 * sentence render, so an effect size can never be labelled as something it is
 * not. A correlation coefficient reported as `cohens-d` would print a value
 * sitting outside its own confidence interval, which is precisely the class of
 * number Law 2 exists to keep away from the user.
 *
 * `term` names the model term the estimate belongs to, and is non-null only for
 * models with more than one (factorial ANOVA, regression, mixed effects). A
 * single partial η² is meaningless without knowing which factor it describes.
 */
export interface EffectSize {
  name:
    | "cohens-d"
    | "hedges-g"
    | "eta-squared"
    | "partial-eta-squared"
    | "omega-squared"
    | "cohens-f"
    | "rank-biserial"
    | "epsilon-squared"
    | "kendalls-w"
    | "cramers-v"
    | "phi"
    | "odds-ratio"
    | "risk-ratio"
    | "hazard-ratio"
    | "pearson-r"
    | "spearman-rho"
    | "r-squared"
  value: number
  ciLow: number | null
  ciHigh: number | null
  term?: string | null
}

/**
 * One row of a model's coefficient or ANOVA table.
 *
 * Factorial ANOVA, regression and mixed-effects models do not have "a" p-value;
 * they have one per term. Collapsing that to a single number forces a choice
 * between an arbitrary term and the smallest p — and the smallest p is the
 * p-hacking the spec author screens requests for. So the engine reports every
 * term and lets the UI show the table.
 */
export interface ModelTerm {
  term: string
  /** F for ANOVA terms, z or t for coefficients. */
  statistic: number | null
  df: number | string | null
  pValue: number | null
  /** Coefficient estimate, for regression-style models. Null for ANOVA terms. */
  estimate: number | null
  ciLow: number | null
  ciHigh: number | null
}

/** A single pairwise comparison from a post-hoc family, with adjusted p AND CI (§2). */
export interface PairwiseComparison {
  groupA: string
  groupB: string
  meanDifference: number
  ciLow: number | null
  ciHigh: number | null
  pValue: number
  pAdjusted: number
  correctionMethod: string
  significant: boolean
}

export interface DescriptiveRow {
  column: string
  group: string | null
  n: number
  mean: number
  sd: number
  sem: number
  median: number
  q1: number
  q3: number
  iqr: number
  min: number
  max: number
  cv: number | null
  geometricMean: number | null
  skewness: number | null
  kurtosis: number | null
  ci95Low: number
  ci95High: number
}

/** Nonlinear-regression output. Tier 0's non-negotiable analysis (§2). */
export interface CurveFitResult {
  model: string
  /** Fitted parameter values with standard errors and CIs, keyed by name. */
  parameters: Record<
    string,
    { value: number; stderr: number | null; ciLow: number | null; ciHigh: number | null }
  >
  ec50: number | null
  rSquared: number
  adjustedRSquared: number
  aicc: number
  /** Residual standard error, Prism's Sy.x. */
  syx: number
  /** Sampled curve for drawing, plus optional confidence band. */
  curve: { x: number[]; y: number[] }
  confidenceBand: { x: number[]; lower: number[]; upper: number[] } | null
  /** Back-calculated unknowns when interpolation was requested. */
  interpolated: { label: string; signal: number; concentration: number | null; inRange: boolean }[] | null
  converged: boolean
  iterations: number
}

/**
 * One Kaplan-Meier product-limit curve.
 *
 * The estimator runs in the engine and its output is carried here rather than
 * recomputed for drawing: the survival probabilities and the median ARE the
 * result a reader acts on, so Law 2 applies to them exactly as it does to a
 * p-value. `censoredTimes` is separate because the ticks it draws are how a
 * reader judges how much follow-up remains behind the tail of the curve.
 */
export interface SurvivalCurve {
  label: string
  /** Step times, starting at 0 with survival 1. */
  time: number[]
  survival: number[]
  /** Greenwood 95% band, clamped to [0, 1]. */
  lower: number[]
  upper: number[]
  atRisk: number[]
  censoredTimes: number[]
  /** Null when the curve never reaches 0.5 (median not reached). */
  median: number | null
  n: number
  events: number
}

/**
 * The primary statistical result. `reportSentence` is the engine's own wording
 * for the figure legend and methods section — generated HERE, from engine
 * numbers, so that Law 2 holds even for prose the model later paraphrases.
 */
export interface TestResult {
  test: string
  statistic: number | null
  df: number | string | null
  pValue: number | null
  effectSizes: EffectSize[]
  assumptions: AssumptionCheck[]
  pairwise: PairwiseComparison[]
  /**
   * Per-term rows for multi-term models; empty for single-comparison tests, in
   * which case `statistic`/`df`/`pValue` above are the whole story.
   */
  terms: ModelTerm[]
  /** Per-group n, so the legend can state it exactly. */
  groupSizes: Record<string, number>
  reportSentence: string
}

/**
 * Both sides of every exclusion (§6.7: "'with vs without excluded points'
 * comparison always available"). The engine computes both rather than leaving
 * the UI to ask twice, which is what makes the comparison impossible to omit.
 */
export interface ExclusionImpact {
  excludedCount: number
  withExclusions: { pValue: number | null; statistic: number | null }
  withoutExclusions: { pValue: number | null; statistic: number | null }
  /** True when including the excluded points flips significance at the spec's alpha. */
  changesSignificance: boolean
}

export interface EngineResult {
  /** Identity: what produced this, against what. */
  engineVersion: string
  dataVersionHash: string
  specHash: string
  computedAt: string
  /** Milliseconds of compute, for the performance budget in §3.2 Law 5. */
  durationMs: number

  descriptives: DescriptiveRow[]
  test: TestResult | null
  curveFit: CurveFitResult | null
  /** Present only for a survival analysis. */
  survival: { groups: SurvivalCurve[] } | null
  exclusionImpact: ExclusionImpact | null

  /**
   * Rows the figure actually used, post-transform, carrying the identity of the
   * source row so the renderer can hit-test a mark back to the spreadsheet
   * ("open the data behind this point", §2 Tier 0 Data↔figure link).
   */
  plotData: { rowId: string; values: Record<string, number | string | null>; excluded: boolean }[]

  /** Non-fatal engine notes: convergence warnings, dropped rows, small n. */
  warnings: string[]

  /**
   * The routine that actually ran, as a machine key. It is not always the test
   * that was requested: a non-2x2 table asked for Fisher's exact gets a
   * chi-square, and a record that still names the request describes an analysis
   * nobody performed. Null when nothing ran.
   */
  testRan: string | null

  /**
   * Non-null exactly when the run failed, in which case `test` is null because
   * nothing was computed. See `EngineError` for why this is not a warning.
   */
  error: EngineError | null
}

/**
 * Why a run produced no test.
 *
 * `test: null` on its own is ambiguous: "no hypothesis attached, here are the
 * descriptives" and "the calculation raised" arrive looking identical, so a
 * failure could be reported as a finished analysis. The failure also used to
 * travel in `warnings` — the list a scientist is meant to read for caveats —
 * carrying a Python exception repr, which is not something to put in front of a
 * bench user. Hence: a code to branch on, a sentence to show, and the raw text
 * kept separately for diagnostics.
 */
export interface EngineError {
  /** Stable across message rewording, so callers may branch on it. */
  code: "test-failed" | "no-routine"
  /** The analysis that was attempted, e.g. "nonlinear-regression". */
  test: string
  /** Shown to the user. Never a Python exception repr. */
  message: string
  /** `OverflowError: …` as Python raised it — for logs and bug reports only. */
  detail: string | null
}

/* ── Cache key ─────────────────────────────────────────────────────────────*/

/**
 * Stable stringify: key order must not change the hash, or the cache would miss
 * on a semantically identical spec and, worse, two identical analyses would get
 * different provenance identities.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`
}

/** SHA-256 over the canonical form, via WebCrypto (available in workers too). */
export async function hashObject(value: unknown): Promise<string> {
  const canonical = stableStringify(value)
  const bytes = new TextEncoder().encode(canonical)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * The cache key required by §6.3, and the identity a stored result is checked
 * against on reopen. Deliberately excludes the parts of the spec that cannot
 * change a number: restyling must never invalidate a computed result, because
 * Law 5 gives style edits a 16ms budget and recomputes a 2s one.
 */
export async function computeCacheKey(
  spec: AnalysisSpec
): Promise<{ specHash: string; cacheKey: string }> {
  const computational = {
    dataset: spec.dataset,
    roles: spec.roles,
    design: spec.design,
    filters: spec.filters,
    exclusions: spec.exclusions,
    transforms: spec.transforms,
    analysis: spec.analysis,
    // Only the figure fields the ENGINE reads. Error-bar choice changes the
    // numbers drawn; colour and font do not.
    figure: { kind: spec.figure.kind, errorBars: spec.figure.errorBars },
  }
  const specHash = await hashObject(computational)
  const cacheKey = `${ENGINE_VERSION}|${spec.dataset.versionHash}|${specHash}`
  return { specHash, cacheKey }
}

/**
 * Does a stored result still describe the current spec and data? §3A.3 rule 3:
 * on reopen we load the stored result and CHECK it, never silently recompute.
 * The three booleans let the reopen banner say precisely what moved.
 */
export function checkResultIntegrity(
  stored: Pick<EngineResult, "engineVersion" | "dataVersionHash" | "specHash">,
  current: { engineVersion: string; dataVersionHash: string; specHash: string }
): { valid: boolean; engineChanged: boolean; dataChanged: boolean; specChanged: boolean } {
  const engineChanged = stored.engineVersion !== current.engineVersion
  const dataChanged = stored.dataVersionHash !== current.dataVersionHash
  const specChanged = stored.specHash !== current.specHash
  return {
    valid: !engineChanged && !dataChanged && !specChanged,
    engineChanged,
    dataChanged,
    specChanged,
  }
}
