"use client"

import { useCallback, useEffect, useState } from "react"
import { appApiUrl } from "@/lib/app-api-url"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { Database, Warning } from "@phosphor-icons/react/ssr"
import {
  ExperimentDataTabularDialog,
  isTabularExperimentFile,
} from "@/components/experiments/experiment-data-tabular-dialog"

/**
 * Picks the analysis' source: which `experiment_data` file, which sheet, which
 * range — i.e. exactly `AnalysisSpec.source` (types/analysis.ts).
 *
 * The sheet list comes from the file's stored Univer workbook snapshot, which
 * the Data & Files spreadsheet viewer already maintains, so nothing new has to
 * parse CSV/XLSX here. Preview reuses that same viewer.
 */

export type DatasetFile = {
  id: string
  file_name: string
  file_type: string | null
  tabular_format?: string | null
}

/** Mirrors AnalysisSpec.source — `sheet`/`range` are "" when not applicable. */
export type DatasetSelection = { data_id: string; sheet: string; range: string }

export type ParsedSheet = {
  name: string
  header: string[]
  /** Data rows only (header excluded), each padded to header length. */
  rows: string[][]
  /** A1-style extent of the populated cells, e.g. "A1:D25". */
  range: string
}

function columnLetter(index: number): string {
  let n = index
  let out = ""
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

type CellMap = Record<string, Record<string, { v?: unknown }>>

/**
 * Flattens a Univer workbook snapshot into per-sheet header + rows.
 *
 * Snapshot shape is `{ sheetOrder: string[], sheets: { [id]: { name, cellData } } }`
 * (see lib/spreadsheet-workbook.ts). `cellData` is sparse and keyed by numeric
 * row → numeric column, so blanks are filled in rather than assumed present.
 */
export function parseWorkbookSheets(snapshot: unknown): ParsedSheet[] {
  if (!snapshot || typeof snapshot !== "object") return []
  const book = snapshot as { sheetOrder?: unknown; sheets?: unknown }
  const sheets = (book.sheets ?? {}) as Record<string, unknown>
  const order = Array.isArray(book.sheetOrder)
    ? (book.sheetOrder as string[])
    : Object.keys(sheets)

  return order.flatMap((sheetId) => {
    const sheet = sheets[sheetId] as { name?: string; cellData?: CellMap } | undefined
    if (!sheet) return []
    const cellData = sheet.cellData ?? {}

    const rowIndices = Object.keys(cellData)
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b)
    if (rowIndices.length === 0) {
      return [{ name: sheet.name ?? sheetId, header: [], rows: [], range: "" }]
    }

    let maxCol = -1
    for (const r of rowIndices) {
      for (const c of Object.keys(cellData[String(r)] ?? {})) {
        const n = Number(c)
        if (Number.isFinite(n) && n > maxCol) maxCol = n
      }
    }
    if (maxCol < 0) {
      return [{ name: sheet.name ?? sheetId, header: [], rows: [], range: "" }]
    }

    const readRow = (r: number) => {
      const row = cellData[String(r)] ?? {}
      return Array.from({ length: maxCol + 1 }, (_, c) => {
        const cell = row[String(c)]
        return cell?.v == null ? "" : String(cell.v)
      })
    }

    const maxRow = rowIndices[rowIndices.length - 1]
    const headerRow = readRow(rowIndices[0])
    // A blank header cell still occupies a column — name it by its letter so
    // the role grid never shows two identical "" columns.
    const header = headerRow.map((h, c) => (h.trim() === "" ? columnLetter(c) : h))
    const rows = rowIndices.slice(1).map(readRow)

    return [
      {
        name: sheet.name ?? sheetId,
        header,
        rows,
        range: `A1:${columnLetter(maxCol)}${maxRow + 1}`,
      },
    ]
  })
}

