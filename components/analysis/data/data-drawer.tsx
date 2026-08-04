"use client"

import { useMemo } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import type { Results } from "@/types/analysis"

/**
 * The drawer under the canvas: the bridge between a mark on the figure and the
 * cell it came from.
 *
 * "Plotted" holds only values that map 1:1 to something drawn (group, n, mean,
 * SEM, CI, straight off `Results.groups`), so what you read is what you see.
 * "Source rows" is the raw grid with A1-style cell refs, where a row can be
 * excluded from the run; exclusions are row INDICES, matching
 * `AnalysisParams.excluded_rows` (types/analysis.ts).
 */

/** ponytail: hard cap instead of virtualising, raises to a windowed list only
 * if real analyses start running on sheets this size. */
const MAX_SOURCE_ROWS = 500

function columnLetter(index: number): string {
  let n = index
  let out = ""
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

/** Four significant digits, enough to read, short enough to scan. */
function num(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-"
  return Number(value.toPrecision(4)).toString()
}

export function DataDrawer({
  results,
  header,
  rows,
  excludedRows,
  onToggleExclude,
  className,
}: {
  results: Results | null
  header: string[]
  rows: string[][]
  /** Zero-based indices into `rows`. */
  excludedRows: number[]
  onToggleExclude: (rowIndex: number) => void
  className?: string
}) {
  const excluded = useMemo(() => new Set(excludedRows), [excludedRows])
  const visibleRows = rows.slice(0, MAX_SOURCE_ROWS)
  const groups = results?.groups ?? []

  return (
    <div className={cn("rounded-xl border bg-card", className)}>
      <Tabs defaultValue="plotted">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <TabsList>
            <TabsTrigger value="plotted">Plotted</TabsTrigger>
            <TabsTrigger value="source">Source rows</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {rows.length} row{rows.length === 1 ? "" : "s"}
            </span>
            {excluded.size > 0 && (
              <Badge variant="outline">{excluded.size} excluded</Badge>
            )}
          </div>
        </div>

        <TabsContent value="plotted" className="m-0">
          {groups.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nothing plotted yet, run the analysis and the values behind each mark
              appear here.
            </p>
          ) : (
            <div className="max-h-[320px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Group</TableHead>
                    <TableHead className="text-right">n</TableHead>
                    <TableHead className="text-right">Mean</TableHead>
                    <TableHead className="text-right">SD</TableHead>
                    <TableHead className="text-right">SEM</TableHead>
                    <TableHead className="text-right whitespace-nowrap">95% CI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((group) => (
                    <TableRow key={group.name}>
                      <TableCell className="font-medium">{group.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{group.n}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num(group.mean)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num(group.sd)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num(group.sem)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {num(group.ci_low)} – {num(group.ci_high)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="source" className="m-0">
          {visibleRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No source rows, pick a data file and sheet to load the grid.
            </p>
          ) : (
            <>
              <div className="max-h-[320px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" aria-label="Include row" />
                      <TableHead className="w-14 text-xs text-muted-foreground">
                        Row
                      </TableHead>
                      {header.map((name, c) => (
                        <TableHead key={c} className="whitespace-nowrap">
                          <span className="text-muted-foreground">{columnLetter(c)}</span>{" "}
                          {name}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.map((row, index) => {
                      const isExcluded = excluded.has(index)
                      // Header occupies spreadsheet row 1, so data starts at 2.
                      const sheetRow = index + 2
                      return (
                        <TableRow
                          key={index}
                          className={cn(isExcluded && "opacity-50 line-through")}
                        >
                          <TableCell>
                            <Checkbox
                              checked={!isExcluded}
                              onCheckedChange={() => onToggleExclude(index)}
                              aria-label={
                                isExcluded
                                  ? `Include row ${sheetRow}`
                                  : `Exclude row ${sheetRow}`
                              }
                            />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground tabular-nums">
                            {sheetRow}
                          </TableCell>
                          {header.map((_, c) => (
                            <TableCell
                              key={c}
                              className="whitespace-nowrap tabular-nums"
                              title={`${columnLetter(c)}${sheetRow}`}
                            >
                              {row[c] ?? ""}
                            </TableCell>
                          ))}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              {rows.length > MAX_SOURCE_ROWS && (
                <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                  Showing the first {MAX_SOURCE_ROWS} of {rows.length} rows. Exclusions
                  beyond that are set from the spreadsheet view.
                </p>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
