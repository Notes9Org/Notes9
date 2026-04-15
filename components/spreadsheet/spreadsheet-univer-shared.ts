/** Shared helpers for Univer sheet embed + standalone viewer (no React). */

import { resolveSheetColumnCount, resolveSheetRowCount, SHEET_MIN_COLS, SHEET_MIN_ROWS } from "@/lib/univer-sheet-bounds"

export const encodeWorkbookAttr = (value: string) => encodeURIComponent(value)

export const decodeWorkbookAttr = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function scheduleMicrotask(fn: () => void) {
  window.setTimeout(fn, 0)
}

export function buildFallbackTable(workbook: any): string | null {
  const firstSheetId = workbook?.sheetOrder?.[0]
  const sheet = firstSheetId ? workbook?.sheets?.[firstSheetId] : null
  if (!sheet?.cellData) return null

  const rowKeys = Object.keys(sheet.cellData)
    .map((key) => Number(key))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)
    .slice(0, 20)

  if (!rowKeys.length) return null

  const rows = rowKeys.map((rowKey) => {
    const row = sheet.cellData[rowKey] ?? {}
    const colKeys = Object.keys(row)
      .map((key) => Number(key))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b)
      .slice(0, 12)

    if (!colKeys.length) {
      return `<tr><td class="border border-border/70 px-2 py-1.5 text-xs text-muted-foreground"></td></tr>`
    }

    return `<tr>${colKeys
      .map((colKey) => {
        const cell = row[colKey]
        const value = cell?.v == null ? "" : String(cell.v)
        const escaped = value
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;")
        return `<td class="border border-border/70 px-2 py-1.5 text-xs align-top">${escaped}</td>`
      })
      .join("")}</tr>`
  })

  return `<table class="w-full border-collapse">${rows.join("")}</table>`
}

export function hasUniverWorkbookApi(value: unknown): value is {
  createWorkbook: (workbook: unknown) => any
  addEvent: (event: unknown, handler: () => void) => { dispose: () => void }
  onCommandExecuted: (handler: (command: { type: number; id: string }) => void) => { dispose: () => void }
  Event: Record<string, unknown>
  getActiveWorkbook?: () => { getId?: () => string | null } | null
  disposeUnit: (unitId: string) => void
} {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.createWorkbook === "function" &&
    typeof candidate.addEvent === "function" &&
    typeof candidate.onCommandExecuted === "function" &&
    typeof candidate.disposeUnit === "function" &&
    !!candidate.Event &&
    typeof candidate.Event === "object"
  )
}

export function buildDefaultWorkbook(fileName?: string) {
  const workbookId = `spreadsheet-${Math.random().toString(36).slice(2, 10)}`
  const sheetId = `sheet-${Math.random().toString(36).slice(2, 8)}`

  return {
    id: workbookId,
    name: fileName || "Spreadsheet",
    appVersion: "0.20.0",
    locale: "enUS",
    styles: {},
    sheetOrder: [sheetId],
    sheets: {
      [sheetId]: {
        id: sheetId,
        name: "Sheet1",
        tabColor: "",
        hidden: 0,
        freeze: { xSplit: 0, ySplit: 0, startRow: 0, startColumn: 0 },
        rowCount: SHEET_MIN_ROWS,
        columnCount: SHEET_MIN_COLS,
        zoomRatio: 1,
        scrollTop: 0,
        scrollLeft: 0,
        defaultColumnWidth: 96,
        defaultRowHeight: 24,
        mergeData: [],
        cellData: {},
        rowData: {},
        columnData: {},
        rowHeader: { width: 46 },
        columnHeader: { height: 28 },
        showGridlines: 1,
        rightToLeft: 0,
      },
    },
  }
}

/** Empty Univer workbook snapshot (new experiment file or blank grid). */
export function createEmptyWorkbookSnapshot(displayFileName: string) {
  const base = displayFileName.replace(/\.[^.]+$/, "").trim() || "Spreadsheet"
  return buildDefaultWorkbook(base)
}