export function DatasetPicker({
  experimentId,
  files,
  value,
  onChange,
}: {
  experimentId: string
  files: DatasetFile[]
  value: DatasetSelection | null
  /** Fires with the new selection plus the parsed sheet (null while unresolved). */
  onChange: (selection: DatasetSelection, sheet: ParsedSheet | null) => void
}) {
  const tabularFiles = files.filter(isTabularExperimentFile)
  const [sheets, setSheets] = useState<ParsedSheet[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const dataId = value?.data_id ?? ""
  const selectedFile = tabularFiles.find((f) => f.id === dataId) ?? null

  const loadSheets = useCallback(
    async (fileId: string) => {
      const url = appApiUrl(
        `/api/experiments/${experimentId}/data-files/${fileId}/workbook`,
      )
      const readSnapshot = async () => {
        const res = await fetch(url)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || res.statusText)
        }
        const body = (await res.json()) as { workbook_snapshot?: unknown }
        return parseWorkbookSheets(body.workbook_snapshot)
      }

      setLoading(true)
      setError(null)
      try {
        let parsed = await readSnapshot()
        // A file uploaded but never opened in the spreadsheet viewer has no
        // snapshot yet. POST backfills it from the stored file (no-op when
        // already cached), so picking such a file just works instead of
        // dead-ending on "no sheets".
        if (parsed.length === 0) {
          const backfill = await fetch(url, { method: "POST" })
          if (backfill.ok) parsed = await readSnapshot()
        }
        setSheets(parsed)
        if (parsed.length === 0) {
          setError("This file has no readable sheets. Open it in Data & Files to check it.")
        }
        return parsed
      } catch (e) {
        setSheets([])
        setError(e instanceof Error ? e.message : "Could not read this file")
        return [] as ParsedSheet[]
      } finally {
        setLoading(false)
      }
    },
    [experimentId],
  )

  // Re-read whenever the picked file changes (including on first mount for an
  // analysis that already has a source).
  useEffect(() => {
    if (!dataId) {
      setSheets([])
      setError(null)
      return
    }
    void loadSheets(dataId)
  }, [dataId, loadSheets])

  const selectedSheet = sheets.find((s) => s.name === value?.sheet) ?? null

  const pickFile = async (fileId: string) => {
    onChange({ data_id: fileId, sheet: "", range: "" }, null)
    const parsed = await loadSheets(fileId)
    const first = parsed[0]
    if (first) onChange({ data_id: fileId, sheet: first.name, range: first.range }, first)
  }

  const pickSheet = (sheetName: string) => {
    const sheet = sheets.find((s) => s.name === sheetName) ?? null
    onChange(
      { data_id: dataId, sheet: sheetName, range: sheet?.range ?? "" },
      sheet,
    )
  }

  if (tabularFiles.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Database aria-hidden />
          </EmptyMedia>
          <EmptyTitle>No spreadsheets in this experiment</EmptyTitle>
          <EmptyDescription>
            Analysis reads tabular data. Upload a CSV or Excel file to this experiment
            from Data &amp; Files and it will be selectable here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="analysis-source-file">Data file</Label>
          <Select value={dataId} onValueChange={(v) => void pickFile(v)}>
            <SelectTrigger id="analysis-source-file">
              <SelectValue placeholder="Choose a data file" />
            </SelectTrigger>
            <SelectContent>
              {tabularFiles.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.file_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="analysis-source-sheet">Sheet</Label>
          {loading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select
              value={value?.sheet ?? ""}
              onValueChange={pickSheet}
              disabled={sheets.length === 0}
            >
              <SelectTrigger id="analysis-source-sheet">
                <SelectValue
                  placeholder={dataId ? "Choose a sheet" : "Choose a file first"}
                />
              </SelectTrigger>
              <SelectContent>
                {sheets.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="analysis-source-range">Range</Label>
          <Input
            id="analysis-source-range"
            value={value?.range ?? ""}
            placeholder="A1:D25"
            disabled={!value?.sheet}
            onChange={(e) =>
              onChange(
                {
                  data_id: dataId,
                  sheet: value?.sheet ?? "",
                  range: e.target.value,
                },
                selectedSheet,
              )
            }
          />
          <p className="text-xs text-muted-foreground">
            Prefilled from the sheet&apos;s populated cells. The first row is read as
            column headers.
          </p>
        </div>

        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!selectedFile}
            onClick={() => setPreviewOpen(true)}
          >
            Preview spreadsheet
          </Button>
        </div>
      </div>

      {error && (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <Warning className="size-4 shrink-0 translate-y-0.5" aria-hidden />
          <span>{error}</span>
        </p>
      )}

      {selectedFile && (
        <ExperimentDataTabularDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          experimentId={experimentId}
          fileId={selectedFile.id}
          fileName={selectedFile.file_name}
        />
      )}
    </div>
  )
}
