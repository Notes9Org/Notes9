import { z } from "zod"

/**
 * L3, The Analysis Spec. The single source of truth.
 *
 * From the Data Analysis master document (§3.3 L3), the spec carries:
 *   dataset_ref + version_hash · row filters · exclusions (with reason + author)
 *   · transforms · design declaration · test + options + corrections · model
 *   params · figure type · encodings · style tokens · annotations · export settings
 *
 * Three of the five architectural laws (§3.2) are enforced by this file existing
 * and being the ONLY thing the UI and the AI mutate:
 *
 *   Law 1, everything is a spec, nothing is a picture. There is no field here
 *           for a rendered image. Images are produced at export, from the spec.
 *   Law 3, chat and hand-editing operate on one object, bidirectionally. Both a
 *           dragged axis and "now make it log scale" become the same typed
 *           mutation on the same object, so the assistant always reads the
 *           user's latest state rather than its own last proposal.
 *   Law 4, every result is reproducible from (spec + data version). The spec
 *           therefore pins `dataset.versionHash`; results are never valid
 *           independently of it.
 *
 * The spec deliberately holds NO results and NO statistics. Numbers live in the
 * results object the engine returns (§3.2 Law 2: no number reaches the user that
 * did not come from the engine). If a p-value ever appears in this file's types,
 * the separation has been broken.
 *
 * SCHEMA VERSIONING. `schemaVersion` is mandatory and checked on open. Per §3A.6,
 * an outdated spec must forward-migrate and log the migration, never fail to
 * open, see `migrateSpec`.
 */

export const ANALYSIS_SPEC_SCHEMA_VERSION = 1 as const

/* ── Dataset reference ─────────────────────────────────────────────────────
   §3A.3 rule 4: snapshot the rows, reference the file. The spec carries the
   reference and the hash of the snapshot it was computed against; the snapshot
   rows themselves live on the revision, not in the spec, because the spec must
   stay small enough to diff, patch, and send to a model. */

export const DatasetRef = z.object({
  /** data_files row this analysis came from, when it came from the library. */
  fileId: z.string().uuid().nullable(),
  /** Human label shown in provenance when the file is renamed or detached. */
  fileName: z.string().max(512),
  /** Sheet name for multi-sheet workbooks; null for single-table formats. */
  sheet: z.string().max(256).nullable().default(null),
  /**
   * Content hash of the exact rows used. Drift detection (§3A.6) compares this
   * against the live file; a mismatch raises the reopen banner rather than
   * silently recomputing.
   */
  versionHash: z.string().min(8).max(128),
  /** Row/column counts, so provenance can state the shape without the rows. */
  rowCount: z.number().int().nonnegative(),
  columnCount: z.number().int().nonnegative(),
})
export type DatasetRef = z.infer<typeof DatasetRef>

/* ── Cross-file join (T0.6) ────────────────────────────────────────────────
   "Join across files in the same project." This is DATASET level, not a
   Transform, and the reason is provenance rather than taste. A Transform is a
   pure row operation over the table already in hand; it carries no file id and
   no version hash, and it is applied by `applyTransform(rows, t)`, which has no
   way to reach a second file. A join pulls in another FILE, and Law 4 (a result
   is reproducible from spec + data version) means every file a number depends
   on must be pinned by its own hash. So each join carries a full DatasetRef for
   its right-hand side, and the joins sit beside `dataset`, not inside
   `transforms`.

   ORDER. The resolver applies joins as step 0, before row filters and before
   transforms, because filters and transforms must be able to name the columns
   the join brought in (that is the whole point of joining a plate map).

   ROW IDENTITY. Exclusions are recorded against row ids (§8.1) and have to
   resolve again on the next open, so a join may not reshuffle identity for
   free. Two rules, both deterministic given the two version hashes:

     - a left row matching AT MOST ONE right row keeps its own rowId unchanged.
       This is the 1:1 case, which is what a plate map, a sample sheet, or a
       metadata table is, and it means attaching one to a working analysis does
       not orphan the exclusions already recorded against it.
     - a left row that fans out to N > 1 right rows yields one row per match
       with id `${leftRowId}<US>${rightRowId}`, the same convention pivotLonger
       already uses, because a single id can no longer name a single row. The
       resolver warns when this happens, since any exclusion recorded before the
       fan-out now names a row that no longer exists.

   Cardinality cannot change under a fixed pair of version hashes, so the branch
   between those two rules is itself stable: the same spec against the same two
   snapshots always produces the same ids. */

