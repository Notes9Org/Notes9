"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import { useRef } from "react"
import { FileSpreadsheet } from "lucide-react"
import { UniverWorkbookView } from "@/components/spreadsheet/univer-workbook-view"
import { scheduleMicrotask } from "@/components/spreadsheet/spreadsheet-univer-shared"

function SpreadsheetEmbedView({ node, updateAttributes }: { node: any; updateAttributes: (attrs: Record<string, unknown>) => void }) {
  const updateAttributesRef = useRef(updateAttributes)
  updateAttributesRef.current = updateAttributes
  /** Stable per node-view instance so Univer does not remount when `workbookData` updates from saves. */
  const instanceKeyRef = useRef<string | null>(null)
  if (instanceKeyRef.current == null) {
    instanceKeyRef.current =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `sheet-${Math.random().toString(36).slice(2, 12)}`
  }
  const instanceKey = instanceKeyRef.current

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
