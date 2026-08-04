/**
 * The semantic layer (L2): what each column MEANS, and what the design IS.
 *
 * This is the layer that makes test selection project-aware rather than
 * shape-driven (§2 Tier 1.1). Everything here is deterministic and runs on the
 * client: it reads column names, value types, cardinality and the repetition
 * structure across rows, and nothing else.
 *
 * It deliberately does NOT call a model. The document's priority order for
 * roles is project record → inference → user, and this file is the middle step.
 * A model may later propose roles, but it proposes them as spec mutations that
 * go through the same `source: "user"` path an override does, so the provenance
 * of every role stays legible. Two consequences that matter:
 *
 *   - inference never overwrites a role whose source is "project-record" or
 *     "user" (§6.2: an override persists and is not re-guessed);
 *   - every inferred role carries a confidence, so the UI can show which ones
 *     were guessed and invite a correction rather than presenting them as fact.
 */

import type {
  AnalysisSpec,
  ColumnRole,
  DesignDeclaration,
  TestKind,
  VariableRole,
} from "@/lib/data-analysis/spec/analysis-spec"
import type { Table } from "@/lib/data-analysis/engine/resolver"

/* ── Column profiles ───────────────────────────────────────────────────────*/

export type ColumnType = "numeric" | "categorical" | "identifier" | "datetime" | "empty"

export interface ColumnProfile {
  column: string
  type: ColumnType
  /** Distinct non-null values. */
  cardinality: number
  /** Distinct values, capped, used for level lists and 2x2 detection. */
  levels: string[]
  count: number
  missing: number
  /** Unit parsed out of the header, e.g. "Viability (%)" → "%". */
  unit: string | null
  /** True when every non-null value is distinct: a key, not a variable. */
  unique: boolean
  numeric: { min: number; max: number; allIntegers: boolean; allPositive: boolean } | null
}

const MAX_LEVELS = 64

/** Units live in the header far more reliably than in the cells. */
function parseUnit(header: string): string | null {
  const match = header.match(/[([]\s*([^)\]]{1,24})\s*[)\]]\s*$/)
  if (!match) return null
  const unit = match[1].trim()
  // "(n = 8)" and "(mean)" annotate the column; they do not give it a unit.
  // The `n =` branch is matched without a trailing word boundary: `\b` cannot
  // match between "=" and a space, so anchoring it there never fires.
  if (!unit) return null
  if (/^\d+$/.test(unit)) return null
  if (/^n\s*=/i.test(unit)) return null
  if (/\b(mean|median|average|avg|sd|sem|ci|range|iqr|total|sum)\b/i.test(unit)) return null
  return unit
}

/** The header with any trailing unit removed, for name matching. */
function bareName(header: string): string {
  return header.replace(/[([][^)\]]*[)\]]\s*$/, "").trim().toLowerCase()
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""))
  return Number.isFinite(n) ? n : null
}

