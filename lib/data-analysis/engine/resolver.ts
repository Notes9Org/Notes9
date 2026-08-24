import type { AnalysisSpec, Transform } from "@/lib/data-analysis/spec/analysis-spec"

/**
 * The resolver: AnalysisSpec + snapshot table → EnginePayload.
 *
 * This is the boundary the whole architecture rests on. Above it, a language
 * model chooses SEMANTICS, which column is the response, whether the design is
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
  /** Every row post-transform, for the figure, including excluded ones. */
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
    | {
        shape: "curve"
        x: number[]
        y: number[]
        model: string
        weighting: string
        sharedParameters: string[]
        confidenceBands: boolean
        unknowns: { label: string; signal: number }[]
        /**
         * Present only when `analysis.nonlinear.datasetColumn` is set (T0.20).
         * The engine fits these jointly, sharing whatever `sharedParameters`
         * names. Absent means one curve, which is what every payload built
         * before this field existed meant. `x`/`y`/`rowIds` above stay the
         * concatenation in this same order.
         */
        datasets?: { label: string; x: number[]; y: number[]; rowIds: string[] }[]
        /** The column the datasets were split on, for the provenance record. */
        datasetColumn?: string
      }
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
  if (v === null || v === undefined || v === "") return "-"
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
 * The replicate-collapse statistic over one group's finite readings.
 *
 * SD is the SAMPLE deviation (n-1): technical replicates are a sample of the
 * measurement process, not its population. A single replicate has no spread,
 * and reporting 0 there would claim a perfect agreement that was never
 * measured, so it returns null and the emitted `n` column says why.
 */
function collapseStat(
  vals: number[],
  statistic: Extract<Transform, { kind: "collapseReplicates" }>["statistic"]
): number | null {
  if (statistic === "median") {
    // The shared helper, not an inline pick of the upper-middle value: on an
    // even count, two technical replicates being the common case, picking
    // sorted[n/2] returns the larger reading rather than the midpoint,
    // biasing every collapsed row upward.
    return median([...vals].sort((a, b) => a - b))
  }
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  if (statistic === "mean") return mean
  if (vals.length < 2) return null
  const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / (vals.length - 1))
  return statistic === "sem" ? sd / Math.sqrt(vals.length) : sd
}

/**
 * The row id for one widened group.
 *
 * `pivotLonger` extends an id with `␟<column>`. Widening strips that suffix
 * again when every member of the group carries the same stem, so a re-entrant
 * wide → long → wide returns the ORIGINAL ids: the round trip is an identity
 * on identity, and exclusions recorded against the pre-fold rows still match.
 * Anything else concatenates the way `collapseReplicates` does.
 */
function widenRowId(group: TableRow[]): string {
  const stems = new Set(
    group.map((r) => (r.rowId.includes("␟") ? r.rowId.slice(0, r.rowId.lastIndexOf("␟")) : r.rowId))
  )
  const [stem] = [...stems]
  return stems.size === 1 && stem ? stem : group.map((r) => r.rowId).join("+")
}

/**
 * The mean of `column` over the rows belonging to a named LEVEL.
 *
 * Two transforms reference a level rather than a column, `foldChange.baseline`
 * and `baselineSubtract.blankGroup`, and, unlike `normaliseToControl`, neither
 * carries the column that level lives in. So the column is resolved from the
 * spec, in declaration order, and never guessed:
 *
 *   1. `analysis.groupColumn`, the declared condition column;
 *   2. a column the semantic layer (L2) tagged `group` or `treatment`;
 *   3. failing both, the one and only column in which the level appears.
 *
 * If no column holds the level, or several do and none was declared, this
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
 * columns the chosen test consumes, a categorical exposure has no missing
 * *value* to impute, and every strategy states what it did, because a filled
 * hole a reader cannot see is the same failure as a wrong baseline:
 *
 *   listwise  drop the whole row when any consumed column is missing, so a
 *             column that WAS present is dropped along with it. This was the
 *             de-facto behaviour before, unstated and uncounted.
 *   pairwise  keep every row; each statistic uses the rows where its own
 *             variables are present, what the shaping below already does.
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
 * Transforms applied in array order, blank-subtract-then-log ≠ log-then-blank-subtract.
 *
 * `reference` is the level mean the caller resolved for the two transforms that
 * name a level (see `resolveReference`); null for every other kind.
 */
