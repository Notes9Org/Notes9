import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx"
import { buildSpreadsheetWorkbookSnapshot } from "@/lib/spreadsheet-workbook"
import { snapshotSheetNames, snapshotToTable } from "./snapshot-table"
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

/* ── Which sheet is analysed ───────────────────────────────────────────────── */

/** A two-sheet workbook whose sheets carry DIFFERENT columns and values, so
 *  "which sheet was read" is answerable from the result and not just asserted. */
function twoSheetSnapshot() {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Treatment", "Viability"],
      ["Vehicle", 91],
      ["Drug", 47],
    ]),
    "Screen A"
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Dose", "Response"],
      [1, 10],
      [3, 30],
      [9, 90],
    ]),
    "Screen B"
  )
  return buildSpreadsheetWorkbookSnapshot("two-sheets.xlsx", wb)
}

describe("the analysed sheet is chosen, not assumed", () => {
  const snapshot = twoSheetSnapshot()

  it("reads sheet 1 and says so when nothing is pinned", () => {
    const t = snapshotToTable(snapshot)
    expect(t.sheetName).toBe("Screen A")
    expect(t.columns).toEqual(["Treatment", "Viability"])
  })

  it("analyses a DIFFERENT sheet when one is pinned", () => {
    // The bug this closes: the grid showed sheet 2 and the chart, the
    // statistics and the standard curve all computed from sheet 1. Pinning has
    // to change the numbers, not just a label.
    const t = snapshotToTable(snapshot, "Screen B")
    expect(t.sheetName).toBe("Screen B")
    expect(t.columns).toEqual(["Dose", "Response"])
    expect(t.rows).toEqual([
      { Dose: 1, Response: 10 },
      { Dose: 3, Response: 30 },
      { Dose: 9, Response: 90 },
    ])
    expect(t.rowIds).toEqual(["row-2", "row-3", "row-4"])
    expect(t.parseError).toBeNull()
  })

  it("leaves an unpinned read byte-identical to the pre-picker reading", () => {
    // The backward-compatibility contract for analyses saved before the picker
    // existed: they carry no pin, so they must resolve exactly as they did.
    const before = snapshotToTable(snapshot)
    const { sheetName: _s, ...rest } = before
    expect(rest).toEqual({
      columns: ["Treatment", "Viability"],
      rows: [
        { Treatment: "Vehicle", Viability: 91 },
        { Treatment: "Drug", Viability: 47 },
      ],
      rowIds: ["row-2", "row-3"],
      parseError: null,
    })
  })
})

describe("a pin is a decision, not a hint", () => {
  it("does NOT fall through to another sheet when the pinned one has no header", () => {
    // The existing later-sheet scan is a fallback for "nobody chose". Letting
    // it fire under a pin would silently re-point a saved analysis at data it
    // was never about — the exact failure the pin exists to stop.
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[], []]), "Blank")
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Dose", "Response"],
        [1, 10],
      ]),
      "Real"
    )
    const snapshot = buildSpreadsheetWorkbookSnapshot("mixed.xlsx", wb)

    // Unpinned, the scan legitimately walks past the blank sheet.
    expect(snapshotToTable(snapshot).sheetName).toBe("Real")

    // Pinned to the blank one, it stops there and says why.
    const pinned = snapshotToTable(snapshot, "Blank")
    expect(pinned.columns).toEqual([])
    expect(pinned.rows).toEqual([])
    expect(pinned.parseError).toMatch(/Blank/)
  })

  it("refuses to analyse a substitute when the pinned sheet is gone", () => {
    const gone = snapshotToTable(twoSheetSnapshot(), "Screen C")
    expect(gone.columns).toEqual([])
    expect(gone.sheetName).toBeNull()
    expect(gone.parseError).toMatch(/Screen C/)
  })
})

describe("snapshotSheetNames", () => {
  it("lists the sheets in tab order for the picker", () => {
    expect(snapshotSheetNames(twoSheetSnapshot())).toEqual(["Screen A", "Screen B"])
  })
})
