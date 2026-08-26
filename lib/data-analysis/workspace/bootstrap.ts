/**
 * Opening a sheet and getting a sensible analysis back.
 *
 * This is the seam between "here are some rows" and "here is an Analysis Spec".
 * It runs the semantic layer over the table, takes the design that falls out,
 * and picks the test that design actually supports, rather than defaulting to
 * a t-test and letting the user discover it was the wrong one.
 *
 * Everything it decides is marked `source: "inferred"` with a confidence, so
 * the roles panel can show what was guessed and the user's correction sticks
 * (§6.2). Nothing here is a statistic: the numbers still come from the engine.
 */

import { parseSpec, type AnalysisSpec, type TestKind } from "@/lib/data-analysis/spec/analysis-spec"
import type { Table } from "@/lib/data-analysis/engine/resolver"
import {
  defaultGroupColumn,
  inferDesign,
  inferRoles,
  legalTests,
  parseUnit,
  profileTable,
} from "@/lib/data-analysis/semantic/infer"
import { applyRecord, rolesFromRecord, type ExperimentRecord } from "@/lib/data-analysis/semantic/record"
import type { AnalysisPipeline } from "./pipelines"

export interface SheetMeta {
  fileName: string
  sheet?: string | null
  fileId?: string | null
  /** Changes whenever a cell changes; what a stored result is checked against. */
  versionHash: string
}

/**
 * A quick, stable hash of the table's contents.
 *
 * Used as the data version when the caller has no better identity to offer. It
 * is not cryptographic, it only has to change when the data changes, because
 * that is what makes a stored result detectably stale on reopen (§3A.3).
 *
 * The prefix says `fnv1a64` because that is what this is: two 32-bit FNV-1a
 * accumulators, 64 non-cryptographic bits. It used to say `sha256`, which put a
 * collision-resistance claim on a provenance record that the function cannot
 * keep. The digits are byte-for-byte the ones the old label carried — only the
 * name changed — so a stored `sha256:<hex>` and a live `fnv1a64:<same hex>`
 * describe identical data. Nothing parses the prefix; `checkResultIntegrity`
 * compares the whole string, so a revision saved before this change reports a
 * data-version mismatch once. See the note in `checkExclusions`.
 */
export function hashTable(table: Table): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  const write = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619)
      h2 = Math.imul(h2 + s.charCodeAt(i), 2246822519) ^ (h2 >>> 13)
    }
  }
  write(table.columns.join("\u0000"))
  for (const row of table.rows) {
    write(row.rowId)
    for (const c of table.columns) write(String(row.values[c] ?? ""))
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0")
  return `fnv1a64:${hex(h1)}${hex(h2)}`
}

/**
 * The chart that suits a test, so a new analysis opens already drawn.
 *
 * A chart type is not a neutral default: a bar chart of a correlation is
 * misleading, and a box plot of a dose-response hides the curve. Pairing them
 * here means the first thing the user sees is a figure that matches the
 * question the spec is asking.
 */
function figureKindFor(test: TestKind, hasTime: boolean): AnalysisSpec["figure"]["kind"] {
  switch (test) {
    case "correlation-pearson":
    case "correlation-spearman":
    case "linear-regression":
      return "xy-scatter-fit"
    case "nonlinear-regression":
      return "dose-response"
    case "kaplan-meier":
      return "kaplan-meier"
    case "chi-square":
    case "fisher-exact":
      return "pie-composition"
    case "anova-two-way":
      return "grouped-bar"
    case "kruskal-wallis":
    case "friedman":
    case "mann-whitney":
    case "wilcoxon-signed-rank":
      // Rank tests describe distributions, so show the distribution.
      return "box"
    case "none":
    case "descriptives":
    case "normality":
      return hasTime ? "line-timecourse" : "bar-scatter-error"
    default:
      return hasTime ? "line-timecourse" : "bar-scatter-error"
  }
}

/** The correction that belongs with a test, rather than "none" by default. */
function postHocFor(test: TestKind): AnalysisSpec["analysis"]["postHoc"] {
  if (test === "anova-one-way" || test === "anova-rm" || test === "anova-two-way") return "tukey"
  if (test === "kruskal-wallis" || test === "friedman") return "dunn"
  return "none"
}

export interface BootstrapOptions {
  /** Force a test instead of taking the design's recommendation. */
  test?: TestKind
  /** Roles the project record already knows; never re-guessed (§6.2). */
  knownRoles?: AnalysisSpec["roles"]
  /**
   * The notes9 experiment record for this sheet, when the workspace knows
   * which experiment it belongs to. Supplies `knownRoles` on its own and
   * cross-checks the file-derived design against what the project recorded,
   * which is what makes test selection project-driven rather than shape-driven.
   */
  record?: ExperimentRecord | null
  title?: string
}

