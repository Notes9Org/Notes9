"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import { useEffect, useRef, useState } from "react"
import { FileSpreadsheet } from "lucide-react"

import "@univerjs/preset-sheets-core/lib/index.css"
import sheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US"

const encodeWorkbook = (value: string) => encodeURIComponent(value)
const decodeWorkbook = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** TipTap `updateAttributes` can sync to React via flushSync; never call it synchronously from useEffect. */
function scheduleSpreadsheetAttrsUpdate(fn: () => void) {
  window.setTimeout(fn, 0)
}

const buildFallbackTable = (workbook: any) => {
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

const hasUniverWorkbookApi = (value: unknown): value is {
  createWorkbook: (workbook: unknown) => any
  addEvent: (event: unknown, handler: () => void) => { dispose: () => void }
  Event: Record<string, unknown>
  getActiveWorkbook?: () => { getId?: () => string | null } | null
  disposeUnit: (unitId: string) => void
} => {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.createWorkbook === "function" &&
    typeof candidate.addEvent === "function" &&
    typeof candidate.disposeUnit === "function" &&
    !!candidate.Event &&
    typeof candidate.Event === "object"
  )
}

const buildDefaultWorkbook = (fileName?: string) => {
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
        rowCount: 50,
        columnCount: 26,
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

const normalizeWorkbookSnapshot = (workbook: any, fileName?: string) => {
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
      rowCount: Math.max(Number(rawSheet.rowCount) || 50, 1),
      columnCount: Math.max(Number(rawSheet.columnCount) || 26, 1),
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

const findScrollableAncestor = (start: EventTarget | null, boundary: HTMLElement | null) => {
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

const handleSpreadsheetWheel = (event: WheelEvent, boundary: HTMLElement | null) => {
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

function SpreadsheetEmbedView({ node, updateAttributes }: { node: any; updateAttributes: (attrs: Record<string, unknown>) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const boundaryRef = useRef<HTMLDivElement | null>(null)
  const [fallbackHtml, setFallbackHtml] = useState<string | null>(null)
  const [hasInteractiveSheet, setHasInteractiveSheet] = useState(false)
  const lastSavedWorkbookRef = useRef(node.attrs.workbookData || "")
  const isHydratingRef = useRef(false)
  /** TipTap often passes a new callback identity each render; do not list it in useEffect deps or the effect re-runs every render and can thrash / overflow the stack. */
  const updateAttributesRef = useRef(updateAttributes)
  updateAttributesRef.current = updateAttributes

  useEffect(() => {
    let disposed = false
    let cleanup: (() => void) | null = null
    let saveTimer: ReturnType<typeof setTimeout> | null = null
    let mountHost: HTMLDivElement | null = null

    const applyAttrs = (attrs: Record<string, unknown>) => {
      updateAttributesRef.current(attrs)
    }

    const mount = async () => {
      const workbookAttr = node.attrs.workbookData
      if (!containerRef.current || !workbookAttr) return

      try {
        const parsedWorkbook = JSON.parse(decodeWorkbook(workbookAttr))
        const workbook = normalizeWorkbookSnapshot(parsedWorkbook, node.attrs.fileName)
        const normalizedEncoded = encodeWorkbook(JSON.stringify(workbook))
        lastSavedWorkbookRef.current = normalizedEncoded
        setFallbackHtml(buildFallbackTable(workbook))
        if (normalizedEncoded !== workbookAttr && !isHydratingRef.current) {
          isHydratingRef.current = true
          scheduleSpreadsheetAttrsUpdate(() => {
            applyAttrs({ workbookData: normalizedEncoded })
            window.setTimeout(() => {
              isHydratingRef.current = false
            }, 0)
          })
        }

        const [{ createUniver, LocaleType }, { UniverSheetsCorePreset }] = await Promise.all([
          import("@univerjs/presets"),
          import("@univerjs/preset-sheets-core"),
        ])

        if (disposed || !containerRef.current) return

        mountHost = document.createElement("div")
        mountHost.className = "h-full w-full"
        containerRef.current.replaceChildren(mountHost)

        const presetConfig: any = {
          container: mountHost,
          header: false,
          toolbar: false,
          formulaBar: true,
          footer: true,
          menu: false,
          contextMenu: true,
          statusBarStatistic: true,
          disableAutoFocus: true,
          ribbonType: "simple",
        }

        const { univer, univerAPI } = createUniver({
          locale: LocaleType.EN_US,
          locales: {
            [LocaleType.EN_US]: sheetsCoreEnUS,
          },
          presets: [
            [
              UniverSheetsCorePreset(presetConfig),
              {
                lazy: false,
              },
            ],
          ],
        })

        if (!hasUniverWorkbookApi(univerAPI)) {
          console.warn("Spreadsheet embed mounted without Univer workbook API; using fallback table only.")
          setHasInteractiveSheet(false)
          cleanup = () => {
            if (containerRef.current === mountHost?.parentElement) {
              containerRef.current.replaceChildren()
            }
          }
          return
        }

        let fWorkbook: any
        try {
          fWorkbook = univerAPI.createWorkbook(workbook)
        } catch (error) {
          console.error("Failed to create Univer workbook from embedded snapshot", error)
          setHasInteractiveSheet(false)
          return
        }
        setHasInteractiveSheet(true)

        const persistWorkbook = () => {
          if (disposed || isHydratingRef.current) return

          if (saveTimer) {
            clearTimeout(saveTimer)
          }

          saveTimer = setTimeout(async () => {
            try {
              await fWorkbook.endEditing?.(true)
            } catch {}

            try {
              const snapshot = fWorkbook.save()
              const encoded = encodeWorkbook(JSON.stringify(snapshot))
              if (encoded === lastSavedWorkbookRef.current) return
              lastSavedWorkbookRef.current = encoded
              setFallbackHtml(buildFallbackTable(snapshot))
              isHydratingRef.current = true
              scheduleSpreadsheetAttrsUpdate(() => {
                applyAttrs({ workbookData: encoded })
                window.setTimeout(() => {
                  isHydratingRef.current = false
                }, 0)
              })
            } catch (error) {
              console.error("Failed to persist spreadsheet embed", error)
            }
          }, 250)
        }

        const disposables = [
          univerAPI.addEvent(univerAPI.Event.SheetValueChanged, persistWorkbook),
          univerAPI.addEvent(univerAPI.Event.SheetCreated, persistWorkbook),
          univerAPI.addEvent(univerAPI.Event.SheetDeleted, persistWorkbook),
          univerAPI.addEvent(univerAPI.Event.SheetMoved, persistWorkbook),
          univerAPI.addEvent(univerAPI.Event.SheetNameChanged, persistWorkbook),
          univerAPI.addEvent(univerAPI.Event.SheetTabColorChanged, persistWorkbook),
          univerAPI.addEvent(univerAPI.Event.SheetHideChanged, persistWorkbook),
          univerAPI.addEvent(univerAPI.Event.ActiveSheetChanged, persistWorkbook),
        ]

        cleanup = () => {
          if (saveTimer) {
            clearTimeout(saveTimer)
          }
          try {
            const snapshot = fWorkbook?.save?.()
            if (snapshot) {
              const encoded = encodeWorkbook(JSON.stringify(snapshot))
              if (encoded !== lastSavedWorkbookRef.current) {
                lastSavedWorkbookRef.current = encoded
                isHydratingRef.current = true
                scheduleSpreadsheetAttrsUpdate(() => {
                  applyAttrs({ workbookData: encoded })
                  window.setTimeout(() => {
                    isHydratingRef.current = false
                  }, 0)
                })
              }
            }
          } catch {}
          disposables.forEach((disposable) => {
            try {
              disposable.dispose()
            } catch {}
          })
          try {
            const univerDisposable = univer as { dispose?: () => void }
            const canDispose = !!mountHost?.isConnected
            if (canDispose) {
              window.setTimeout(() => {
                try {
                  univerDisposable.dispose?.()
                } catch {}
              }, 0)
            }
          } catch {}
          if (containerRef.current === mountHost?.parentElement) {
            containerRef.current.replaceChildren()
          }
        }
      } catch (error) {
        console.error("Failed to mount spreadsheet embed", error)
        setHasInteractiveSheet(false)
      }
    }

    void mount()

    return () => {
      cleanup?.()
      disposed = true
    }
  }, [node.attrs.workbookData])

  useEffect(() => {
    const boundary = boundaryRef.current
    if (!boundary) return

    const onWheel = (event: WheelEvent) => {
      handleSpreadsheetWheel(event, boundary)
    }

    boundary.addEventListener("wheel", onWheel, { capture: true, passive: false })
    return () => {
      boundary.removeEventListener("wheel", onWheel, true)
    }
  }, [])

  return (
    <NodeViewWrapper
      className="my-4 overflow-hidden rounded-xl border border-border/70 bg-card/70 shadow-sm"
      contentEditable={false}
      data-drag-handle
    >
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/45 px-3 py-2 text-sm font-medium text-foreground">
        <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
        <span className="truncate">{node.attrs.fileName || "Spreadsheet"}</span>
      </div>

      <div
        ref={boundaryRef}
        className="h-[520px] bg-background [overscroll-behavior:contain]"
        onTouchMoveCapture={(event) => {
          event.stopPropagation()
        }}
      >
        <div ref={containerRef} className="h-full w-full [overscroll-behavior:contain]" />
        {!hasInteractiveSheet && fallbackHtml ? (
          <div
            className="max-h-[520px] overflow-auto p-3 [overscroll-behavior:contain]"
            dangerouslySetInnerHTML={{ __html: fallbackHtml }}
          />
        ) : null}
      </div>
    </NodeViewWrapper>
  )
}

export const SpreadsheetEmbed = Node.create({
  name: "spreadsheetEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      fileName: {
        default: "Spreadsheet",
        parseHTML: (element) => element.getAttribute("data-file-name") || "Spreadsheet",
        renderHTML: (attributes) => ({
          "data-file-name": attributes.fileName,
        }),
      },
      workbookData: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-workbook") || "",
        renderHTML: (attributes) => ({
          "data-workbook": attributes.workbookData,
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="spreadsheet-embed"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "spreadsheet-embed",
        class: "spreadsheet-embed-node",
      }),
      [
        "div",
        {
          class: "rounded-xl border border-border/70 bg-card/70 px-3 py-2 text-sm text-foreground",
        },
        HTMLAttributes["data-file-name"] || "Spreadsheet",
      ],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(SpreadsheetEmbedView)
  },
})