function applyTransform(
  rows: TableRow[],
  t: Transform,
  reference: number | null,
  spec: AnalysisSpec,
  warnings: string[]
): TableRow[] {
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
      // fold-change taken against the whole table's mean is not a fold-change
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
        // A bucket with no control, or a control that read zero, yields null,
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
    case "pivotWider": {
      // Long → wide, the inverse of pivotLonger. Rows agreeing on every column
      // except namesFrom/valuesFrom become one row with a column per level.
      // Like pivotLonger it changes the row count and the column set, so it
      // belongs at the front of the transform list.
      const allCols = Object.keys(rows[0]?.values ?? {})
      const carried = allCols.filter((c) => c !== t.namesFrom && c !== t.valuesFrom)
      // Every level gets a cell in every output row so the table stays
      // rectangular; a level a group never measured is an explicit null the
      // missing-value path can see, not an absent key nothing downstream reads.
      const levels = [...new Set(rows.map((r) => toLabel(r.values[t.namesFrom])))]
      const buckets = new Map<string, TableRow[]>()
      for (const r of rows) {
        const key = carried.map((c) => toLabel(r.values[c])).join("␟")
        const list = buckets.get(key) ?? []
        list.push(r)
        buckets.set(key, list)
      }
      return [...buckets.values()].map((group) => {
        const values: Record<string, number | string | null> = {}
        for (const c of carried) values[c] = group[0].values[c]
        for (const l of levels) values[l] = null
        const filled = new Set<string>()
        for (const r of group) {
          const l = toLabel(r.values[t.namesFrom])
          // Two rows sharing a key AND a level are replicates, and one cell
          // cannot hold both. Widening is not the place to average them, so
          // keep the first and say so rather than dropping one in silence.
          if (filled.has(l)) {
            warnings.push(
              `Long → wide found more than one row with "${t.namesFrom}" = ${l} that agreed on every other column (${group.map((x) => x.rowId).join(", ")}); only the first value was kept. Collapse the replicates first if they are replicates.`
            )
            continue
          }
          filled.add(l)
          values[l] = r.values[t.valuesFrom] ?? null
        }
        return { rowId: widenRowId(group), values }
      })
    }
    case "baselineSubtract": {
      // An explicit `blankValue` wins. Otherwise `t.blankGroup` is a LEVEL
      // the wells labelled "Blank", and the subtrahend is that level's mean,
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
      const allCols = Object.keys(rows[0]?.values ?? {})
      // WHICH columns are measurements is a semantic question, not "does this
      // parse as a number". Collapsing every numeric column averages a numeric
      // subject/well/plate ID into an identifier naming nobody: subjects 1, 2,
      // 3 become subject 2. Prefer the transform's explicit list, then the
      // declared response columns, and guess only as a last resort, out loud,
      // because a guess here is a guess about what the data means.
      const declared = t.columns.length ? t.columns : spec.analysis.responseColumns
      const measured = declared.length
        ? declared.filter((c) => allCols.includes(c))
        : allCols.filter((c) => !t.by.includes(c) && rows.some((r) => toNumber(r.values[c]) !== null))
      if (!declared.length && measured.length > 0) {
        warnings.push(
          `Replicate collapse had no measurement columns declared, so it collapsed every numeric column outside the grouping keys (${measured.join(", ")}). A numeric identifier in that list was averaged; name the measurement columns on the transform to stop that.`
        )
      }
      if (allCols.includes(t.countTo)) {
        warnings.push(
          `Replicate collapse overwrote the existing column "${t.countTo}" with the replicate count; rename it on the transform to keep the original.`
        )
      }
      const carried = allCols.filter((c) => !measured.includes(c) && c !== t.countTo)
      return [...buckets.values()].map((group) => {
        const values: Record<string, number | string | null> = { ...group[0].values }
        // Non-measurement columns are NOT free to inherit from group[0].
        // Replicates that disagree on operator, plate or comment have no single
        // value to carry, and printing one researcher's name over another's is
        // the same failure as a silently filled hole: say what was discarded
        // and leave the cell empty, as the missing-value path does.
        for (const c of carried) {
          const seen = [...new Set(group.map((r) => toLabel(r.values[c])))]
          if (seen.length > 1) {
            values[c] = null
            warnings.push(
              `Replicate group ${group.map((r) => r.rowId).join("+")} disagreed on "${c}" (${seen.join(", ")}); the collapsed row leaves it empty rather than keeping the first replicate's value.`
            )
          }
        }
        for (const c of measured) {
          const vals = group.map((r) => toNumber(r.values[c])).filter((v): v is number => v !== null)
          values[c] = vals.length === 0 ? null : collapseStat(vals, t.statistic)
        }
        // n is a column, not a fact recoverable only by counting the "+"s in a
        // row id. SD and SEM are unreadable without it.
        values[t.countTo] = group.length
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

/* ── Cross-file join (T0.6) ────────────────────────────────────────────────
   Joins the right table onto the left on one or more key columns.

   ROW IDENTITY, which is the part that matters. Exclusions are stored against
   row ids (§8.1) and are re-resolved on every open, so a join must not reshuffle
   identity gratuitously:

     - a left row matching AT MOST ONE right row KEEPS ITS OWN rowId. That is the
       1:1 case — a plate map, a sample sheet, a metadata table — and it means
       attaching one to a working analysis leaves every exclusion already filed
       against those rows resolving exactly as before.
     - a left row that fans out to N > 1 right rows becomes N rows with ids
       `${leftRowId}<US>${rightRowId}`, the same convention `pivotLonger` uses,
       because one id can no longer name one row. That is reported, since any
       exclusion filed before the fan-out now names a row that no longer exists
       and step 3 will count it as orphaned.

   Both branches are deterministic under a fixed pair of version hashes, and the
   cardinality that selects between them cannot change without one of those
   hashes changing — which already invalidates the results under Law 4. So the
   ids a spec produces are a function of (spec, left hash, right hash), which is
   exactly what reproducibility requires.

   Keys are compared on their string form. A well id that arrived as the number 3
   from an instrument export and as the text "3" from a hand-typed map is the
   same well, and refusing to join them would make the feature useless for the
   case it exists to serve. */
/**
 * Separator for fan-out join ids and composite keys. Deliberately NOT the "␟"
 * that `pivotLonger` uses: `pivotWider` undoes a fold by stripping the last
 * "␟" from an id, and a join id must not be silently unwound by a widen that
 * had nothing to do with the join.
 */
const JOIN_ID_SEPARATOR = "\u22c8"

function joinKeyOf(values: Record<string, number | string | null>, columns: string[]): string | null {
  const parts: string[] = []
  for (const c of columns) {
    const v = values[c]
    // A null key joins to nothing. Treating null as a joinable value would make
    // every unkeyed row on one side match every unkeyed row on the other.
    if (v === null || v === undefined) return null
    const t = String(v).trim()
    if (t === "") return null
    parts.push(t)
  }
  return parts.join(JOIN_ID_SEPARATOR)
}

function applyJoin(
  left: Table,
  join: AnalysisSpec["joins"] extends (infer J)[] | undefined ? J : never,
  tables: ReadonlyMap<string, Table> | undefined,
  warnings: string[],
): { ok: true; table: Table } | { ok: false; blocked: PreconditionFailure } {
  const name = join.right.fileName
  const key = join.right.fileId
  const right = key === null ? undefined : tables?.get(key)
  if (!right) {
    return {
      ok: false,
      blocked: {
        code: "join-source-missing",
        message: `"${name}" is joined into this analysis but its rows were not supplied, so the join could not run.`,
        fix: "Open the file in this project, or remove the join.",
      },
    }
  }

  const leftKeys = join.on.map((k) => k.left)
  const rightKeys = join.on.map((k) => k.right)
  const missingLeft = leftKeys.filter((c) => !left.columns.includes(c))
  const missingRight = rightKeys.filter((c) => !right.columns.includes(c))
  if (missingLeft.length || missingRight.length) {
    return {
      ok: false,
      blocked: {
        code: "join-column-missing",
        message:
          `The join onto "${name}" names ` +
          [
            missingLeft.length ? `${missingLeft.join(", ")} on this file` : "",
            missingRight.length ? `${missingRight.join(", ")} on "${name}"` : "",
          ].filter(Boolean).join(" and ") +
          ", which no longer exist.",
        fix: "Pick key columns that are present on both files.",
      },
    }
  }

  // Which right columns to bring, and under what name. A collision never
  // overwrites the left column: the analysis was built against the left file.
  const wanted = join.columns.length
    ? join.columns.filter((c) => right.columns.includes(c))
    : right.columns.filter((c) => !rightKeys.includes(c))
  const unknownWanted = join.columns.filter((c) => !right.columns.includes(c))
  if (unknownWanted.length) {
    warnings.push(`"${name}" no longer has ${unknownWanted.join(", ")}; ${unknownWanted.length === 1 ? "that column was" : "those columns were"} not joined in.`)
  }
  const renamed = new Map<string, string>()
  const renamedPairs: string[] = []
  for (const c of wanted) {
    let target = c
    if (left.columns.includes(c)) {
      target = `${c}${join.suffix}`
      let n = 2
      while (left.columns.includes(target) || renamed.has(target)) { target = `${c}${join.suffix}${n}`; n += 1 }
      renamedPairs.push(`${c} → ${target}`)
    }
    renamed.set(c, target)
  }
  if (renamedPairs.length) {
    warnings.push(`Joining "${name}" renamed ${renamedPairs.join(", ")} to avoid overwriting a column of the same name on this file.`)
  }

  const index = new Map<string, TableRow[]>()
  let rightUnkeyed = 0
  for (const r of right.rows) {
    const k = joinKeyOf(r.values, rightKeys)
    if (k === null) { rightUnkeyed += 1; continue }
    const at = index.get(k)
    if (at) at.push(r)
    else index.set(k, [r])
  }
  if (rightUnkeyed > 0) {
    warnings.push(`${rightUnkeyed} row${rightUnkeyed === 1 ? "" : "s"} in "${name}" ${rightUnkeyed === 1 ? "has" : "have"} a blank key and could not be joined to anything.`)
  }

  const nulls: Record<string, null> = {}
  for (const target of renamed.values()) nulls[target] = null

  const rows: TableRow[] = []
  let unmatched = 0
  let fannedRows = 0
  let fannedOut = 0
  for (const l of left.rows) {
    const k = joinKeyOf(l.values, leftKeys)
    const hits = k === null ? undefined : index.get(k)
    if (!hits || hits.length === 0) {
      unmatched += 1
      if (join.type === "inner") continue
      rows.push({ rowId: l.rowId, values: { ...l.values, ...nulls } })
      continue
    }
    if (hits.length === 1) {
      // 1:1, the common case. The id is untouched, so exclusions survive.
      const values: Record<string, number | string | null> = { ...l.values }
      for (const [src, target] of renamed) values[target] = hits[0].values[src] ?? null
      rows.push({ rowId: l.rowId, values })
      continue
    }
    fannedRows += 1
    fannedOut += hits.length
    for (const r of hits) {
      const values: Record<string, number | string | null> = { ...l.values }
      for (const [src, target] of renamed) values[target] = r.values[src] ?? null
      rows.push({ rowId: `${l.rowId}${JOIN_ID_SEPARATOR}${r.rowId}`, values })
    }
  }

  if (unmatched > 0) {
    warnings.push(
      join.type === "inner"
        ? `${unmatched} row${unmatched === 1 ? "" : "s"} dropped by the inner join onto "${name}": no matching key.`
        : `${unmatched} row${unmatched === 1 ? "" : "s"} had no match in "${name}"; the joined columns are empty for ${unmatched === 1 ? "it" : "them"}.`,
    )
  }
  if (fannedRows > 0) {
    warnings.push(
      `${fannedRows} row${fannedRows === 1 ? "" : "s"} matched more than one row in "${name}" and became ${fannedOut}. ` +
        `Those rows have new ids, so any exclusion recorded against them before the join no longer resolves.`,
    )
  }

  return { ok: true, table: { columns: [...left.columns, ...renamed.values()], rows } }
}

export function resolvePayload(
  spec: AnalysisSpec,
  table: Table,
  /**
   * Right-hand tables for `spec.joins`, keyed by `join.right.fileId` (T0.6).
   * Omitted, which is every caller written before joins existed, means a spec
   * carrying joins cannot resolve and says so rather than running on the left
   * table alone.
   */
  joinTables?: ReadonlyMap<string, Table>,
): ResolveOutcome {
  const warnings: string[] = []
  const blocked: PreconditionFailure[] = []
  const test = spec.analysis.test

  /* 0, join across files in the same project (§T0.6). Before filters and before
     transforms, because both must be able to name the columns a join brought
     in — filtering on a plate map's `treatment` is the whole point. */
  let joined: Table = table
  for (const join of spec.joins ?? []) {
    const outcome = applyJoin(joined, join, joinTables, warnings)
    if (!outcome.ok) return { ok: false, blocked: [outcome.blocked] }
    joined = outcome.table
  }

  /* 1, filter */
  let rows = joined.rows.filter((r) =>
    spec.filters.every((f) => matches(r.values[f.column], f.op, f.value))
  )
  const filteredOut = joined.rows.length - rows.length
  if (filteredOut > 0) warnings.push(`${filteredOut} row${filteredOut === 1 ? "" : "s"} removed by filters.`)

  /* 2, transform, in order. Two kinds reference a named level, which has to be
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
    rows = applyTransform(rows, t, reference, spec, warnings)
  }

  /* 3, exclusions: partitioned, never dropped. Both sides are kept so the
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
        `the row${orphaned === 1 ? " it names no longer exists" : "s they name no longer exist"} after a reshape, ` +
        `collapsing replicates or folding wide columns rewrites row ids. Re-exclude those points on the current table.`
    )
  }

  /* 3b, missing values, per the declared strategy. */
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

  /* 4, shape for the test */
  switch (test) {
    /**
     * No test chosen.
     *
     * Not a refusal. A timecourse, a plate map or an exploratory scatter is a
     * perfectly good analysis with nothing to test yet, and blocking it would
     * mean the figure cannot be drawn until a p-value is demanded, which is
     * the pressure toward testing-first that §8 exists to resist. The engine
     * gets the same columns `descriptives` would, so the chart has its rows and
     * the summary panel has its means, and no test is reported.
     */
    case "none":
    case "descriptives":
    case "normality": {
      // Declared columns first, then anything a transform introduced, a
      // pivotLonger's value column exists only after step 2, and summarising the
      // pre-transform column list would report "nothing numeric" about a table
      // that is entirely numeric.
      const available = [
        ...new Set([...joined.columns, ...included.flatMap((r) => Object.keys(r.values))]),
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
            question: `"${groupCol}" has ${levels.length} groups. A two-group test can only compare two of them, which pair, or should this be an ANOVA?`,
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

      /* One curve per level of `datasetColumn`, or a single curve over
         everything when it is null (T0.20). Levels are kept in FIRST-APPEARANCE
         order rather than sorted, so the engine's per-dataset results come back
         in the order the rows are in and the labels are stable across re-runs. */
      const dsCol = nl.datasetColumn ?? null
      const buckets: { label: string; rows: typeof included }[] = []
      const bucketIndex = new Map<string, number>()
      let unlabelled = 0
      for (const r of included) {
        let label = ""
        if (dsCol !== null) {
          const raw = r.values[dsCol]
          if (raw === null || raw === undefined || String(raw).trim() === "") { unlabelled++; continue }
          label = String(raw)
        }
        let at = bucketIndex.get(label)
        if (at === undefined) { at = buckets.length; bucketIndex.set(label, at); buckets.push({ label, rows: [] }) }
        buckets[at].rows.push(r)
      }
      if (unlabelled > 0) {
        warnings.push(
          `${unlabelled} row${unlabelled === 1 ? "" : "s"} had no value in "${dsCol}" and could not be assigned to a curve; ` +
            `they are not in any dataset and did not contribute to the fit.`,
        )
      }
      if (buckets.length === 0) {
        blocked.push({ code: "no-rows", message: dsCol === null ? "No rows to fit." : `No row carries a value in "${dsCol}", so there is no curve to fit.` })
        break
      }

      const minPoints = nl.model === "3pl" ? 3 : nl.model === "5pl" ? 5 : 4
      const sets: { label: string; x: number[]; y: number[]; rowIds: string[] }[] = []
      let nonPositive = 0
      let failed = false
      for (const bucket of buckets) {
        const bx: number[] = []
        const by: number[] = []
        const bids: string[] = []
        for (const r of bucket.rows) {
          const xv = toNumber(r.values[xCol])
          const yv = toNumber(r.values[yCol])
          if (xv === null || yv === null) continue
          // Log-x models cannot take zero or negative concentrations. Dropping a
          // blank silently would shift the fitted bottom, so it is counted.
          if (xv <= 0) { nonPositive++; continue }
          bx.push(xv); by.push(yv); bids.push(r.rowId)
        }
        // Named per dataset, because "too few points" is unactionable when the
        // user cannot tell WHICH curve is short.
        const where = dsCol === null ? "" : ` for "${bucket.label}"`
        if (bx.length < minPoints) {
          blocked.push({ code: "too-few-points", message: `A ${nl.model.toUpperCase()} fit${where} needs at least ${minPoints} points; ${bx.length} available.` })
          failed = true
          continue
        }
        // Points are not the constraint, DISTINCT concentrations are. Replicates
        // at one dose buy precision, not identifiability: a model with `minPoints`
        // free parameters fitted through two doses is under-determined, and the
        // optimiser reports that as an OverflowError from deep inside the solver
        // rather than as anything a bench scientist can act on.
        const levels = new Set(bx).size
        if (levels < minPoints) {
          blocked.push({
            code: "too-few-concentrations",
            message: `A ${nl.model.toUpperCase()} fit${where} estimates ${minPoints} parameters and needs at least ${minPoints} different concentrations; these ${bx.length} points cover only ${levels}.`,
            fix: "Add more concentration levels, extra replicates at the same concentration do not constrain the curve.",
          })
          failed = true
          continue
        }
        sets.push({ label: bucket.label, x: bx, y: by, rowIds: bids })
      }
      // A dataset that cannot be fitted blocks the whole request rather than
      // being dropped: a global fit missing one of its curves shares its
      // parameters across different data than the user asked for, and that
      // substitution would not be visible in the numbers that came back.
      if (failed) break
      if (nonPositive > 0) {
        warnings.push(`${nonPositive} point${nonPositive === 1 ? "" : "s"} with concentration ≤ 0 excluded from the log-scale fit.`)
      }
      // `sharedParameters` only has something to act on across two or more
      // curves. Saying so is the difference between a global fit and a global
      // fit that quietly ran as an ordinary one.
      if (nl.sharedParameters.length > 0 && sets.length < 2) {
        warnings.push(
          `Shared parameters (${nl.sharedParameters.join(", ")}) were requested but there is only one curve to fit, so nothing was shared. ` +
            (dsCol === null
              ? "Name a dataset column to split the rows into several curves."
              : `"${dsCol}" holds only one distinct value in the included rows.`),
        )
      }

      const multi = dsCol !== null
      return {
        ok: true,
        warnings,
        payload: {
          ...base,
          shape: "curve",
          // Flat arrays stay the concatenation across datasets, in dataset
          // order, so `x[i]`/`y[i]`/`rowIds[i]` still describe one point for any
          // consumer that does not read `datasets`.
          x: sets.flatMap((d) => d.x),
          y: sets.flatMap((d) => d.y),
          model: nl.model,
          weighting: nl.weighting,
          sharedParameters: nl.sharedParameters,
          confidenceBands: nl.confidenceBands,
          unknowns: [],
          rowIds: sets.flatMap((d) => d.rowIds),
          ...(multi ? { datasetColumn: dsCol, datasets: sets } : {}),
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
