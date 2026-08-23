"use client"

import { useMemo, useState } from "react"

import { cn } from "@/lib/utils"
import type { EngineResult } from "@/lib/data-analysis/engine/contract"
import {
  usedDatasetColumns,
  type PlotRow,
} from "@/lib/data-analysis/workspace/used-dataset"

/**
 * The rows the figure was actually built from (§2 Tier 0, data↔figure link).
 *
 * The spreadsheet beside the chart shows the RAW sheet: pre-filter,
 * pre-transform, pre-collapse, with excluded points sitting in it unmarked.
 * That is the right surface for editing data and the wrong one for answering
 * "what is this bar made of". `EngineResult.plotData` is the resolver's own
 * answer to that question — every row post-transform, carrying its source row
 * id and its exclusion state — and until now nothing rendered it.
 *
 * BOUNDED ON PURPOSE. Datasets here reach tens of thousands of rows, and a
 * table that puts all of them in the DOM turns opening a panel into a several
 * second freeze. This pages instead: a fixed window, the row range stated, and
 * the total stated beside it. Nothing is hidden without saying so, and the full
 * set is one click away in the CSV/XLSX export next to it.
 */

const PAGE_SIZE = 200

function cellText(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—"
  return typeof value === "number" ? String(value) : value
}

export function UsedRowsTable({
  plotData,
  className,
}: {
  plotData: EngineResult["plotData"] | null | undefined
  className?: string
}) {
  const rows: PlotRow[] = useMemo(() => plotData ?? [], [plotData])
  const columns = useMemo(() => usedDatasetColumns(rows).slice(2), [rows])
  const [page, setPage] = useState(0)

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  // A spec edit can shrink the data under a page that is already scrolled past
  // the end; clamp on render rather than resetting in an effect, which would
  // paint an empty table for one frame first.
  const current = Math.min(page, pageCount - 1)
  const start = current * PAGE_SIZE
  const window = rows.slice(start, start + PAGE_SIZE)
  const excluded = rows.reduce((n, r) => n + (r.excluded ? 1 : 0), 0)

  if (rows.length === 0) {
    return (
      <div className={cn("p-4 text-[12px] text-muted-foreground", className)}>
        Nothing has been computed yet, so there are no rows to show. Run the analysis and
        the rows behind the figure appear here.
      </div>
    )
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-3 py-2 text-[11.5px] text-muted-foreground">
        <span className="font-medium text-foreground">
          {`${rows.length.toLocaleString()} row${rows.length === 1 ? "" : "s"} post-transform`}
        </span>
        <span>
          {excluded.toLocaleString()} excluded{excluded > 0 ? ", kept and marked" : ""}
        </span>
        <span className="ml-auto">
          showing {(start + 1).toLocaleString()}–
          {Math.min(start + PAGE_SIZE, rows.length).toLocaleString()}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-[11.5px]">
          <caption className="sr-only">
            The rows the figure used, after filters and transforms, with excluded rows
            marked.
          </caption>
          <thead className="sticky top-0 z-10 bg-background">
            <tr>
              <th scope="col" className="border-b px-2 py-1.5 text-left font-medium">
                Row
              </th>
              <th scope="col" className="border-b px-2 py-1.5 text-left font-medium">
                State
              </th>
              {columns.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className="border-b px-2 py-1.5 text-left font-medium whitespace-nowrap"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {window.map((row) => (
              <tr
                key={row.rowId}
                className={cn(
                  "border-b border-border/40",
                  // Excluded rows are dimmed, never hidden, and the state column
                  // says so in words: colour alone is not a readable signal.
                  row.excluded && "text-muted-foreground line-through decoration-1"
                )}
              >
                <th
                  scope="row"
                  className="px-2 py-1 text-left font-normal whitespace-nowrap tabular-nums"
                >
                  {row.rowId}
                </th>
                <td className="px-2 py-1 whitespace-nowrap">
                  {row.excluded ? "excluded" : "used"}
                </td>
                {columns.map((c) => (
                  <td key={c} className="px-2 py-1 whitespace-nowrap tabular-nums">
                    {cellText(row.values[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-2 border-t px-3 py-1.5 text-[11.5px]">
          <button
            type="button"
            className="rounded border px-2 py-0.5 disabled:opacity-40"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Previous
          </button>
          <span className="text-muted-foreground">
            Page {current + 1} of {pageCount}
          </span>
          <button
            type="button"
            className="rounded border px-2 py-0.5 disabled:opacity-40"
            disabled={current >= pageCount - 1}
            onClick={() => setPage(current + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
