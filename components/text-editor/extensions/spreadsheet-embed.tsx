"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Expand, FileSpreadsheet, Minimize } from "lucide-react"
import { UniverWorkbookView } from "@/components/spreadsheet/univer-workbook-view"
import { scheduleMicrotask } from "@/components/spreadsheet/spreadsheet-univer-shared"

/** Above notes/protocol side panels (z-120) and TipTap region fullscreen (z-110); below modals (z-130+). */
const SPREADSHEET_FULLSCREEN_Z_INDEX = 125

const EMBED_PLACEHOLDER_MIN_H = 320

function findFullscreenRegionElement(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null
  const shell = root.closest("[data-editor-workspace-shell]")
  if (shell instanceof HTMLElement) return shell
  const sidebarInset = root.closest('[data-slot="sidebar-inset"]')
  const main = sidebarInset?.querySelector(":scope > main")
  return main instanceof HTMLElement ? main : null
}

function SpreadsheetEmbedView({ node, updateAttributes }: { node: any; updateAttributes: (attrs: Record<string, unknown>) => void }) {
  const updateAttributesRef = useRef(updateAttributes)
  updateAttributesRef.current = updateAttributes
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [portalMounted, setPortalMounted] = useState(false)
  const [regionStyle, setRegionStyle] = useState<React.CSSProperties | undefined>(
    undefined,
  )
  /** Stable per node-view instance so Univer does not remount when `workbookData` updates from saves. */
  const instanceKeyRef = useRef<string | null>(null)
  if (instanceKeyRef.current == null) {
    instanceKeyRef.current =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `sheet-${Math.random().toString(36).slice(2, 12)}`
  }
  const instanceKey = instanceKeyRef.current

  useEffect(() => {
    setPortalMounted(true)
  }, [])

  const syncRegionBounds = useCallback(() => {
    if (!isFullscreen) return
    const region = findFullscreenRegionElement(rootRef.current)
    if (!region) return
    const rect = region.getBoundingClientRect()
    setRegionStyle({
      position: "fixed",
      top: `${Math.round(rect.top)}px`,
      left: `${Math.round(rect.left)}px`,
      width: `${Math.round(rect.width)}px`,
      height: `${Math.round(rect.height)}px`,
      zIndex: SPREADSHEET_FULLSCREEN_Z_INDEX,
      margin: 0,
    })
  }, [isFullscreen])

  useEffect(() => {
    if (!isFullscreen) {
      setRegionStyle(undefined)
      return
    }

    syncRegionBounds()
    window.addEventListener("resize", syncRegionBounds)
    window.addEventListener("scroll", syncRegionBounds, true)
    return () => {
      window.removeEventListener("resize", syncRegionBounds)
      window.removeEventListener("scroll", syncRegionBounds, true)
    }
  }, [isFullscreen, syncRegionBounds])

  useEffect(() => {
    if (!isFullscreen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isFullscreen])

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev)
  }, [])

  const stopEditorBubbling = useCallback(
    (
      event:
        | React.KeyboardEvent<HTMLDivElement>
        | React.FormEvent<HTMLDivElement>
        | React.MouseEvent<HTMLDivElement>,
    ) => {
      event.stopPropagation()
    },
    [],
  )

  const sheetPanel = (
    <div
      data-spreadsheet-embed-root
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-[inherit]"
    >
      <div
        className={
          isFullscreen
            ? "flex items-center gap-2 border-b border-border bg-muted px-3 py-2 text-sm font-medium text-foreground"
            : "flex items-center gap-2 border-b border-border/60 bg-muted/45 px-3 py-2 text-sm font-medium text-foreground"
        }
      >
        <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
        <span className="truncate flex-1">{node.attrs.fileName || "Spreadsheet"}</span>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-background/80 text-muted-foreground transition-colors hover:text-foreground"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            toggleFullscreen()
          }}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
        </button>
      </div>

      <div
        className="min-h-0 flex-1"
        onMouseDown={stopEditorBubbling}
        onClick={stopEditorBubbling}
        onBeforeInput={stopEditorBubbling}
        onInput={stopEditorBubbling}
        onKeyDown={stopEditorBubbling}
        onKeyUp={stopEditorBubbling}
      >
        <UniverWorkbookView
          instanceKey={instanceKey}
          variant="embed"
          workbookEncoded={node.attrs.workbookData}
          fileName={node.attrs.fileName}
          onPersistEncoded={(enc) =>
            scheduleMicrotask(() => {
              updateAttributesRef.current({ workbookData: enc })
            })
          }
        />
      </div>
    </div>
  )

  const fullscreenPortal =
    isFullscreen && portalMounted && regionStyle
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${node.attrs.fileName || "Spreadsheet"} fullscreen`}
            className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            style={regionStyle}
            onMouseDown={stopEditorBubbling}
            onClick={stopEditorBubbling}
          >
            {sheetPanel}
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <NodeViewWrapper
        ref={rootRef}
        className={
          isFullscreen
            ? "my-4 overflow-hidden rounded-xl border border-dashed border-border/60 bg-muted/25"
            : "my-4 overflow-hidden rounded-xl border border-border/70 bg-card/70 shadow-sm"
        }
        style={
          isFullscreen
            ? { minHeight: EMBED_PLACEHOLDER_MIN_H }
            : undefined
        }
        contentEditable={false}
        data-drag-handle
      >
        {isFullscreen ? (
          <div
            className="flex items-center justify-center text-xs text-muted-foreground"
            style={{ minHeight: EMBED_PLACEHOLDER_MIN_H }}
          >
            Spreadsheet open in fullscreen — press Esc or minimize to return
          </div>
        ) : (
          sheetPanel
        )}
      </NodeViewWrapper>
      {fullscreenPortal}
    </>
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
