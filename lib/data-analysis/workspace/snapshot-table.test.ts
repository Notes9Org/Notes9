import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx"
import { buildSpreadsheetWorkbookSnapshot } from "@/lib/spreadsheet-workbook"
import { snapshotToTable } from "./snapshot-table"
import { tableFromChartRows } from "./chart-state-spec"
import { hashTable } from "./bootstrap"

const snapshotOf = (aoa: (string | number)[][]) => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Sheet1")
  return buildSpreadsheetWorkbookSnapshot("plate.xlsx", wb)
}

/**
 * A sheet with a dedicated unit row under the header: the shape `detectHeader`
 * reads differently from the way every analysis already in the database was
 * saved. It folds "(nm)" into the column name and starts the data one row
 * lower, which renames the column, shifts every positional `rowId` by one and
 * changes the version hash.
 */
const UNIT_ROW_SHEET: (string | number)[][] = [
  ["Sample", "OD600"],
  ["", "(nm)"],
  ["S1", 0.42],
  ["S2", 0.61],
  ["S3", 0.88],
]

describe("snapshotToTable reads a stored sheet the way it was stored", () => {
  const table = snapshotToTable(snapshotOf(UNIT_ROW_SHEET))
  const specTable = tableFromChartRows(table.columns, table.rows)

  it("names columns from row 1 verbatim, with no unit folded in", () => {
    // A stored spec's xKey / yKeys / responseColumns / filter columns are these
    // strings. Renaming "OD600" to "OD600 (nm)" makes every one of them stop
    // resolving on reopen.
    expect(table.columns).toEqual(["Sample", "OD600"])
  })

  it("keeps a stored exclusion on the row it was drawn on", () => {
    // `rowId` is positional (`row-${i + 2}`), so moving where the data starts
    // silently re-points an exclusion at a different physical row. That is a
    // data-integrity failure, not a cosmetic one.
    expect(specTable.rows).toHaveLength(4)
    expect(specTable.rows.map((r) => r.rowId)).toEqual(["row-2", "row-3", "row-4", "row-5"])
    expect(specTable.rows.find((r) => r.rowId === "row-4")?.values.Sample).toBe("S2")
  })

  it("hashes to the value stored analyses were checked against", () => {
    // Pinned from the reading in use before header detection existed. If this
    // changes, every pre-existing analysis of a sheet like this reports drift
    // or detaches on reopen.
    expect(hashTable(specTable)).toBe("sha256:97a90926a069d6bc")
  })

  it("still reads an ordinary sheet the obvious way", () => {
    const plain = snapshotToTable(
      snapshotOf([
        ["Treatment", "Viability"],
        ["Vehicle", 91],
        ["Drug", 47],
      ])
    )
    expect(plain.columns).toEqual(["Treatment", "Viability"])
    expect(plain.rows).toEqual([
      { Treatment: "Vehicle", Viability: 91 },
      { Treatment: "Drug", Viability: 47 },
    ])
  })
})
