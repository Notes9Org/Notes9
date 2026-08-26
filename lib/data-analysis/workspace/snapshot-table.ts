/**
 * Reading the live sheet the chart workspace draws from.
 *
 * There is one reader now: `detectHeader`/`tableFromGrid` (workspace/bootstrap.ts),
 * which knows how to skip a preamble, fold a two-row merged header, read a unit
 * row and drop a trailing footnote. It used to be consulted only as a veto over
 * a verbatim row-0 read, and a veto that fires only when row 0 is a TITLE is no
 * veto at all for the four shapes that actually break: a unit row became a data
 * row, a two-row header collapsed four columns into two, a footnote became a
 * data row, and two columns of the same name silently became one.
 *
 * The compatibility hazard that kept the verbatim read is real and unchanged:
 * a saved spec references column names and row ids, so a sheet that starts
 * reading differently reshuffles the analyses saved against it. It is handled
 * by making the difference visible rather than by preserving the wrong reading:
 *  - Where the two readings agree — a header on row 1, no unit row, no merged
 *    group, no footnote, no blank or duplicate header cells — the columns, the
 *    values, the row ids and `hashTable` are byte-identical to before. That is
 *    the overwhelming majority of sheets, and `ingest-identity.test.ts` pins it.
 *  - Where they disagree, the sheet was being read wrong. Those saved analyses
 *    see a changed `versionHash`, so the reopen path already reports drift
 *    instead of quietly recomputing, and `checkExclusions`
 *    (saved-analysis-session.ts) says which exclusions no longer name their
 *    own sample.
 *
 * `parseError` makes the failure visible instead of returning a silently empty
 * table: R1 in ARCHITECTURE.md is a placeholder ("Attach a data file to
 * start.") shown while data is plainly on screen, because the gate had no way
 * to tell "no dataset" from "dataset that failed to parse". This module is
 * what lets the gate tell them apart.
 */

import * as XLSX from "xlsx"
import { snapshotToXlsxWorkbook, type UniverWorkbookSnapshot } from "@/lib/spreadsheet-workbook"
import { detectHeader, rememberRowIds, tableFromGrid } from "@/lib/data-analysis/workspace/bootstrap"

/** One row keyed by column name, the shape the chart and stats panels hold. */
export type Row = Record<string, number | string>

export type SnapshotTable = {
  columns: string[]
  rows: Row[]
  /**
   * The spreadsheet row each entry of `rows` came from, as a `rowId`. Parallel
   * to `rows`; also carried on the array itself, so `tableFromChartRows` picks
   * them up without every caller being rewritten to pass them.
   */
  rowIds: string[]
  /**
   * The sheet these rows were read from, or `null` when nothing was read.
   *
   * The analysed sheet used to be implicit — sheet 1, or whichever later sheet
   * the fallback scan happened to land on — while the grid beside it showed
   * whatever tab the user had clicked. Naming it here is what lets the
   * workspace SAY which sheet the figure is made of instead of leaving the
   * reader to assume it is the one on screen.
   */
  sheetName: string | null
  /** Non-null explains why the table is empty. Never set just because there are 0 rows. */
  parseError: string | null
}

/** The sheets this workbook offers, in tab order. `[]` if it cannot be parsed. */
export function snapshotSheetNames(snapshot: UniverWorkbookSnapshot): string[] {
  try {
    return snapshotToXlsxWorkbook(snapshot).SheetNames ?? []
  } catch {
    return []
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** A grid cell as XLSX's `header: 1` mode hands it back. */
type Grid = (string | number | null | undefined)[][]

function sheetToGrid(ws: XLSX.WorkSheet): Grid {
  return XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, blankrows: true })
}

/**
 * Coerce a `tableFromGrid` cell for the flat row shape.
 *
 * `Row` is the chart and stats panels' own shape and cannot hold `null`, so a
 * blank stays `""` here; `tableFromChartRows` is where the two readers converge
 * on the `Table` contract's `null`, which is the layer the missing-value logic
 * actually reads. `hashTable` writes `?? ""` either way, so converging costs no
 * stored hash.
 *
 * A numeric-looking string still becomes a number: that is the one coercion the
 * old reader did that the grid reader does not, and dropping it would turn
 * every text-formatted number column categorical.
 */