export function normalizeWorkbookSnapshot(workbook: any, fileName?: string) {
  const fallback = buildDefaultWorkbook(fileName)
  if (!workbook || typeof workbook !== "object") {
    return fallback
  }

  const rawSheets = workbook.sheets && typeof workbook.sheets === "object" ? workbook.sheets : {}
  const rawSheetOrder = Array.isArray(workbook.sheetOrder) ? workbook.sheetOrder : []

  const normalizedSheets: Record<string, any> = {}
  const normalizedOrder: string[] = []

  for (const rawSheetId of rawSheetOrder) {
    if (typeof rawSheetId !== "string" || !rawSheetId) continue
    const rawSheet = rawSheets[rawSheetId]
    if (!rawSheet || typeof rawSheet !== "object") continue

    const sheetId = typeof rawSheet.id === "string" && rawSheet.id ? rawSheet.id : rawSheetId
    normalizedSheets[sheetId] = {
      id: sheetId,
      name:
        typeof rawSheet.name === "string" && rawSheet.name.trim()
          ? rawSheet.name
          : `Sheet${normalizedOrder.length + 1}`,
      tabColor: typeof rawSheet.tabColor === "string" ? rawSheet.tabColor : "",
      hidden: Number(rawSheet.hidden) === 1 ? 1 : 0,
      freeze:
        rawSheet.freeze && typeof rawSheet.freeze === "object"
          ? {
              xSplit: Number(rawSheet.freeze.xSplit) || 0,
              ySplit: Number(rawSheet.freeze.ySplit) || 0,
              startRow: Number(rawSheet.freeze.startRow) || 0,
              startColumn: Number(rawSheet.freeze.startColumn) || 0,
            }
          : { xSplit: 0, ySplit: 0, startRow: 0, startColumn: 0 },
      rowCount: resolveSheetRowCount(rawSheet.rowCount, rawSheet.cellData),
      columnCount: resolveSheetColumnCount(rawSheet.columnCount, rawSheet.cellData),
      zoomRatio: Number(rawSheet.zoomRatio) || 1,
      scrollTop: Number(rawSheet.scrollTop) || 0,
      scrollLeft: Number(rawSheet.scrollLeft) || 0,
      defaultColumnWidth: Number(rawSheet.defaultColumnWidth) || 96,
      defaultRowHeight: Number(rawSheet.defaultRowHeight) || 24,
      mergeData: Array.isArray(rawSheet.mergeData) ? rawSheet.mergeData : [],
      cellData: rawSheet.cellData && typeof rawSheet.cellData === "object" ? rawSheet.cellData : {},
      rowData: rawSheet.rowData && typeof rawSheet.rowData === "object" ? rawSheet.rowData : {},
      columnData: rawSheet.columnData && typeof rawSheet.columnData === "object" ? rawSheet.columnData : {},
      rowHeader:
        rawSheet.rowHeader && typeof rawSheet.rowHeader === "object"
          ? { width: Number(rawSheet.rowHeader.width) || 46, hidden: Number(rawSheet.rowHeader.hidden) === 1 ? 1 : undefined }
          : { width: 46 },
      columnHeader:
        rawSheet.columnHeader && typeof rawSheet.columnHeader === "object"
          ? { height: Number(rawSheet.columnHeader.height) || 28, hidden: Number(rawSheet.columnHeader.hidden) === 1 ? 1 : undefined }
          : { height: 28 },
      showGridlines: Number(rawSheet.showGridlines) === 0 ? 0 : 1,
      rightToLeft: Number(rawSheet.rightToLeft) === 1 ? 1 : 0,
    }
    normalizedOrder.push(sheetId)
  }

  if (normalizedOrder.length === 0) {
    return fallback
  }

  return {
    id: typeof workbook.id === "string" && workbook.id ? workbook.id : fallback.id,
    name:
      typeof workbook.name === "string" && workbook.name.trim()
        ? workbook.name
        : fileName || fallback.name,
    appVersion:
      typeof workbook.appVersion === "string" && workbook.appVersion
        ? workbook.appVersion
        : fallback.appVersion,
    locale:
      typeof workbook.locale === "string" && workbook.locale
        ? workbook.locale
        : fallback.locale,
    styles: workbook.styles && typeof workbook.styles === "object" ? workbook.styles : {},
    sheetOrder: normalizedOrder,
    sheets: normalizedSheets,
  }
}

export function findScrollableAncestor(start: EventTarget | null, boundary: HTMLElement | null) {
  let node = start instanceof HTMLElement ? start : null
  while (node && node !== boundary) {
    const style = window.getComputedStyle(node)
    const canScrollY =
      /(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1
    if (canScrollY) {
      return node
    }
    node = node.parentElement
  }
  return boundary
}

export function handleSpreadsheetWheel(event: WheelEvent, boundary: HTMLElement | null) {
  if (!boundary) return
  const scrollNode = findScrollableAncestor(event.target, boundary)
  if (!(scrollNode instanceof HTMLElement)) return

  const canTrap =
    (() => {
      const deltaY = event.deltaY
      if (Math.abs(deltaY) < Math.abs(event.deltaX)) return false
      const atTop = scrollNode.scrollTop <= 0
      const atBottom = scrollNode.scrollTop + scrollNode.clientHeight >= scrollNode.scrollHeight - 1
      if (deltaY < 0) return !atTop
      if (deltaY > 0) return !atBottom
      return false
    })()
  if (!canTrap) return

  event.preventDefault()
  event.stopPropagation()
  scrollNode.scrollTop += event.deltaY
  scrollNode.scrollLeft += event.deltaX
}

let embedWheelIsolationRefCount = 0
let embedWheelIsolationHandler: ((e: WheelEvent) => void) | null = null

/**
 * TipTap embeds: the grid is mostly a canvas (no native overflow scroll), so wheel "defaults"
 * can scroll the **editor** instead — especially at the top/bottom edge (scroll chaining).
 *
 * One `document` listener in the **bubble** phase runs after Univer's handlers on the canvas,
 * then `preventDefault()` cancels only the browser default (parent scroll), without synthetic
 * `wheel` events or capture-phase interception.
 */
export function registerSpreadsheetEmbedWheelIsolation(): () => void {
  if (typeof document === "undefined") return () => {}

  if (embedWheelIsolationRefCount === 0) {
    embedWheelIsolationHandler = (e: WheelEvent) => {
      const t = e.target
      const el = t instanceof Element ? t : t.parentElement
      if (!el?.closest("[data-spreadsheet-embed-root]")) return
      e.preventDefault()
    }
    document.addEventListener("wheel", embedWheelIsolationHandler, {
      passive: false,
      capture: false,
    })
  }
  embedWheelIsolationRefCount += 1
  return () => {
    embedWheelIsolationRefCount -= 1
    if (embedWheelIsolationRefCount === 0 && embedWheelIsolationHandler) {
      document.removeEventListener("wheel", embedWheelIsolationHandler, false)
      embedWheelIsolationHandler = null
    }
  }
}
