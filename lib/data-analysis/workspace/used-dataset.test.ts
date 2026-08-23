import { describe, it, expect } from "vitest"

import type { EngineResult } from "@/lib/data-analysis/engine/contract"
import {
  usedDatasetColumns,
  usedDatasetGrid,
  usedDatasetToCsv,
  usedDatasetFileName,
} from "./used-dataset"

type PlotData = EngineResult["plotData"]

const rows: PlotData = [
  { rowId: "row-2", values: { arm: "Ctrl", signal: 2.1 }, excluded: false },
  { rowId: "row-3", values: { arm: "Ctrl", signal: 9.9 }, excluded: true },
  // A transform can introduce a column part-way through the table.
  { rowId: "row-4", values: { arm: "Drug", signal: 3.4, plate: "P2" }, excluded: false },
]

describe("used dataset", () => {
  it("puts identity and exclusion state first, then every column in first-seen order", () => {
    expect(usedDatasetColumns(rows)).toEqual(["row_id", "excluded", "arm", "signal", "plate"])
  })

  it("keeps excluded rows and marks them, rather than dropping them", () => {
    const grid = usedDatasetGrid(rows)
    expect(grid).toHaveLength(4) // header + 3 rows
    expect(grid[2]).toEqual(["row-3", "excluded", "Ctrl", 9.9, null])
    expect(grid[1][1]).toBe("")
  })

  it("fills a column a row does not have with a blank, not with a neighbour's value", () => {
    expect(usedDatasetGrid(rows)[1]).toEqual(["row-2", "", "Ctrl", 2.1, null])
    expect(usedDatasetGrid(rows)[3]).toEqual(["row-4", "", "Drug", 3.4, "P2"])
  })

  it("quotes CSV cells that would otherwise break the row", () => {
    const csv = usedDatasetToCsv([
      { rowId: "row-2", values: { note: 'a,b "c"\nd' }, excluded: false },
    ])
    expect(csv).toBe('row_id,excluded,note\r\nrow-2,,"a,b ""c""\nd"')
  })

  it("names the file apart from the raw-workbook export", () => {
    expect(usedDatasetFileName("IL-6 dose response!", "csv")).toBe("IL-6-dose-response-used-data.csv")
    expect(usedDatasetFileName("", "xlsx")).toBe("analysis-used-data.xlsx")
  })

  it("survives an empty result without inventing columns", () => {
    expect(usedDatasetColumns([])).toEqual(["row_id", "excluded"])
    expect(usedDatasetToCsv([])).toBe("row_id,excluded")
  })
})
