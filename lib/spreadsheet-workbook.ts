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
    file.type.includes("spreadsheet") ||
    file.type.includes("excel") ||
    file.type.includes("csv")
  )
}

export function inferTabularFormatFromFileName(fileName: string): TabularFormat | null {
  const lower = fileName.toLowerCase()
  if (lower.endsWith(".csv")) return "csv"
  if (lower.endsWith(".xlsx")) return "xlsx"
  if (lower.endsWith(".xls")) return "xls"
  return null
}

export function readSpreadsheetWorkbook(arrayBuffer: ArrayBuffer, fileName: string): XlsxWorkBook {
  return XLSX.read(arrayBuffer, {
    type: "array",
    cellFormula: true,
    cellDates: true,
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
