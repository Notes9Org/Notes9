import * as XLSX from "xlsx"
import {
  resolveSheetColumnCountFromRangeEnd,
  resolveSheetRowCountFromRangeEnd,
} from "@/lib/univer-sheet-bounds"

type XlsxWorkBook = ReturnType<typeof XLSX.read>
type XlsxWorkSheet = XlsxWorkBook["Sheets"][string]

export type TabularFormat = "csv" | "xlsx" | "xls"

export type UniverWorkbookSnapshot = Record<string, unknown>

export function encodeSpreadsheetWorkbook(workbook: UniverWorkbookSnapshot): string {
  return encodeURIComponent(JSON.stringify(workbook))
}

export function decodeSpreadsheetWorkbook(encoded: string): UniverWorkbookSnapshot {
  try {
    return JSON.parse(decodeURIComponent(encoded)) as UniverWorkbookSnapshot
  } catch {
    return JSON.parse(encoded) as UniverWorkbookSnapshot
  }
}

export function isSpreadsheetFile(file: File): boolean {
  const lower = file.name.toLowerCase()
  return (
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".csv") ||
    // Deliberately NOT .tsv/.txt. This predicate gates the experiment upload
    // dialog and the lab-note editor's drop/paste handlers app-wide, so
    // widening it turns every plain text file in the ELN into a spreadsheet.
    // The data-analysis workspace reads .tsv/.txt through its own file input
    // and `readSpreadsheetWorkbook`, and never asks this question.
    file.type.includes("spreadsheet") ||
    file.type.includes("excel") ||
    file.type.includes("csv")
  )
}

export function inferTabularFormatFromFileName(fileName: string): TabularFormat | null {
  const lower = fileName.toLowerCase()
  // Only extensions the product is willing to REWRITE belong here. A non-null
  // return is a licence to overwrite the stored file: it sets
  // `experiment_data.tabular_format`, which opens the row in the editable
  // spreadsheet dialog and arms the `sync_storage` branch of the workbook
  // PATCH route, which uploads a re-serialised buffer over the original bytes.
  // Widening this to `.txt`/`.tsv` once meant one save turned a user's text
  // file into a CSV. Parsing those for read-only analysis needs nothing from
  // here — `readSpreadsheetWorkbook` handles the separator itself.
  if (lower.endsWith(".csv")) return "csv"
  if (lower.endsWith(".xlsx")) return "xlsx"
  if (lower.endsWith(".xls")) return "xls"
  return null
}

/**
 * Read a workbook, or throw.
 *
 * Callers must handle the throw: SheetJS raises on a truncated or non-workbook
 * buffer, and a swallowed rejection here shows the user an empty sheet with no
 * explanation for it.
 */
/** Delimiters a `.txt` export is plausibly using, most-likely first. Ties are
 *  broken by this order, which is why tab leads: a lab instrument writing
 *  `.txt` is far more often tab-separated than anything else. */
const TXT_DELIMITER_CANDIDATES = ["\t", ",", ";", "|"] as const

/**
 * Count `delimiter` occurrences in `line`, ignoring any inside double quotes.
 *
 * Quote-awareness is not pedantry here: the whole reason the caller cannot just
 * trust the first line is that a field may legitimately contain the character
 * being counted. `"Smith, John"\t42` has one tab and one comma, and a counter
 * that cannot see the quotes reads that comma as a separator — which is how a
 * tab-separated file ends up split on commas instead.
 */
function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      // "" inside a quoted field is an escaped quote, not a close-then-open.
      if (inQuotes && line[i + 1] === '"') i++
      else inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && ch === delimiter) count++
  }
  return count
}

