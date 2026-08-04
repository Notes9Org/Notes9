import type { AnalysisSpec, Transform } from "@/lib/data-analysis/spec/analysis-spec"

/**
 * The resolver: AnalysisSpec + snapshot table → EnginePayload.
 *
 * This is the boundary the whole architecture rests on. Above it, a language
 * model chooses SEMANTICS — which column is the response, whether the design is
 * paired, which test answers the question. Below it, nothing is model-authored:
 * this file shapes the arrays, and Python computes the numbers.
 *
 * It is pure TypeScript and runs before the worker boots, so a precondition
 * failure is instant rather than arriving after a 20MB runtime download. It also
 * keeps the Python surface small: the engine receives clean arrays and never
 * parses, filters, or guesses.
 *
 * Ordered pipeline (the order matters; these steps do not commute):
 *   filter → transform → collapse replicates → partition exclusions →
 *   coerce/drop → shape for the test → check preconditions → attach row ids
 */

/* ── Input table ───────────────────────────────────────────────────────────*/

export interface TableRow {
  /** Stable identity, carried all the way to a Plotly mark. */
  rowId: string
  values: Record<string, number | string | null>
}

export interface Table {
  columns: string[]
  rows: TableRow[]
}

/* ── Output payloads, one per test family (Part 6 contract) ────────────────*/

interface PayloadBase {
  test: AnalysisSpec["analysis"]["test"]
  alpha: number
  tails: "two" | "greater" | "less"
  /** Row ids in emission order, so results can be hit-tested back to the sheet. */
  rowIds: string[]
  /** Every row post-transform, for the figure — including excluded ones. */
  plotRows: { rowId: string; values: Record<string, number | string | null>; excluded: boolean }[]
}

export type EnginePayload = PayloadBase &
  (
    | { shape: "columns"; columns: Record<string, (number | null)[]> }
    | { shape: "groups"; groups: Record<string, number[]>; referenceLevel: string | null; postHoc: string; equalVariance: boolean }
    | { shape: "pairs"; pairs: [number, number][]; labels: [string, string] }
    | { shape: "matrix"; matrix: number[][]; subjects: string[]; conditions: string[] }
    | { shape: "long"; long: { y: number; f1: string; f2?: string; subject?: string }[]; interaction: boolean }
    | { shape: "xy"; x: number[]; y: number[]; forceIntercept: boolean }
    | { shape: "contingency"; table: number[][]; rowLevels: string[]; colLevels: string[] }
    | { shape: "curve"; x: number[]; y: number[]; model: string; weighting: string; sharedParameters: string[]; confidenceBands: boolean; unknowns: { label: string; signal: number }[] }
    | { shape: "survival"; durations: number[]; events: number[]; groups: string[] | null }
  )

/* ── Outcome ───────────────────────────────────────────────────────────────*/

export interface PreconditionFailure {
  code: string
  /** Plain language, shown to the researcher. Never a stack trace. */
  message: string
  /** What would make it work, when there is a concrete answer. */
  fix?: string
}

export interface ClarificationNeeded {
  question: string
  /** Candidate answers, when the ambiguity is a choice between known options. */
  options?: string[]
}

export type ResolveOutcome =
  | { ok: true; payload: EnginePayload; warnings: string[] }
  | { ok: false; blocked: PreconditionFailure[] }
  | { ok: false; question: ClarificationNeeded }

/* ── Helpers ───────────────────────────────────────────────────────────────*/

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function toLabel(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—"
  return String(v)
}

function matches(value: unknown, op: string, target: unknown): boolean {
  const n = toNumber(value)
  const t = toNumber(target)
  switch (op) {
    case "eq": return String(value) === String(target)
    case "neq": return String(value) !== String(target)
    case "lt": return n !== null && t !== null && n < t
    case "lte": return n !== null && t !== null && n <= t
    case "gt": return n !== null && t !== null && n > t
    case "gte": return n !== null && t !== null && n >= t
    case "in": return Array.isArray(target) && target.map(String).includes(String(value))
    case "notIn": return Array.isArray(target) && !target.map(String).includes(String(value))
    case "contains": return String(value).toLowerCase().includes(String(target).toLowerCase())
    case "isNull": return value === null || value === undefined || value === ""
    case "notNull": return !(value === null || value === undefined || value === "")
    default: return true
  }
}

