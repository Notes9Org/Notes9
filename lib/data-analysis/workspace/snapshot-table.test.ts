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
 * A sheet with a dedicated unit row under the header.
 *
 * This file used to pin the OPPOSITE of what it pins now. The verbatim row-0
 * read was kept because `detectHeader` renames the column ("OD600" ->
 * "OD600 (nm)"), moves the data start and changes the version hash, which
 * reshuffles analyses saved against a sheet like this. The reason that trade
 * was reversed: the verbatim read put the literal string "(nm)" into a numeric
 * column as a data point, so the analysis ran on a sample that does not exist.
 * A saved spec that stops resolving is visible; a fabricated data point is not.
 *
 * What a previously-saved analysis of a sheet like this now sees on reopen: a
 * changed `dataset.versionHash`, so the reopen path reports drift rather than
 * recomputing quietly, and `xKey`/`yKeys` naming "OD600" no longer resolve
 * until re-picked. Nothing is lost or rewritten; the analysis opens and says
 * the data reads differently.
 */
const UNIT_ROW_SHEET: (string | number)[][] = [
  ["Sample", "OD600"],
  ["", "(nm)"],
  ["S1", 0.42],
  ["S2", 0.61],
  ["S3", 0.88],
]

describe("snapshotToTable reads a sheet with the header detector", () => {
  const table = snapshotToTable(snapshotOf(UNIT_ROW_SHEET))
  const specTable = tableFromChartRows(table.columns, table.rows, table.rowIds)

  it("folds the unit row into the name instead of leaving it as a data row", () => {
    expect(table.columns).toEqual(["Sample", "OD600 (nm)"])
  })

  it("anchors every rowId to the spreadsheet row it came from", () => {
    // S1 is on spreadsheet row 3. Positional ids called it row-2, so an
    // exclusion on it cited row 2 — the unit row — in the provenance table.
    expect(specTable.rows).toHaveLength(3)
    expect(specTable.rows.map((r) => r.rowId)).toEqual(["row-3", "row-4", "row-5"])
    expect(specTable.rows.find((r) => r.rowId === "row-4")?.values.Sample).toBe("S2")
  })

  it("picks the ids up without being handed them, so existing callers get them", () => {
    // The workspace calls `tableFromChartRows(t.columns, t.rows)` with no ids.
    expect(tableFromChartRows(table.columns, table.rows).rows.map((r) => r.rowId)).toEqual([
      "row-3",
      "row-4",
      "row-5",
    ])
  })
})

describe("an ordinary sheet reads exactly as it always did", () => {
  // The compatibility contract: where the verbatim row-0 read and the detector
  // agree, every byte a saved analysis references is unchanged — column names,
  // values, row ids and the version hash digits.
  const plain = snapshotToTable(
    snapshotOf([
      ["Treatment", "Viability"],
      ["Vehicle", 91],
      ["Drug", 47],
    ])
  )

  it("keeps the columns and values", () => {
    expect(plain.columns).toEqual(["Treatment", "Viability"])
    expect(plain.rows).toEqual([
      { Treatment: "Vehicle", Viability: 91 },
      { Treatment: "Drug", Viability: 47 },
    ])
  })

  it("keeps the row ids saved exclusions reference", () => {
    expect(plain.rowIds).toEqual(["row-2", "row-3"])
  })

  it("keeps the version hash digits stored analyses were checked against", () => {
    // Compared against the reading actually in use before this change rather
    // than a pinned constant, so the compatibility claim is checked and not
    // just asserted. (bootstrap.test.ts pins the digits themselves, which is
    // what shows the hash label changed without the value moving.)
    const legacy = legacyRead([
      ["Treatment", "Viability"],
      ["Vehicle", 91],
      ["Drug", 47],
    ])
    expect(hashTable(tableFromChartRows(plain.columns, plain.rows))).toBe(
      hashTable(tableFromChartRows(legacy.columns, legacy.rows))
    )
    expect(plain.columns).toEqual(legacy.columns)
    expect(plain.rows).toEqual(legacy.rows)
    expect(plain.rowIds).toEqual(legacy.rows.map((_, i) => `row-${i + 2}`))
  })
})

/**
 * The reader this module used before header detection was routed through, kept
 * here verbatim so the "nothing changed for an ordinary sheet" claim above is
 * an executed comparison rather than a pinned magic number.
 */
function legacyRead(aoa: (string | number)[][]): {
  columns: string[]
  rows: Record<string, number | string>[]
} {
  const header = (aoa[0] ?? []).map((c) => String(c ?? "").trim()).filter(Boolean)
  const coerce = (v: number | string | null): number | string => {
    if (v === null) return ""
    if (typeof v === "number") return v
    if (v === "" || !isFinite(Number(v))) return v
    return Number(v)
  }
  const rows = aoa.slice(1).map((r) => {
    const o: Record<string, number | string> = {}
    header.forEach((h, i) => {
      o[h] = coerce((r[i] ?? null) as number | string | null)
    })
    return o
  })
  return { columns: header, rows }
}