/**
 * Guess the field separator of a plain-text table (T0.2).
 *
 * `.txt` names no separator of its own, and SheetJS's own guess reads only the
 * first line — which is the header, the one line most likely to contain a
 * comma inside a label ("Concentration, uM"). So this samples several lines and
 * prefers the delimiter whose field count is *consistent* across them: a real
 * separator produces the same number of columns on every row, while a
 * character that merely appears inside some values does not.
 *
 * Returns null when nothing looks like a separator, which is the correct answer
 * for a genuinely single-column file — the caller then leaves SheetJS alone
 * rather than forcing a split that would invent columns.
 */
export function sniffTextDelimiter(text: string): string | null {
  const lines = text
    .split(/\r\n|\r|\n/)
    .filter((l) => l.trim().length > 0)
    .slice(0, 8)

  if (lines.length === 0) return null

  let best: { delimiter: string; fields: number } | null = null

  for (const delimiter of TXT_DELIMITER_CANDIDATES) {
    const counts = lines.map((l) => countOutsideQuotes(l, delimiter))
    // Every sampled line must actually contain it, and agree on how many.
    if (counts[0] === 0) continue
    if (!counts.every((c) => c === counts[0])) continue

    const fields = counts[0] + 1
    // More columns is a stronger signal, but only among delimiters that were
    // consistent — consistency is the test, column count is just the tiebreak.
    if (!best || fields > best.fields) best = { delimiter, fields }
  }

  return best?.delimiter ?? null
}

/** How much of a text file to look at when sniffing. Enough to see several
 *  rows of anything realistic without decoding a 40 MB export to read line 3. */
const TXT_SNIFF_BYTES = 64 * 1024

export function readSpreadsheetWorkbook(arrayBuffer: ArrayBuffer, fileName: string): XlsxWorkBook {
  const lower = fileName.toLowerCase()

  // The separator is otherwise guessed from the first line, which picks the
  // wrong one as soon as a cell in that line contains a comma. The extension
  // already says what it is, so say it.
  let fieldSeparator: string | null = null
  if (lower.endsWith(".tsv")) {
    fieldSeparator = "\t"
  } else if (lower.endsWith(".txt")) {
    // `.txt` names no separator, so it has to be read out of the bytes (T0.2).
    // `fatal: false` because a sniff must never be the thing that fails an
    // open: undecodable bytes in the sample just mean no delimiter is found,
    // and the file still goes to SheetJS exactly as it did before.
    const sample = new TextDecoder("utf-8", { fatal: false }).decode(
      new Uint8Array(arrayBuffer, 0, Math.min(arrayBuffer.byteLength, TXT_SNIFF_BYTES))
    )
    fieldSeparator = sniffTextDelimiter(sample)
  }

  return XLSX.read(arrayBuffer, {
    type: "array",
    cellFormula: true,
    cellDates: true,
    ...(fieldSeparator ? { FS: fieldSeparator } : {}),
  })
}

