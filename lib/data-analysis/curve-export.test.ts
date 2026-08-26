import { describe, expect, it } from "vitest"
import {
  curveExportCsv,
  curveExportColumnWidths,
  curveExportFileName,
  curveExportGrid,
  curveExportTsv,
  type CurveExportInput,
} from "@/lib/data-analysis/curve-export"
import type { CurveFit } from "@/lib/data-analysis/curve-fitting"

function fakeFit(over: Partial<CurveFit> = {}): CurveFit {
  return {
    model: "4pl",
    params: [0.05, 1.2, 12.5, 1.9],
    paramNames: ["Bottom", "Hill", "EC50", "Top"],
    paramSE: [0.01, 0.08, 1.1, 0.03],
    paramCI: [
      [0.03, 0.07],
      [1.04, 1.36],
      [10.3, 14.7],
      [1.84, 1.96],
    ],
    r2: 0.9987,
    adjR2: 0.9981,
    rmse: 0.0142,
    syx: 0.0163,
    aicc: -41.2,
    dof: 4,
    n: 8,
    predict: (x) => x,
    interpolate: (y) => y,
    predictSE: () => 0.01,
    ec50: 12.5,
    ec50CI: [10.3, 14.7],
    ...over,
  } as CurveFit
}

function input(over: Partial<CurveExportInput> = {}): CurveExportInput {
  return {
    model: "4pl",
    modelLabel: "4PL logistic",
    fit: fakeFit(),
    concLabel: "Concentration (pg/mL)",
    signalLabel: "OD450",
    blank: 0.041,
    source: "columns",
    standards: [
      { conc: 1.5625, mean: 0.089, n: 2 },
      { conc: 3.125, mean: 0.171, n: 2 },
      { conc: 6.25, mean: 0.402, n: 2 },
    ],
    unknowns: [
      { label: "Serum A", signal: 0.312, dil: 10, conc: 47.31, inRange: true },
      { label: "Serum B", signal: 1.94, dil: 10, conc: NaN, inRange: false },
      { label: "Serum C", signal: 0.02, dil: 10, conc: 0.9, inRange: false },
    ],
    dilutionApplied: true,
    ...over,
  }
}

const rowStartingWith = (grid: (string | number)[][], label: string) =>
  grid.find((r) => r[0] === label)

describe("curveExportGrid", () => {
  it("carries the fit, the standards and the unknowns in one grid", () => {
    const grid = curveExportGrid(input())
    expect(rowStartingWith(grid, "Model")?.[1]).toBe("4PL logistic")
    expect(rowStartingWith(grid, "R²")?.[1]).toBe(0.9987)
    expect(rowStartingWith(grid, "Standards used (n)")?.[1]).toBe(8)
    expect(rowStartingWith(grid, "Bottom")).toEqual(["Bottom", 0.05, 0.01, 0.03, 0.07])
    expect(rowStartingWith(grid, "Standards")).toBeTruthy()
    expect(rowStartingWith(grid, "Back-calculated unknowns")).toBeTruthy()
    expect(rowStartingWith(grid, "Serum A")).toEqual(["Serum A", 0.312, 10, 47.31, "in range"])
  })

  it("writes full precision, not the panel's 3-decimal display rounding", () => {
    const grid = curveExportGrid(
      input({ standards: [{ conc: 1.5625, mean: 0.0891234567, n: 2 }] })
    )
    const row = grid.find((r) => r[0] === 1.5625)
    expect(row?.[1]).toBe(0.0891234567)
  })

  it("marks an unfittable sample rather than exporting NaN", () => {
    const grid = curveExportGrid(input())
    expect(rowStartingWith(grid, "Serum B")).toEqual(["Serum B", 1.94, 10, "-", "no fit"])
  })

  it("distinguishes extrapolated from in-range, which a bare number cannot", () => {
    const grid = curveExportGrid(input())
    expect(rowStartingWith(grid, "Serum C")?.[4]).toBe("extrapolated")
    expect(rowStartingWith(grid, "Serum A")?.[4]).toBe("in range")
  })

  it("says no blank was subtracted rather than reporting a zero blank", () => {
    expect(rowStartingWith(curveExportGrid(input({ blank: null })), "Blank subtracted")?.[1]).toBe("no")
    expect(rowStartingWith(curveExportGrid(input({ blank: 0 })), "Blank subtracted")?.[1]).toBe(0)
  })

  it("says so out loud when there is no fit, instead of dropping the section", () => {
    const grid = curveExportGrid(input({ fit: null }))
    expect(rowStartingWith(grid, "Fit")?.[1]).toContain("not fitted")
    // The standards it does have are still exported.
    expect(rowStartingWith(grid, "Standards")).toBeTruthy()
  })

  it("omits the dilution column when no dilution column was chosen", () => {
    const grid = curveExportGrid(input({ dilutionApplied: false }))
    expect(rowStartingWith(grid, "Sample")).toEqual(["Sample", "Signal", "Concentration", "Status"])
    expect(rowStartingWith(grid, "Serum A")).toEqual(["Serum A", 0.312, 47.31, "in range"])
  })

  it("names the plate as the source when standards came from the layout", () => {
    expect(rowStartingWith(curveExportGrid(input({ source: "plate" })), "Standards from")?.[1]).toBe(
      "Plate layout"
    )
  })
})

describe("serialization", () => {
  it("quotes a CSV field containing the delimiter", () => {
    const csv = curveExportCsv(
      input({ unknowns: [{ label: "Patient 4, week 2", signal: 0.3, dil: 1, conc: 12, inRange: true }] })
    )
    expect(csv).toContain('"Patient 4, week 2"')
  })

  it("escapes an embedded quote by doubling it", () => {
    const csv = curveExportCsv(
      input({ unknowns: [{ label: 'the "control"', signal: 0.3, dil: 1, conc: 12, inRange: true }] })
    )
    expect(csv).toContain('"the ""control"""')
  })

  it("leaves clipboard TSV unquoted so it pastes as cells, not literal quotes", () => {
    const tsv = curveExportTsv(
      input({ unknowns: [{ label: "Patient 4, week 2", signal: 0.3, dil: 1, conc: 12, inRange: true }] })
    )
    expect(tsv).toContain("Patient 4, week 2\t0.3")
    expect(tsv).not.toContain('"')
  })

  it("renders a section break as a genuinely empty line", () => {
    expect(curveExportCsv(input())).toContain("\n\nStandards\n")
  })

  it("agrees cell for cell between the two delimiters", () => {
    const csvCells = curveExportCsv(input({ unknowns: [] })).split("\n").map((l) => l.split(","))
    const tsvCells = curveExportTsv(input({ unknowns: [] })).split("\n").map((l) => l.split("\t"))
    expect(tsvCells).toEqual(csvCells)
  })
})

describe("curveExportFileName", () => {
  it("slugs the analysis title", () => {
    expect(curveExportFileName("ELISA plate 3", "csv")).toBe("elisa-plate-3-standard-curve.csv")
  })

  it("falls back when the title is empty or unusable", () => {
    expect(curveExportFileName("", "xlsx")).toBe("analysis-standard-curve.xlsx")
    expect(curveExportFileName("///", "csv")).toBe("analysis-standard-curve.csv")
  })
})

describe("curveExportColumnWidths", () => {
  it("widens to the longest cell in each column, within a cap", () => {
    const widths = curveExportColumnWidths([
      ["Parameter", "Estimate"],
      ["a".repeat(80), 1],
    ])
    expect(widths[0].wch).toBe(42)
    expect(widths[1].wch).toBe(10)
  })
})