export const DatasetJoin = z.object({
  /** The file being joined in, pinned by its own hash exactly as `dataset` is. */
  right: DatasetRef,
  /**
   * Key columns, left name paired with right name. A multi-column key matches
   * on the whole tuple. Values are compared in their string form, so a well
   * number that arrived as a number on one side and as text on the other still
   * meets, which is the single most common shape of this join in practice.
   */
  on: z
    .array(z.object({ left: z.string().max(256), right: z.string().max(256) }))
    .min(1)
    .max(8),
  /**
   * "left" keeps unmatched left rows with nulls in the right columns; "inner"
   * drops them. Either way the resolver reports the count in `warnings`, because
   * a table that silently shrank is the kind of invisible substitution §3.2
   * forbids.
   */
  type: z.enum(["inner", "left"]).default("left"),
  /**
   * Right columns to bring in. Empty, the default, means every right column
   * except the ones used as keys.
   */
  columns: z.array(z.string().max(256)).default([]),
  /**
   * Appended to a right column's name when it would otherwise collide with a
   * left column. Never overwrite the left column: the left table is the one the
   * analysis was built against.
   */
  suffix: z.string().min(1).max(64).default("_r"),
})
export type DatasetJoin = z.infer<typeof DatasetJoin>

/* ── Semantic layer (L2) ───────────────────────────────────────────────────
   Variable roles and the design declaration. Populated in priority order from
   the notes9 project record, then inference, then the user (§3.3 L2). The
   `source` field records WHICH of those three supplied each role, because
   §6.2 requires that a user override persists and is not re-guessed. */

export const VariableRole = z.enum([
  "subject",
  "group",
  "treatment",
  "time",
  "replicate",
  "response",
  "covariate",
  "ignore",
])
export type VariableRole = z.infer<typeof VariableRole>

export const RoleSource = z.enum(["project-record", "inferred", "user"])

export const ColumnRole = z.object({
  column: z.string().max(256),
  role: VariableRole,
  /** Units as detected or declared, e.g. "pg/mL". Null when unitless. */
  unit: z.string().max(64).nullable().default(null),
  source: RoleSource,
  /** Inference confidence 0–1; null when the user or the record set it. */
  confidence: z.number().min(0).max(1).nullable().default(null),
})
export type ColumnRole = z.infer<typeof ColumnRole>

/**
 * The design declaration. This is what makes test selection project-aware
 * rather than shape-driven (§2 Tier 1.1), and it is what an assumption check
 * reads to know that "before/after" on the same subjects is paired.
 */
export const DesignDeclaration = z.object({
  paired: z.boolean().default(false),
  repeatedMeasures: z.boolean().default(false),
  /** Column that identifies the subject across repeated measurements. */
  subjectColumn: z.string().max(256).nullable().default(null),
  /** Nesting, e.g. wells within plates within runs. Outermost first. */
  nesting: z.array(z.string().max(256)).default([]),
  replicateType: z.enum(["technical", "biological", "mixed", "unknown"]).default("unknown"),
  source: RoleSource,
  /**
   * Set when the declared design disagrees with the notes9 experiment record.
   * §6.2 requires the mismatch to be flagged rather than silently resolved.
   */
  recordMismatch: z.string().max(512).nullable().default(null),
})
export type DesignDeclaration = z.infer<typeof DesignDeclaration>

/* ── Data preparation ──────────────────────────────────────────────────────
   Ordered because these do not commute: subtracting a blank then logging is not
   the same as logging then subtracting. The array order IS the pipeline order. */

