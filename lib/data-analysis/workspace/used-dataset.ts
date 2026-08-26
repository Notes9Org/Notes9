/**
 * The dataset the figure was actually built from (§2 Tier 0).
 *
 * `EngineResult.plotData` is the resolver's own answer to "which rows, with
 * which values, went into this figure": every row POST-transform, carrying the
 * row id it came from and whether it was excluded. It is already computed,
 * already cached and already shipped to the renderer.
 *
 * Exporting the raw workbook instead — no filters, no transforms, no replicate
 * collapse, and exclusions present but unmarked — hands a reader a file that
 * cannot reproduce the figure beside it and does not say so. This module turns
 * `plotData` into the two shapes a reader can open.
 *
 * Excluded rows are KEPT and marked, never dropped, for the same reason §8.1
 * keeps them in the analysis: a dataset with the inconvenient points quietly
 * missing is the artefact exclusion governance exists to prevent.
 */

import type { EngineResult } from "@/lib/data-analysis/engine/contract"

export type PlotRow = EngineResult["plotData"][number]

export const ROW_ID_COLUMN = "row_id"
export const EXCLUDED_COLUMN = "excluded"

/**
 * Column order: identity, exclusion state, then the data columns in first-seen
 * order. A transform can introduce a column part-way through (pivotLonger's
 * value column exists only after it runs), so the union is taken over every
 * row rather than read off the first one.
 */
export function usedDatasetColumns(plotData: readonly PlotRow[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of plotData) {
    for (const key of Object.keys(row.values)) {
      if (!seen.has(key)) {
        seen.add(key)
        out.push(key)
      }
    }
  }
  return [ROW_ID_COLUMN, EXCLUDED_COLUMN, ...out]
}

/** One rectangular grid: header row first, then a row per plot row. */
export function usedDatasetGrid(
  plotData: readonly PlotRow[]
): (string | number | null)[][] {
  const columns = usedDatasetColumns(plotData)
  const dataColumns = columns.slice(2)
  return [
    columns,
    ...plotData.map((row) => [
      row.rowId,
      row.excluded ? "excluded" : "",
      ...dataColumns.map((c) => row.values[c] ?? null),
    ]),
  ]
}

/** RFC 4180 quoting: a comma, a quote or a newline in a cell must survive. */
function csvCell(value: string | number | null): string {
  if (value === null) return ""
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function usedDatasetToCsv(plotData: readonly PlotRow[]): string {
  return usedDatasetGrid(plotData)
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")
}

/** Filenames for both exports, distinct from the raw-workbook export's. */
export function usedDatasetFileName(title: string, extension: "csv" | "xlsx"): string {
  const stem = (title || "analysis").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "")
  return `${stem || "analysis"}-used-data.${extension}`
}