export function profileColumn(column: string, values: (number | string | null)[]): ColumnProfile {
  const present = values.filter((v) => v !== null && v !== undefined && v !== "")
  const distinct = new Set(present.map((v) => String(v)))
  const levels = [...distinct].slice(0, MAX_LEVELS)
  const numbers = present.map(toNumber).filter((n): n is number => n !== null)
  const numericShare = present.length === 0 ? 0 : numbers.length / present.length

  const base = {
    column,
    cardinality: distinct.size,
    levels,
    count: present.length,
    missing: values.length - present.length,
    unit: parseUnit(column),
    unique: present.length > 1 && distinct.size === present.length,
  }

  if (present.length === 0) {
    return { ...base, type: "empty", numeric: null }
  }

  // A column of dates is not a measurement even though it may parse as one.
  const name = bareName(column)
  if (/\b(date|timestamp|datetime|collected|run\s*date)\b/.test(name)) {
    return { ...base, type: "datetime", numeric: null }
  }

  if (numericShare >= 0.8) {
    const numericSummary = {
      min: Math.min(...numbers),
      max: Math.max(...numbers),
      allIntegers: numbers.every((n) => Number.isInteger(n)),
      allPositive: numbers.every((n) => n > 0),
    }
    // A numeric column is only an index if it really looks like one. "All
    // values distinct" is far too weak on its own: readings, counts and
    // measurements are routinely all-distinct integers, and classifying those
    // as identifiers silently drops the response column from the analysis. So
    // require either an id-shaped name or a contiguous run covering 0..n-1 or
    // 1..n, which is what a row number actually looks like.
    const idName = /\b(id|ids|no|num|number|index|idx|#|key|uid|serial)\b/.test(name)
    const contiguous =
      base.unique &&
      numericSummary.allIntegers &&
      numbers.length > 4 &&
      numericSummary.max - numericSummary.min === numbers.length - 1 &&
      (numericSummary.min === 0 || numericSummary.min === 1)
    if ((idName && base.unique) || contiguous) {
      return { ...base, type: "identifier", numeric: numericSummary }
    }
    return { ...base, type: "numeric", numeric: numericSummary }
  }

  if (base.unique) return { ...base, type: "identifier", numeric: null }
  return { ...base, type: "categorical", numeric: null }
}

export function profileTable(table: Table): ColumnProfile[] {
  return table.columns.map((column) =>
    profileColumn(
      column,
      table.rows.map((r) => r.values[column] ?? null)
    )
  )
}

/* ── Role inference ────────────────────────────────────────────────────────*/

/**
 * Header patterns, most specific first.
 *
 * Names are the strongest signal available and bench headers are remarkably
 * conventional, so a name match outranks structure. Structure then breaks ties
 * and catches the sheets whose headers say nothing ("Col1", "A", "value").
 */
const NAME_PATTERNS: { role: VariableRole; pattern: RegExp; confidence: number }[] = [
  { role: "subject", pattern: /\b(subject|participant|patient|animal|mouse|mice|rat|donor|cage|litter|cell\s*line|clone|isolate)(\s*(id|no|number|#))?\b/, confidence: 0.9 },
  { role: "time", pattern: /\b(time|timepoint|time\s*point|day|days|hour|hours|hr|hrs|week|weeks|minute|min|passage|cycle|visit)\b/, confidence: 0.88 },
  { role: "replicate", pattern: /\b(replicate|rep|technical\s*rep|biological\s*rep|run|batch)\b/, confidence: 0.82 },
  { role: "treatment", pattern: /\b(treatment|treated|drug|compound|dose|concentration|conc|stimulus|agonist|inhibitor|vehicle|condition)\b/, confidence: 0.88 },
  { role: "group", pattern: /\b(group|cohort|arm|genotype|strain|category|class|type|sex|gender|status)\b/, confidence: 0.86 },
  { role: "response", pattern: /\b(viability|response|signal|absorbance|abs|od|readout|intensity|fluorescence|luminescence|rlu|mfi|expression|count|counts|value|measurement|result|yield|titre|titer|score|weight|area|length|survival\s*time|duration)\b/, confidence: 0.8 },
]

/** Columns that are bookkeeping, not variables. */
const IGNORE_PATTERN = /\b(well|position|row|column|col|index|note|notes|comment|comments|operator|file|plate\s*id|barcode)\b/

export interface InferredRole extends ColumnRole {
  /** Why this role was chosen, in plain language, for the roles panel. */
  rationale: string
}

/**
 * Does every value of `key` appear exactly once within every level of `factor`?
 *
 * That is the structural fingerprint of a subject measured under each
 * condition, and it is what separates a repeated-measures design from a
 * between-subjects one with a coincidentally repeating id.
 */
function crossesFactor(table: Table, key: string, factor: string): boolean {
  const seen = new Map<string, Set<string>>()
  for (const row of table.rows) {
    const k = row.values[key]
    const f = row.values[factor]
    if (k === null || k === undefined || f === null || f === undefined) return false
    const set = seen.get(String(k)) ?? new Set<string>()
    if (set.has(String(f))) return false // duplicated cell: not a clean crossing
    set.add(String(f))
    seen.set(String(k), set)
  }
  if (seen.size < 2) return false
  const levels = new Set(table.rows.map((r) => String(r.values[factor])))
  if (levels.size < 2) return false
  return [...seen.values()].every((set) => set.size === levels.size)
}

export function inferRoles(table: Table, existing: ColumnRole[] = []): InferredRole[] {
  const profiles = profileTable(table)
  // §6.2: a role the record or the user set is never re-guessed.
  const locked = new Map(
    existing.filter((r) => r.source !== "inferred").map((r) => [r.column, r])
  )

  const out: InferredRole[] = []
  const claimed = new Set<VariableRole>()

  for (const profile of profiles) {
    const lockedRole = locked.get(profile.column)
    if (lockedRole) {
      out.push({ ...lockedRole, rationale: lockedRole.source === "user" ? "Set by you." : "From the experiment record." })
      continue
    }

    const name = bareName(profile.column)
    let role: VariableRole = "ignore"
    let confidence = 0.3
    let rationale = "No signal in the name or the values; left out of the analysis."

    if (profile.type === "empty") {
      rationale = "Column is empty."
    } else if (IGNORE_PATTERN.test(name) && profile.type !== "numeric") {
      role = "ignore"
      confidence = 0.75
      rationale = "Looks like a position or bookkeeping column rather than a variable."
    } else {
      const named = NAME_PATTERNS.find((p) => p.pattern.test(name))
      // A factor has levels; a measurement has values. "Treated OD600" matches
      // the treatment pattern on its name alone, but it is eight distinct
      // readings, not eight treatments, and taking it as the factor puts the
      // measurements on the x axis. So a name match for a factor role is
      // refused when the column is numeric with every value distinct, which is
      // what a measurement looks like and what a real dose column never does.
      // `time` is deliberately absent: a timecourse in wide format has exactly
      // one row per timepoint, so a unique numeric time column is the normal
      // case rather than a misclassification.
      const FACTOR_ROLES: VariableRole[] = ["treatment", "group", "replicate", "subject"]
      const measurementShaped = profile.type === "numeric" && profile.unique
      const nameFits =
        named !== undefined &&
        !(named.role === "response" && profile.type !== "numeric") &&
        !(FACTOR_ROLES.includes(named.role) && measurementShaped)
      if (named && nameFits) {
        role = named.role
        confidence = named.confidence
        rationale = `The name "${profile.column}" matches a ${named.role} column.`
      } else if (profile.type === "numeric") {
        role = "response"
        confidence = 0.55
        rationale = "Numeric measurements with no other role indicated."
      } else if (profile.type === "identifier") {
        role = "ignore"
        confidence = 0.6
        rationale = "Every value is distinct, so this identifies rows rather than describing them."
      } else if (profile.type === "categorical" && profile.cardinality >= 2 && profile.cardinality <= 12) {
        role = claimed.has("group") ? "treatment" : "group"
        confidence = 0.6
        rationale = `${profile.cardinality} repeating labels, which is the shape of a grouping column.`
      } else if (profile.type === "categorical") {
        role = "ignore"
        confidence = 0.5
        rationale = `${profile.cardinality} distinct labels is too many to group by.`
      }
    }

    // Structure can promote an id column to `subject`: if its values recur once
    // per level of a grouping column, it is tracking something across
    // conditions, which is exactly what a subject does.
    if ((role === "ignore" || role === "group") && profile.cardinality > 1) {
      const factors = profiles.filter(
        (p) => p.column !== profile.column && p.type === "categorical" && p.cardinality >= 2 && p.cardinality <= 12
      )
      if (factors.some((f) => crossesFactor(table, profile.column, f.column))) {
        role = "subject"
        confidence = 0.72
        rationale = "Each value appears once in every condition, so it tracks a subject across them."
      }
    }

    claimed.add(role)
    out.push({
      column: profile.column,
      role,
      unit: profile.unit,
      source: "inferred",
      confidence: Number(confidence.toFixed(2)),
      rationale,
    })
  }

  return out
}

/* ── Design detection ──────────────────────────────────────────────────────*/

export interface InferredDesign extends DesignDeclaration {
  rationale: string
}

export function inferDesign(
  table: Table,
  roles: ColumnRole[],
  existing?: DesignDeclaration
): InferredDesign {
  if (existing && existing.source !== "inferred") {
    return {
      ...existing,
      rationale: existing.source === "user" ? "Set by you." : "From the experiment record.",
    }
  }

  const subject = roles.find((r) => r.role === "subject")?.column ?? null
  const factor =
    roles.find((r) => r.role === "treatment")?.column ??
    roles.find((r) => r.role === "group")?.column ??
    roles.find((r) => r.role === "time")?.column ??
    null

  const base: DesignDeclaration = {
    paired: false,
    repeatedMeasures: false,
    subjectColumn: subject,
    nesting: [],
    replicateType: "unknown",
    source: "inferred",
    recordMismatch: null,
  }

  if (!subject || !factor) {
    return {
      ...base,
      rationale: subject
        ? "A subject column is present but no grouping column, so the design is read as unpaired."
        : "No column tracks a subject across conditions, so the design is read as unpaired.",
    }
  }

  const levels = new Set(
    table.rows.map((r) => String(r.values[factor] ?? "")).filter((v) => v !== "")
  ).size
  const crossed = crossesFactor(table, subject, factor)

  if (!crossed) {
    return {
      ...base,
      rationale: `"${subject}" does not appear in every level of "${factor}", so the measurements are treated as independent.`,
    }
  }

  // Two levels measured on the same subjects is paired; more than two is
  // repeated measures. The distinction picks the test, so it is not cosmetic.
  const replicate = roles.find((r) => r.role === "replicate")
  return {
    ...base,
    paired: levels === 2,
    repeatedMeasures: levels > 2,
    replicateType: replicate ? "technical" : "biological",
    rationale:
      levels === 2
        ? `Every "${subject}" appears in both levels of "${factor}", so the measurements are paired.`
        : `Every "${subject}" appears in all ${levels} levels of "${factor}", so this is a repeated-measures design.`,
  }
}

/* ── Capability matrix ─────────────────────────────────────────────────────*/

export interface TestCapability {
  test: TestKind
  legal: boolean
  /** Why not, in the researcher's terms. Present only when illegal. */
  reason?: string
  /** What would make it legal, when there is a concrete answer. */
  fix?: string
  /** The design's own answer, ranked ahead of merely legal alternatives. */
  recommended: boolean
}

/**
 * The column the comparison runs across, when the spec has not named one.
 *
 * `time` is in the list because in a before/after or a timecourse it IS the
 * within-subject factor being compared, leaving it out makes a correctly
 * detected paired design report that it has no groups to pair.
 *
 * Exported so the capability matrix, the resolver's callers and the UI all
 * agree on what "the grouping column" means when nobody has said.
 */
export function defaultGroupColumn(roles: readonly ColumnRole[]): string | null {
  const order: VariableRole[] = ["treatment", "group", "time"]
  for (const role of order) {
    const found = roles.find((r) => r.role === role)
    if (found) return found.column
  }
  return null
}

interface Shape {
  responses: string[]
  groupLevels: number
  /**
   * Observations in the smallest group.
   *
   * A comparison test needs at least two per group to have any spread to
   * compare. Without this the matrix happily recommends a one-way ANOVA over a
   * wide-format sheet, where the "groups" are eight timepoints with one
   * reading each, and the resolver then refuses it, which is the offer-then-
   * refuse the matrix exists to prevent.
   */
  minGroupSize: number
  hasSubject: boolean
  paired: boolean
  repeatedMeasures: boolean
  secondFactor: boolean
  numericColumns: number
  /** Categorical columns that describe rows; subjects and ids are excluded. */
  categoricalColumns: number
}

function readShape(spec: AnalysisSpec, table: Table, profiles: ColumnProfile[]): Shape {
  const roleOf = new Map(spec.roles.map((r) => [r.column, r.role]))
  const groupColumn = spec.analysis.groupColumn ?? defaultGroupColumn(spec.roles)

  const response =
    spec.analysis.responseColumns[0] ?? spec.roles.find((r) => r.role === "response")?.column ?? null

  const counts = new Map<string, number>()
  if (groupColumn) {
    for (const row of table.rows) {
      const level = String(row.values[groupColumn] ?? "")
      if (level === "") continue
      // Only rows carrying a usable response count; a level present in the
      // grouping column but blank in the response contributes nothing.
      if (response !== null) {
        const raw = row.values[response]
        const n = typeof raw === "number" ? raw : Number(raw)
        if (raw === null || raw === "" || !Number.isFinite(n)) continue
      }
      counts.set(level, (counts.get(level) ?? 0) + 1)
    }
  }
  const levels = counts.size
  const minGroupSize = levels === 0 ? 0 : Math.min(...counts.values())

  // Factors, for the two-way check: the columns that could carry a main effect.
  const factorRoles: VariableRole[] = ["treatment", "group", "time"]
  const factors = spec.roles.filter((r) => factorRoles.includes(r.role))

  return {
    responses:
      spec.analysis.responseColumns.length > 0
        ? spec.analysis.responseColumns
        : spec.roles.filter((r) => r.role === "response").map((r) => r.column),
    groupLevels: levels,
    minGroupSize,
    hasSubject: Boolean(spec.design.subjectColumn ?? spec.roles.find((r) => r.role === "subject")),
    paired: spec.design.paired,
    repeatedMeasures: spec.design.repeatedMeasures,
    secondFactor: Boolean(spec.analysis.secondFactorColumn) || factors.length > 1,
    numericColumns: profiles.filter((p) => p.type === "numeric").length,
    // A subject id repeats, so it profiles as categorical, but cross-tabulating
    // subjects against a condition is not a contingency table, it is the
    // design. Only columns that describe a row count here.
    categoricalColumns: profiles.filter((p) => {
      if (p.type !== "categorical") return false
      const role = roleOf.get(p.column)
      return role !== "subject" && role !== "replicate" && role !== "ignore"
    }).length,
  }
}

/**
 * Which tests this data and design can actually support.
 *
 * The UI uses it so the test menu never offers something the resolver will
 * refuse, an option that produces "this cannot be computed" when chosen is
 * worse than no option, because the user has to discover the constraint by
 * hitting it. The AI seam uses the same function, which is what stops the model
 * proposing a paired t-test on data with no subject column.
 *
 * The rules here MUST agree with the resolver's preconditions. They are stated
 * separately because the resolver answers "can I run this now" and this answers
 * "should this be offered at all", but a disagreement between them is a bug.
 */
export function legalTests(spec: AnalysisSpec, table: Table): TestCapability[] {
  const profiles = profileTable(table)
  const s = readShape(spec, table, profiles)
  const hasResponse = s.responses.length > 0
  const out: TestCapability[] = []

  const add = (
    test: TestKind,
    legal: boolean,
    reason?: string,
    fix?: string,
    recommended = false
  ) => out.push({ test, legal, reason, fix, recommended: legal && recommended })

  const noResponse = "No numeric response column is identified."
  const fixResponse = "Set a column's role to Response."

  add("descriptives", hasResponse, hasResponse ? undefined : noResponse, fixResponse)
  add("normality", hasResponse, hasResponse ? undefined : noResponse, fixResponse)

  add(
    "t-one-sample",
    hasResponse && s.groupLevels <= 1,
    !hasResponse ? noResponse : s.groupLevels > 1 ? "The data has more than one group, so a one-sample test would ignore the comparison." : undefined,
    s.groupLevels > 1 ? "Compare the groups instead, or filter to one." : fixResponse
  )

  // Every comparison test needs replication. A sheet in wide format has one
  // reading per level, which is a shape no group comparison can describe.
  const replicated = s.minGroupSize >= 2
  const thinReason =
    `Each group has only ${s.minGroupSize} value; comparing groups needs at least 2 in each.`
  const thinFix = "Add replicates, or reshape the sheet so each replicate is its own row."

  const twoGroups = hasResponse && s.groupLevels === 2 && replicated
  const twoGroupReason = !hasResponse
    ? noResponse
    : s.groupLevels === 0
      ? "No grouping column is identified."
      : s.groupLevels !== 2
        ? `A two-group test needs exactly 2 groups; this data has ${s.groupLevels}.`
        : thinReason

  add("t-unpaired", twoGroups && !s.paired, twoGroups && s.paired ? "The design is paired, so an unpaired test would discard the pairing." : twoGroups ? undefined : twoGroupReason, "Use a paired t-test.")
  add("t-welch", twoGroups && !s.paired, twoGroups && s.paired ? "The design is paired." : twoGroups ? undefined : twoGroupReason, !replicated ? thinFix : "Use a paired t-test.", twoGroups && !s.paired)
  add("mann-whitney", twoGroups && !s.paired, twoGroups && s.paired ? "The design is paired." : twoGroups ? undefined : twoGroupReason, "Use a Wilcoxon signed-rank test.")

  const paired = twoGroups && s.paired && s.hasSubject
  const pairedReason = !twoGroups
    ? twoGroupReason
    : !s.hasSubject
      ? "A paired test needs a column identifying the subject measured in both conditions."
      : "The design is not marked as paired."
  add("t-paired", paired, paired ? undefined : pairedReason, "Set a Subject column and mark the design paired.", paired)
  add("wilcoxon-signed-rank", paired, paired ? undefined : pairedReason, "Set a Subject column and mark the design paired.")

  const manyGroups = hasResponse && s.groupLevels >= 3 && replicated
  const manyReason = !hasResponse
    ? noResponse
    : s.groupLevels < 3
      ? `A test across groups needs at least 3; this data has ${s.groupLevels}.`
      : thinReason
  add("anova-one-way", manyGroups && !s.repeatedMeasures, manyGroups && s.repeatedMeasures ? "The design is repeated measures, so a one-way ANOVA would ignore the within-subject structure." : manyGroups ? undefined : manyReason, !replicated ? thinFix : "Use a repeated-measures ANOVA.", manyGroups && !s.repeatedMeasures)
  add("kruskal-wallis", manyGroups && !s.repeatedMeasures, manyGroups && s.repeatedMeasures ? "The design is repeated measures." : manyGroups ? undefined : manyReason, "Use a Friedman test.")

  const rm = manyGroups && s.repeatedMeasures && s.hasSubject
  const rmReason = !manyGroups
    ? manyReason
    : !s.hasSubject
      ? "A repeated-measures test needs a column identifying the subject."
      : "The design is not marked as repeated measures."
  add("anova-rm", rm, rm ? undefined : rmReason, "Set a Subject column and mark the design repeated measures.", rm)
  add("friedman", rm, rm ? undefined : rmReason, "Set a Subject column and mark the design repeated measures.")

  add(
    "anova-two-way",
    hasResponse && s.secondFactor,
    !hasResponse ? noResponse : "Only one factor is identified.",
    "Give a second column the role Group or Treatment."
  )
  add(
    "mixed-effects",
    hasResponse && s.hasSubject && s.groupLevels >= 2,
    !hasResponse ? noResponse : !s.hasSubject ? "A mixed-effects model needs a subject column for the random effect." : "No grouping column is identified.",
    "Set a Subject column."
  )

  const twoCategorical = s.categoricalColumns >= 2
  add("chi-square", twoCategorical, twoCategorical ? undefined : "A contingency test needs two categorical columns.", "Identify two columns of labels.")
  add("fisher-exact", twoCategorical, twoCategorical ? undefined : "A contingency test needs two categorical columns.", "Identify two columns of labels.")

  const twoNumeric = s.numericColumns >= 2
  const numericReason = `A relationship needs two numeric columns; this data has ${s.numericColumns}.`
  add("correlation-pearson", twoNumeric, twoNumeric ? undefined : numericReason)
  add("correlation-spearman", twoNumeric, twoNumeric ? undefined : numericReason)
  add("linear-regression", twoNumeric, twoNumeric ? undefined : numericReason)

  // A dose-response fit wants a concentration-like predictor spanning orders of
  // magnitude; two arbitrary numeric columns are not enough to recommend it.
  const doseColumn = profiles.find(
    (p) =>
      p.type === "numeric" &&
      p.numeric !== null &&
      p.numeric.allPositive &&
      /\b(dose|conc|concentration|dilution|agonist|inhibitor|standard)\b/.test(bareName(p.column))
  )
  add(
    "nonlinear-regression",
    twoNumeric,
    twoNumeric ? undefined : numericReason,
    undefined,
    Boolean(doseColumn)
  )

  const duration = profiles.find((p) => p.type === "numeric" && /\b(time|duration|survival|days|follow.?up)\b/.test(bareName(p.column)))
  const event = profiles.find(
    (p) =>
      /\b(event|status|death|died|censor|censored|failed)\b/.test(bareName(p.column)) ||
      (p.numeric?.allIntegers === true && p.cardinality === 2)
  )
  const survivalOk = Boolean(duration && event)
  add(
    "kaplan-meier",
    survivalOk,
    survivalOk ? undefined : "A survival analysis needs a duration column and an event/censoring column.",
    "Identify a time-to-event column and a 0/1 event column.",
    survivalOk
  )

  return out
}

/** Convenience: the tests that can be offered, best answer first. */
export function offerableTests(spec: AnalysisSpec, table: Table): TestCapability[] {
  return legalTests(spec, table)
    .filter((c) => c.legal)
    .sort((a, b) => Number(b.recommended) - Number(a.recommended))
}
