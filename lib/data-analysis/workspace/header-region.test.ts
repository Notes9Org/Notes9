/**
 * Where the table IS, when it does not start at A1.
 *
 * A plate reader writes a run header down the left, a blank spacer column, then
 * the grid. Reading from column A gave two nameless `Column 1`/`Column 2`
 * entries in front of the real ones and offered them as axes. These pin the
 * column half of the detector, and the cell addressing that makes the answer
 * showable to a researcher.
 */
import { describe, expect, it } from "vitest"
import {
  cellAddress,
  columnLetter,
  detectHeader,
  planColumnRange,
  planDataRange,
  tableFromGrid,
} from "@/lib/data-analysis/workspace/bootstrap"

describe("columnLetter", () => {
  it("counts in base 26 with no zero digit", () => {
    expect(columnLetter(0)).toBe("A")
    expect(columnLetter(25)).toBe("Z")
    expect(columnLetter(26)).toBe("AA")
    expect(columnLetter(27)).toBe("AB")
    expect(columnLetter(51)).toBe("AZ")
    expect(columnLetter(52)).toBe("BA")
    expect(columnLetter(701)).toBe("ZZ")
    expect(columnLetter(702)).toBe("AAA")
  })

  it("returns nothing for a nonsense index rather than inventing a column", () => {
    expect(columnLetter(-1)).toBe("")
    expect(columnLetter(NaN)).toBe("")
  })
})

describe("cellAddress", () => {
  it("pairs the letter with a 1-based row", () => {
    expect(cellAddress(0, 0)).toBe("A1")
    expect(cellAddress(2, 3)).toBe("C4")
    expect(cellAddress(27, 99)).toBe("AB100")
  })
})

describe("leading empty columns", () => {
  const grid = [
    ["", "", "Conc", "OD450"],
    ["", "", 1.5625, 0.089],
    ["", "", 3.125, 0.171],
    ["", "", 6.25, 0.402],
  ]

  it("anchors the table at the first column that carries anything", () => {
    const plan = detectHeader(grid)
    expect(plan.startCol).toBe(2)
    expect(plan.endCol).toBe(3)
    expect(plan.columns).toEqual(["Conc", "OD450"])
  })

  it("reads the values from the offset columns, not from column A", () => {
    const table = tableFromGrid(grid)
    expect(table.columns).toEqual(["Conc", "OD450"])
    expect(table.rows[0].values).toEqual({ Conc: 1.5625, OD450: 0.089 })
    expect(table.rows).toHaveLength(3)
  })

  it("keeps the sheet's own row numbers as ids", () => {
    expect(tableFromGrid(grid).rows.map((r) => r.rowId)).toEqual(["row-2", "row-3", "row-4"])
  })

  it("says which columns it skipped", () => {
    expect(detectHeader(grid).rationale).toContain("Columns A-B skipped as empty")
  })
})

describe("a title above a table that starts mid-sheet", () => {
  // The title is in A1. Judging column occupancy over the whole grid would
  // anchor the table to column A and drag two empty columns in with it.
  const grid = [
    ["Plate 3 — run 2026-08-14"],
    [],
    ["", "", "Conc", "OD450"],
    ["", "", 1.5625, 0.089],
    ["", "", 3.125, 0.171],
    ["", "", 6.25, 0.402],
  ]

  it("does not let the title anchor the table to column A", () => {
    const plan = detectHeader(grid)
    expect(plan.startCol).toBe(2)
    expect(plan.columns).toEqual(["Conc", "OD450"])
  })

  it("still skips the title row", () => {
    expect(detectHeader(grid).startRow).toBe(2)
    expect(tableFromGrid(grid).rows).toHaveLength(3)
  })
})

describe("trailing empty columns", () => {
  it("drops a header cell with nothing under it rather than naming it Column 4", () => {
    const plan = detectHeader([
      ["Sample", "OD600", "", ""],
      ["S1", 0.42, "", ""],
      ["S2", 0.61, "", ""],
    ])
    expect(plan.columns).toEqual(["Sample", "OD600"])
    expect(plan.endCol).toBe(1)
  })
})

describe("a column that is blank in the header but carries data", () => {
  it("is kept, because it carries something", () => {
    const plan = detectHeader([
      ["", "OD600"],
      ["S1", 0.42],
      ["S2", 0.61],
    ])
    // Not trimmed: column A has values, it just has no name.
    expect(plan.startCol).toBe(0)
    expect(plan.columns).toHaveLength(2)
  })
})

describe("the ordinary sheet is untouched", () => {
  const grid = [
    ["Time", "Signal"],
    [0, 1.0],
    [1, 1.5],
  ]

  it("reads full width, so nothing about it changes", () => {
    const plan = detectHeader(grid)
    expect(plan.startCol).toBe(0)
    expect(plan.endCol).toBe(1)
    expect(plan.columns).toEqual(["Time", "Signal"])
  })
})

describe("overrides settle what detection cannot", () => {
  const grid = [
    ["run id", "", "Conc", "OD450"],
    ["p3", "", 1.5625, 0.089],
    ["p3", "", 3.125, 0.171],
  ]

  it("honours an explicit start column over the detected one", () => {
    // Column A carries a run id all the way down, so nothing is trimmed.
    expect(detectHeader(grid).startCol).toBe(0)
    expect(detectHeader(grid, { startCol: 2 }).columns).toEqual(["Conc", "OD450"])
  })

  it("honours an explicit end column", () => {
    const plan = detectHeader(grid, { startCol: 2, endCol: 2 })
    expect(plan.columns).toEqual(["Conc"])
    expect(tableFromGrid(grid, { header: { startCol: 2, endCol: 2 } }).rows[0].values).toEqual({
      Conc: 1.5625,
    })
  })

  it("combines a column override with a row override", () => {
    const table = tableFromGrid(grid, { header: { startCol: 2, endRow: 1 } })
    expect(table.rows).toHaveLength(1)
    expect(table.columns).toEqual(["Conc", "OD450"])
  })
})

describe("A1 ranges for what was read", () => {
  const grid = [
    ["", "", "Conc", "OD450"],
    ["", "", 1.5625, 0.089],
    ["", "", 3.125, 0.171],
    ["", "", 6.25, 0.402],
  ]

  it("names a column's own range, offset included", () => {
    const plan = detectHeader(grid)
    expect(planColumnRange(plan, 0)).toBe("C2:C4")
    expect(planColumnRange(plan, 1)).toBe("D2:D4")
  })

  it("names the whole data block", () => {
    expect(planDataRange(detectHeader(grid))).toBe("C2:D4")
  })

  it("returns nothing for a column that does not exist", () => {
    expect(planColumnRange(detectHeader(grid), 9)).toBe("")
  })

  it("returns nothing when there is no data under the header", () => {
    const plan = detectHeader([["Conc", "OD450"]])
    expect(planDataRange(plan)).toBe("")
  })
})