export const Transform = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("log10"), column: z.string().max(256) }),
  z.object({ kind: z.literal("ln"), column: z.string().max(256) }),
  z.object({ kind: z.literal("percent"), column: z.string().max(256), of: z.string().max(256) }),
  z.object({ kind: z.literal("zscore"), column: z.string().max(256) }),
  z.object({ kind: z.literal("foldChange"), column: z.string().max(256), baseline: z.string().max(256) }),
  z.object({ kind: z.literal("normalise"), column: z.string().max(256), min: z.number(), max: z.number() }),
  /**
   * "% of vehicle, per plate", the plate-assay default, and not expressible as
   * `normalise`, which rescales to a fixed range and knows nothing about which
   * wells are the control. A separate member rather than extra fields on
   * `normalise`, because widening that shape would change how every already-saved
   * spec parses.
   */
  z.object({
    kind: z.literal("normaliseToControl"),
    column: z.string().max(256),
    /** The condition column and the level within it that holds the control. */
    groupColumn: z.string().max(256),
    controlLevel: z.string().max(256),
    /**
     * Columns that scope the control mean, e.g. ["plate"]. Empty takes one
     * control mean across the whole table, which is only right when there is one
     * plate: normalising to an on-plate control exists to remove plate-to-plate
     * drift, and a global mean folds that drift straight back in.
     */
    per: z.array(z.string().max(256)).default([]),
    as: z.enum(["percent", "ratio"]).default("percent"),
  }),
  z.object({
    kind: z.literal("baselineSubtract"),
    column: z.string().max(256),
    /** Either a named blank group or an explicit value. */
    blankGroup: z.string().max(256).nullable().default(null),
    blankValue: z.number().nullable().default(null),
  }),
  z.object({
    kind: z.literal("collapseReplicates"),
    by: z.array(z.string().max(256)).min(1),
    statistic: z.enum(["mean", "median", "sd", "sem"]),
    /**
     * The measurement columns to collapse. ADDITIVE and optional: a spec saved
     * before this field existed omits it and defaults to `[]`, in which case
     * the resolver falls back to `analysis.responseColumns`. Naming the
     * measurements matters because "parses as a number" is not the same
     * question as "is a measurement": a numeric subject/well/plate ID that is
     * averaged turns subjects 1, 2, 3 into subject 2.
     */
    columns: z.array(z.string().max(256)).default([]),
    /**
     * Column receiving the group size. Replicate n belongs in the table, not
     * only in the concatenated row id, because SD and SEM are unreadable
     * without it. ADDITIVE: defaults to "n" for specs saved before it existed.
     */
    countTo: z.string().max(256).default("n"),
  }),
  z.object({
    kind: z.literal("calculatedColumn"),
    name: z.string().max(256),
    /** Spreadsheet-style formula, evaluated by the engine, never by the model. */
    formula: z.string().max(2000),
  }),
  /**
   * Wide → long. A plate reader writes one column per plate column, so a raw
   * 96-well export arrives as 8 rows × 12 value columns; every shape below the
   * resolver is long, which makes that layout unanalysable until it is folded.
   * This is the one transform that changes the row count and the column set
   * rather than a column's values.
   */
  z.object({
    kind: z.literal("pivotLonger"),
    /** The wide columns to fold, e.g. the twelve plate columns "1".."12". */
    columns: z.array(z.string().max(256)).min(1),
    /** New column carrying the folded column's name. */
    namesTo: z.string().max(256),
    /** New column carrying its value. */
    valuesTo: z.string().max(256),
  }),
  /**
   * Long → wide, the inverse of `pivotLonger`. Rows that agree on every column
   * except the two named here become one row, with one new column per level of
   * `namesFrom`. Needed because half the instruments in a lab emit long and
   * half the readers (and every heatmap) want wide, and because a folded table
   * has to be unfoldable or the fold is destructive.
   *
   * Like `pivotLonger` this changes the row count and the column set, so it
   * belongs at the FRONT of the transform list: exclusions and downstream
   * column references are written against whichever shape follows it.
   */
  z.object({
    kind: z.literal("pivotWider"),
    /** Column whose distinct values become the new column names. */
    namesFrom: z.string().max(256),
    /** Column whose values fill those new columns. */
    valuesFrom: z.string().max(256),
  }),
])
export type Transform = z.infer<typeof Transform>

export const MissingValueStrategy = z.enum([
  "listwise",
  "pairwise",
  "mean-impute",
  "median-impute",
  "leave",
])

export const RowFilter = z.object({
  column: z.string().max(256),
  op: z.enum(["eq", "neq", "lt", "lte", "gt", "gte", "in", "notIn", "contains", "isNull", "notNull"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]).nullable(),
})
export type RowFilter = z.infer<typeof RowFilter>

/* ── Exclusion governance (§8.1) ───────────────────────────────────────────
   The single most trust-building feature in the product, and the one that stops
   "remove points and watch stats update" being a frictionless p-hacking machine.
   Every field here is required BY DESIGN:

     - a reason is mandatory, from a named list or free text;
     - the author and timestamp are recorded;
     - the point is never deleted, only marked, so "with vs without" is always
       computable and is always shown alongside (§6.7).

   A statistical exclusion must additionally name its method and parameters, so
   "outlier" can never be ad hoc. */

export const ExclusionReasonKind = z.enum([
  "technical-failure",
  "contamination",
  "instrument-error",
  "pre-registered-criterion",
  "statistical-outlier",
  "other",
])
export type ExclusionReasonKind = z.infer<typeof ExclusionReasonKind>

