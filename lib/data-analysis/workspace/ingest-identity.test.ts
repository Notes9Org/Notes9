/**
 * Ingestion defects that misattribute samples.
 *
 * Every case here reads a sheet the way the workspace reads it — snapshot ->
 * `snapshotToTable` -> `tableFromChartRows` — because that is the path an
 * exclusion, a filter and a provenance row actually travel. A unit test against
 * `tableFromGrid` alone passes while the live path is still wrong.
 */

import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx"
import { buildSpreadsheetWorkbookSnapshot } from "@/lib/spreadsheet-workbook"
import { snapshotToTable } from "./snapshot-table"
import { tableFromChartRows } from "./chart-state-spec"
import { hashTable, tableFromGrid } from "./bootstrap"
import { checkExclusions } from "./saved-analysis-session"
import { profileTable } from "@/lib/data-analysis/semantic/infer"

const snapshotOf = (aoa: (string | number)[][]) => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Sheet1")
  return buildSpreadsheetWorkbookSnapshot("plate.xlsx", wb)
}

/** The live path, end to end: what the chart, the stats panel and the spec see. */
function readLive(aoa: (string | number)[][]) {
  const table = snapshotToTable(snapshotOf(aoa))
  return { table, spec: tableFromChartRows(table.columns, table.rows) }
}

/* ── Task 2: the header detector is bypassed on the live path ──────────────*/

describe("the live read uses the header detector", () => {
  it("keeps all four data columns of a two-row merged header", () => {
    const { table } = readLive([
      ["", "Vehicle", "", "Drug", ""],
      ["Time", "Mean", "SD", "Mean", "SD"],
      [0, 1.0, 0.1, 2.0, 0.2],
      [1, 1.5, 0.15, 2.5, 0.25],
    ])
    expect(table.columns).toEqual(["Time", "Vehicle Mean", "Vehicle SD", "Drug Mean", "Drug SD"])
    expect(table.rows[0]).toMatchObject({
      Time: 0,
      "Vehicle Mean": 1.0,
      "Vehicle SD": 0.1,
      "Drug Mean": 2.0,
      "Drug SD": 0.2,
    })
  })

  it("does not turn a unit row into a data row", () => {
    const { table } = readLive([
      ["Sample", "OD600"],
      ["", "(nm)"],
      ["S1", 0.42],
      ["S2", 0.61],
      ["S3", 0.88],
    ])
    expect(table.rows).toHaveLength(3)
    // The unit row is read as units and folded into the name, so the column is
    // "OD600 (nm)" and the string "(nm)" never reaches a numeric column. This
    // renames the column for saved specs of sheets shaped like this — see the
    // compatibility note at the top of snapshot-table.ts.
    expect(table.columns).toEqual(["Sample", "OD600 (nm)"])
    expect(table.rows.map((r) => r["OD600 (nm)"])).toEqual([0.42, 0.61, 0.88])
  })

  it("does not turn a trailing footnote into a data row", () => {
    const { table } = readLive([
      ["Sample", "OD"],
      ["S1", 1],
      ["S2", 2],
      ["", ""],
      ["n = 2", ""],
    ])
    expect(table.rows).toHaveLength(2)
    expect(table.rows.map((r) => r.Sample)).toEqual(["S1", "S2"])
  })

  it("keeps both columns' values when two columns share a name", () => {
    const { table } = readLive([
      ["Time", "OD", "OD"],
      [0, 0.1, 0.9],
      [1, 0.2, 0.8],
    ])
    // The first OD column's values must survive somewhere. Before the fix the
    // last duplicate overwrote it and the header was deduped on top.
    expect(table.columns).toHaveLength(3)
    const first = table.columns[1]
    const second = table.columns[2]
    expect(table.rows.map((r) => r[first])).toEqual([0.1, 0.2])
    expect(table.rows.map((r) => r[second])).toEqual([0.9, 0.8])
  })
})

/* ── Task 1: row identity is positional ────────────────────────────────────*/

describe("row identity is anchored to the sheet, not the array index", () => {
  it("does not shift ids when a title sits above the header", () => {
    const { spec } = readLive([
      ["Plate 3, run 2024-05-02", "", ""],
      ["Sample", "Group", "OD"],
      ["S1", "A", 1],
      ["S2", "B", 2],
      ["S3", "A", 3],
    ])
    // S1 is on spreadsheet row 3. An exclusion recorded against "row-3" and
    // shown in the provenance table as row 3 must be S1.
    expect(spec.rows.map((r) => r.rowId)).toEqual(["row-3", "row-4", "row-5"])
    expect(spec.rows.find((r) => r.rowId === "row-3")?.values.Sample).toBe("S1")
  })

  it("does not shift ids when a blank spacer row sits above the header", () => {
    const { spec } = readLive([
      ["", ""],
      ["Sample", "OD"],
      ["S1", 1],
      ["S2", 2],
    ])
    expect(spec.rows.map((r) => r.rowId)).toEqual(["row-3", "row-4"])
    expect(spec.rows.find((r) => r.rowId === "row-3")?.values.Sample).toBe("S1")
  })

  it("leaves the ordinary sheet's ids exactly where saved analyses expect them", () => {
    const { spec } = readLive([
      ["Sample", "OD"],
      ["S1", 1],
      ["S2", 2],
      ["S3", 3],
    ])
    expect(spec.rows.map((r) => r.rowId)).toEqual(["row-2", "row-3", "row-4"])
  })
})