/**
 * Build an Analysis Spec for a table.
 *
 * The test is chosen from the capability matrix, so it can only ever be one the
 * resolver will actually accept, a menu that offers something and then refuses
 * it is worse than one that never offered it.
 */
export function specFromTable(
  table: Table,
  meta: SheetMeta,
  options: BootstrapOptions = {}
): AnalysisSpec {
  // Roles the record establishes are locked before inference runs, so they are
  // never re-guessed (§6.2). An explicit `knownRoles` still wins over them: it
  // is what a caller has already settled.
  const fromRecord = options.record ? rolesFromRecord(table, options.record) : []
  const known = [...(options.knownRoles ?? [])]
  for (const role of fromRecord) {
    if (!known.some((k) => k.column === role.column)) known.push(role)
  }

  const roles = inferRoles(table, known)
  const plainRoles = roles.map(({ rationale: _r, ...role }) => role)
  // Deliberately NOT given the record's design: this must stay the file's own
  // reading, so `applyRecord` has two independent sides to compare. Handing it
  // the record here would make the design its own control and the
  // record-vs-file disagreement would silently always come back empty.
  const { rationale: _d, ...fileDesign } = inferDesign(table, plainRoles)
  // The record is the higher authority for design, but the file is still read
  // and any disagreement is reported with both sides named, never resolved
  // quietly in favour of one.
  const plainDesign = options.record
    ? applyRecord(table, plainRoles, fileDesign, options.record)
    : fileDesign

  const groupColumn = defaultGroupColumn(plainRoles)
  const responseColumns = plainRoles.filter((r) => r.role === "response").map((r) => r.column)
  const hasTime = plainRoles.some((r) => r.role === "time")

  // A provisional spec, only so the capability matrix has roles and a design to
  // read. Its test is replaced immediately below.
  const draft = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: meta.fileId ?? null,
      fileName: meta.fileName,
      sheet: meta.sheet ?? null,
      versionHash: meta.versionHash,
      rowCount: table.rows.length,
      columnCount: table.columns.length,
    },
    roles: plainRoles,
    design: plainDesign,
    analysis: { test: "none", groupColumn, responseColumns },
    figure: { kind: "bar-scatter-error", x: {}, y: {}, errorBars: "sd" },
    export: {},
  })
  if (!draft.ok) throw new Error("Could not build an analysis for this sheet.")

  const capabilities = legalTests(draft.spec, table)
  const recommended = capabilities.find((c) => c.legal && c.recommended)
  const test: TestKind =
    options.test ??
    // No recommendation means the design does not point anywhere on its own.
    // "none" is the honest answer there: draw the data, ask for nothing.
    (recommended?.test ?? "none")

  const responseRole = plainRoles.find((r) => r.role === "response")
  const groupRole = plainRoles.find((r) => r.column === groupColumn)

  const parsed = parseSpec({
    ...draft.spec,
    analysis: {
      ...draft.spec.analysis,
      test,
      postHoc: postHocFor(test),
    },
    figure: {
      ...draft.spec.figure,
      kind: figureKindFor(test, hasTime),
      title: options.title ?? meta.sheet ?? meta.fileName.replace(/\.[^.]+$/, ""),
      errorBars: "sem",
      x: { label: groupRole?.column ?? groupColumn ?? "" },
      y: { label: responseRole?.column ?? responseColumns[0] ?? "", unit: responseRole?.unit ?? null },
    },
  })
  if (!parsed.ok) throw new Error("Could not build an analysis for this sheet.")
  return parsed.spec
}

/** A ready-to-open pipeline for a sheet. */
export function pipelineFromTable(
  id: string,
  name: string,
  table: Table,
  meta: SheetMeta,
  options: BootstrapOptions = {}
): AnalysisPipeline {
  return {
    id,
    name,
    spec: specFromTable(table, meta, options),
    table,
    result: null,
    stale: true,
  }
}

/* ── Reading the grid ──────────────────────────────────────────────────────*/

type Cell = string | number | null | undefined
type Grid = Cell[][]

const cellText = (cell: Cell): string => (cell === null || cell === undefined ? "" : String(cell).trim())

function isNumericCell(cell: Cell): boolean {
  if (typeof cell === "number") return Number.isFinite(cell)
  const t = cellText(cell)
  return t !== "" && Number.isFinite(Number(t.replace(/,/g, "")))
}