export const Exclusion = z
  .object({
    /** Stable row identity within the data snapshot. */
    rowId: z.string().max(128),
    reasonKind: ExclusionReasonKind,
    /** Required free text when the kind is "other"; optional elaboration otherwise. */
    reasonText: z.string().max(1000).nullable().default(null),
    /**
     * Required when reasonKind is "statistical-outlier": the named test and its
     * parameters, e.g. { method: "ROUT", params: { Q: 0.01 } }. §8.1 forbids ad
     * hoc outlier removal.
     */
    method: z
      .object({
        name: z.enum(["ROUT", "Grubbs"]),
        params: z.record(z.string(), z.number()),
      })
      .nullable()
      .default(null),
    excludedBy: z.string().max(256),
    excludedAt: z.string().datetime(),
  })
  .superRefine((val, ctx) => {
    if (val.reasonKind === "other" && !val.reasonText?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reasonText"],
        message: "A free-text reason is required when the reason kind is 'other'.",
      })
    }
    if (val.reasonKind === "statistical-outlier" && !val.method) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["method"],
        message:
          "A statistical exclusion must name its method and parameters (e.g. ROUT Q=1%). Ad hoc outlier removal is not permitted.",
      })
    }
  })
export type Exclusion = z.infer<typeof Exclusion>

/* ── Test + options + corrections ──────────────────────────────────────────
   Tier 0's statistics list (§2). The engine implements each behind one uniform
   interface (§6.3); this union is the request side of that interface. */

export const TestKind = z.enum([
  "descriptives",
  "normality",
  "t-one-sample",
  "t-unpaired",
  "t-welch",
  "t-paired",
  "mann-whitney",
  "wilcoxon-signed-rank",
  "kruskal-wallis",
  "friedman",
  "anova-one-way",
  "anova-two-way",
  "anova-rm",
  "mixed-effects",
  "chi-square",
  "fisher-exact",
  "correlation-pearson",
  "correlation-spearman",
  "linear-regression",
  "nonlinear-regression",
  "kaplan-meier",
  "none",
])
export type TestKind = z.infer<typeof TestKind>

export const PostHocKind = z.enum([
  "tukey",
  "dunnett",
  "sidak",
  "bonferroni",
  "holm-sidak",
  "dunn",
  "none",
  /**
   * False-discovery-rate corrections. Appended, never reordered: a stored spec
   * names its correction by string, so moving a member would silently reparse
   * an already-saved analysis as a different one.
   *
   * These control the expected PROPORTION of false positives among the
   * rejections rather than the probability of any at all, which is the trade a
   * comparison count in the hundreds — an omics panel, a multi-marker plate —
   * has to make: a family-wise correction over 300 pairs has no power left.
   * The engine implements both, and pairs them with Benjamini-Yekutieli (2005)
   * FCR intervals so the interval and the adjusted p cannot contradict.
   */
  "benjamini-hochberg",
  "benjamini-yekutieli",
])

/** Nonlinear model library for Tier 0's non-negotiable dose-response work (§2). */
export const NonlinearModel = z.enum([
  "4pl",
  "3pl",
  "5pl",
  "log-agonist-vs-response",
  "michaelis-menten",
  "one-site-binding",
  "exponential-decay",
  "exponential-growth",
  "linear",
  "semi-log",
])

export const AnalysisConfig = z.object({
  test: TestKind.default("none"),
  postHoc: PostHocKind.default("none"),
  /** Two-sided by default; one-sided must be a deliberate choice. */
  tails: z.enum(["two", "greater", "less"]).default("two"),
  alpha: z.number().min(0).max(1).default(0.05),
  /** Which columns the test consumes; meaning depends on `test`. */
  responseColumns: z.array(z.string().max(256)).default([]),
  groupColumn: z.string().max(256).nullable().default(null),
  secondFactorColumn: z.string().max(256).nullable().default(null),
  /** Reference/control level for Dunnett and for fold-change. */
  referenceLevel: z.string().max(256).nullable().default(null),
  missingValues: MissingValueStrategy.default("listwise"),
  /** Nonlinear-regression parameters, present only when test is nonlinear-regression. */
  nonlinear: z
    .object({
      model: NonlinearModel,
      weighting: z.enum(["none", "1/Y", "1/Y^2"]).default("none"),
      /** Share parameters across datasets, Prism's global fit. */
      sharedParameters: z.array(z.string().max(64)).default([]),
      /**
       * Column whose distinct values split the included rows into SEPARATE
       * CURVES for a global fit (T0.20). Null, the default and the meaning of
       * every spec written before this field existed, is one curve over all
       * rows.
       *
       * `sharedParameters` was always here but had nothing to share ACROSS,
       * because the payload could only ever carry one x/y pair. With this set
       * the resolver emits `datasets: [{ label, x, y }, ...]`, one entry per
       * level ordered by FIRST APPEARANCE in the data (not by a Set's iteration
       * order and not alphabetically), so the engine's per-dataset results come
       * back in an order the caller can predict and the labels are stable
       * across re-runs.
       */
      datasetColumn: z.string().max(256).nullable().optional(),
      constraints: z.record(z.string(), z.object({ min: z.number().nullable(), max: z.number().nullable() })).default({}),
      confidenceBands: z.boolean().default(true),
      /** Interpolate unknowns from the fitted standard curve. */
      interpolate: z.boolean().default(false),
    })
    .nullable()
    .default(null),
  /**
   * §6.3: deterministic seeding for any stochastic method. Recorded in the spec
   * so a re-run reproduces the same result rather than merely a similar one.
   */
  randomSeed: z.number().int().nullable().default(null),
})
export type AnalysisConfig = z.infer<typeof AnalysisConfig>

