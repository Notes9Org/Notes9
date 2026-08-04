/**
 * Wire contracts for Catalyst Analysis.
 *
 * SOURCE OF TRUTH: `AI/catalyst/core/analysis/contracts.py`. These two sides are
 * hand-synced with no codegen, if you change a shape here, change the frozen
 * dataclass there in the same commit (and vice versa). Per-analysis `params`
 * shapes live in `AI/catalyst/core/analysis/catalog.py`; `FigureSpec.meta` keys
 * are produced by `AI/catalyst/core/analysis/figure_builder.py`.
 *
 * `schema_version` is on `AnalysisSpec` and `Results` so a stored analysis
 * written by an older runtime stays readable. FigureSpec deliberately has none
 * the Python dataclass does not emit one.
 */

/** Prism-style data table shapes. Mirrors the analyses.table_type CHECK. */
export const TABLE_TYPE_VALUES = [
  "column",
  "grouped",
  "xy",
  "contingency",
  "survival",
  "nested",
] as const

export type TableType = (typeof TABLE_TYPE_VALUES)[number]

/** Narrows an untrusted string (DB row, API payload) to a known table type. */
export function isTableType(value: unknown): value is TableType {
  return typeof value === "string" && (TABLE_TYPE_VALUES as readonly string[]).includes(value)
}

/**
 * One reshaping/normalisation step applied to the source data before the test
 * runs. Extra keys are step-specific (e.g. the blank column for subtract_blank).
 *
 * Narrower than Python, which accepts `Tuple[Any, ...]`, this union is the set
 * the engine actually implements.
 */
export type Transform = {
  op: "pivot_longer" | "subtract_blank" | "apply_dilution" | "normalise_to_control"
  [k: string]: unknown
}

/** Missing-data policy. Mirrors catalog.MISSING_POLICIES. */
export type MissingPolicy = "listwise_delete" | "pairwise_delete"

/**
 * Parameters common to every analysis. Each analysis pins its own extra keys
 * (see catalog.py: `assume_equal_variance`, `posthoc`/`correction`/
 * `control_group`, …), so this is an open record with the shared floor typed.
 *
 * Nothing is defaulted on the Python side by design, scipy's defaults and R's
 * differ, and the spec exists so the same JSON reproduces the same numbers.
 */
export type AnalysisParams = Record<string, unknown> & {
  alpha: number
  /** Absent for inherently non-tailed analyses (e.g. linear_regression). */
  tails?: 1 | 2
  missing: MissingPolicy
  /** Zero-based ROW INDICES to drop, not labels (catalog.py: Tuple[int, ...]). */
  excluded_rows: number[]
}

/**
 * The complete, replayable description of an analysis: which data, which
 * columns play which role, and how the test is parameterised. Stored in
 * analyses.analysis_spec.
 */
export interface AnalysisSpec {
  schema_version: 1
  /** Python types this as an open string; kept narrow here and in the DB CHECK. */
  table_type: TableType
  analysis_type: string
  runtime: "python"
  source: {
    /** experiment_data.id the analysis reads from. */
    data_id: string
    /** Required by SourceRef.from_dict, send "" when not applicable. */
    sheet: string
    range: string
  }
  roles: {
    measurement: string[]
    group: string[]
    /** Subject/pairing columns for repeated-measures designs; null when unpaired. */
    subject: string[] | null
  }
  params: AnalysisParams
  transforms: Transform[]
  figure: { template: string }
}

/**
 * Model-fit output, present only for analyses that fit a model (currently
 * linear_regression). `build_figure` is a pure function of Results, so the
 * scatter points and the evaluated line ride along here for the figure builder.
 *
 * Python types this as a free-form Mapping; these are the keys
 * linear_regression.py actually populates.
 */
export interface FitResult {
  model: string
  /** x / y column names. */
  x: string
  y: string
  slope: number
  intercept: number
  slope_se: number
  intercept_se: number
  /** [low, high], t-based at the spec's alpha. */
  slope_ci: [number, number]
  intercept_ci: [number, number]
  r_squared: number
  /** Fitted line evaluated at the sorted observed x values. */
  line: { x: number[]; y: number[] }
  /** Raw observed points, in input order. */
  points: { x: number[]; y: number[] }
}

/** Statistical output of a run. Stored in analyses.results. */
export interface Results {
  schema_version: 1
  analysis_type: string
  test: {
    name: string
    statistic: number
    statistic_name: string
    df: number[]
    p_value: number
    effect_size: { name: string; value: number } | null
  }
  groups: {
    name: string
    n: number
    mean: number
    sd: number
    sem: number
    ci_low: number
    ci_high: number
  }[]
  comparisons: {
    group_a: string
    group_b: string
    difference: number
    p_value: number
    p_adjusted: number
    significant: boolean
    method: string
  }[]
  assumptions: {
    name: string
    statistic: number
    p_value: number
    passed: boolean
    note: string
  }[]
  meta: {
    n_total: number
    n_excluded: number
    alpha: number
    /** Package → version, for reproducibility ("scipy": "1.14.0"). */
    software: Record<string, string>
  }
  /** Model fits only, the key is omitted entirely (not null) otherwise. */
  fit?: FitResult
}

/**
 * Plotly-JSON figure envelope plus the metadata a caption needs. Stored in
 * analyses.figure_spec.
 *
 * NOTE: no schema_version, FigureSpec.to_dict() emits exactly these four keys.
 */
export interface FigureSpec {
  data: Record<string, unknown>[]
  layout: Record<string, unknown>
  config: Record<string, unknown>
  /**
   * Free-form on the Python side, but figure_builder.py is the only producer;
   * these are the keys it emits. The trailing four are template-specific.
   */
  meta: Record<string, unknown> & {
    template: string
    test_name: string
    /** "sem" for grouped bars, "none" for scatter fits. */
    error_bar: string
    /** Group name → n, for the caption. */
    n_per_group: Record<string, number>
    /** The hex colours used, in trace order. */
    palette: string[]
    alpha: number
    width_mm: number
    font_pt: number
    /** grouped_bar_sem_brackets only. */
    significance?: { group_a: string; group_b: string; p_adjusted: number; label: string }[]
    /** xy_scatter_fit only. */
    r_squared?: number
    slope?: number
    intercept?: number
  }
}