const filledCount = (row: Cell[]): number =>
  row.reduce<number>((n, c) => (cellText(c) === "" ? n : n + 1), 0)
const rowHasNumber = (row: Cell[]): boolean => row.some(isNumericCell)

/**
 * A bare unit token from a unit row, read with the header's own rules.
 *
 * The cell says "%" or "nM" where a header would say "Viability (%)", so it is
 * wrapped and handed to `parseUnit`. That is not a trick for its own sake: it is
 * what makes "n = 8", "mean" and a lone number get rejected here exactly as they
 * are rejected in a header, without a second list of exceptions to keep in step.
 */
function unitFromCell(cell: Cell): string | null {
  const raw = cellText(cell).replace(/^[([]/, "").replace(/[)\]]$/, "").trim()
  if (!raw) return null
  return parseUnit(`(${raw})`)
}

/** A label, then a blank, then another label: the shape a merged span leaves. */
function hasInteriorGap(row: Cell[]): boolean {
  let seenLabel = false
  let gapAfterLabel = false
  for (const cell of row) {
    if (cellText(cell) === "") {
      if (seenLabel) gapAfterLabel = true
      continue
    }
    if (gapAfterLabel) return true
    seenLabel = true
  }
  return false
}

/** The same span written out cell by cell instead of merged. */
function hasAdjacentRepeat(row: Cell[]): boolean {
  for (let c = 1; c < row.length; c++) {
    const prev = cellText(row[c - 1])
    if (prev !== "" && prev === cellText(row[c])) return true
  }
  return false
}

/**
 * Is this row a dedicated unit row rather than the first row of data?
 *
 * The test is structural, so it needs no vocabulary of unit names: a unit row
 * carries no numbers, and every column it annotates is numeric all the way down.
 * A first data row like `["A1", "Treated", 12]` fails on both counts, and a
 * second header row like `["Mean", "SD"]` fails because `parseUnit` refuses
 * those words wherever they appear.
 */
function isUnitRow(grid: Grid, r: number): boolean {
  const row = grid[r] ?? []
  let annotated = 0
  for (let c = 0; c < row.length; c++) {
    if (cellText(row[c]) === "") continue
    if (isNumericCell(row[c])) return false
    if (unitFromCell(row[c]) === null) return false
    let below = 0
    for (let i = r + 1; i < grid.length; i++) {
      const value = (grid[i] ?? [])[c]
      if (cellText(value) === "") continue
      if (!isNumericCell(value)) return false
      below++
    }
    if (below === 0) return false
    annotated++
  }
  return annotated > 0
}

/** How a grid was read: which rows are header, units and data. */
export interface HeaderPlan {
  /** First grid row of the header block. */
  startRow: number
  /** Rows the header spans: 1, or 2 when a merged group sits above the names. */
  rowCount: number
  /** Grid row holding bare units, when there is one. */
  unitRow: number | null
  /** First grid row of data. */
  dataStart: number
  /** Last grid row of data, inclusive. -1 when there is none. */
  dataEnd: number
  /** Column names, with any unit-row unit folded in as a "(unit)" suffix. */
  columns: string[]
  /** The unit read for each column from the unit row, for the roles panel. */
  units: (string | null)[]
  /** What was decided, in plain language, so the user can see and correct it. */
  rationale: string
}

/**
 * What the user says when the sheet is shaped in a way detection cannot settle.
 *
 * Every field is a correction to one decision, so a user who only disagrees
 * about the unit row does not have to restate the header.
 */
export interface HeaderOverride {
  /** Grid row the header starts on. */
  startRow?: number
  /** Rows the header spans. */
  rowCount?: number
  /** Force the row after the header to be, or not to be, a unit row. */
  unitRow?: boolean
  /** Last grid row of data, inclusive: where the table stops and junk starts. */
  endRow?: number
}

const EMPTY_PLAN: HeaderPlan = {
  startRow: 0,
  rowCount: 0,
  unitRow: null,
  dataStart: 0,
  dataEnd: -1,
  columns: [],
  units: [],
  rationale: "The sheet has no rows to read.",
}

/**
 * Work out where the header ends and the data begins.
 *
 * Real bench sheets rarely open with a clean header on row 1: there is a title
 * above it, a merged group label spanning several columns, a row of units under
 * the names, and a footnote at the bottom. Taking row 0 as the header regardless
 * turns all four into silently wrong columns, which is worse than refusing the
 * file, because the analysis still runs.
 *
 * Every rule here is structural and conservative: where the shape is ambiguous
 * it declines to guess and reads the sheet the old way, because a false positive
 * eats a row of real data. `HeaderOverride` is how the user settles the cases
 * that no rule can, and it is the reason the plan is returned rather than kept
 * private.
 */