export function buildSpreadsheetWorkbookSnapshot(fileName: string, workbook: XlsxWorkBook): UniverWorkbookSnapshot {
  const workbookId = `spreadsheet-${Math.random().toString(36).slice(2, 10)}`
  const sheetOrder: string[] = []
  const sheets: Record<string, Record<string, unknown>> = {}

  workbook.SheetNames.forEach((sheetName: string, index: number) => {
    const worksheet = workbook.Sheets[sheetName]
    if (!worksheet) return

    const sheetId = `sheet-${index + 1}-${Math.random().toString(36).slice(2, 8)}`
    sheetOrder.push(sheetId)

    const range = worksheet["!ref"] ? XLSX.utils.decode_range(worksheet["!ref"]) : { s: { r: 0, c: 0 }, e: { r: 24, c: 9 } }
    const rowCount = resolveSheetRowCountFromRangeEnd(range.e.r)
    const columnCount = resolveSheetColumnCountFromRangeEnd(range.e.c)
    const cellData: Record<number, Record<number, Record<string, unknown>>> = {}

    Object.keys(worksheet).forEach((key) => {
      if (key.startsWith("!")) return
      const cell = worksheet[key]
      if (!cell) return
      const decoded = XLSX.utils.decode_cell(key)
      if (!cellData[decoded.r]) {
        cellData[decoded.r] = {}
      }

      const cellEntry: Record<string, unknown> = {}
      if (cell.f) {
        cellEntry.f = `=${cell.f}`
      }

      if (cell.t === "n") {
        cellEntry.v = typeof cell.v === "number" ? cell.v : Number(cell.v ?? 0)
        cellEntry.t = 2
      } else if (cell.t === "b") {
        cellEntry.v = Boolean(cell.v)
        cellEntry.t = 3
      } else {
        cellEntry.v = cell.w ?? cell.v ?? ""
        cellEntry.t = 1
      }

      cellData[decoded.r][decoded.c] = cellEntry
    })

    const mergeData = Array.isArray(worksheet["!merges"])
      ? worksheet["!merges"].map((merge: { s: { r: number; c: number }; e: { r: number; c: number } }) => ({
          startRow: merge.s.r,
          startColumn: merge.s.c,
          endRow: merge.e.r,
          endColumn: merge.e.c,
        }))
      : []

    const columnData = Array.isArray(worksheet["!cols"])
      ? worksheet["!cols"].reduce<Record<number, Record<string, unknown>>>(
          (acc: Record<number, Record<string, unknown>>, col: unknown, colIndex: number) => {
          if (!col || typeof col !== "object") return acc
          const c = col as { wpx?: number; width?: number; hidden?: boolean }
          if (typeof c.wpx === "number") {
            acc[colIndex] = { ...(acc[colIndex] ?? {}), w: c.wpx }
          } else if (typeof c.width === "number") {
            acc[colIndex] = { ...(acc[colIndex] ?? {}), w: Math.round(c.width * 8) }
          }
          if (c.hidden) {
            acc[colIndex] = { ...(acc[colIndex] ?? {}), hd: 1 }
          }
          return acc
        },
        {}
      )
      : {}

    const rowData = Array.isArray(worksheet["!rows"])
      ? worksheet["!rows"].reduce<Record<number, Record<string, unknown>>>(
          (acc: Record<number, Record<string, unknown>>, row: unknown, rowIndex: number) => {
          if (!row || typeof row !== "object") return acc
          const rw = row as { hpx?: number; hpt?: number; hidden?: boolean }
          if (typeof rw.hpx === "number") {
            acc[rowIndex] = { ...(acc[rowIndex] ?? {}), h: rw.hpx }
          } else if (typeof rw.hpt === "number") {
            acc[rowIndex] = { ...(acc[rowIndex] ?? {}), h: Math.round(rw.hpt * 1.3333) }
          }
          if (rw.hidden) {
            acc[rowIndex] = { ...(acc[rowIndex] ?? {}), hd: 1 }
          }
          return acc
        },
        {}
      )
      : {}

    sheets[sheetId] = {
      id: sheetId,
      name: sheetName,
      tabColor: "",
      hidden: 0,
      freeze: { xSplit: 0, ySplit: 0, startRow: 0, startColumn: 0 },
      rowCount,
      columnCount,
      zoomRatio: 1,
      scrollTop: 0,
      scrollLeft: 0,
      defaultColumnWidth: 96,
      defaultRowHeight: 24,
      mergeData,
      cellData,
      rowData,
      columnData,
      rowHeader: { width: 46 },
      columnHeader: { height: 28 },
      showGridlines: 1,
      rightToLeft: 0,
    }
  })

  return {
    id: workbookId,
    name: fileName.replace(/\.[^.]+$/, "") || "Spreadsheet",
    appVersion: "0.20.0",
    locale: "enUS",
    styles: {},
    sheetOrder,
    sheets,
  }
}

