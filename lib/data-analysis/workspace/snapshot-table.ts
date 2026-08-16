/**
 * Reading the live sheet the chart workspace draws from.
 *
 * The primary read is deliberately dumb and unchanged from the original
 * implementation: first sheet, row 0 as the header, verbatim. Column names
 * become `xKey`/`yKeys` in a saved spec and row order becomes `rowId`s a saved
 * exclusion list references — changing either for a sheet that already reads
 * fine would silently reshuffle every analysis saved against it. That reading
 * is only replaced when it demonstrably failed: an empty first sheet (the data
 * lives on another sheet), or a first row `detectHeader` itself concludes is a
 * title sitting above the real header. Both are recovered by scanning sheets
 * with `detectHeader`/`tableFromGrid` (workspace/bootstrap.ts), which already
 * knows how to skip a preamble, fold a unit row and drop a trailing footnote.
 *
 * `parseError` makes the failure visible instead of returning a silently empty
 * table: R1 in ARCHITECTURE.md is a placeholder ("Attach a data file to
 * start.") shown while data is plainly on screen, because the gate had no way
 * to tell "no dataset" from "dataset that failed to parse". This module is
 * what lets the gate tell them apart.
 */

import * as XLSX from "xlsx"
import { snapshotToXlsxWorkbook, type UniverWorkbookSnapshot } from "@/lib/spreadsheet-workbook"
import { detectHeader, tableFromGrid } from "@/lib/data-analysis/workspace/bootstrap"

/** One row keyed by column name, the shape the chart and stats panels hold. */
export type Row = Record<string, number | string>

export type SnapshotTable = {
  columns: string[]
  rows: Row[]
  /** Non-null explains why the table is empty. Never set just because there are 0 rows. */
  parseError: string | null
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** A grid cell as XLSX's `header: 1` mode hands it back. */
type Grid = (string | number | null | undefined)[][]

function sheetToGrid(ws: XLSX.WorkSheet): Grid {
  return XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, blankrows: true })
}

/** Coerce a `tableFromGrid` cell the way the legacy reader always has: blank
 *  becomes `""`, a numeric-looking string becomes a number. */
function coerceCell(v: number | string | null): number | string {
  if (v === null) return ""
  if (typeof v === "number") return v
  if (v === "" || !isFinite(Number(v))) return v
  return Number(v)
}

function legacyReadFirstSheet(ws: XLSX.WorkSheet): { columns: string[]; rows: Row[] } {
  const aoa = sheetToGrid(ws)
  const header = (aoa[0] ?? []).map((c) => String(c ?? "").trim()).filter(Boolean)
  const rows: Row[] = aoa.slice(1).map((r) => {
    const o: Row = {}
    header.forEach((h, i) => {
      o[h] = coerceCell((r[i] ?? null) as number | string | null)
    })
    return o
  })
  return { columns: header, rows }
}

/** Read one sheet with the preamble/unit-row-aware detector, folded into the
 *  flat row shape every other reader here expects. */
function detectedReadSheet(grid: Grid): { columns: string[]; rows: Row[] } | null {
  const plan = detectHeader(grid)
  if (plan.columns.length === 0) return null
  const table = tableFromGrid(grid)
  if (table.columns.length === 0) return null
  const rows: Row[] = table.rows.map((r) => {
    const o: Row = {}
    for (const c of table.columns) o[c] = coerceCell(r.values[c] ?? null)
    return o
  })
  return { columns: table.columns, rows }
}

export function snapshotToTable(snapshot: UniverWorkbookSnapshot): SnapshotTable {
  let wb: XLSX.WorkBook
  try {
    wb = snapshotToXlsxWorkbook(snapshot)
  } catch (err) {
    return { columns: [], rows: [], parseError: `Could not read this file: ${errorMessage(err)}` }
  }

  const sheetNames = wb.SheetNames ?? []
  if (sheetNames.length === 0) {
    return { columns: [], rows: [], parseError: "This file has no sheets." }
  }

  const firstSheet = wb.Sheets[sheetNames[0]]
  if (firstSheet) {
    try {
      const legacy = legacyReadFirstSheet(firstSheet)
      if (legacy.columns.length > 0) {
        const grid = sheetToGrid(firstSheet)
        const plan = detectHeader(grid)
        // Trust the verbatim row-0 reading unless detection itself concludes
        // row 0 is a title sitting above the real header — that is the one
        // case the legacy reader gets silently wrong rather than just empty.
        if (plan.startRow === 0) {
          return { ...legacy, parseError: null }
        }
      }
    } catch {
      // Fall through to the sheet scan below.
    }
  }

  // The legacy reading of sheet 1 was empty or a title row. Look for the real
  // table: on sheet 1 itself (past the preamble) first, then later sheets.
  let lastRationale: string | null = null
  for (const name of sheetNames) {
    const ws = wb.Sheets[name]
    if (!ws) continue
    try {
      const grid = sheetToGrid(ws)
      const found = detectedReadSheet(grid)
      if (found) return { ...found, parseError: null }
      lastRationale = detectHeader(grid).rationale
    } catch (err) {
      lastRationale = errorMessage(err)
    }
  }

  return {
    columns: [],
    rows: [],
    parseError:
      sheetNames.length > 1
        ? `No header row was found on any of the ${sheetNames.length} sheets in this file.`
        : `No header row was found on this sheet.${lastRationale ? ` ${lastRationale}` : ""}`,
  }
}