describe("a row inserted above an exclusion is reported, not silently applied", () => {
  const saved = readLive([
    ["Sample", "OD"],
    ["S1", 1],
    ["S2", 2],
    ["S3", 3],
  ]).spec
  const afterInsert = readLive([
    ["Sample", "OD"],
    ["S0", 0],
    ["S1", 1],
    ["S2", 2],
    ["S3", 3],
  ]).spec

  it("still resolves the id, which is why the orphan check never fires", () => {
    expect(afterInsert.rows.some((r) => r.rowId === "row-3")).toBe(true)
  })

  it("reports that row-3 is no longer the sample it was excluded on", () => {
    // Saved: row-3 is S2. After the insert, row-3 is S1.
    expect(checkExclusions(saved, afterInsert, [{ rowId: "row-3" }])).toEqual([
      { rowId: "row-3", status: "moved" },
    ])
  })

  it("says nothing when the sheet is untouched", () => {
    expect(checkExclusions(saved, saved, [{ rowId: "row-3" }])).toEqual([
      { rowId: "row-3", status: "ok" },
    ])
  })

  it("still reports a deleted row as missing", () => {
    const afterDelete = readLive([
      ["Sample", "OD"],
      ["S1", 1],
      ["S2", 2],
    ]).spec
    expect(checkExclusions(saved, afterDelete, [{ rowId: "row-4" }])).toEqual([
      { rowId: "row-4", status: "missing" },
    ])
  })
})

/* ── Task 3: duplicate column names in the good path ───────────────────────*/

describe("tableFromGrid disambiguates duplicate column names", () => {
  it("keeps a column per duplicate instead of the last one winning", () => {
    const table = tableFromGrid([
      ["Time", "OD", "OD"],
      [0, 0.1, 0.9],
    ])
    expect(table.columns).toEqual(["Time", "OD", "OD (2)"])
    expect(table.rows[0].values).toEqual({ Time: 0, OD: 0.1, "OD (2)": 0.9 })
  })

  it("does not rename a column that is already unique", () => {
    expect(tableFromGrid([["Time", "OD"], [0, 0.1]]).columns).toEqual(["Time", "OD"])
  })
})

/* ── Task 4: the hash is not SHA-256 ───────────────────────────────────────*/

describe("hashTable labels itself honestly", () => {
  const table = tableFromGrid([
    ["Sample", "OD"],
    ["S1", 1],
  ])

  it("does not claim to be SHA-256", () => {
    expect(hashTable(table).startsWith("sha256:")).toBe(false)
  })

  it("names the function it actually is, over the same 64 bits", () => {
    expect(hashTable(table)).toMatch(/^fnv1a64:[0-9a-f]{16}$/)
  })
})

/* ── Task 5: two readers disagreed on "missing" ────────────────────────────*/

describe("a blank cell is one thing on both read paths", () => {
  const aoa: (string | number)[][] = [
    ["Sample", "Group", "OD"],
    ["S1", "A", 1],
    ["S2", "", 2],
    ["S3", "A", ""],
  ]

  it("reads a blank as null in the Table both readers feed", () => {
    const { spec } = readLive(aoa)
    expect(spec.rows[1].values.Group).toBeNull()
    expect(spec.rows[2].values.OD).toBeNull()
    // tableFromGrid, the other reader, already said null. They now agree.
    expect(tableFromGrid(aoa).rows[1].values.Group).toBeNull()
  })

  it("leaves the downstream missing count and version hash unchanged", () => {
    const { spec } = readLive(aoa)
    const profiles = Object.fromEntries(profileTable(spec).map((p) => [p.column, p.missing]))
    expect(profiles).toEqual({ Sample: 0, Group: 1, OD: 1 })
    // Same bits as the old `""` reading: `hashTable` writes `?? ""` either way.
    expect(hashTable(spec)).toBe(
      hashTable({
        columns: spec.columns,
        rows: spec.rows.map((r) => ({
          rowId: r.rowId,
          values: Object.fromEntries(
            Object.entries(r.values).map(([k, v]) => [k, v === null ? "" : v])
          ),
        })),
      })
    )
  })
})