/* ── Figure: type, encodings, style tokens, annotations ────────────────────
   The 12 canonical chart types from §2 Tier 0. */

/**
 * Every chart the product can draw.
 *
 * One list, because a chart the spec cannot name is a chart that cannot be
 * saved, reopened, put in a figure panel or reproduced, Law 1 makes the spec
 * the only description of a figure, so anything missing here is unreachable
 * from a saved analysis.
 */
export const FigureKind = z.enum([
  // Comparisons across groups
  "bar-scatter-error",
  "grouped-bar",
  "stacked-bar",
  "horizontal-bar",
  "box",
  "violin",
  // Relationships
  "xy-scatter-fit",
  "bubble",
  "line-timecourse",
  "area",
  "dose-response",
  // Distributions
  "histogram",
  "ecdf",
  "qq",
  // Matrices and screens
  "heatmap",
  "correlation-matrix",
  "volcano",
  // Clinical and assay
  "kaplan-meier",
  "roc",
  "bland-altman",
  "forest",
  // Composition
  "pie-composition",
  // Three-dimensional
  "scatter-3d",
  "surface-3d",
])
export type FigureKind = z.infer<typeof FigureKind>

/**
 * §2: error-bar type is switchable AND always stated on the figure.
 *
 * The confidence levels are separate members rather than a level parameter
 * because the choice has to be legible in one token everywhere it is printed:
 * in the legend, in the methods sentence, and in the exported figure.
 */
export const ErrorBarKind = z.enum([
  "sd",
  "sem",
  "ci90",
  "ci95",
  "ci99",
  "range",
  "iqr",
  "mad",
  "none",
])

export const AxisSpec = z.object({
  label: z.string().max(256).nullable().default(null),
  unit: z.string().max(64).nullable().default(null),
  /**
   * "auto" defers to the figure kind, which is not the same statement as
   * "linear". A four-parameter logistic fit is unreadable at the low end on a
   * linear dose axis, so `dose-response` wants log x — but only until someone
   * says otherwise, and a schema whose only default IS "linear" cannot tell a
   * chosen linear axis from an unset one. `parseSpec` resolves "auto" to a
   * concrete scale, so every consumer downstream still sees "linear"|"log10".
   */
  scale: z.enum(["auto", "linear", "log10"]).default("auto"),
  min: z.number().nullable().default(null),
  max: z.number().nullable().default(null),
  tickCount: z.number().int().min(2).max(50).nullable().default(null),
  /** Axis breaks as [from, to] ranges omitted from the drawn scale. */
  breaks: z.array(z.tuple([z.number(), z.number()])).default([]),
})
export type AxisSpec = z.infer<typeof AxisSpec>

export const SeriesStyle = z.object({
  key: z.string().max(256),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
  pointShape: z.enum(["circle", "square", "diamond", "triangle", "cross", "x", "star"]).default("circle"),
  pointSize: z.number().min(0).max(40).default(6),
  opacity: z.number().min(0).max(1).default(1),
  jitter: z.number().min(0).max(1).default(0),
  lineStyle: z.enum(["solid", "dash", "dot", "dashdot", "none"]).default("solid"),
  lineWidth: z.number().min(0).max(10).default(2),
  /** Dual-axis assignment. */
  axis: z.enum(["left", "right"]).default("left"),
})
export type SeriesStyle = z.infer<typeof SeriesStyle>

/**
 * A significance bracket. Generated from the post-hoc result, then draggable and
 * restylable (§2). `derived` marks brackets the engine produced: those are
 * recomputed when the analysis changes, whereas a user-authored bracket is not
 * silently replaced. The p-value is NOT stored here, the renderer reads it from
 * the results object, so Law 2 holds even for annotations.
 */
