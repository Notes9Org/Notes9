import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx"
import { buildSpreadsheetWorkbookSnapshot, type UniverWorkbookSnapshot } from "@/lib/spreadsheet-workbook"
import { snapshotToTable } from "@/lib/data-analysis/workspace/snapshot-table"

/**
 * Slice 01 (ARCHITECTURE.md "Shape" failure mode): a parse failure must be a
 * visible state, never a silently empty table, and the reader must find data
 * that is not on the first sheet or that sits under a title preamble.
 */

function workbookOf(sheets: Record<string, (string | number)[][]>): UniverWorkbookSnapshot {
  const wb = XLSX.utils.book_new()
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name)
  }
  return buildSpreadsheetWorkbookSnapshot("data.xlsx", wb)
}

const HEADER_ROWS: (string | number)[][] = [
  ["Well", "OD600"],
  ["A1", 0.42],
  ["A2", 0.61],
  ["A3", 0.88],
]

describe("snapshotToTable", () => {
  it("reads the ordinary case: header on row 0 of sheet 1", () => {
    const table = snapshotToTable(workbookOf({ Sheet1: HEADER_ROWS }))
    expect(table.parseError).toBeNull()
    expect(table.columns).toEqual(["Well", "OD600"])
    expect(table.rows).toHaveLength(3)
    expect(table.rows[0]).toEqual({ Well: "A1", OD600: 0.42 })
  })

  it("finds the data when it is not on the first sheet", () => {
    const table = snapshotToTable(
      workbookOf({
        Notes: [],
        Sheet2: HEADER_ROWS,
      }),
    )
    expect(table.parseError).toBeNull()
    expect(table.columns).toEqual(["Well", "OD600"])
    expect(table.rows).toHaveLength(3)
  })

  it("finds the data under a title/metadata preamble above the header", () => {
    const table = snapshotToTable(
      workbookOf({
        Sheet1: [["Plate reader export — run 2026-08-16"], ...HEADER_ROWS],
      }),
    )
    expect(table.parseError).toBeNull()
    expect(table.columns).toEqual(["Well", "OD600"])
    expect(table.rows.length).toBeGreaterThan(0)
  })

  it("surfaces a parseError instead of a silent empty table when no sheet has a header", () => {
    const table = snapshotToTable(
      workbookOf({
        Sheet1: [[]],
        Sheet2: [["", ""], ["", ""]],
      }),
    )
    expect(table.columns).toEqual([])
    expect(table.rows).toEqual([])
    expect(table.parseError).toBeTruthy()
    expect(typeof table.parseError).toBe("string")
  })

  it("never swallows a throw into a silently-empty result", () => {
    // Not a real UniverWorkbookSnapshot: snapshotToXlsxWorkbook must throw on it.
    const broken = { garbage: true } as unknown as UniverWorkbookSnapshot
    const table = snapshotToTable(broken)
    expect(table.columns).toEqual([])
    expect(table.rows).toEqual([])
    expect(table.parseError).toBeTruthy()
  })

  it("a header row with zero data rows is a valid empty table, not a parse error", () => {
    const table = snapshotToTable(workbookOf({ Sheet1: [["Well", "OD600"]] }))
    expect(table.columns).toEqual(["Well", "OD600"])
    expect(table.rows).toEqual([])
    expect(table.parseError).toBeNull()
  })
})
