/**
 * Reading the live sheet the chart workspace draws from.
 *
 * This is the one place a Univer snapshot becomes rows, and its output is
 * load-bearing for data already in the database: the column names become the
 * spec's `xKey`/`yKeys`/`responseColumns` and filter columns, the row order
 * becomes the positional `rowId`s that carry a user's exclusions
 * (`tableFromChartRows`), and the whole thing becomes `dataset.versionHash`.
 *
 * That is why the reading is deliberately dumb: row 0 is the header, verbatim.
 * `detectHeader` in ./bootstrap can do much better (a title above the table, a
 * merged two-row header, a unit row, a trailing footnote), but changing how an
 * existing sheet is read silently re-points every analysis already saved
 * against it: columns it names stop resolving, and an excluded `row-5` lands on
 * a different physical row. Detection can only be turned on here once the plan
 * it chose is stored with the analysis and shown to the user, so a reopen
 * reproduces the reading it was saved under. `HeaderPlan.rationale` and
 * `HeaderOverride` already exist for exactly that; nothing persists them yet.
 */

import * as XLSX from "xlsx"
import { snapshotToXlsxWorkbook, type UniverWorkbookSnapshot } from "@/lib/spreadsheet-workbook"

/** Rows keyed by column name, the shape the chart and stats panels hold. */
export type SnapshotTable = { columns: string[]; rows: Record<string, number | string>[] }

export function snapshotToTable(snapshot: UniverWorkbookSnapshot): SnapshotTable {
  try {
    const wb = snapshotToXlsxWorkbook(snapshot)
    const ws = wb.Sheets[wb.SheetNames[0]]
    if (!ws) return { columns: [], rows: [] }
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, blankrows: false })
    const header = (aoa[0] ?? []).map((c) => String(c ?? "").trim()).filter(Boolean)
    const rows = aoa.slice(1).map((r) => {
      const o: Record<string, number | string> = {}
      header.forEach((h, i) => {
        const v = r[i]
        o[h] = typeof v === "number" ? v : v == null || v === "" ? "" : isFinite(Number(v)) ? Number(v) : String(v)
      })
      return o
    })
    return { columns: header, rows }
  } catch {
    return { columns: [], rows: [] }
  }
}