export const SignificanceBracket = z.object({
  id: z.string().max(64),
  fromGroup: z.string().max(256),
  toGroup: z.string().max(256),
  /** Vertical offset from the auto-placed position, in px, after dragging. */
  offsetY: z.number().default(0),
  derived: z.boolean().default(true),
  /** Render as stars or the numeric p. */
  display: z.enum(["stars", "p-value", "both"]).default("stars"),

  /* ── Style overrides (T0.27) ────────────────────────────────────────────
     Every field below is a SPARSE OVERRIDE and is OPTIONAL, absence meaning "use
     the figure's style tokens". That is what keeps restyling compatible with
     regeneration: when the analysis changes, brackets are re-derived from the
     new post-hoc result and only the fields the user actually set are carried
     across, exactly as `offsetY` already is. A bracket that has never been
     restyled carries none of them and is therefore indistinguishable from a fresh one, so
     regeneration has nothing to preserve and nothing to fight.

     Storing a concrete colour on every derived bracket instead would freeze the
     palette at the moment of generation: changing the figure theme afterwards
     would leave the brackets behind, and the "user restyled this" signal would
     be lost because every bracket would look restyled. */

  /** Line and label colour. Null uses the figure's foreground token. */
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  /** Bracket stroke width in px. Absent uses the figure default. */
  lineWidth: z.number().min(0.25).max(10).nullable().optional(),
  /** Label size in px. Absent uses `style.tickFontSize`. */
  fontSize: z.number().min(6).max(36).nullable().optional(),
  /** Height of the downward end ticks in px. Absent uses the figure default. */
  capLength: z.number().min(0).max(40).nullable().optional(),
  /**
   * Suppress this bracket without deleting it. Deleting a DERIVED bracket does
   * not work, the next recompute regenerates it; hiding is the only stable way
   * to say "not this comparison" and survive regeneration.
   */
  hidden: z.boolean().optional(),
})
export type SignificanceBracket = z.infer<typeof SignificanceBracket>

/**
 * The style fields a user may have overridden on a bracket. When brackets are
 * re-derived after an analysis change, copy exactly these (plus `offsetY`) from
 * the old bracket with the same pair key onto the new one; everything else is a
 * property of the fresh post-hoc result and must NOT be carried over.
 */
export const BRACKET_STYLE_FIELDS = [
  "display",
  "colour",
  "lineWidth",
  "fontSize",
  "capLength",
  "hidden",
] as const satisfies readonly (keyof SignificanceBracket)[]

/**
 * A bracket's identity is the comparison it spans.
 *
 * Brackets are generated from the post-hoc result on every recompute, so an
 * index or a random id would point somewhere else the moment a group is added.
 * The pair does not move, which is what makes a dragged offset survive a
 * recompute and land back on the same comparison.
 *
 * ponytail: 30 characters a side keeps the id inside the schema's 64-character
 * cap. Two groups identical in their first 30 characters would share a bracket;
 * hash the pair instead if that ever turns up in real data.
 */
const PAIR_SEPARATOR = "\u001f"

export function bracketId(fromGroup: string, toGroup: string): string {
  return `${fromGroup.slice(0, 30)}${PAIR_SEPARATOR}${toGroup.slice(0, 30)}`
}

/** The comparison an id names, or null if it is not a pair id. */
export function bracketPair(id: string): { fromGroup: string; toGroup: string } | null {
  const parts = id.split(PAIR_SEPARATOR)
  if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) return null
  return { fromGroup: parts[0], toGroup: parts[1] }
}

export const Annotation = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    id: z.string().max(64),
    x: z.number(),
    y: z.number(),
    text: z.string().max(1000),
    fontSize: z.number().min(4).max(72).default(12),
    colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#000000"),
  }),
  z.object({
    kind: z.literal("arrow"),
    id: z.string().max(64),
    x1: z.number(),
    y1: z.number(),
    x2: z.number(),
    y2: z.number(),
    colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#000000"),
  }),
  z.object({
    kind: z.literal("shape"),
    id: z.string().max(64),
    shape: z.enum(["rect", "ellipse", "line"]),
    x1: z.number(),
    y1: z.number(),
    x2: z.number(),
    y2: z.number(),
    colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#000000"),
  }),
])
export type Annotation = z.infer<typeof Annotation>