export function detectHeader(grid: Grid, override: HeaderOverride = {}): HeaderPlan {
  const rows = grid.length
  if (rows === 0) return EMPTY_PLAN

  // A title above the table is one lone cell over a row of names. It is only
  // skipped when the row below really looks like a header: a lone value over a
  // row of numbers is a one-column sheet, not a title.
  let start = override.startRow ?? 0
  if (override.startRow === undefined) {
    while (start < rows && filledCount(grid[start] ?? []) === 0) start++
    while (
      start + 1 < rows &&
      filledCount(grid[start] ?? []) === 1 &&
      filledCount(grid[start + 1] ?? []) > 1 &&
      !rowHasNumber(grid[start + 1] ?? [])
    ) {
      start++
    }
  }
  start = Math.min(Math.max(start, 0), rows - 1)
  const top = grid[start] ?? []
  if (filledCount(top) === 0) return EMPTY_PLAN

  const next = grid[start + 1] ?? []
  // A merged group label leaves gaps, a repeated one leaves duplicates, and a
  // single label over many columns leaves a row far sparser than the names
  // below it. Any of the three is the signature of a two-row header.
  const spanned =
    hasInteriorGap(top) || hasAdjacentRepeat(top) || filledCount(top) * 2 < filledCount(next)
  // Requiring a number somewhere below is what keeps a table of labels from
  // having its first data row read as a second header row. It is also why a
  // genuinely all-categorical sheet with a two-row header needs the override.
  const dataBelow = grid.slice(start + 2).some(rowHasNumber)
  const twoRow =
    override.rowCount !== undefined
      ? override.rowCount >= 2
      : start + 2 < rows &&
        filledCount(next) >= filledCount(top) &&
        !rowHasNumber(top) &&
        !rowHasNumber(next) &&
        dataBelow &&
        spanned

  const rowCount = twoRow ? 2 : 1
  const width = Math.max(top.length, twoRow ? next.length : 0)

  const columns: string[] = []
  let carried = ""
  for (let c = 0; c < width; c++) {
    const above = cellText(top[c])
    if (above !== "") carried = above
    if (!twoRow) {
      columns.push(above)
      continue
    }
    const name = cellText(next[c])
    // A blank in the top row under a named column is a span continuing, so the
    // group label carries across it. Columns before the first group label get
    // nothing carried, which is right: "Subject" is not "Treated Subject".
    const group = above !== "" ? above : name !== "" ? carried : ""
    columns.push(group && name && group !== name ? `${group} ${name}` : name || group)
  }

  // The unit row sits directly under the header. It must have data of its own
  // below it, or it is the last row and therefore the data.
  const candidate = start + rowCount
  const hasRoom = candidate + 1 < rows
  const unitRow =
    override.unitRow === false || !hasRoom
      ? null
      : override.unitRow === true || isUnitRow(grid, candidate)
        ? candidate
        : null

  const units: (string | null)[] = columns.map(() => null)
  if (unitRow !== null) {
    const unitCells = grid[unitRow] ?? []
    for (let c = 0; c < columns.length; c++) {
      const unit = unitFromCell(unitCells[c])
      if (!unit) continue
      units[c] = unit
      // A header that already states its unit keeps it: the row is a second
      // opinion, not an override. Folding the unit into the name is what lets
      // the semantic layer read it with no further wiring.
      if (columns[c] && !parseUnit(columns[c])) columns[c] = `${columns[c]} (${unit})`
    }
  }

  const dataStart = (unitRow ?? start + rowCount - 1) + 1
  let dataEnd = override.endRow ?? rows - 1
  if (override.endRow === undefined) {
    while (dataEnd >= dataStart && filledCount(grid[dataEnd] ?? []) === 0) dataEnd--
    // Footnotes ("n = 8", "* p < 0.05") sit under the table behind a blank row.
    // Insisting on that separator is what keeps a genuine last row that happens
    // to carry a single value: dropping one of those loses real data, which is
    // a far worse failure than carrying a footnote.
    let thin = dataEnd
    while (thin >= dataStart && filledCount(grid[thin] ?? []) === 1) thin--
    if (thin < dataEnd && thin >= dataStart && filledCount(grid[thin] ?? []) === 0) {
      dataEnd = thin
      while (dataEnd >= dataStart && filledCount(grid[dataEnd] ?? []) === 0) dataEnd--
    }
  }
  dataEnd = Math.min(dataEnd, rows - 1)

  const parts = [
    twoRow
      ? `Rows ${start + 1}-${start + 2} read as the header, with the group label carried across each span.`
      : `Row ${start + 1} read as the header.`,
  ]
  if (start > 0) parts.push(`${start} row${start === 1 ? "" : "s"} above it skipped.`)
  if (unitRow !== null) parts.push(`Row ${unitRow + 1} read as units.`)
  if (dataEnd < rows - 1) parts.push(`Rows below ${dataEnd + 1} left out as trailing notes.`)

  return {
    startRow: start,
    rowCount,
    unitRow,
    dataStart,
    dataEnd,
    columns,
    units,
    rationale: parts.join(" "),
  }
}