/** Middle value; the mean of the two middle values on an even count. */
function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * The mean of `column` over the rows belonging to a named LEVEL.
 *
 * Two transforms reference a level rather than a column — `foldChange.baseline`
 * and `baselineSubtract.blankGroup` — and, unlike `normaliseToControl`, neither
 * carries the column that level lives in. So the column is resolved from the
 * spec, in declaration order, and never guessed:
 *
 *   1. `analysis.groupColumn`, the declared condition column;
 *   2. a column the semantic layer (L2) tagged `group` or `treatment`;
 *   3. failing both, the one and only column in which the level appears.
 *
 * If no column holds the level — or several do and none was declared — this
 * blocks. Averaging every row instead produces a grand mean and presents it as
 * a baseline: a number wrong by exactly the treatment effect, and one that
 * looks entirely plausible on the way out.
 */
function resolveReference(
  rows: TableRow[],
  spec: AnalysisSpec,
  level: string,
  column: string
): { ok: true; value: number } | { ok: false; blocked: PreconditionFailure } {
  const holds = (c: string) => rows.some((r) => toLabel(r.values[c]) === level)
  const declared = [
    spec.analysis.groupColumn,
    ...spec.roles.filter((r) => r.role === "group" || r.role === "treatment").map((r) => r.column),
  ].filter((c): c is string => c !== null)

  let found = declared.find(holds) ?? null
  if (found === null) {
    const anywhere = [...new Set(rows.flatMap((r) => Object.keys(r.values)))].filter(holds)
    if (anywhere.length > 1) {
      return {
        ok: false,
        blocked: {
          code: "ambiguous-level",
          message: `"${level}" appears in more than one column (${anywhere.join(", ")}), so which one holds the reference group is not decidable.`,
          fix: "Set the grouping column to the one that holds it.",
        },
      }
    }
    found = anywhere[0] ?? null
  }
  if (found === null) {
    return {
      ok: false,
      blocked: {
        code: "level-not-found",
        message: `No group named "${level}" was found in the data.`,
        fix: "Name the reference group exactly as it appears in the condition column.",
      },
    }
  }

  const levelColumn = found
  const vals = rows
    .filter((r) => toLabel(r.values[levelColumn]) === level)
    .map((r) => toNumber(r.values[column]))
    .filter((v): v is number => v !== null)
  if (vals.length === 0) {
    return {
      ok: false,
      blocked: {
        code: "empty-reference",
        message: `The "${level}" rows carry no usable ${column} value, so there is nothing to reference against.`,
        fix: `Check that ${column} is filled in for the ${level} rows.`,
      },
    }
  }
  return { ok: true, value: vals.reduce((a, b) => a + b, 0) / vals.length }
}

/**
 * `analysis.missingValues`, applied.
 *
 * The provenance card and the exported results sheet both print this setting as
 * though it governed the computation, so it has to. It bites only on the numeric
 * columns the chosen test consumes — a categorical exposure has no missing
 * *value* to impute — and every strategy states what it did, because a filled
 * hole a reader cannot see is the same failure as a wrong baseline:
 *
 *   listwise  drop the whole row when any consumed column is missing, so a
 *             column that WAS present is dropped along with it. This was the
 *             de-facto behaviour before, unstated and uncounted.
 *   pairwise  keep every row; each statistic uses the rows where its own
 *             variables are present — what the shaping below already does.
 *   *-impute  fill the holes with the column's mean/median over the rows that
 *             have one.
 *   leave     touch nothing; the engine omits non-finite values, because there
 *             is no finite arithmetic that includes them.
 */
function applyMissingValues(rows: TableRow[], spec: AnalysisSpec, warnings: string[]): TableRow[] {
  const declared = spec.analysis.responseColumns
  const pool = declared.length ? declared : [...new Set(rows.flatMap((r) => Object.keys(r.values)))]
  const cols = pool.filter((c) => rows.some((r) => toNumber(r.values[c]) !== null))
  const holes = rows.reduce((n, r) => n + cols.filter((c) => toNumber(r.values[c]) === null).length, 0)
  if (holes === 0) return rows
  const missing = `${holes} missing value${holes === 1 ? "" : "s"}`

  switch (spec.analysis.missingValues) {
    case "listwise": {
      const kept = rows.filter((r) => cols.every((c) => toNumber(r.values[c]) !== null))
      const dropped = rows.length - kept.length
      warnings.push(
        `${dropped} row${dropped === 1 ? "" : "s"} dropped whole: a value was missing in ${cols.join(", ")} (listwise deletion).`
      )
      return kept
    }
    case "mean-impute":
    case "median-impute": {
      const useMean = spec.analysis.missingValues === "mean-impute"
      const fill = new Map<string, number>()
      for (const c of cols) {
        const vals = rows.map((r) => toNumber(r.values[c])).filter((v): v is number => v !== null)
        if (vals.length === 0) continue
        fill.set(c, useMean ? vals.reduce((a, b) => a + b, 0) / vals.length : median([...vals].sort((a, b) => a - b)))
      }
      warnings.push(
        `${missing} filled with the column ${useMean ? "mean" : "median"}; n is unchanged but the spread is narrower than the measured data.`
      )
      return rows.map((r) => {
        const values = { ...r.values }
        for (const c of cols) {
          const f = fill.get(c)
          if (f !== undefined && toNumber(values[c]) === null) values[c] = f
        }
        return { ...r, values }
      })
    }
    case "pairwise":
      warnings.push(`${missing} kept in place; each comparison uses the rows where its own variables are present.`)
      return rows
    case "leave":
      warnings.push(`${missing} left as-is; they are omitted from the computation.`)
      return rows
  }
}

