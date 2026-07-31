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

/** Transforms applied in array order — blank-subtract-then-log ≠ log-then-blank-subtract. */
function applyTransform(rows: TableRow[], t: Transform): TableRow[] {
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
      const base = rows
        .filter((r) => toLabel(r.values[t.baseline]) !== "—")
        .map((r) => num(r, t.column))
        .filter((v): v is number => v !== null)
      const mean = base.reduce((a, b) => a + b, 0) / (base.length || 1)
      return rows.map((r) => {
        const v = num(r, t.column)
        return { ...r, values: { ...r.values, [t.column]: v !== null && mean !== 0 ? v / mean : null } }
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
    case "baselineSubtract": {
      let blank = t.blankValue
      if (blank === null && t.blankGroup) {
        const vals = rows
          .filter((r) => toLabel(r.values[t.blankGroup as string]) !== "—")
          .map((r) => num(r, t.column))
          .filter((v): v is number => v !== null)
        blank = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
      }
      const b = blank ?? 0
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

  /* 2 — transform, in order */
  for (const t of spec.transforms) rows = applyTransform(rows, t)

  /* 3 — exclusions: partitioned, never dropped. Both sides are kept so the
        with/without comparison (§8.1) is always computable. */
  const excludedIds = new Set(spec.exclusions.map((e) => e.rowId))
  const plotRows = rows.map((r) => ({
    rowId: r.rowId,
    values: r.values,
    excluded: excludedIds.has(r.rowId),
  }))
  const included = rows.filter((r) => !excludedIds.has(r.rowId))
  if (excludedIds.size > 0) {
    warnings.push(
      `${excludedIds.size} point${excludedIds.size === 1 ? "" : "s"} excluded; the result is computed without them.`
    )
  }

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
      const cols = spec.analysis.responseColumns.length
        ? spec.analysis.responseColumns
        : table.columns.filter((c) => included.some((r) => toNumber(r.values[c]) !== null))
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