export const FigureSpec = z.object({
  kind: FigureKind,
  title: z.string().max(512).nullable().default(null),
  subtitle: z.string().max(512).nullable().default(null),
  /**
   * The figure legend.
   *
   * Null means "use the one the engine's numbers generate". Once the user
   * writes their own it is stored here and never regenerated over, which is the
   * same sticky-manual-edit rule the AI patch path follows: a caption someone
   * has worded is a decision, and silently rewriting it when the analysis
   * changes would be the product overruling its author.
   */
  caption: z.string().max(4000).nullable().default(null),
  x: AxisSpec,
  y: AxisSpec,
  /** Secondary axis, when a series is assigned to the right. */
  y2: AxisSpec.nullable().default(null),
  errorBars: ErrorBarKind.default("sd"),
  /**
   * Colour-blind-safe by default (§6.4). The full set lives in
   * lib/data-analysis/render/palettes.ts; this is a plain string so adding a
   * palette there does not require a schema migration, and an unknown id falls
   * back to the default rather than failing to parse a saved analysis.
   */
  palette: z.string().max(64).default("okabe-ito"),
  series: z.array(SeriesStyle).default([]),
  showLegend: z.boolean().default(true),
  legendPosition: z.enum(["bottom", "right", "top", "none"]).default("bottom"),
  showGridlines: z.boolean().default(true),
  /** Figures follow the platform's UI face by default; serif is a choice, not the default. */
  fontFamily: z.enum(["sans", "serif", "mono"]).default("sans"),
  titleFontSize: z.number().min(6).max(48).default(17),
  axisFontSize: z.number().min(6).max(36).default(13),
  /** Panel dimensions in px; aspect is derived, not stored twice. */
  width: z.number().min(120).max(4000).default(720),
  height: z.number().min(120).max(4000).default(520),
  brackets: z.array(SignificanceBracket).default([]),
  annotations: z.array(Annotation).default([]),
  /** Excluded points stay visible, greyed, unless explicitly hidden (§8.1). */
  showExcludedPoints: z.boolean().default(true),
  /** Draw the Greenwood band on a Kaplan-Meier curve, or the fit's band on a curve. */
  showConfidenceBands: z.boolean().default(true),
  /**
   * Volcano plot only: the |effect| threshold drawn as a vertical guide, paired
   * with the analysis alpha for the horizontal one. Stored so the lines on the
   * figure are the same cut-offs the reader is told were applied.
   */
  volcanoFoldChange: z.number().min(0).max(100).default(1),
  /**
   * Volcano only: how many significant features get an on-plot label.
   *
   * A volcano a reader cannot read gene names off is half a volcano, and a
   * volcano that labels all 20 000 of them is none. The cap is stored rather
   * than hardcoded so the figure can state which bound was applied, and the
   * subtitle says "top N of M" whenever M exceeds it — a truncation a reader
   * cannot see is a truncation that misrepresents the result.
   */
  volcanoLabelCount: z.number().int().min(0).max(100).default(10),
  /**
   * Violin only: stop the kernel density at the observed range.
   *
   * Plotly's default (`spanmode: "soft"`) runs the KDE past the extreme
   * observations, so a violin of a concentration, a count or an elapsed time
   * draws density below zero — a claim about values the assay cannot produce.
   * Truncation is the default for that reason; the soft tail stays available
   * because it is the right picture for a genuinely unbounded quantity.
   */
  violinTruncate: z.boolean().default(true),
  /**
   * Violin only: mirror the second factor's two levels about each group's tick.
   *
   * Off by default because it needs a second factor with exactly two levels;
   * asking for it without one is reported on the figure, never ignored.
   */
  violinSplit: z.boolean().default(false),
  /** Violin only: the median/IQR box inside the density, as journals draw it. */
  violinInnerBox: z.boolean().default(true),
  /**
   * Histogram only: bin count. Null asks for Freedman-Diaconis, which is the
   * rule that survives the skewed, outlier-heavy distributions lab data
   * actually has; a number here overrides it.
   */
  histogramBins: z.number().int().min(1).max(500).nullable().default(null),
  /** Histogram only: what the bar height means. */
  histogramNorm: z
    .enum(["count", "probability", "density", "probability density"])
    .default("count"),
})
export type FigureSpec = z.infer<typeof FigureSpec>

/* ── Export settings (§6.8) ────────────────────────────────────────────────
   Journal presets front and centre; the last mile Prism owns today. */

export const ExportSettings = z.object({
  format: z.enum(["png", "svg", "pdf", "eps", "tiff", "jpg"]).default("svg"),
  dpi: z.number().int().min(72).max(2400).default(300),
  transparent: z.boolean().default(false),
  colourSpace: z.enum(["rgb", "cmyk"]).default("rgb"),
  widthMm: z.number().min(10).max(500).nullable().default(null),
  /** Named journal preset applied, for provenance. */
  journalPreset: z.string().max(128).nullable().default(null),
})
export type ExportSettings = z.infer<typeof ExportSettings>