/**
 * Transforms applied in array order — blank-subtract-then-log ≠ log-then-blank-subtract.
 *
 * `reference` is the level mean the caller resolved for the two transforms that
 * name a level (see `resolveReference`); null for every other kind.
 */
function applyTransform(rows: TableRow[], t: Transform, reference: number | null): TableRow[] {
  const num = (r: TableRow, c: string) => toNumber(r.values[c])

  switch (t.kind) {
    case "log10":
    case "ln": {
      const f = t.kind === "log10" ? Math.log10 : Math.log
      return rows.map((r) => {
        const v = num(r, t.column)
        return { ...r, values: { ...r.values, [t.column]: v !== null && v > 0 ? f(v) : null } }
      })
    }
    case "zscore": {
      const vals = rows.map((r) => num(r, t.column)).filter((v): v is number => v !== null)
      const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1)
      const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(vals.length - 1, 1))
      return rows.map((r) => {
        const v = num(r, t.column)
        return { ...r, values: { ...r.values, [t.column]: v !== null && sd > 0 ? (v - mean) / sd : null } }
      })
    }
    case "percent": {
      const denom = rows.map((r) => num(r, t.of)).filter((v): v is number => v !== null)
      const total = denom.reduce((a, b) => a + b, 0)
      return rows.map((r) => {
        const v = num(r, t.column)
        return { ...r, values: { ...r.values, [t.column]: v !== null && total !== 0 ? (v / total) * 100 : null } }
      })
    }
    case "foldChange": {
      // `t.baseline` is a LEVEL, not a column: the divisor is the mean of the
      // baseline group, resolved by the caller against the condition column. A
      // fold-change taken against the whole table's mean is not a fold-change —
      // it divides the effect into itself and lands everything near 1.
      // A baseline that read zero yields null, not Infinity.
      return rows.map((r) => {
        const v = num(r, t.column)
        return { ...r, values: { ...r.values, [t.column]: v !== null && reference ? v / reference : null } }
      })
    }
    case "normalise": {
      const vals = rows.map((r) => num(r, t.column)).filter((v): v is number => v !== null)
      const lo = Math.min(...vals)
      const hi = Math.max(...vals)
      const span = hi - lo
      return rows.map((r) => {
        const v = num(r, t.column)
        const scaled = v !== null && span > 0 ? t.min + ((v - lo) / span) * (t.max - t.min) : null
        return { ...r, values: { ...r.values, [t.column]: scaled } }
      })
    }
    case "normaliseToControl": {
      // "% of vehicle, per plate". The control mean is taken WITHIN each `per`
      // bucket: normalising to an on-plate control exists to remove plate-to-plate
      // signal drift, and one global control mean folds that drift back in.
      const bucketOf = (r: TableRow) => t.per.map((c) => toLabel(r.values[c])).join("␟")
      const controls = new Map<string, number[]>()
      for (const r of rows) {
        if (toLabel(r.values[t.groupColumn]) !== t.controlLevel) continue
        const v = num(r, t.column)
        if (v === null) continue
        const key = bucketOf(r)
        const list = controls.get(key) ?? []
        list.push(v)
        controls.set(key, list)
      }
      const scale = t.as === "percent" ? 100 : 1
      return rows.map((r) => {
        const ctrl = controls.get(bucketOf(r))
        const mean = ctrl?.length ? ctrl.reduce((a, b) => a + b, 0) / ctrl.length : null
        const v = num(r, t.column)
        // A bucket with no control — or a control that read zero — yields null,
        // not a number. A missing reference is not a reference of zero, and a
        // plate quietly normalised against nothing is the error worth blocking.
        const scaled = v !== null && mean !== null && mean !== 0 ? (v / mean) * scale : null
        return { ...r, values: { ...r.values, [t.column]: scaled } }
      })
    }
    case "pivotLonger": {
      // The only transform that changes the row count and the column set. Row
      // ids are extended rather than reused so a folded point is still
      // hit-testable back to the cell it came from; as with collapseReplicates,
      // exclusions recorded against the pre-fold ids no longer match, which is
      // why a reshape belongs at the front of the transform list.
      const carried = Object.keys(rows[0]?.values ?? {}).filter((c) => !t.columns.includes(c))
      return rows.flatMap((r) =>
        t.columns.map((c) => {
          const values: Record<string, number | string | null> = {}
          for (const k of carried) values[k] = r.values[k]
          values[t.namesTo] = c
          values[t.valuesTo] = r.values[c] ?? null
          return { rowId: `${r.rowId}␟${c}`, values }
        })
      )
    }
    case "baselineSubtract": {
      // An explicit `blankValue` wins. Otherwise `t.blankGroup` is a LEVEL —
      // the wells labelled "Blank" — and the subtrahend is that level's mean,
      // resolved by the caller. Neither present means there is nothing to
      // subtract, which is a no-op rather than a subtraction of the whole plate.
      const b = t.blankValue ?? reference ?? 0
      return rows.map((r) => {
        const v = num(r, t.column)
        return { ...r, values: { ...r.values, [t.column]: v !== null ? v - b : null } }
      })
    }
    case "collapseReplicates": {
      // Grouped by the declared keys; the raw rows are retained upstream on the
      // spec, so this is non-destructive from the researcher's point of view.
      const buckets = new Map<string, TableRow[]>()
      for (const r of rows) {
        const key = t.by.map((c) => toLabel(r.values[c])).join("␟")
        const list = buckets.get(key) ?? []
        list.push(r)
        buckets.set(key, list)
      }
      const numericCols = Object.keys(rows[0]?.values ?? {}).filter((c) =>
        rows.some((r) => toNumber(r.values[c]) !== null)
      )
      return [...buckets.values()].map((group) => {
        const first = group[0]
        const values: Record<string, number | string | null> = { ...first.values }
        for (const c of numericCols) {
          const vals = group.map((r) => toNumber(r.values[c])).filter((v): v is number => v !== null)
          if (vals.length === 0) continue
          values[c] =
            t.statistic === "median"
              ? [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)]
              : vals.reduce((a, b) => a + b, 0) / vals.length
        }
        return { rowId: group.map((r) => r.rowId).join("+"), values }
      })
    }
    case "calculatedColumn":
      // Formula evaluation belongs to the sheet, not here: the spreadsheet
      // already owns it and duplicating an expression evaluator would create a
      // second, divergent source of truth.
      return rows
  }
}