/** Convert Univer snapshot (from DB or embed) back to SheetJS for export. */
export function snapshotToXlsxWorkbook(snapshot: UniverWorkbookSnapshot): XlsxWorkBook {
  const sheetOrder = snapshot.sheetOrder as string[] | undefined
  const sheets = snapshot.sheets as Record<string, Record<string, unknown>> | undefined
  if (!sheetOrder?.length || !sheets) {
    return XLSX.utils.book_new()
  }

  const out: XlsxWorkBook = { SheetNames: [], Sheets: {} }

  for (const sheetId of sheetOrder) {
    const sheet = sheets[sheetId]
    if (!sheet || typeof sheet !== "object") continue

    const name = typeof sheet.name === "string" && sheet.name ? sheet.name : "Sheet1"
    const cellData = sheet.cellData as Record<string, Record<string, Record<string, unknown>>> | undefined
    const ws: XlsxWorkSheet = {}

    let maxR = 0
    let maxC = 0

    if (cellData && typeof cellData === "object") {
      for (const rk of Object.keys(cellData)) {
        const r = Number(rk)
        if (!Number.isFinite(r)) continue
        const row = cellData[rk] ?? {}
        for (const ck of Object.keys(row)) {
          const c = Number(ck)
          if (!Number.isFinite(c)) continue
          const entry = row[ck]
          if (!entry || typeof entry !== "object") continue
          const addr = XLSX.utils.encode_cell({ r, c })
          const t = entry.t
          const v = entry.v
          const fRaw = entry.f

          maxR = Math.max(maxR, r)
          maxC = Math.max(maxC, c)

          const f =
            typeof fRaw === "string" && fRaw.startsWith("=") ? fRaw.slice(1) : typeof fRaw === "string" ? fRaw : undefined

          if (f) {
            if (t === 2 && typeof v === "number") {
              ws[addr] = { t: "n", v, f }
            } else if (t === 3 && typeof v === "boolean") {
              ws[addr] = { t: "b", v, f }
            } else {
              ws[addr] = { t: "s", v: String(v ?? ""), f }
            }
          } else if (t === 2 && typeof v === "number") {
            ws[addr] = { t: "n", v }
          } else if (t === 3 && typeof v === "boolean") {
            ws[addr] = { t: "b", v }
          } else {
            ws[addr] = { t: "s", v: String(v ?? "") }
          }
        }
      }
    }

    const mergeData = sheet.mergeData as
      | Array<{ startRow: number; startColumn: number; endRow: number; endColumn: number }>
      | undefined
    if (mergeData?.length) {
      ws["!merges"] = mergeData.map((m) => ({
        s: { r: m.startRow, c: m.startColumn },
        e: { r: m.endRow, c: m.endColumn },
      }))
    }

    if (maxR >= 0 || maxC >= 0) {
      ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } })
    }

    out.SheetNames.push(name)
    out.Sheets[name] = ws
  }

  if (out.SheetNames.length === 0) {
    return XLSX.utils.book_new()
  }

  return out
}

export function exportSnapshotFirstSheetAsCsv(snapshot: UniverWorkbookSnapshot): string {
  const wb = snapshotToXlsxWorkbook(snapshot)
  if (!wb.SheetNames.length) return ""
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return ""
  return XLSX.utils.sheet_to_csv(sheet)
}

export function workbookSnapshotToXlsxBuffer(snapshot: UniverWorkbookSnapshot): ArrayBuffer {
  const wb = snapshotToXlsxWorkbook(snapshot)
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer
}

export function workbookSnapshotToCsvBuffer(snapshot: UniverWorkbookSnapshot): ArrayBuffer {
  const wb = snapshotToXlsxWorkbook(snapshot)
  if (!wb.SheetNames.length) {
    return new TextEncoder().encode("").buffer
  }
  const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]] ?? {})
  return new TextEncoder().encode(csv).buffer
}

/** Trigger browser download of an .xlsx built from a Univer snapshot. */
export function downloadSnapshotAsXlsxFile(snapshot: UniverWorkbookSnapshot, downloadName: string) {
  const wb = snapshotToXlsxWorkbook(snapshot)
  XLSX.writeFile(wb, downloadName)
}