/**
 * Make repeated column names distinct instead of letting them collide.
 *
 * `values` is keyed by name, so two columns called "OD" used to mean the second
 * one overwrote the first and the deduped header then showed the FIRST name
 * against the SECOND column's numbers. Suffixing is the smallest thing that
 * keeps both columns' data and keeps the name a user can recognise.
 */
function disambiguate(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const n = (seen.get(name) ?? 0) + 1
    seen.set(name, n)
    if (n === 1) return name
    let candidate = `${name} (${n})`
    // A sheet that literally contains "OD" and "OD (2)" must not collapse either.
    for (let extra = n; seen.has(candidate); extra++) candidate = `${name} (${extra + 1})`
    seen.set(candidate, 1)
    return candidate
  })
}

/**
 * Rows from a spreadsheet grid.
 *
 * The header block is found by `detectHeader` rather than assumed to be row 0,
 * so a title, a merged group label, a unit row or a trailing footnote does not
 * become a column name or a data point. Blank rows are dropped rather than
 * carried as rows of nulls, because a sheet almost always has some, and they
 * would otherwise appear as empty points on every figure.
 */
export function tableFromGrid(
  grid: (string | number | null | undefined)[][],
  options: { rowIdPrefix?: string; header?: HeaderOverride } = {}
): Table {
  const plan = detectHeader(grid, options.header ?? {})
  if (plan.columns.length === 0) return { columns: [], rows: [] }
  const header = disambiguate(plan.columns.map((h, i) => h || `Column ${i + 1}`))
  const prefix = options.rowIdPrefix ?? "row"
  const rows: Table["rows"] = []
  for (let r = plan.dataStart; r <= plan.dataEnd; r++) {
    const raw = grid[r] ?? []
    const values: Record<string, number | string | null> = {}
    let any = false
    for (const [c, name] of header.entries()) {
      const cell = raw[c]
      if (cell === undefined || cell === null || cell === "") {
        values[name] = null
        continue
      }
      any = true
      values[name] = typeof cell === "number" ? cell : String(cell)
    }
    if (!any) continue
    // The sheet's own row number is the stable identity: it is what the user
    // sees in the spreadsheet, so a point traced back to it lands somewhere
    // they can find.
    rows.push({ rowId: `${prefix}-${r + 1}`, values })
  }
  return { columns: header, rows }
}

/* ── Carrying the sheet-anchored ids to the spec ───────────────────────────*/

/**
 * The row ids a flat `Row[]` came from.
 *
 * `snapshotToTable` has to hand the workspace `Record<string, …>[]`, which has
 * nowhere to put a `rowId`, and `tableFromChartRows` then had to invent one from
 * the array index — which is only right when the header is on row 1 and no row
 * was dropped. Keying the ids off the array the reader produced lets the true,
 * sheet-anchored ids survive the trip without changing either shape, so no
 * caller has to be rewritten to keep an exclusion pointing at its own sample.
 *
 * ponytail: side channel keyed on array identity; it misses if a caller copies
 * the array (`.map`, `.filter`, a spread). That is why `tableFromChartRows`
 * still falls back to the positional id and why it also takes `rowIds`
 * explicitly — pass them and the side channel is not consulted at all.
 */
const ROW_IDS = new WeakMap<object, string[]>()

export function rememberRowIds<T extends object>(rows: T, ids: string[]): T {
  ROW_IDS.set(rows, ids)
  return rows
}

export function recallRowIds(rows: object): string[] | undefined {
  return ROW_IDS.get(rows)
}

/** Profiles for the roles panel, alongside the spec's own role list. */
export function describeSheet(table: Table) {
  return profileTable(table)
}
