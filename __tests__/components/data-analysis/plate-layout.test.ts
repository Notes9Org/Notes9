/**
 * T0.2 — the re-enabled plate map opens on the right layout.
 *
 * `PlateModelInit` existed with no caller, so every sheet booted at 96-well
 * with `originRow = 0`. A 384-well plate came up as 96 even though detection
 * had already said 384, and because the grid handed to the model INCLUDES the
 * header row, well A1 landed on a column name and the whole plate sat one row
 * too high. Both are silent: the researcher sees a plate, just the wrong one.
 */

import { describe, expect, it } from "vitest"

import { plateLayoutFromSheet } from "@/components/data-analysis/plate-view"
import { plateFromGrid } from "@/lib/data-analysis/plate"

const HEADERED: (string | number)[][] = [
  ["Row", "1", "2", "3"],
  ["A", 0.11, 0.21, 0.31],
  ["B", 0.12, 0.22, 0.32],
]

describe("plateLayoutFromSheet", () => {
  it("uses the format detection already found", () => {
    expect(plateLayoutFromSheet(HEADERED, { plate: true, plateFormat: 384 }).format).toBe(384)
    expect(plateLayoutFromSheet(HEADERED, { plate: true, plateFormat: 96 }).format).toBe(96)
    // `plateFormat` is nullable on the detection result.
    expect(plateLayoutFromSheet(HEADERED, { plate: true, plateFormat: null }).format).toBe(96)
  })

  it("starts below a header row and past the row-label column", () => {
    expect(plateLayoutFromSheet(HEADERED, { plate: true })).toMatchObject({ originRow: 1, originCol: 1 })
  })

  it("starts at row 0 when the readings begin there", () => {
    const raw: (string | number)[][] = [
      ["A", 0.11, 0.21],
      ["B", 0.12, 0.22],
    ]
    expect(plateLayoutFromSheet(raw, { plate: true })).toMatchObject({ originRow: 0, originCol: 1 })
  })

  it("leaves the origin alone on a bare numeric grid", () => {
    const bare: (string | number)[][] = [
      [0.11, 0.21],
      [0.12, 0.22],
    ]
    expect(plateLayoutFromSheet(bare, { plate: true })).toMatchObject({ originRow: 0, originCol: 0 })
  })

  it("does not push the origin down on an empty sheet", () => {
    // `every` on an empty row is vacuously true, which would move the origin
    // for no reason.
    expect(plateLayoutFromSheet([], { plate: true })).toMatchObject({ originRow: 0, originCol: 0 })
    expect(plateLayoutFromSheet([[]], { plate: true })).toMatchObject({ originRow: 0, originCol: 0 })
  })
})

describe("the layout the plate model is seeded with", () => {
  it("puts the first reading in well A1 instead of a header string", () => {
    const wrong = plateFromGrid(HEADERED, 96, 0, 0)
    const layout = plateLayoutFromSheet(HEADERED, { plate: true })
    const right = plateFromGrid(HEADERED, 96, layout.originRow, layout.originCol)

    // Seeded from 0,0 the plate reads the header row and the row-label
    // column, so A1 is empty and every reading has shifted.
    expect(wrong.wells[0][0].value).toBeNull()
    expect(right.wells[0][0].value).toBe(0.11)
    expect(right.wells[1][0].value).toBe(0.12)
  })
})