function coerceCell(v: number | string | null): number | string {
  if (v === null) return ""
  if (typeof v === "number") return v
  if (v === "" || !isFinite(Number(v))) return v
  return Number(v)
}

/** Read one sheet with the preamble/unit-row-aware detector, folded into the
 *  flat row shape every other reader here expects. */
function detectedReadSheet(grid: Grid): { columns: string[]; rows: Row[]; rowIds: string[] } | null {
  const table = tableFromGrid(grid)
  if (table.columns.length === 0) return null
  const rows: Row[] = table.rows.map((r) => {
    const o: Row = {}
    for (const c of table.columns) o[c] = coerceCell(r.values[c] ?? null)
    return o
  })
  const rowIds = table.rows.map((r) => r.rowId)
  return { columns: table.columns, rows: rememberRowIds(rows, rowIds), rowIds }
}

function failed(parseError: string): SnapshotTable {
  return { columns: [], rows: [], rowIds: [], sheetName: null, parseError }
}

/**
 * Read the sheet an analysis is about.
 *
 * `sheetName` is a PIN, not a hint. Passed, that sheet is read and only that
 * sheet: if it has no header the table is empty and says why, rather than
 * quietly moving to a neighbour. The fallback scan below is the opposite kind
 * of thing — it exists for the case where nobody has chosen, and choosing is
 * exactly what a pin has done.
 *
 * Omitted (or `null`), the behaviour is unchanged from before the sheet picker
 * existed, which is what keeps analyses saved before it byte-identical: they
 * carry no pin, so they resolve through the same scan, to the same sheet, with
 * the same columns and row ids.
 */
export function snapshotToTable(
  snapshot: UniverWorkbookSnapshot,
  sheetName?: string | null
): SnapshotTable {
  let wb: XLSX.WorkBook
  try {
    wb = snapshotToXlsxWorkbook(snapshot)
  } catch (err) {
    return failed(`Could not read this file: ${errorMessage(err)}`)
  }

  const sheetNames = wb.SheetNames ?? []
  if (sheetNames.length === 0) return failed("This file has no sheets.")

  if (sheetName != null) {
    const ws = sheetNames.includes(sheetName) ? wb.Sheets[sheetName] : undefined
    if (!ws) {
      // A renamed or deleted sheet must not silently re-point the analysis at
      // a different one; the columns would still resolve and the numbers would
      // be about something else.
      return failed(
        `This analysis reads the sheet named “${sheetName}”, which is not in this file. Choose the sheet to analyse.`
      )
    }
    try {
      const grid = sheetToGrid(ws)
      const found = detectedReadSheet(grid)
      if (found) return { ...found, sheetName, parseError: null }
      const rationale = detectHeader(grid).rationale
      return failed(`No header row was found on “${sheetName}”.${rationale ? ` ${rationale}` : ""}`)
    } catch (err) {
      return failed(`Could not read “${sheetName}”: ${errorMessage(err)}`)
    }
  }

  // Sheet 1 first, then later sheets: an empty first sheet means the data lives
  // somewhere else in the workbook, not that the file is unreadable.
  let lastRationale: string | null = null
  for (const name of sheetNames) {
    const ws = wb.Sheets[name]
    if (!ws) continue
    try {
      const grid = sheetToGrid(ws)
      const found = detectedReadSheet(grid)
      if (found) return { ...found, sheetName: name, parseError: null }
      lastRationale = detectHeader(grid).rationale
    } catch (err) {
      lastRationale = errorMessage(err)
    }
  }

  return failed(
    sheetNames.length > 1
      ? `No header row was found on any of the ${sheetNames.length} sheets in this file.`
      : `No header row was found on this sheet.${lastRationale ? ` ${lastRationale}` : ""}`
  )
}
