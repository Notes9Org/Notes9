/**
 * T0.12 — do calculated columns update live through the analysis?
 *
 * `resolver.ts` deliberately delegates formula evaluation to the spreadsheet
 * rather than duplicating an expression evaluator, and its `calculatedColumn`
 * case is a pure pass-through of the rows. That is a sound decision, and it is
 * only sound BECAUSE of the link this file pins: the evaluated value, not the
 * formula text, is what arrives in the rows.
 *
 * The workspace's memo chain is
 *
 *     liveSnapshot -> snapshotToTable -> tableFromChartRows -> specFromChartState
 *
 * with no gate anywhere along it, so this exercises exactly that chain rather
 * than asserting anything about React. What the ADR-025 compute gate holds back
 * is the ENGINE run, and the last test here is the one that says a formula edit
 * still moves the signature that gate compares — a gate keyed only on the shape
 * of the spec would leave a recomputed column silently stale.
 *
 * No test in the repo contained a formula cell at all before this one; the
 * fixtures were all literals, so the `v`/`f` dual write that makes this work
 * was uncovered.
 */

import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"

import { buildSpreadsheetWorkbookSnapshot, type UniverWorkbookSnapshot } from "@/lib/spreadsheet-workbook"
import { snapshotToTable } from "@/lib/data-analysis/workspace/snapshot-table"
import { specFromChartState, tableFromChartRows } from "@/lib/data-analysis/workspace/chart-state-spec"

/**
 * A sheet with a calculated column: `Fold` is `=B2/0.05`, and the cached
 * evaluated value rides alongside the formula exactly as Univer persists it.
 */
function sheetWithFormula(values: number[]): UniverWorkbookSnapshot {
  const ws: XLSX.WorkSheet = {}
  ws.A1 = { t: "s", v: "Time" }
  ws.B1 = { t: "s", v: "OD600" }
  ws.C1 = { t: "s", v: "Fold" }
  values.forEach((v, i) => {
    const row = i + 2
    ws[`A${row}`] = { t: "n", v: i * 2 }
    ws[`B${row}`] = { t: "n", v }
    // The formula AND its result, which is the dual write the whole chain rests on.
    ws[`C${row}`] = { t: "n", v: v / 0.05, f: `B${row}/0.05` }
  })
  ws["!ref"] = `A1:C${values.length + 1}`
  const wb: XLSX.WorkBook = { SheetNames: ["Sheet1"], Sheets: { Sheet1: ws } }
  return buildSpreadsheetWorkbookSnapshot("growth.xlsx", wb)
}

const RAIL = {
  chartType: "line",
  xKey: "Time",
  yKeys: ["Fold"],
  title: "",
  xLabel: "Time",
  yLabel: "Fold",
  paletteName: "okabe-ito",
  errorMode: "sd" as const,
}

function specFor(snapshot: UniverWorkbookSnapshot) {
  const table = snapshotToTable(snapshot, "Sheet1")
  const specTable = tableFromChartRows(table.columns, table.rows)
  return { table, spec: specFromChartState(RAIL, specTable, { fileName: "growth.xlsx" }) }
}

describe("a calculated column reaches the analysis as a NUMBER", () => {
  const { table } = specFor(sheetWithFormula([0.05, 0.2, 0.8]))

  it("is in the table at all", () => {
    expect(table.columns).toContain("Fold")
  })

  it("carries the evaluated result, not the formula text", () => {
    const fold = table.rows.map((r) => r.Fold)
    expect(fold).toEqual([1, 4, 16])
    // The failure mode if `f` ever won over `v`.
    expect(fold.some((v) => typeof v === "string" && String(v).startsWith("="))).toBe(false)
  })

  it("is not silently blank, which is how a dropped persist would look", () => {
    expect(table.rows.every((r) => r.Fold !== "" && r.Fold != null)).toBe(true)
  })
})

describe("a formula edit updates live", () => {
  it("the new value reaches the derived spec's data with no gate in between", () => {
    const before = specFor(sheetWithFormula([0.05, 0.2, 0.8]))
    // The researcher edits the sheet; Univer recalculates and persists a new
    // snapshot. Same formula, new inputs.
    const after = specFor(sheetWithFormula([0.05, 0.5, 2.0]))

    expect(before.table.rows.map((r) => r.Fold)).toEqual([1, 4, 16])
    expect(after.table.rows.map((r) => r.Fold)).toEqual([1, 10, 40])
  })

  it("moves the version hash, so the compute gate reruns the engine", () => {
    // `recomputeSignature` is keyed on `dataset.versionHash`, which is a
    // content hash of the table. A gate keyed only on the SHAPE of the spec
    // would leave the recomputed column stale on screen.
    const before = specFor(sheetWithFormula([0.05, 0.2, 0.8]))
    const after = specFor(sheetWithFormula([0.05, 0.5, 2.0]))

    expect(before.spec.dataset.versionHash).not.toBe(after.spec.dataset.versionHash)
  })

  it("an edit that changes nothing does not churn the hash", () => {
    const a = specFor(sheetWithFormula([0.05, 0.2, 0.8]))
    const b = specFor(sheetWithFormula([0.05, 0.2, 0.8]))
    expect(a.spec.dataset.versionHash).toBe(b.spec.dataset.versionHash)
  })
})