/* ── The spec ──────────────────────────────────────────────────────────────*/

export const AnalysisSpec = z.object({
  schemaVersion: z.literal(ANALYSIS_SPEC_SCHEMA_VERSION),
  dataset: DatasetRef,
  /**
   * Other files in the same project joined onto `dataset` (T0.6). Applied by
   * the resolver BEFORE filters and transforms. Empty is the default and the
   * meaning of every spec written before this field existed.
   */
  joins: z.array(DatasetJoin).optional(),
  roles: z.array(ColumnRole).default([]),
  design: DesignDeclaration,
  filters: z.array(RowFilter).default([]),
  exclusions: z.array(Exclusion).default([]),
  transforms: z.array(Transform).default([]),
  analysis: AnalysisConfig,
  figure: FigureSpec,
  export: ExportSettings,
  /**
   * Where the engine runs. Today there is only one answer, a Pyodide worker in
   * the browser, and nothing reads this field yet. It exists now because the
   * field is free to add before any analysis has been saved without it, and a
   * migration afterwards; declaring it up front makes a future server tier a
   * routing decision rather than a change to the contract every stored spec was
   * written against. Deliberately absent from the cache key: it names where a
   * number is computed, never what the number is.
   */
  runtime: z.enum(["browser", "server"]).default("browser"),
})
export type AnalysisSpec = z.infer<typeof AnalysisSpec>

/**
 * Kinds whose x axis is a concentration series, where log is the readable
 * default. A 4PL fit on a linear dose axis crushes every low-dose point into
 * the left margin, which is the half of the curve the EC50 is estimated from.
 */
const LOG_X_BY_DEFAULT = new Set<FigureKind>(["dose-response"])

/**
 * Resolve an "auto" axis scale against the figure kind.
 *
 * Only the x axis of a dose-response gets a non-linear default: no kind in the
 * catalogue wants a log y unless its author asks. Exported because the renderer
 * has to make the same decision for a spec that never went through `parseSpec`.
 */
export function effectiveScale(
  scale: AxisSpec["scale"],
  kind: FigureKind,
  axis: "x" | "y" | "y2"
): "linear" | "log10" {
  if (scale !== "auto") return scale
  return axis === "x" && LOG_X_BY_DEFAULT.has(kind) ? "log10" : "linear"
}

/**
 * Parse-and-validate. The AI layer (§6.6) must route every proposed spec through
 * this: invalid specs are rejected and repaired, never rendered. Returning the
 * issues rather than throwing is what lets the orchestrator run its repair loop.
 */
export function parseSpec(
  input: unknown
): { ok: true; spec: AnalysisSpec } | { ok: false; issues: z.ZodIssue[] } {
  const result = AnalysisSpec.safeParse(input)
  if (!result.success) return { ok: false, issues: result.error.issues }
  // "auto" is resolved here rather than left for each reader. The chart-state
  // round trip writes a concrete "linear"|"log10" back on every conversion, so
  // a sentinel that survived parsing would be erased by the first UI edit and
  // the log default would silently revert.
  const { figure } = result.data
  const spec: AnalysisSpec = {
    ...result.data,
    figure: {
      ...figure,
      x: { ...figure.x, scale: effectiveScale(figure.x.scale, figure.kind, "x") },
      y: { ...figure.y, scale: effectiveScale(figure.y.scale, figure.kind, "y") },
      y2: figure.y2
        ? { ...figure.y2, scale: effectiveScale(figure.y2.scale, figure.kind, "y2") }
        : figure.y2,
    },
  }
  return { ok: true, spec }
}

/**
 * Forward-migrate an older spec (§3A.6: never fail to open).
 *
 * Each step upgrades one version and returns a note for the revision history, so
 * the migration is logged rather than silent. There is only one version today;
 * the ladder exists so that adding v2 is an append, not a redesign.
 */
export function migrateSpec(
  input: unknown
): { ok: true; spec: AnalysisSpec; notes: string[] } | { ok: false; issues: z.ZodIssue[] } {
  const notes: string[] = []
  let candidate = input as Record<string, unknown>

  const version = typeof candidate?.schemaVersion === "number" ? candidate.schemaVersion : 0
  if (version === 0) {
    candidate = { ...candidate, schemaVersion: ANALYSIS_SPEC_SCHEMA_VERSION }
    notes.push("Spec had no schema version; treated as v1.")
  }

  const parsed = parseSpec(candidate)
  if (!parsed.ok) return parsed
  return { ok: true, spec: parsed.spec, notes }
}