/* ── The resolver ──────────────────────────────────────────────────────────*/

export function resolvePayload(spec: AnalysisSpec, table: Table): ResolveOutcome {
  const warnings: string[] = []
  const blocked: PreconditionFailure[] = []
  const test = spec.analysis.test

  /* 1 — filter */
  let rows = table.rows.filter((r) =>
    spec.filters.every((f) => matches(r.values[f.column], f.op, f.value))
  )
  const filteredOut = table.rows.length - rows.length
  if (filteredOut > 0) warnings.push(`${filteredOut} row${filteredOut === 1 ? "" : "s"} removed by filters.`)

  /* 2 — transform, in order. Two kinds reference a named level, which has to be
        resolved against a column before the transform can run; that happens
        here, where failing to find it can block rather than quietly widen into
        a table-wide mean. */
  for (const t of spec.transforms) {
    let reference: number | null = null
    if (t.kind === "foldChange") {
      const ref = resolveReference(rows, spec, t.baseline, t.column)
      if (!ref.ok) return { ok: false, blocked: [ref.blocked] }
      reference = ref.value
    } else if (t.kind === "baselineSubtract" && t.blankValue === null && t.blankGroup !== null) {
      const ref = resolveReference(rows, spec, t.blankGroup, t.column)
      if (!ref.ok) return { ok: false, blocked: [ref.blocked] }
      reference = ref.value
    }
    rows = applyTransform(rows, t, reference)
  }

  /* 3 — exclusions: partitioned, never dropped. Both sides are kept so the
        with/without comparison (§8.1) is always computable. */
  const excludedIds = new Set(spec.exclusions.map((e) => e.rowId))
  const plotRows = rows.map((r) => ({
    rowId: r.rowId,
    values: r.values,
    excluded: excludedIds.has(r.rowId),
  }))
  const kept = rows.filter((r) => !excludedIds.has(r.rowId))
  // Report what was APPLIED, not what the spec lists. collapseReplicates and
  // pivotLonger rewrite row ids, so an exclusion recorded before a reshape names
  // a row that no longer exists; saying "1 point excluded" while that point is
  // still inside the mean is a false statement about the one operation §8.1 asks
  // a reader to trust. Nothing enforces the ordering the transform comments
  // recommend, so the count has to be measured rather than assumed.
  const applied = rows.length - kept.length
  const orphaned = excludedIds.size - applied
  if (applied > 0) {
    warnings.push(`${applied} point${applied === 1 ? "" : "s"} excluded; the result is computed without them.`)
  }
  if (orphaned > 0) {
    warnings.push(
      `${orphaned} exclusion${orphaned === 1 ? " was" : "s were"} NOT applied: ` +
        `the row${orphaned === 1 ? " it names no longer exists" : "s they name no longer exist"} after a reshape — ` +
        `collapsing replicates or folding wide columns rewrites row ids. Re-exclude those points on the current table.`
    )
  }

  /* 3b — missing values, per the declared strategy. */
  const included = applyMissingValues(kept, spec, warnings)

  if (included.length === 0) {
    return { ok: false, blocked: [{ code: "no-rows", message: "No rows remain after filters and exclusions." }] }
  }

  const base = {
    test,
    alpha: spec.analysis.alpha,
    tails: spec.analysis.tails,
    plotRows,
  }

  const response = spec.analysis.responseColumns[0]
  const groupCol = spec.analysis.groupColumn
  const subjectCol = spec.design.subjectColumn

  /* Helper: response values grouped by the group column, in stable level order. */
  const buildGroups = () => {
    const groups = new Map<string, { values: number[]; rowIds: string[] }>()
    for (const r of included) {
      const level = toLabel(r.values[groupCol as string])
      const v = toNumber(r.values[response])
      if (v === null) continue
      const entry = groups.get(level) ?? { values: [], rowIds: [] }
      entry.values.push(v)
      entry.rowIds.push(r.rowId)
      groups.set(level, entry)
    }
    return groups
  }

  /* 4 — shape for the test */
  switch (test) {
    /**
     * No test chosen.
     *
     * Not a refusal. A timecourse, a plate map or an exploratory scatter is a
     * perfectly good analysis with nothing to test yet, and blocking it would
     * mean the figure cannot be drawn until a p-value is demanded — which is
     * the pressure toward testing-first that §8 exists to resist. The engine
     * gets the same columns `descriptives` would, so the chart has its rows and
     * the summary panel has its means, and no test is reported.
     */
    case "none":
    case "descriptives":
    case "normality": {
      // Declared columns first, then anything a transform introduced — a
      // pivotLonger's value column exists only after step 2, and summarising the
      // pre-transform column list would report "nothing numeric" about a table
      // that is entirely numeric.
      const available = [
        ...new Set([...table.columns, ...included.flatMap((r) => Object.keys(r.values))]),
      ]
      const cols = spec.analysis.responseColumns.length
        ? spec.analysis.responseColumns
        : available.filter((c) => included.some((r) => toNumber(r.values[c]) !== null))
      if (cols.length === 0) {
        blocked.push({ code: "no-numeric", message: "No numeric column to summarise.", fix: "Pick a response column." })
        break
      }
      const columns: Record<string, (number | null)[]> = {}
      for (const c of cols) columns[c] = included.map((r) => toNumber(r.values[c]))
      return {
        ok: true,
        warnings,
        payload: { ...base, shape: "columns", columns, rowIds: included.map((r) => r.rowId) },
      }
    }

    case "t-one-sample": {
      if (!response) { blocked.push(missingResponse()); break }
      const values = included.map((r) => toNumber(r.values[response])).filter((v): v is number => v !== null)
      if (values.length < 2) { blocked.push(tooFew(2, values.length)); break }
      return {
        ok: true,
        warnings,
        payload: {
          ...base,
          shape: "groups",
          groups: { sample: values },
          referenceLevel: null,
          postHoc: "none",
          equalVariance: true,
          rowIds: included.map((r) => r.rowId),
        },
      }
    }

    case "t-unpaired":
    case "t-welch":
    case "mann-whitney": {
      if (!response) { blocked.push(missingResponse()); break }
      if (!groupCol) { blocked.push(missingGroup()); break }
      const groups = buildGroups()
      const levels = [...groups.keys()]
      if (levels.length < 2) {
        blocked.push({ code: "too-few-levels", message: `"${groupCol}" has only ${levels.length} level.`, fix: "Choose a column with two groups." })
        break
      }
      if (levels.length > 2) {
        // Refusing here rather than silently picking two is the point: a t-test
        // on four groups is the canonical wrong-test error.
        return {
          ok: false,
          question: {
            question: `"${groupCol}" has ${levels.length} groups. A two-group test can only compare two of them — which pair, or should this be an ANOVA?`,
            options: [...levels],
          },
        }
      }
      const [a, b] = levels
      if (groups.get(a)!.values.length < 2 || groups.get(b)!.values.length < 2) {
        blocked.push(tooFew(2, Math.min(groups.get(a)!.values.length, groups.get(b)!.values.length)))
        break
      }
      return {
        ok: true,
        warnings,
        payload: {
          ...base,
          shape: "groups",
          groups: { [a]: groups.get(a)!.values, [b]: groups.get(b)!.values },
          referenceLevel: spec.analysis.referenceLevel,
          postHoc: "none",
          // Welch is the default; Student requires a deliberate choice.
          equalVariance: test === "t-unpaired",
          rowIds: [...groups.get(a)!.rowIds, ...groups.get(b)!.rowIds],
        },
      }
    }

    case "t-paired":
    case "wilcoxon-signed-rank": {
      if (!response) { blocked.push(missingResponse()); break }
      if (!groupCol) { blocked.push(missingGroup()); break }
      if (!subjectCol) {
        blocked.push({
          code: "no-subject",
          message: "A paired test needs to know which rows belong to the same subject.",
          fix: `Set the subject column in the design, or switch to an unpaired test.`,
        })
        break
      }
      const byLevel = new Map<string, Map<string, number>>()
      for (const r of included) {
        const level = toLabel(r.values[groupCol])
        const subject = toLabel(r.values[subjectCol])
        const v = toNumber(r.values[response])
        if (v === null) continue
        const m = byLevel.get(level) ?? new Map<string, number>()
        m.set(subject, v)
        byLevel.set(level, m)
      }
      const levels = [...byLevel.keys()]
      if (levels.length !== 2) {
        blocked.push({ code: "pair-levels", message: `A paired test needs exactly two conditions; "${groupCol}" has ${levels.length}.` })
        break
      }
      const [la, lb] = levels
      const ma = byLevel.get(la)!
      const mb = byLevel.get(lb)!
      const pairs: [number, number][] = []
      let unmatched = 0
      for (const [subject, va] of ma) {
        const vb = mb.get(subject)
        if (vb === undefined) { unmatched++; continue }
        pairs.push([va, vb])
      }
      unmatched += [...mb.keys()].filter((s) => !ma.has(s)).length
      // Dropped subjects are counted, never silent.
      if (unmatched > 0) warnings.push(`${unmatched} subject${unmatched === 1 ? "" : "s"} had no matching pair and were excluded from the test.`)
      if (pairs.length < 2) { blocked.push(tooFew(2, pairs.length)); break }
      return {
        ok: true,
        warnings,
        payload: { ...base, shape: "pairs", pairs, labels: [la, lb], rowIds: included.map((r) => r.rowId) },
      }
    }

    case "anova-one-way":
    case "kruskal-wallis": {
      if (!response) { blocked.push(missingResponse()); break }
      if (!groupCol) { blocked.push(missingGroup()); break }
      const groups = buildGroups()
      const levels = [...groups.keys()]
      if (levels.length < 3) {
        blocked.push({
          code: "too-few-levels",
          message: `An ANOVA needs at least three groups; "${groupCol}" has ${levels.length}.`,
          fix: "Use a two-group test instead.",
        })
        break
      }
      const thin = levels.filter((l) => groups.get(l)!.values.length < 2)
      if (thin.length) { blocked.push(tooFew(2, 1)); break }
      // Dunnett is meaningless without a control to compare against.
      if (spec.analysis.postHoc === "dunnett" && !spec.analysis.referenceLevel) {
        return {
          ok: false,
          question: {
            question: "Dunnett's test compares every group to one control. Which group is the control?",
            options: levels,
          },
        }
      }
      return {
        ok: true,
        warnings,
        payload: {
          ...base,
          shape: "groups",
          groups: Object.fromEntries(levels.map((l) => [l, groups.get(l)!.values])),
          referenceLevel: spec.analysis.referenceLevel,
          postHoc: spec.analysis.postHoc,
          equalVariance: true,
          rowIds: levels.flatMap((l) => groups.get(l)!.rowIds),
        },
      }
    }

    case "friedman":
    case "anova-rm": {
      if (!response) { blocked.push(missingResponse()); break }
      if (!groupCol) { blocked.push(missingGroup()); break }
      if (!subjectCol) {
        blocked.push({
          code: "no-subject",
          message: "A repeated-measures test needs a subject column.",
          fix: "Set the subject column in the design.",
        })
        break
      }
      const conditions = [...new Set(included.map((r) => toLabel(r.values[groupCol])))]
      const subjects = [...new Set(included.map((r) => toLabel(r.values[subjectCol])))]
      const lookup = new Map<string, number>()
      for (const r of included) {
        const v = toNumber(r.values[response])
        if (v === null) continue
        lookup.set(`${toLabel(r.values[subjectCol])}␟${toLabel(r.values[groupCol])}`, v)
      }
      const complete: string[] = []
      const matrix: number[][] = []
      for (const s of subjects) {
        const row = conditions.map((c) => lookup.get(`${s}␟${c}`))
        if (row.some((v) => v === undefined)) continue
        complete.push(s)
        matrix.push(row as number[])
      }
      const dropped = subjects.length - complete.length
      if (dropped > 0) {
        warnings.push(
          `${dropped} subject${dropped === 1 ? "" : "s"} had missing conditions and were dropped.` +
            (test === "anova-rm" ? " A mixed-effects model would keep them." : "")
        )
      }
      if (matrix.length < 2 || conditions.length < 2) { blocked.push(tooFew(2, matrix.length)); break }
      return {
        ok: true,
        warnings,
        payload: { ...base, shape: "matrix", matrix, subjects: complete, conditions, rowIds: included.map((r) => r.rowId) },
      }
    }

    case "anova-two-way":
    case "mixed-effects": {
      if (!response) { blocked.push(missingResponse()); break }
      if (!groupCol) { blocked.push(missingGroup()); break }
      const second = spec.analysis.secondFactorColumn
      if (test === "anova-two-way" && !second) {
        blocked.push({ code: "no-second-factor", message: "A two-way ANOVA needs a second factor.", fix: "Choose a second grouping column." })
        break
      }
      const long: { y: number; f1: string; f2?: string; subject?: string }[] = []
      for (const r of included) {
        const y = toNumber(r.values[response])
        if (y === null) continue
        long.push({
          y,
          f1: toLabel(r.values[groupCol]),
          ...(second ? { f2: toLabel(r.values[second]) } : {}),
          ...(subjectCol ? { subject: toLabel(r.values[subjectCol]) } : {}),
        })
      }
      if (long.length < 4) { blocked.push(tooFew(4, long.length)); break }
      return {
        ok: true,
        warnings,
        payload: { ...base, shape: "long", long, interaction: true, rowIds: included.map((r) => r.rowId) },
      }
    }

    case "chi-square":
    case "fisher-exact": {
      const [rowVar, colVar] = spec.analysis.responseColumns
      if (!rowVar || !colVar) {
        blocked.push({ code: "need-two-categoricals", message: "A contingency test needs two categorical columns.", fix: "Choose both an exposure and an outcome column." })
        break
      }
      const rowLevels = [...new Set(included.map((r) => toLabel(r.values[rowVar])))]
      const colLevels = [...new Set(included.map((r) => toLabel(r.values[colVar])))]
      const counts = rowLevels.map((rl) =>
        colLevels.map((cl) => included.filter((r) => toLabel(r.values[rowVar]) === rl && toLabel(r.values[colVar]) === cl).length)
      )
      if (rowLevels.length < 2 || colLevels.length < 2) { blocked.push({ code: "table-too-small", message: "A contingency table needs at least two levels on each axis." }); break }
      return {
        ok: true,
        warnings,
        payload: { ...base, shape: "contingency", table: counts, rowLevels, colLevels, rowIds: included.map((r) => r.rowId) },
      }
    }

    case "correlation-pearson":
    case "correlation-spearman":
    case "linear-regression": {
      const [xCol, yCol] = spec.analysis.responseColumns
      if (!xCol || !yCol) {
        blocked.push({ code: "need-xy", message: "This needs an x and a y column.", fix: "Choose two numeric columns." })
        break
      }
      const x: number[] = []
      const y: number[] = []
      const ids: string[] = []
      for (const r of included) {
        const xv = toNumber(r.values[xCol])
        const yv = toNumber(r.values[yCol])
        if (xv === null || yv === null) continue // pairwise complete
        x.push(xv); y.push(yv); ids.push(r.rowId)
      }
      if (x.length < 3) { blocked.push(tooFew(3, x.length)); break }
      return {
        ok: true,
        warnings,
        payload: { ...base, shape: "xy", x, y, forceIntercept: false, rowIds: ids },
      }
    }

    case "nonlinear-regression": {
      const [xCol, yCol] = spec.analysis.responseColumns
      if (!xCol || !yCol) {
        blocked.push({ code: "need-xy", message: "A curve fit needs a concentration column and a signal column." })
        break
      }
      const nl = spec.analysis.nonlinear
      if (!nl) { blocked.push({ code: "no-model", message: "No curve model selected.", fix: "Choose 4PL, 3PL or another model." }); break }
      const x: number[] = []
      const y: number[] = []
      const ids: string[] = []
      let nonPositive = 0
      for (const r of included) {
        const xv = toNumber(r.values[xCol])
        const yv = toNumber(r.values[yCol])
        if (xv === null || yv === null) continue
        // Log-x models cannot take zero or negative concentrations. Dropping a
        // blank silently would shift the fitted bottom, so it is counted.
        if (xv <= 0) { nonPositive++; continue }
        x.push(xv); y.push(yv); ids.push(r.rowId)
      }
      if (nonPositive > 0) {
        warnings.push(`${nonPositive} point${nonPositive === 1 ? "" : "s"} with concentration ≤ 0 excluded from the log-scale fit.`)
      }
      const minPoints = nl.model === "3pl" ? 3 : nl.model === "5pl" ? 5 : 4
      if (x.length < minPoints) {
        blocked.push({ code: "too-few-points", message: `A ${nl.model.toUpperCase()} fit needs at least ${minPoints} points; ${x.length} available.` })
        break
      }
      // Points are not the constraint — DISTINCT concentrations are. Replicates
      // at one dose buy precision, not identifiability: a model with `minPoints`
      // free parameters fitted through two doses is under-determined, and the
      // optimiser reports that as an OverflowError from deep inside the solver
      // rather than as anything a bench scientist can act on.
      const levels = new Set(x).size
      if (levels < minPoints) {
        blocked.push({
          code: "too-few-concentrations",
          message: `A ${nl.model.toUpperCase()} fit estimates ${minPoints} parameters and needs at least ${minPoints} different concentrations; these ${x.length} points cover only ${levels}.`,
          fix: "Add more concentration levels — extra replicates at the same concentration do not constrain the curve.",
        })
        break
      }
      return {
        ok: true,
        warnings,
        payload: {
          ...base,
          shape: "curve",
          x, y,
          model: nl.model,
          weighting: nl.weighting,
          sharedParameters: nl.sharedParameters,
          confidenceBands: nl.confidenceBands,
          unknowns: [],
          rowIds: ids,
        },
      }
    }

    case "kaplan-meier": {
      const [timeCol, eventCol] = spec.analysis.responseColumns
      if (!timeCol || !eventCol) {
        blocked.push({ code: "need-survival", message: "Survival analysis needs a time column and an event column.", fix: "Event should be 1 for the event and 0 for censored." })
        break
      }
      const durations: number[] = []
      const events: number[] = []
      const groups: string[] = []
      const ids: string[] = []
      for (const r of included) {
        const t = toNumber(r.values[timeCol])
        const e = toNumber(r.values[eventCol])
        if (t === null || e === null) continue
        durations.push(t)
        events.push(e === 0 ? 0 : 1)
        if (groupCol) groups.push(toLabel(r.values[groupCol]))
        ids.push(r.rowId)
      }
      if (durations.length < 2) { blocked.push(tooFew(2, durations.length)); break }
      return {
        ok: true,
        warnings,
        payload: {
          ...base,
          shape: "survival",
          durations, events,
          groups: groupCol ? groups : null,
          rowIds: ids,
        },
      }
    }
  }

  return { ok: false, blocked: blocked.length ? blocked : [{ code: "unsupported", message: `The test "${test}" is not yet supported.` }] }
}

/* ── Shared precondition messages ──────────────────────────────────────────*/

function missingResponse(): PreconditionFailure {
  return { code: "no-response", message: "No response column chosen.", fix: "Pick the column holding the measurement." }
}
function missingGroup(): PreconditionFailure {
  return { code: "no-group", message: "No grouping column chosen.", fix: "Pick the column that says which condition each row belongs to." }
}
function tooFew(need: number, have: number): PreconditionFailure {
  return { code: "too-few", message: `Not enough data: ${have} usable value${have === 1 ? "" : "s"}, ${need} needed.` }
}
