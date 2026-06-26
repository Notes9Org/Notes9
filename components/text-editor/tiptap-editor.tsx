"use client"

// @ts-ignore
import { useEditor, EditorContent } from "@tiptap/react"
// @ts-ignore
import { BubbleMenu } from "@tiptap/react/menus"
// @ts-ignore
import { StarterKit } from "@tiptap/starter-kit"
import { Placeholder } from "@tiptap/extension-placeholder"
import { Link } from "@tiptap/extension-link"
import { ResizableImage } from "./extensions/resizable-image"
import { Highlight } from "@tiptap/extension-highlight"
import { TextStyle, FontFamily, FontSize } from "@tiptap/extension-text-style"
import { Color } from "@tiptap/extension-color"
import { TaskList } from "@tiptap/extension-task-list"
import { TaskItem } from "@tiptap/extension-task-item"
import { Table } from "@tiptap/extension-table"
import { TableRow } from "@tiptap/extension-table-row"
import { TableCell } from "@tiptap/extension-table-cell"
import { TableHeader } from "@tiptap/extension-table-header"
import { TableOfContents } from "./table-of-contents"
import { Mathematics } from "@tiptap/extension-mathematics"
import { Underline } from "@tiptap/extension-underline"
import { Subscript } from "@tiptap/extension-subscript"
import { Superscript } from "@tiptap/extension-superscript"
import Mention from "@tiptap/extension-mention"
import { createEntitySuggestion, EntityItem, EntityMention } from "./extensions/entity-mention"
import { createLabNoteSuggestion, LabNoteItem, LabNoteMention } from "./extensions/labnote-mention"
import { createLiteratureSuggestion, LiteratureItem, LiteratureMention } from "./extensions/literature-mention"
import Collaboration from "@tiptap/extension-collaboration"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type * as Y from "yjs"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { sanitizeHtml } from "@/lib/sanitize-html"
import { importFileToEditorHtml } from "@/lib/import-file-to-html"
import type { SearchPaper } from "@/types/paper-search"
import { createClient } from "@/lib/supabase/client"
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  ListChecks,
  Undo,
  Redo,
  Link2,
  Mic,
  Camera,
  BookOpen,
  Quote,
  Sheet,
  Table as TableIcon,
  FileText,
  FileInput,
  Sparkles,
  WandSparkles,
  Loader2,
  Globe,
  FlaskConical,
  Sigma,
  Calculator,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Type,
  MessageSquarePlus,
  IndentDecrease,
  IndentIncrease,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  X,
  Columns,
  Rows,
  MoveVertical,
  SeparatorHorizontal,
  Maximize2,
  Minimize2,
  Maximize,
  Minimize,
  MessageSquare,
  Plus,
  Pipette,
  Paintbrush,
  ImagePlus,
  ArrowRight,
  Check,
} from "lucide-react"
import { Extension, Mark, mergeAttributes } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { TextSelection } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { cn } from "@/lib/utils"
import { useAwsTranscribe } from "@/hooks/use-aws-transcribe"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react"
import { createPortal } from "react-dom"
import "@/styles/inline-diff.css"
// @ts-ignore
// `mammoth` is large (~500KB) and only needed when the user actually drops a
// .docx file — load it dynamically inside `insertDocxFromFile` instead of
// bundling it into the initial editor chunk.
import { toast } from "sonner"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu"
import {
  DEFAULT_TEXT_STYLE_FONT_LABEL,
  DEFAULT_TEXT_STYLE_FONT_STACK,
  ALL_FONT_MENU_VARIANTS,
  fontLabelForAttr,
} from "./font-menu-data"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { ChemicalFormula, formatChemicalFormula } from "./extensions/chemical-formula"
import { ChemistryHighlight } from "./extensions/chemistry-highlight"
import { RagHighlight } from "./extensions/rag-highlight"
import { SimpleShape } from "./extensions/simple-shape"
import { BlockDragHandle } from "./extensions/block-drag-handle"
import { moveTopLevelBlock } from "./editor-block-utils"
import { EditorContextMenu } from "./editor-context-menu"
import { EditorRuler } from "./editor-ruler"
import { LineHeight } from "./extensions/line-height"
import { PageBreak } from "./extensions/page-break"
import { Columns as ColumnsExtension } from "./extensions/columns"
import { DocHeader, DocFooter, HeaderFooter } from "./extensions/header-footer"
import { Pagination, type PaginationParams } from "./extensions/pagination"
import { SpreadsheetEmbed } from "./extensions/spreadsheet-embed"
import { VoiceWaveform } from "./voice-waveform"
// @ts-ignore - CSS import for KaTeX math rendering
import "katex/dist/katex.min.css"
import katex from "katex"
// `xlsx` (~1 MB) is only needed when the user imports a spreadsheet file.
// `isSpreadsheetFile` and `encodeSpreadsheetWorkbook` are inlined here so the
// gating checks in drag/paste handlers don't pull in the heavy xlsx module.
// `readSpreadsheetWorkbook` and `buildSpreadsheetWorkbookSnapshot` are loaded
// dynamically inside insertSpreadsheetFromFile.

function isSpreadsheetFile(file: File): boolean {
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

function encodeSpreadsheetWorkbook(workbook: Record<string, unknown>): string {
  return encodeURIComponent(JSON.stringify(workbook))
}
import {
  isEditorNativeClipboardHtml,
  resolveClipboardPaste,
} from "@/lib/clipboard-to-editor-html"
import { markdownToHtml } from "@/lib/markdown-to-editor-html"
import {
  type CitationMetadata,
  CITATION_STYLE_OPTIONS,
  formatInlineCitation,
  formatCitation,
  parseCitationsFromHtml,
  reformatInlineCitations,
  reformatBibliography,
} from "./citation-utils"
import {
  CitationContext,
  useCitationReducer,
  applyStoreToHtml,
  buildMetadataMap,
  type CitationEntry,
} from "./use-citation-store"
import {
  writePaperCitationStyle,
  readPaperCitationStyle,
  PAPER_CITATION_STYLE_EVENT,
  isValidTiptapCitationStyle,
} from "./paper-citation-style-sync"

// Until the user explicitly picks a citation style, citations are NOT rolled up
// into a references/bibliography section. This flag (persisted) records whether
// a style has ever been chosen.
const CITATION_STYLE_CHOSEN_KEY = "notes9-citation-style-chosen"

interface Paper {
  id: string
  title: string
  authors: string[]
  year: number | null
  journal: string
  source_url: string
  doi: string
}

interface TiptapEditorProps {
  content?: string
  onChange?: (content: string) => void
  placeholder?: string
  className?: string
  editable?: boolean
  minHeight?: string
  showAITools?: boolean
  title?: string
  autoSave?: boolean
  onAutoSave?: (content: string) => Promise<void>
  protocols?: EntityItem[]
  samples?: EntityItem[]
  labNotes?: LabNoteItem[]
  literatureItems?: LiteratureItem[]
  /** Enable KaTeX math equation support (inline & block) */
  enableMath?: boolean
  /** Enable academic paper mode (auto-numbered sections, figures, tables) */
  paperMode?: boolean
  /**
   * When true, the editor body uses the parent flex height instead of a viewport-based max-height.
   * Use inside resizable panels (e.g. protocol design mode) so the formatting toolbar stays visible.
   */
  panelEmbed?: boolean
  /**
   * Sparkles menu (make shorter/longer, etc.). Disable where AI lives elsewhere (e.g. protocol design header).
   */
  showAiWritingDropdown?: boolean
  /** When the writing dropdown is shown, also show an “AI” label next to the sparkles (e.g. paper writing workspace). */
  showAiWritingToolbarLabel?: boolean
  /** Callback fired when the editor instance is ready (or changes). Useful for parent components that need direct editor access. */
  onEditorReady?: (editor: ReturnType<typeof useEditor>) => void
  /** HTML content to show as an inline diff widget at the cursor position */
  inlineDiffHtml?: string | null
  /** Called when user accepts the inline diff */
  onAcceptInlineDiff?: () => void
  /** Called when user dismisses the inline diff */
  onDismissInlineDiff?: () => void
  /**
   * When true, editor body uses max-height 100% inside a flex parent instead of viewport-based caps.
   * Use with lab notes / panels so the toolbar stays visible and scroll stays in the editor body.
   */
  fillParentHeight?: boolean
  /** Lab notes: opens scientific calculator from the formatting toolbar. */
  onOpenScientificCalculator?: () => void
  /**
   * When set, region fullscreen is applied to this element (e.g. lab notes column including title row)
   * instead of only the editor card. Bounds still track the app `SidebarInset` main area.
   */
  fullscreenWorkspaceRef?: RefObject<HTMLElement | null>
  /** Fires when editor region fullscreen is toggled (Esc or button). */
  onEditorFullscreenChange?: (open: boolean) => void
  /** Populated with a toggle for the comments sidebar so external toolbars can open it. */
  commentsToggleRef?: RefObject<(() => void) | null>
  /**
   * When set, the fullscreen document title (shown only if fullscreen covers the page title — no fullscreenWorkspaceRef)
   * is editable with the same click-to-edit / blur-commit pattern as protocol design.
   */
  onDocumentTitleChange?: (value: string) => void
  /** Called after the inline fullscreen title blurs or commits with Enter; parent should persist (e.g. save to DB). */
  onDocumentTitleCommit?: () => void | Promise<void>
  /**
   * With fullscreenWorkspaceRef, shift the fixed shell right by this many px and reduce width (e.g. notes list
   * panel width when open), like the main layout shifting beside a sidebar.
   */
  fullscreenMainStartInsetPx?: number
  /**
   * Prepended to the formatting toolbar row (after optional fullscreen doc title). Lab notes fullscreen uses this
   * with fullscreenWorkspaceRef so list + title + save share one row with the toolbar, separated by "|".
   */
  leadingToolbarSlot?: ReactNode
  /** Appended after the fullscreen control (e.g. lab notes new / print / export). */
  trailingToolbarSlot?: ReactNode
  /** Yjs document instance for collaborative editing */
  ydoc?: Y.Doc | null
  /** Hocuspocus provider instance for WebSocket sync */
  provider?: HocuspocusProvider | null
  /** Whether collaboration mode is active */
  collaborationEnabled?: boolean
  /** Display name for the local user's cursor */
  userName?: string
  /** Color for the local user's cursor */
  userColor?: string
}

// Extension to support background color for table cells
const ExtendedTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: element => element.style.backgroundColor || null,
        renderHTML: attributes => {
          if (!attributes.backgroundColor) {
            return {}
          }
          return {
            style: `background-color: ${attributes.backgroundColor} !important`,
          }
        },
      },
    }
  },
})

const ExtendedTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: element => element.style.backgroundColor || null,
        renderHTML: attributes => {
          if (!attributes.backgroundColor) {
            return {}
          }
          return {
            style: `background-color: ${attributes.backgroundColor} !important`,
          }
        },
      },
    }
  },
})

// Table rows gain a persistent `height` attribute so manual row-height drags
// survive ProseMirror redraws (and reloads), the same way column widths persist
// via the built-in `colwidth` cell attribute.
const ResizableTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      height: {
        default: null,
        parseHTML: (element) => {
          const el = element as HTMLElement
          return el.style.height || el.getAttribute("height") || null
        },
        renderHTML: (attributes) => {
          if (!attributes.height) return {}
          return { style: `height: ${attributes.height}` }
        },
      },
    }
  },
})

interface CommentItem {
  id: string
  text: string
  author: string
  createdAt: number
  content: string
  pos: number
  kind: "text" | "image"
}

// Standalone helper functions for persisting table state
// These bypass the Tiptap command registration to avoid runtime "is not a function" errors
const syncTableSize = (table: HTMLTableElement, view: any) => {
  try {
    const pos = view.posAtDOM(table, 0)
    if (pos < 0) return false

    const $pos = view.state.doc.resolve(pos)
    let tablePos = -1

    for (let d = $pos.depth; d >= 0; d--) {
      const node = $pos.node(d)
      if (node && node.type.name === 'table') {
        tablePos = $pos.before(d)
        break
      }
    }

    if (tablePos === -1) {
      const nodeAt = view.state.doc.nodeAt(pos)
      if (nodeAt?.type.name === 'table') {
        tablePos = pos
      }
    }

    if (tablePos >= 0) {
      const tableNode = view.state.doc.nodeAt(tablePos)
      if (tableNode) {
        const width = `${table.offsetWidth}px`
        const { tr } = view.state
        tr.setNodeMarkup(tablePos, undefined, {
          ...tableNode.attrs,
          width: width,
        })
        view.dispatch(tr)
        return true
      }
    }
  } catch (e) {
    console.warn('Failed to sync table size:', e)
  }
  return false
}

const syncCellAttributes = (table: HTMLTableElement, view: any) => {
  try {
    const pos = view.posAtDOM(table, 0)
    if (pos < 0) return false

    const $pos = view.state.doc.resolve(pos)
    let tablePos = -1
    for (let d = $pos.depth; d >= 0; d--) {
      const node = $pos.node(d)
      if (node && node.type.name === 'table') {
        tablePos = $pos.before(d)
        break
      }
    }

    if (tablePos === -1) {
      const nodeAt = view.state.doc.nodeAt(pos)
      if (nodeAt?.type.name === 'table') {
        tablePos = pos
      }
    }

    if (tablePos < 0) return false
    const tableNode = view.state.doc.nodeAt(tablePos)
    if (!tableNode || tableNode.type.name !== 'table') return false

    const { tr } = view.state
    let cellCount = 0
    const domCells = table.querySelectorAll('td, th')

    tableNode.descendants((node: any, nodePos: number) => {
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        const domCell = domCells[cellCount] as HTMLElement
        if (domCell) {
          const bgColor = domCell.style.backgroundColor
          tr.setNodeMarkup(tablePos + nodePos + 1, undefined, {
            ...node.attrs,
            backgroundColor: bgColor || null,
          })
        }
        cellCount++
        return false
      }
      return true
    })

    view.dispatch(tr)
    return true
  } catch (e) {
    console.warn('Failed to sync cell attributes:', e)
  }
  return false
}

/**
 * Persist a manual column-width and/or row-height drag into the document model
 * so it survives ProseMirror redraws and reloads. Column widths are written to
 * the standard `colwidth` cell attribute (rendered by the table's colgroup);
 * row heights to the row's `height` attribute. Column indexes are DOM-cell
 * indexes, which match visual columns for tables without merged cells.
 */
const persistTableDimensions = (
  table: HTMLTableElement,
  view: any,
  opts: { colIndex?: number; colWidth?: number; rowIndex?: number; rowHeight?: number },
  addToHistory: boolean = true,
) => {
  try {
    const pos = view.posAtDOM(table, 0)
    if (pos < 0) return
    const $pos = view.state.doc.resolve(pos)
    let tablePos = -1
    for (let d = $pos.depth; d >= 0; d--) {
      const node = $pos.node(d)
      if (node && node.type.name === 'table') {
        tablePos = $pos.before(d)
        break
      }
    }
    if (tablePos === -1) {
      const nodeAt = view.state.doc.nodeAt(pos)
      if (nodeAt?.type.name === 'table') tablePos = pos
    }
    if (tablePos < 0) return

    const tableNode = view.state.doc.nodeAt(tablePos)
    if (!tableNode || tableNode.type.name !== 'table') return

    const tr = view.state.tr
    let changed = false
    let rowIdx = 0
    tableNode.forEach((rowNode: any, rowOffset: number) => {
      const rowPos = tablePos + 1 + rowOffset
      if (opts.rowIndex === rowIdx && opts.rowHeight != null) {
        tr.setNodeMarkup(rowPos, undefined, { ...rowNode.attrs, height: `${opts.rowHeight}px` })
        changed = true
      }
      if (opts.colIndex != null && opts.colWidth != null) {
        let colIdx = 0
        rowNode.forEach((cellNode: any, cellOffset: number) => {
          const cellPos = rowPos + 1 + cellOffset
          const colspan = cellNode.attrs.colspan || 1
          if (colIdx === opts.colIndex && colspan === 1) {
            tr.setNodeMarkup(cellPos, undefined, { ...cellNode.attrs, colwidth: [opts.colWidth] })
            changed = true
          }
          colIdx += colspan
        })
      }
      rowIdx++
    })

    if (changed) {
      if (!addToHistory) tr.setMeta('addToHistory', false)
      view.dispatch(tr)
    }
  } catch (e) {
    console.warn('Failed to persist table dimensions:', e)
  }
}

function CommentSidebar({ editor, open, onClose }: { editor: any; open: boolean; onClose: () => void }) {
  const [comments, setComments] = useState<CommentItem[]>([])

  const updateComments = useCallback(() => {
    if (!editor) return
    const items: CommentItem[] = []
    editor.state.doc.descendants((node: any, pos: number) => {
      if (node.type.name === "image" && node.attrs.commentId && node.attrs.commentContent) {
        if (!items.find((c) => c.id === node.attrs.commentId && c.pos === pos)) {
          items.push({
            id: node.attrs.commentId,
            author: node.attrs.commentAuthor || "Unknown",
            createdAt: node.attrs.commentCreatedAt || Date.now(),
            content: node.attrs.commentContent,
            text: node.attrs.alt?.trim() ? `[Image: ${node.attrs.alt}]` : "[Image]",
            pos,
            kind: "image",
          })
        }
      }
      node.marks.forEach((mark: any) => {
        if (mark.type.name === "comment") {
          if (!items.find((c) => c.id === mark.attrs.id && c.pos === pos)) {
            items.push({
              id: mark.attrs.id,
              author: mark.attrs.author,
              createdAt: mark.attrs.createdAt,
              content: mark.attrs.content,
              text: node.textContent,
              pos,
              kind: "text",
            })
          }
        }
      })
    })
    setComments(items)
  }, [editor])

  useEffect(() => {
    if (!editor) return
    updateComments()
    editor.on("update", updateComments)
    return () => {
      editor.off("update", updateComments)
    }
  }, [editor, updateComments])

  if (!open) return null

  return (
    <div className="absolute right-0 top-0 h-full w-72 bg-background border-l border-border z-50 shadow-xl flex flex-col animate-in slide-in-from-right duration-300">
      <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> Comments
        </h3>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close comments panel">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {comments.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-xs italic">No comments yet</div>
        ) : (
          comments.map((comment) => (
            <div
              key={`${comment.id}-${comment.pos}`}
              className="p-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors cursor-pointer group"
              onClick={() => {
                if (comment.kind === "image") {
                  editor.chain().focus().setNodeSelection(comment.pos).run()
                } else {
                  editor.commands.focus(comment.pos)
                }
                const dom = editor.view.nodeDOM(comment.pos)
                if (dom) {
                  const el = dom instanceof Element ? dom : dom.parentElement
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
                }
              }}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-2xs font-bold text-primary uppercase">{comment.author}</span>
                <span className="text-3xs text-muted-foreground">
                  {new Date(comment.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-foreground mb-2 line-clamp-3">{comment.content}</p>
              <div className="flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-2xs text-muted-foreground italic truncate max-w-[120px]">"{comment.text}"</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation()
                    editor.commands.deleteComment(comment.id)
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// Custom Table extension with width/height support
const ResizableTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: 'auto',
        parseHTML: element => element.style.width || element.getAttribute('width') || 'auto',
        renderHTML: attributes => {
          if (!attributes.width || attributes.width === 'auto') return {}
          return {
            style: `width: ${attributes.width}`,
            width: attributes.width,
          }
        },
      },
    }
  },

});

// React component for table controls and resize handles
const TableControlsOverlay = ({
  table,
  editor,
  view,
  boundary,
}: {
  table: HTMLTableElement,
  editor: any,
  view: any,
  /** The editor's visible viewport; the overlay is clipped to this so handles
   *  and controls never render outside the editor. */
  boundary?: HTMLElement | null,
}) => {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [clipRect, setClipRect] = useState<DOMRect | null>(null)
  // Live cursor position (viewport coords) so handles only reveal near a border
  // line — they stay out of the way while typing in a cell.
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null)
  const [dragState, setDragState] = useState<{
    type: 'col' | 'row' | 'both'
    colIndex: number
    rowIndex: number
    startX: number
    startY: number
    startColWidths: number[]
    startRowHeights: number[]
  } | null>(null)

  useEffect(() => {
    let raf: number | null = null
    let latest: { x: number; y: number } | null = null
    const onMove = (e: MouseEvent) => {
      latest = { x: e.clientX, y: e.clientY }
      if (raf === null) {
        raf = requestAnimationFrame(() => {
          raf = null
          setMouse(latest)
        })
      }
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [])

  // Observe size + position changes rather than polling at 10Hz. The old
  // `setInterval(updateRect, 100)` forced a layout reflow ten times per second
  // for every visible table; ResizeObserver fires only when geometry changes.
  useEffect(() => {
    const updateRect = () => {
      setRect(table.getBoundingClientRect())
      setClipRect(boundary ? boundary.getBoundingClientRect() : null)
    }
    updateRect()

    const ro = new ResizeObserver(updateRect)
    ro.observe(table)
    if (boundary) ro.observe(boundary)

    // Picks up scroll-induced position changes that ResizeObserver misses.
    window.addEventListener('scroll', updateRect, { passive: true, capture: true })
    window.addEventListener('resize', updateRect, { passive: true })

    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', updateRect, { capture: true } as AddEventListenerOptions)
      window.removeEventListener('resize', updateRect)
    }
  }, [table, boundary])

  useEffect(() => {
    if (!dragState) return
    let frame: number | null = null
    let latest: { dx: number; dy: number } | null = null

    // Drive the resize through the document model (colwidth / row height) — the
    // same path the built-in column resizer uses — so it actually renders under
    // `table-layout` + colgroup and persists. Pure DOM style tweaks get
    // overridden by the colgroup and the cells' `min-width`, which is why
    // dragging appeared to do nothing.
    const apply = (addToHistory: boolean) => {
      if (!latest) return
      const { type, colIndex, rowIndex, startColWidths, startRowHeights } = dragState
      const opts: { colIndex?: number; colWidth?: number; rowIndex?: number; rowHeight?: number } = {}
      if (type === 'col' || type === 'both') {
        opts.colIndex = colIndex
        opts.colWidth = Math.max(75, Math.round((startColWidths[colIndex] ?? 175) + latest.dx))
      }
      if (type === 'row' || type === 'both') {
        opts.rowIndex = rowIndex
        opts.rowHeight = Math.max(24, Math.round((startRowHeights[rowIndex] ?? 32) + latest.dy))
      }
      persistTableDimensions(table, view, opts, addToHistory)
    }

    const onMouseMove = (e: MouseEvent) => {
      latest = { dx: e.clientX - dragState.startX, dy: e.clientY - dragState.startY }
      if (frame === null) {
        frame = requestAnimationFrame(() => {
          frame = null
          apply(false)
        })
      }
    }

    const onMouseUp = () => {
      if (frame !== null) {
        cancelAnimationFrame(frame)
        frame = null
      }
      apply(true) // final commit lands as a single undo step
      setDragState(null)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [dragState, table, view])

  const getColWidths = () => {
    const firstRow = table.querySelector('tr')
    if (!firstRow) return []
    const cells = firstRow.querySelectorAll('td, th')
    return Array.from(cells).map(c => (c as HTMLElement).offsetWidth)
  }

  const getRowHeights = () => {
    const rows = table.querySelectorAll('tr')
    return Array.from(rows).map(r => (r as HTMLElement).offsetHeight)
  }

  const handleStartDrag = (
    type: 'col' | 'row' | 'both',
    colIndex: number,
    rowIndex: number,
    e: React.MouseEvent
  ) => {
    e.preventDefault()
    e.stopPropagation()
    setDragState({
      type,
      colIndex,
      rowIndex,
      startX: e.clientX,
      startY: e.clientY,
      startColWidths: getColWidths(),
      startRowHeights: getRowHeights(),
    })
    document.body.style.cursor = type === 'col' ? 'col-resize' : type === 'row' ? 'row-resize' : 'nwse-resize'
    document.body.style.userSelect = 'none'
  }

  if (!rect) return null

  // All overlay coordinates are relative to the clip box (the editor viewport),
  // and the outer container clips to it — so handles/controls never escape the
  // editor even when the table sits at its edge or is scrolled.
  const clip = clipRect ?? rect

  const handles: React.ReactNode[] = []
  const rows = Array.from(table.querySelectorAll('tr')) as HTMLElement[]
  const firstRow = rows[0]
  const firstRowCells = firstRow ? (Array.from(firstRow.querySelectorAll('td, th')) as HTMLElement[]) : []

  // A handle only reveals when the cursor is within REVEAL_PX of its border line
  // (or it's the one being dragged), so handles never sit over the cells while
  // you're typing — they appear only near the table lines.
  const REVEAL_PX = 8
  const isDragging = !!dragState
  const mx = mouse?.x ?? -Infinity
  const my = mouse?.y ?? -Infinity
  // Vertical span the cursor must be within for a column line to reveal, and the
  // horizontal span for a row line.
  const withinTableY = my >= rect.top - REVEAL_PX && my <= rect.bottom + REVEAL_PX
  const withinTableX = mx >= rect.left - REVEAL_PX && mx <= rect.right + REVEAL_PX

  // Column handles — one per column boundary, spanning the FULL table height.
  firstRowCells.forEach((cell, colIndex) => {
    const cellRect = cell.getBoundingClientRect()
    const boundaryX = cellRect.right
    const colActive =
      isDragging && (dragState!.type === 'col' || dragState!.type === 'both') && dragState!.colIndex === colIndex
    const nearBoundary = withinTableY && Math.abs(mx - boundaryX) <= REVEAL_PX && !isDragging
    if (!colActive && !nearBoundary) return
    const colWidth = cellRect.width
    handles.push(
      <div
        key={`col-${colIndex}`}
        className="absolute pointer-events-auto cursor-col-resize"
        style={{ top: rect.top - clip.top, left: boundaryX - clip.left - 5, width: 10, height: rect.height, zIndex: 1001 }}
        title="Drag to resize column"
        onMouseDown={(e) => handleStartDrag('col', colIndex, 0, e)}
      >
        {/* Column highlight band (covers the column being resized). */}
        <div
          className={cn('pointer-events-none absolute top-0 h-full', colActive ? 'bg-primary/10' : 'bg-primary/5')}
          style={{ right: 5, width: colWidth }}
        />
        {/* Crisp guide line down the full column boundary. */}
        <div
          className={cn(
            'pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] rounded-full',
            colActive ? 'bg-primary' : 'bg-primary/70',
          )}
        />
      </div>
    )
  })

  // Row handles — one per row boundary, spanning the FULL table width.
  rows.forEach((row, rowIndex) => {
    const rowRect = row.getBoundingClientRect()
    const boundaryY = rowRect.bottom
    const rowActive =
      isDragging && (dragState!.type === 'row' || dragState!.type === 'both') && dragState!.rowIndex === rowIndex
    const nearBoundary = withinTableX && Math.abs(my - boundaryY) <= REVEAL_PX && !isDragging
    if (!rowActive && !nearBoundary) return
    const rowHeight = rowRect.height
    handles.push(
      <div
        key={`row-${rowIndex}`}
        className="absolute pointer-events-auto cursor-row-resize"
        style={{ top: boundaryY - clip.top - 5, left: rect.left - clip.left, width: rect.width, height: 10, zIndex: 1001 }}
        title="Drag to resize row"
        onMouseDown={(e) => handleStartDrag('row', 0, rowIndex, e)}
      >
        {/* Row highlight band (covers the row being resized). */}
        <div
          className={cn('pointer-events-none absolute left-0 w-full', rowActive ? 'bg-primary/10' : 'bg-primary/5')}
          style={{ bottom: 5, height: rowHeight }}
        />
        {/* Crisp guide line across the full row boundary. */}
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px] rounded-full',
            rowActive ? 'bg-primary' : 'bg-primary/70',
          )}
        />
      </div>
    )
  })

  // Corner handle (bottom-right of the table) — resize both at once. Reveals only
  // when the cursor is near the bottom-right corner.
  const lastRow = rows[rows.length - 1]
  const lastRowCells = lastRow ? (Array.from(lastRow.querySelectorAll('td, th')) as HTMLElement[]) : []
  const cornerCell = lastRowCells[lastRowCells.length - 1]
  if (cornerCell && firstRowCells.length > 0) {
    const cornerRect = cornerCell.getBoundingClientRect()
    const cornerActive = isDragging && dragState!.type === 'both'
    const nearCorner =
      !isDragging && Math.abs(mx - cornerRect.right) <= 14 && Math.abs(my - cornerRect.bottom) <= 14
    if (cornerActive || nearCorner) {
      const lastColIndex = firstRowCells.length - 1
      const lastRowIndex = rows.length - 1
      handles.push(
        <div
          key="corner"
          className="absolute pointer-events-auto cursor-nwse-resize flex items-end justify-end"
          style={{
            top: cornerRect.bottom - clip.top - 9,
            left: cornerRect.right - clip.left - 9,
            width: 16,
            height: 16,
            zIndex: 1002,
          }}
          title="Drag to resize row and column"
          onMouseDown={(e) => handleStartDrag('both', lastColIndex, lastRowIndex, e)}
        >
          <div
            className={cn(
              'size-2.5 rounded-[3px] border-b-2 border-r-2',
              cornerActive ? 'border-primary' : 'border-primary/60',
            )}
          />
        </div>
      )
    }
  }

  // Anchor the Edit Table button just below the table's bottom-right. The
  // container's overflow:hidden keeps it from spilling outside the editor; we
  // keep it anchored to the table (not the viewport corner) so moving off the
  // table dismisses the controls.
  const editBtnTop = rect.bottom - clip.top + 6
  const editBtnRight = Math.max(0, clip.right - rect.right)

  return (
    <div
      data-table-overlay=""
      className="absolute pointer-events-none select-none overflow-hidden"
      style={{
        top: clip.top + window.scrollY,
        left: clip.left + window.scrollX,
        width: clip.width,
        height: clip.height,
        zIndex: 1000,
      }}
    >
      <div className="relative w-full h-full">
        {handles}

        {/* Edit Table trigger — anchored to the table, clamped inside the editor. */}
        <div
          className="table-controls-overlay absolute pointer-events-auto"
          style={{
            top: editBtnTop,
            right: editBtnRight,
            zIndex: 1005
          }}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-2xs gap-1.5 bg-background shadow-sm hover:bg-accent border-muted-foreground/20"
              >
                <TableIcon className="h-3 w-3" /> Edit Table
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-1 bg-background/95 backdrop-blur-sm border-border shadow-2xl">
              <DropdownMenuLabel className="text-2xs uppercase text-muted-foreground font-semibold px-2 py-1">Rows</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => editor.chain().focus().addRowBefore().run()} className="text-xs gap-2">
                <Rows className="h-3.5 w-3.5 rotate-180 opacity-70" /> Add Row Above
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().addRowAfter().run()} className="text-xs gap-2">
                <Rows className="h-3.5 w-3.5 opacity-70" /> Add Row Below
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().deleteRow().run()} className="text-xs gap-2 text-destructive focus:text-destructive">
                <Trash2 className="h-3.5 w-3.5 opacity-70" /> Delete Row
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuLabel className="text-2xs uppercase text-muted-foreground font-semibold px-2 py-1">Columns</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => editor.chain().focus().addColumnBefore().run()} className="text-xs gap-2">
                <Columns className="h-3.5 w-3.5 -scale-x-100 opacity-70" /> Add Column Left
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().addColumnAfter().run()} className="text-xs gap-2">
                <Columns className="h-3.5 w-3.5 opacity-70" /> Add Column Right
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().deleteColumn().run()} className="text-xs gap-2 text-destructive focus:text-destructive">
                <Trash2 className="h-3.5 w-3.5 opacity-70" /> Delete Column
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuLabel className="text-2xs uppercase text-muted-foreground font-semibold px-2 py-1">Position</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => moveTopLevelBlock(editor, -1)} className="text-xs gap-2">
                <ArrowUp className="h-3.5 w-3.5 opacity-70" /> Move Table Up
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => moveTopLevelBlock(editor, 1)} className="text-xs gap-2">
                <ArrowDown className="h-3.5 w-3.5 opacity-70" /> Move Table Down
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuLabel className="text-2xs uppercase text-muted-foreground font-semibold px-2 py-1">Cells & Headers</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => editor.chain().focus().mergeCells().run()} className="text-xs gap-2">
                <Maximize2 className="h-3.5 w-3.5 opacity-70" /> Merge Cells
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().splitCell().run()} className="text-xs gap-2">
                <Minimize2 className="h-3.5 w-3.5 opacity-70" /> Split Cell
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeaderRow().run()} className="text-xs gap-2">
                <Type className="h-3.5 w-3.5 opacity-70" /> Toggle Row Header
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeaderColumn().run()} className="text-xs gap-2">
                <Type className="h-3.5 w-3.5 opacity-70" /> Toggle Column Header
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuLabel className="text-2xs uppercase text-muted-foreground font-semibold px-2 py-1 flex items-center gap-2">
                <Paintbrush className="h-3 w-3" /> Cell Background
              </DropdownMenuLabel>
              <div className="flex flex-wrap gap-1.5 p-2 px-3">
                {[
                  { name: 'No Color', value: null, className: 'bg-transparent border border-muted-foreground/30 flex items-center justify-center after:content-["/"] after:text-muted-foreground/40 after:text-2xs after:font-bold' },
                  { name: 'Blue', value: '#e3f2fd', className: 'bg-[#e3f2fd] border border-blue-200' },
                  { name: 'Green', value: '#e8f5e9', className: 'bg-[#e8f5e9] border border-green-200' },
                  { name: 'Red', value: '#ffebee', className: 'bg-[#ffebee] border border-red-200' },
                  { name: 'Yellow', value: '#fffde7', className: 'bg-[#fffde7] border border-yellow-200' },
                  { name: 'Gray', value: '#f5f5f5', className: 'bg-[#f5f5f5] border border-gray-200' },
                  { name: 'Indigo', value: '#e8eaf6', className: 'bg-[#e8eaf6] border border-indigo-200' },
                  { name: 'Purple', value: '#f3e5f5', className: 'bg-[#f3e5f5] border border-purple-200' },
                ].map((color) => (
                  <button
                    key={color.name}
                    title={color.name}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();

                      // React Overlay Method:
                      // 1. Identify cells to color (multi-selection or current focus)
                      const selectedCells = table.querySelectorAll('.selectedCell');

                      if (selectedCells.length > 0) {
                        // Color all selected cells
                        selectedCells.forEach(cell => {
                          (cell as HTMLElement).style.backgroundColor = color.value || '';
                        });
                      } else {
                        // Fallback: Use Tiptap's built-in command for single cell/current selection
                        // This ensures we still color the cell even if it's not "selected" in a multi-cell sense
                        editor.chain().focus().setCellAttribute('backgroundColor', color.value).run();
                      }

                      // 2. Persist DOM changes to the Tiptap document
                      syncCellAttributes(table, view);
                    }}
                    className={cn(
                      "h-5 w-5 rounded-sm transition-all hover:scale-110 active:scale-95 shadow-sm",
                      color.className
                    )}
                  />
                ))}
              </div>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => editor.chain().focus().deleteTable().run()} className="text-xs gap-2 text-destructive focus:text-destructive font-medium">
                <Trash2 className="h-3.5 w-3.5" /> Delete Entire Table
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div >
    </div >
  )
}

export interface IndentOptions {
  types: string[];
  indentLevels: number[];
  defaultIndentLevel: number;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    setIndent: () => ReturnType;
    unsetIndent: () => ReturnType;
  }
}

export const Indent = Extension.create<IndentOptions>({
  name: 'indent',

  addOptions() {
    return {
      types: ['paragraph', 'heading', 'blockquote'],
      indentLevels: [0, 30, 60, 90, 120, 150, 180, 210],
      defaultIndentLevel: 0,
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: this.options.defaultIndentLevel,
            renderHTML: (attributes) => {
              if (!attributes.indent || attributes.indent === 0) {
                return {};
              }
              return {
                style: `margin-left: ${attributes.indent}px`,
              };
            },
            parseHTML: (element) => {
              const left = element.style.marginLeft || element.style.paddingLeft;
              const value = parseInt(left, 10);
              return value && value > 0 ? value : 0;
            },
          },
        },
      },
    ];
  },

  addCommands(): any {
    return {
      setIndent:
        () =>
          ({ tr, state, dispatch, editor }: any) => {
            const { selection } = state;
            const { from, to } = selection;

            if (
              editor.isActive('bulletList') ||
              editor.isActive('orderedList') ||
              editor.isActive('taskList')
            ) {
              return editor.chain().sinkListItem('listItem').run();
            }

            tr.doc.nodesBetween(from, to, (node: any, pos: number) => {
              if (this.options.types.includes(node.type.name)) {
                const indent = node.attrs.indent || 0;
                const nextLevel =
                  this.options.indentLevels.find((level) => level > indent) || indent;

                if (nextLevel !== indent) {
                  tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    indent: nextLevel,
                  });
                }
              }
            });

            if (dispatch) {
              dispatch(tr);
              return true;
            }
            return false;
          },
      unsetIndent:
        () =>
          ({ tr, state, dispatch, editor }: any) => {
            const { selection } = state;
            const { from, to } = selection;

            if (
              editor.isActive('bulletList') ||
              editor.isActive('orderedList') ||
              editor.isActive('taskList')
            ) {
              return editor.chain().liftListItem('listItem').run();
            }

            tr.doc.nodesBetween(from, to, (node: any, pos: number) => {
              if (this.options.types.includes(node.type.name)) {
                const indent = node.attrs.indent || 0;
                const prevLevel =
                  [...this.options.indentLevels]
                    .reverse()
                    .find((level) => level < indent) || 0;

                if (prevLevel !== indent) {
                  tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    indent: prevLevel,
                  });
                }
              }
            });

            if (dispatch) {
              dispatch(tr);
              return true;
            }
            return false;
          },
    };
  },

  addKeyboardShortcuts() {
    return {
      // @ts-expect-error Tiptap's Commands augmentation isn't surfaced on the
      // SingleCommands type inside addKeyboardShortcuts; setIndent is declared above.
      Tab: () => this.editor.commands.setIndent(),
      // @ts-expect-error see above — unsetIndent is declared in the module augmentation.
      'Shift-Tab': () => this.editor.commands.unsetIndent(),
    };
  },
});

export interface AlignmentOptions {
  textTypes: string[];
  verticalTypes: string[];
  defaultTextAlign: "left" | "center" | "right" | "justify";
  defaultVerticalAlign: "top" | "middle" | "bottom";
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    setTextAlign: (alignment: "left" | "center" | "right" | "justify") => ReturnType;
    unsetTextAlign: () => ReturnType;
    setVerticalAlign: (alignment: "top" | "middle" | "bottom") => ReturnType;
    unsetVerticalAlign: () => ReturnType;
  }
}

export const Alignment = Extension.create<AlignmentOptions>({
  name: "alignment",

  addOptions() {
    return {
      textTypes: ["paragraph", "heading", "tableCell", "tableHeader"],
      verticalTypes: ["tableCell", "tableHeader"],
      defaultTextAlign: "left",
      defaultVerticalAlign: "top",
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.textTypes,
        attributes: {
          textAlign: {
            default: this.options.defaultTextAlign,
            parseHTML: (element: HTMLElement) =>
              (element.style.textAlign as "left" | "center" | "right" | "justify" | "") ||
              this.options.defaultTextAlign,
            renderHTML: (attributes: Record<string, any>) => {
              if (
                !attributes.textAlign ||
                attributes.textAlign === this.options.defaultTextAlign
              ) {
                return {};
              }

              return {
                style: `text-align: ${attributes.textAlign}`,
              };
            },
          },
        },
      },
      {
        types: this.options.verticalTypes,
        attributes: {
          verticalAlign: {
            default: this.options.defaultVerticalAlign,
            parseHTML: (element: HTMLElement) =>
              (element.style.verticalAlign as "top" | "middle" | "bottom" | "") ||
              this.options.defaultVerticalAlign,
            renderHTML: (attributes: Record<string, any>) => {
              if (
                !attributes.verticalAlign ||
                attributes.verticalAlign === this.options.defaultVerticalAlign
              ) {
                return {};
              }

              return {
                style: `vertical-align: ${attributes.verticalAlign}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const updateNodesInSelection = (
      state: any,
      tr: any,
      types: string[],
      updater: (attrs: Record<string, any>) => Record<string, any>
    ) => {
      const { from, to } = state.selection;
      let changed = false;

      tr.doc.nodesBetween(from, to, (node: any, pos: number) => {
        if (types.includes(node.type.name)) {
          tr.setNodeMarkup(pos, undefined, updater(node.attrs));
          changed = true;
        }
      });

      return changed;
    };

    return {
      setTextAlign:
        (alignment: "left" | "center" | "right" | "justify") =>
          ({ state, tr, dispatch }: { state: any; tr: any; dispatch: any }) => {
            const changed = updateNodesInSelection(
              state,
              tr,
              this.options.textTypes,
              (attrs) => ({ ...attrs, textAlign: alignment })
            );

            if (changed && dispatch) {
              dispatch(tr);
            }

            return changed;
          },
      unsetTextAlign:
        () =>
          ({ state, tr, dispatch }: { state: any; tr: any; dispatch: any }) => {
            const changed = updateNodesInSelection(
              state,
              tr,
              this.options.textTypes,
              (attrs) => ({ ...attrs, textAlign: this.options.defaultTextAlign })
            );

            if (changed && dispatch) {
              dispatch(tr);
            }

            return changed;
          },
      setVerticalAlign:
        (alignment: "top" | "middle" | "bottom") =>
          ({ state, tr, dispatch }: { state: any; tr: any; dispatch: any }) => {
            const changed = updateNodesInSelection(
              state,
              tr,
              this.options.verticalTypes,
              (attrs) => ({ ...attrs, verticalAlign: alignment })
            );

            if (changed && dispatch) {
              dispatch(tr);
            }

            return changed;
          },
      unsetVerticalAlign:
        () =>
          ({ state, tr, dispatch }: { state: any; tr: any; dispatch: any }) => {
            const changed = updateNodesInSelection(
              state,
              tr,
              this.options.verticalTypes,
              (attrs) => ({
                ...attrs,
                verticalAlign: this.options.defaultVerticalAlign,
              })
            );

            if (changed && dispatch) {
              dispatch(tr);
            }

            return changed;
          },
    } as any;
  },
});

export interface CommentOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      setComment: (attributes: { author: string; content: string; createdAt?: number }) => ReturnType;
      unsetComment: () => ReturnType;
      deleteComment: (id: string) => ReturnType;
    };
    // Re-declared here so the ResizableImage commands resolve in this module's
    // type-check context. The runtime commands are implemented in
    // ./extensions/resizable-image; signatures mirror that file exactly.
    resizableImage: {
      setImageAlign: (align: "left" | "center" | "right") => ReturnType;
      setImageFloat: (float: "none" | "left" | "right") => ReturnType;
      setImageWidth: (width: number) => ReturnType;
      setImageComment: (attrs: {
        author: string;
        content: string;
        id?: string;
        createdAt?: number;
      }) => ReturnType;
      clearImageComment: () => ReturnType;
      deleteImageCommentById: (id: string) => ReturnType;
    };
  }
}

export const Comment = Mark.create<CommentOptions>({
  name: 'comment',

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'comment-mark',
      },
    };
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-id'),
        renderHTML: (attributes: Record<string, any>) => {
          if (!attributes.id) {
            return {};
          }
          return {
            'data-id': attributes.id,
          };
        },
      },
      author: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-author'),
        renderHTML: (attributes: Record<string, any>) => {
          if (!attributes.author) {
            return {};
          }
          return {
            'data-author': attributes.author,
          };
        },
      },
      createdAt: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const val = element.getAttribute('data-created-at');
          return val ? Number(val) : null;
        },
        renderHTML: (attributes: Record<string, any>) => {
          if (!attributes.createdAt) {
            return {};
          }
          return {
            'data-created-at': attributes.createdAt,
          };
        },
      },
      content: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-content'),
        renderHTML: (attributes: Record<string, any>) => {
          if (!attributes.content) {
            return {};
          }
          return {
            'data-content': attributes.content,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-comment]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, any> }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-comment': '' }), 0];
  },

  addCommands() {
    return {
      setComment:
        (attributes: any) =>
          ({ commands }: { commands: any }) => {
            const id = `comment-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.floor(Math.random() * 1000)}`}`;
            return commands.setMark(this.name, {
              ...attributes,
              id,
              createdAt: attributes.createdAt || Date.now(),
            });
          },
      unsetComment:
        () =>
          ({ commands }: { commands: any }) => {
            return commands.unsetMark(this.name);
          },
      deleteComment:
        (id: string) =>
          ({ tr, state, dispatch }: { tr: any; state: any; dispatch: any }) => {
            const { doc } = state;
            let changed = false;
            doc.descendants((node: any, pos: number) => {
              if (node.type.name === "image" && node.attrs.commentId === id) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  commentId: null,
                  commentAuthor: null,
                  commentContent: null,
                  commentCreatedAt: null,
                });
                changed = true;
              }
              node.marks.forEach((mark: any) => {
                if (mark.type.name === this.name && mark.attrs.id === id) {
                  tr.removeMark(pos, pos + node.nodeSize, mark.type);
                  changed = true;
                }
              });
            });
            if (changed && dispatch) {
              dispatch(tr);
              return true;
            }
            return changed;
          },
    };
  },

  addProseMirrorPlugins() {
    return []
  },
});

/** At most one of these toolbar dropdowns open at a time (mutually exclusive). */
type ToolbarClusterId = "text" | "insert" | "lists" | "align" | "table" | "sigma" | "ai"

/** Word-style ribbon tabs. "table" is contextual (shown only inside a table). */
type RibbonTab = "home" | "insert" | "layout" | "table"
const RIBBON_TAB_KEY = "notes9-editor-ribbon-tab"

type ToolbarShortcutTarget =
  | "text-trigger"
  | "font-family"
  | "font-size"
  | "text-color"
  | "insert"
  | "lists"
  | "align"
  | "table"
  | "sigma"

const SCIENTIFIC_SYMBOL_GROUPS = [
  ["alpha", "beta", "gamma", "delta", "mu", "pi"].map((id, index) => ({
    id,
    label: ["alpha", "beta", "gamma", "delta", "mu", "pi"][index],
    value: ["alpha", "beta", "gamma", "delta", "mu", "pi"][index] === "alpha" ? "α" :
      ["alpha", "beta", "gamma", "delta", "mu", "pi"][index] === "beta" ? "β" :
      ["alpha", "beta", "gamma", "delta", "mu", "pi"][index] === "gamma" ? "γ" :
      ["alpha", "beta", "gamma", "delta", "mu", "pi"][index] === "delta" ? "Δ" :
      ["alpha", "beta", "gamma", "delta", "mu", "pi"][index] === "mu" ? "μ" : "π",
  })),
  [
    { id: "plus-minus", label: "plus/minus", value: "±" },
    { id: "approx", label: "approx", value: "≈" },
    { id: "not-equal", label: "not equal", value: "≠" },
    { id: "less-equal", label: "less/equal", value: "≤" },
    { id: "greater-equal", label: "greater/equal", value: "≥" },
    { id: "infinity", label: "infinity", value: "∞" },
  ],
  [
    { id: "right-arrow", label: "reaction arrow", value: "→" },
    { id: "equilibrium", label: "equilibrium", value: "⇌" },
    { id: "degree", label: "degree", value: "°" },
    { id: "angstrom", label: "angstrom", value: "Å" },
    { id: "times", label: "times", value: "×" },
    { id: "middle-dot", label: "dot", value: "·" },
  ],
]

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.matches("input, textarea, select")) return true
  return !!target.closest("input, textarea, select")
}

function clampChannel(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function normalizeHex(hex: string): string {
  let h = hex.replace(/^#/, "").trim()
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("")
  }
  return "#" + h.slice(0, 6).toLowerCase()
}

function normalizeUrl(url: string) {
  const trimmed = url.trim()
  if (!trimmed) return ""
  if (/^(https?:\/\/|mailto:|tel:|data:|blob:)/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

/**
 * Make plain-text math safe to render with KaTeX.
 *
 * Users typically type ordinary expressions like `EE% = ((Total-Free)/Total)*100`
 * rather than escaped LaTeX. KaTeX treats `%` as a comment start (silently
 * dropping the rest of the line), and `#`/`&` as macro/alignment control
 * characters, so an unescaped one breaks the whole equation. Escape only those
 * special characters that aren't already escaped, leaving intentional LaTeX
 * (`^`, `_`, `\frac`, braces, …) untouched.
 */
function sanitizeLatexInput(latex: string): string {
  return latex.replace(/(?<!\\)([%#&])/g, "\\$1")
}

// Common English words that carry no topical signal for citation matching.
const CITE_STOPWORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "into", "onto", "over",
  "under", "are", "was", "were", "been", "being", "have", "has", "had", "does",
  "did", "done", "which", "while", "where", "when", "what", "whom", "whose",
  "than", "then", "they", "their", "them", "these", "those", "such", "also",
  "because", "however", "therefore", "between", "within", "among", "across",
  "using", "used", "based", "study", "studies", "results", "result", "method",
  "methods", "analysis", "data", "show", "shown", "showed", "can", "could",
  "would", "should", "may", "might", "will", "shall", "not", "but", "its",
  "our", "your", "his", "her", "each", "other", "more", "most", "some", "many",
  "much", "very", "both", "about", "after", "before", "during", "through",
])

/**
 * Pull the most topical keywords out of a selected sentence/claim so we can
 * match it against saved papers (and seed a web search). Keeps unique words of
 * length ≥ 4 that aren't stopwords, in order, capped to keep filters small.
 */
function extractCiteKeywords(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []
  const seen = new Set<string>()
  const out: string[] = []
  for (const w of matches) {
    if (CITE_STOPWORDS.has(w) || seen.has(w)) continue
    seen.add(w)
    out.push(w)
    if (out.length >= 8) break
  }
  return out
}

function isMacLikePlatform() {
  if (typeof navigator === "undefined") return false
  const platform = navigator.platform || ""
  const userAgent = navigator.userAgent || ""
  return /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS|iPhone|iPad|iPod/i.test(userAgent)
}

function formatToolbarShortcutLabel(isMac: boolean, key: string) {
  return `\\ ${key.toUpperCase()}`
}

// Preserve an `id` on paragraphs/headings so imported reference entries
// (id="cite-ref-N") survive in the editor and inline citations can scroll to them.
const NodeId = Extension.create({
  name: "nodeId",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          id: {
            default: null,
            parseHTML: (element) => element.getAttribute("id") || null,
            renderHTML: (attributes) => (attributes.id ? { id: attributes.id } : {}),
          },
        },
      },
    ]
  },
})

export function TiptapEditor({
  content = "",
  onChange,
  placeholder = "Start typing your scientific notes...",
  className,
  editable = true,
  minHeight = "400px",
  showAITools = true,
  title = "document",
  hideToolbar = false,
  protocols = [],
  samples = [],
  labNotes = [],
  literatureItems = [],
  enableMath = false,
  paperMode = false,
  panelEmbed = false,
  showAiWritingDropdown = true,
  showAiWritingToolbarLabel = false,
  onEditorReady,
  inlineDiffHtml,
  onAcceptInlineDiff,
  onDismissInlineDiff,
  fillParentHeight = false,
  onOpenScientificCalculator,
  fullscreenWorkspaceRef,
  onEditorFullscreenChange,
  commentsToggleRef,
  onDocumentTitleChange,
  onDocumentTitleCommit,
  fullscreenMainStartInsetPx = 0,
  leadingToolbarSlot,
  trailingToolbarSlot,
  ydoc,
  provider,
  collaborationEnabled,
  userName,
  userColor,
}: TiptapEditorProps & {
  hideToolbar?: boolean
  /** Accepted for lab-notes compatibility; export UI is toolbar-driven. */
  hideExportControls?: boolean
  exportIncludeCommentsInPdf?: boolean
}) {
  const [activeTable, setActiveTable] = useState<HTMLTableElement | null>(null)
  const [editorContainer, setEditorContainer] = useState<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(false)
  const editorShellRef = useRef<HTMLDivElement | null>(null)
  const [editorRegionFullscreen, setEditorRegionFullscreen] = useState(false)
  const [editorFullscreenStyle, setEditorFullscreenStyle] = useState<CSSProperties | undefined>(
    undefined,
  )
  const [fullscreenDocTitleEditing, setFullscreenDocTitleEditing] = useState(false)
  const fullscreenDocTitleInputRef = useRef<HTMLInputElement | null>(null)

  const getSidebarInsetMain = useCallback((): HTMLElement | null => {
    const root = fullscreenWorkspaceRef?.current ?? editorShellRef.current
    if (!root) return null
    const inset = root.closest('[data-slot="sidebar-inset"]')
    if (!inset) return null
    return inset.querySelector(":scope > main") as HTMLElement | null
  }, [fullscreenWorkspaceRef])

  const syncEditorFullscreenBounds = useCallback(() => {
    if (!editorRegionFullscreen) return
    const mainEl = getSidebarInsetMain()
    if (!mainEl) {
      // Respect notches / home indicator when we cannot anchor to SidebarInset main.
      const pad = "max(env(safe-area-inset-top, 0px), 0.75rem)"
      setEditorFullscreenStyle({
        position: "fixed",
        top: pad,
        right: "max(env(safe-area-inset-right, 0px), 0.75rem)",
        bottom: "max(env(safe-area-inset-bottom, 0px), 0.75rem)",
        left: "max(env(safe-area-inset-left, 0px), 0.75rem)",
        zIndex: 110,
        margin: 0,
        width: "auto",
        height: "auto",
      })
      return
    }
    const rect = mainEl.getBoundingClientRect()
    const startInset = Math.max(0, fullscreenMainStartInsetPx ?? 0)
    const width = Math.max(160, Math.round(rect.width - startInset))
    // Use bottom − top so the shell matches the visible main column edge-to-edge (avoids 1px gaps).
    const height = Math.max(200, Math.round(rect.bottom - rect.top))
    setEditorFullscreenStyle({
      position: "fixed",
      top: `${Math.round(rect.top)}px`,
      left: `${Math.round(rect.left + startInset)}px`,
      width: `${width}px`,
      height: `${height}px`,
      zIndex: 110,
      margin: 0,
    })
  }, [editorRegionFullscreen, getSidebarInsetMain, fullscreenMainStartInsetPx])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!editorRegionFullscreen) {
      setEditorFullscreenStyle(undefined)
      return
    }
    syncEditorFullscreenBounds()
    window.addEventListener("resize", syncEditorFullscreenBounds)
    window.addEventListener("scroll", syncEditorFullscreenBounds, true)
    return () => {
      window.removeEventListener("resize", syncEditorFullscreenBounds)
      window.removeEventListener("scroll", syncEditorFullscreenBounds, true)
    }
  }, [editorRegionFullscreen, syncEditorFullscreenBounds])

  useEffect(() => {
    if (!editorRegionFullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditorRegionFullscreen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [editorRegionFullscreen])

  useEffect(() => {
    onEditorFullscreenChange?.(editorRegionFullscreen)
  }, [editorRegionFullscreen, onEditorFullscreenChange])

  /** Apply fixed bounds to workspace shell or editor card (not both). */
  useLayoutEffect(() => {
    const el = fullscreenWorkspaceRef?.current ?? editorShellRef.current
    if (!el) return

    const reset = () => {
      el.style.removeProperty("position")
      el.style.removeProperty("top")
      el.style.removeProperty("left")
      el.style.removeProperty("right")
      el.style.removeProperty("bottom")
      el.style.removeProperty("width")
      el.style.removeProperty("height")
      el.style.removeProperty("inset")
      el.style.removeProperty("z-index")
      el.style.removeProperty("margin")
      el.removeAttribute("data-n9-editor-fullscreen")
    }

    if (!editorRegionFullscreen) {
      reset()
      return
    }

    if (!editorFullscreenStyle) {
      return
    }

    const s = editorFullscreenStyle
    el.style.position = typeof s.position === "string" ? s.position : "fixed"
    el.style.zIndex = String(s.zIndex ?? 110)
    el.style.margin = typeof s.margin === "string" ? s.margin : "0"
    if (s.inset != null) {
      el.style.inset = String(s.inset)
      el.style.width = "auto"
      el.style.height = "auto"
    } else {
      el.style.removeProperty("inset")
      if (s.top != null) el.style.top = String(s.top)
      if (s.left != null) el.style.left = String(s.left)
      if (s.width != null) el.style.width = String(s.width)
      if (s.height != null) el.style.height = String(s.height)
    }
    el.setAttribute("data-n9-editor-fullscreen", "")
    return reset
  }, [editorRegionFullscreen, editorFullscreenStyle, fullscreenWorkspaceRef])

  useEffect(() => {
    if (!editorRegionFullscreen) return
    const mainEl = getSidebarInsetMain()
    if (!mainEl || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => {
      syncEditorFullscreenBounds()
    })
    ro.observe(mainEl)
    return () => ro.disconnect()
  }, [editorRegionFullscreen, getSidebarInsetMain, syncEditorFullscreenBounds])

  useEffect(() => {
    if (!editorRegionFullscreen) {
      setFullscreenDocTitleEditing(false)
    }
  }, [editorRegionFullscreen])

  useEffect(() => {
    if (!fullscreenDocTitleEditing) return
    const id = requestAnimationFrame(() => {
      fullscreenDocTitleInputRef.current?.focus()
      fullscreenDocTitleInputRef.current?.select()
    })
    return () => cancelAnimationFrame(id)
  }, [fullscreenDocTitleEditing])

  // Track table hover with hide delay
  useEffect(() => {
    if (!editorContainer) return
    let hideTimeout: any
    // Throttle to one layout-reading pass per animation frame. mousemove fires
    // 30-60x/s and each pass runs closest('table') + contains() (forces style
    // recalc); coalescing to the latest event per frame yields the same final
    // activeTable without thrashing layout on every intermediate event.
    let rafId: number | null = null
    let pendingTarget: HTMLElement | null = null

    const process = () => {
      rafId = null
      const target = pendingTarget
      if (!target) return
      const table = target.closest('table')

      // Only track if the table is inside THIS editor container
      const isOurTable = table && editorContainer.contains(table)
      // Resize handles + the Edit Table button live in a body-level portal, so
      // they aren't inside `table`; matching the overlay marker keeps the
      // controls alive while the cursor is on them (incl. during a drag).
      const overlay = target.closest('[data-table-overlay]')

      if (isOurTable) {
        clearTimeout(hideTimeout)
        setActiveTable(table as HTMLTableElement)
      } else if (overlay) {
        clearTimeout(hideTimeout)
        // Keep activeTable as is if we're over ANY table control overlay
      } else {
        // Start hide delay
        clearTimeout(hideTimeout)
        hideTimeout = setTimeout(() => {
          setActiveTable(null)
        }, 800) // Increased delay to 800ms for better usability
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      pendingTarget = e.target as HTMLElement
      if (rafId === null) {
        rafId = requestAnimationFrame(process)
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      if (rafId !== null) cancelAnimationFrame(rafId)
      clearTimeout(hideTimeout)
    }
  }, [editorContainer])
  const [isAIProcessing, setIsAIProcessing] = useState(false)
  const [isCiteProcessing, setIsCiteProcessing] = useState(false)
  const [toolbarClusterMenu, setToolbarClusterMenu] = useState<ToolbarClusterId | null>(null)
  // Word-style tabbed ribbon: which group of tools is currently shown.
  const [ribbonTab, setRibbonTab] = useState<RibbonTab>(() => {
    if (typeof window === "undefined") return "home"
    const saved = window.localStorage.getItem(RIBBON_TAB_KEY)
    return saved === "insert" || saved === "layout" || saved === "table" ? saved : "home"
  })
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(RIBBON_TAB_KEY, ribbonTab)
    } catch {
      /* ignore quota/availability errors */
    }
  }, [ribbonTab])
  // Page setup for print / PDF export (orientation + margins).
  const [pageSetup, setPageSetup] = useState<{
    orientation: "portrait" | "landscape"
    pageView: boolean
    margins: { top: number; right: number; bottom: number; left: number }
  }>({
    orientation: "portrait",
    pageView: false,
    margins: { top: 96, right: 96, bottom: 96, left: 96 },
  })
  // Page geometry in CSS px at 96dpi (US Letter): portrait 8.5×11in, landscape 11×8.5in.
  const pageWidthPx = pageSetup.orientation === "landscape" ? 1056 : 816
  const pageMinHeightPx = pageSetup.orientation === "landscape" ? 816 : 1056
  // Live params the pagination plugin reads each measure pass.
  const paginationParamsRef = useRef<PaginationParams>({ enabled: false, pageContentHeightPx: 0, gapPx: 0 })
  paginationParamsRef.current = {
    enabled: pageSetup.pageView,
    pageContentHeightPx: Math.max(0, pageMinHeightPx - pageSetup.margins.top - pageSetup.margins.bottom),
    gapPx: pageSetup.margins.top + pageSetup.margins.bottom + 28,
  }
  useEffect(() => {
    if (typeof document === "undefined") return
    const id = "n9-page-setup-style"
    let el = document.getElementById(id) as HTMLStyleElement | null
    if (!el) {
      el = document.createElement("style")
      el.id = id
      document.head.appendChild(el)
    }
    const m = pageSetup.margins
    const inch = (px: number) => `${(px / 96).toFixed(2)}in`
    el.textContent = `@media print { @page { size: ${pageSetup.orientation === "landscape" ? "landscape" : "portrait"}; margin: ${inch(m.top)} ${inch(m.right)} ${inch(m.bottom)} ${inch(m.left)}; } }`
  }, [pageSetup])
  const [textMenuFontSizeInput, setTextMenuFontSizeInput] = useState("16")
  const [textMenuBaseColor, setTextMenuBaseColor] = useState("#1e88e5")
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkUrlInput, setLinkUrlInput] = useState("")
  const [linkTextInput, setLinkTextInput] = useState("")
  const [mathEdit, setMathEdit] = useState<{ pos: number; latex: string; block: boolean } | null>(null)
  const [chemDialogOpen, setChemDialogOpen] = useState(false)
  const [chemInput, setChemInput] = useState("")
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const cameraVideoRef = useRef<HTMLVideoElement>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const [imageInsertDialogOpen, setImageInsertDialogOpen] = useState(false)
  const [imageUrlInput, setImageUrlInput] = useState("")
  const [imageAltInput, setImageAltInput] = useState("")
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)
  const [citationModalOpen, setCitationModalOpen] = useState(false)
  const [bibliographyModalOpen, setBibliographyModalOpen] = useState(false)
  const [foundPapers, setFoundPapers] = useState<Paper[]>([])
  const [selectedPapers, setSelectedPapers] = useState<Set<number>>(new Set())
  const [citationInsertPosition, setCitationInsertPosition] = useState<number>(0)
  // Where the currently-shown citation results came from, and the query that
  // produced them (so the modal can offer a web search when the repository
  // had nothing useful).
  const [citationSource, setCitationSource] = useState<"repository" | "web" | null>(null)
  const [lastCiteQuery, setLastCiteQuery] = useState<string>("")
  // Whether the user has explicitly chosen a citation style. Until they have,
  // the bibliography stays empty and references are never auto-populated. A
  // previously-saved style (or a prior choice) counts as chosen.
  const [citationStyleChosen, setCitationStyleChosen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    const saved = readPaperCitationStyle()
    if (saved && isValidTiptapCitationStyle(saved)) return true
    try {
      return window.localStorage.getItem(CITATION_STYLE_CHOSEN_KEY) === "1"
    } catch {
      return false
    }
  })

  const markCitationStyleChosen = useCallback(() => {
    setCitationStyleChosen(true)
    try {
      window.localStorage.setItem(CITATION_STYLE_CHOSEN_KEY, "1")
    } catch {
      /* ignore persistence failures */
    }
  }, [])
  // Citation store (single source of truth for citations + style)
  const [citationState, citationDispatch] = useCitationReducer(paperMode)
  const selectedCitationStyle = citationState.style
  // Memoize the metadata map — `buildMetadataMap` walks the full citation
  // store and runs on every render (the editor re-renders on selection change).
  const citationMetadata = useMemo(() => buildMetadataMap(citationState), [citationState])
  const [isCommenting, setIsCommenting] = useState(false)
  const [commentText, setCommentText] = useState("")
  const [commentsSidebarOpen, setCommentsSidebarOpen] = useState(false)
  // Expose a comments-sidebar toggle so an external toolbar (e.g. the lab-notes
  // "Review" menu) can open/close it.
  useEffect(() => {
    if (!commentsToggleRef) return
    commentsToggleRef.current = () => setCommentsSidebarOpen((open) => !open)
    return () => {
      if (commentsToggleRef) commentsToggleRef.current = null
    }
  }, [commentsToggleRef])
  /* State merge: keeping activeCommentData from origin */
  const [activeCommentData, setActiveCommentData] = useState<{ author: string; content: string; createdAt: number; id: string; rect: DOMRect } | null>(null)
  const [, setToolbarSyncTick] = useState(0)
  const lastFinalIndexRef = useRef<number>(0)
  const lastInterimTextRef = useRef<string>("")
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null)
  // Re-run pagination when page setup changes (margins/orientation/page-view toggle)
  // even without a doc edit — the plugin recomputes on any transaction.
  useEffect(() => {
    const ed = editorRef.current
    if (ed) ed.view.dispatch(ed.state.tr.setMeta("n9-paginate-refresh", true))
  }, [pageSetup, pageMinHeightPx])
  /** Skip one cross-window event after we broadcast from the toolbar (avoid duplicate reformat loop). */
  const skipNextPaperCitationEventRef = useRef(false)

  const clearInterimFromEditor = useCallback(() => {
    const ed = editorRef.current
    if (!ed || !lastInterimTextRef.current) return
    const currentPos = ed.state.selection.anchor
    const interimLength = lastInterimTextRef.current.length
    const deleteFrom = Math.max(0, currentPos - interimLength)
    const deleteTo = currentPos
    if (deleteFrom < deleteTo) {
      ed.chain()
        .focus()
        .setTextSelection({ from: deleteFrom, to: deleteTo })
        .deleteSelection()
        .run()
    }
    lastInterimTextRef.current = ""
  }, [])

  const { start: startAwsTranscribe, stop: stopAwsTranscribe, isListening, getWaveformData } = useAwsTranscribe({
    onInterim: useCallback((text: string) => {
      const ed = editorRef.current
      if (!ed) return
      if (lastInterimTextRef.current) clearInterimFromEditor()
      if (text) {
        ed.chain().focus().insertContent(text).run()
        lastInterimTextRef.current = text
      }
    }, [clearInterimFromEditor]),
    onFinal: useCallback((text: string) => {
      const ed = editorRef.current
      if (!ed) return
      if (lastInterimTextRef.current) clearInterimFromEditor()
      if (text) {
        ed.chain().focus().insertContent(text + " ").run()
      }
    }, [clearInterimFromEditor]),
    onError: useCallback((msg: string) => {
      clearInterimFromEditor()
      toast.error(msg || "Transcription unavailable. Check server configuration.")
    }, [clearInterimFromEditor]),
  })

  // Use ref for entities so the mention extension always has access to current entities
  const entitiesRef = useRef<EntityItem[]>([
    ...(protocols || []).map(p => ({ ...p, type: "protocol" as const })),
    ...(samples || []).map(s => ({ ...s, type: "sample" as const }))
  ])
  const labNotesRef = useRef<LabNoteItem[]>(labNotes || [])
  const literatureRef = useRef<LiteratureItem[]>(literatureItems || [])

  // Keep the refs in sync with props
  useEffect(() => {
    entitiesRef.current = [
      ...(protocols || []).map(p => ({ ...p, type: "protocol" as const })),
      ...(samples || []).map(s => ({ ...s, type: "sample" as const }))
    ]
  }, [protocols, samples])

  useEffect(() => {
    labNotesRef.current = labNotes
  }, [labNotes])

  useEffect(() => {
    literatureRef.current = literatureItems
  }, [literatureItems])



  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        ...(collaborationEnabled && ydoc && provider ? { history: false } : {}),
      }),
      Placeholder.configure({
        placeholder,
      }),
      Link.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            'data-paper-id': { default: null },
            'data-paper-title': { default: null },
            'data-paper-authors': { default: null },
            'data-paper-year': { default: null },
            'data-paper-journal': { default: null },
            'data-paper-doi': { default: null },
          }
        },
      }).configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline cursor-pointer",
        },
      }),
      ResizableImage.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          class: "max-w-full h-auto rounded-lg",
        },
      }),
      Highlight.configure({
        multicolor: true,
      }),
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      ResizableTable.configure({
        resizable: true,
        allowTableNodeSelection: true,
        handleWidth: 5,
        cellMinWidth: 75,
        lastColumnResizable: true,
      }),
      ResizableTableRow,
      ExtendedTableHeader,
      ExtendedTableCell,
      ...(enableMath ? [Mathematics.configure({
        inlineOptions: {
          onClick: (node: any, pos: number) => {
            setMathEdit({ pos, latex: String(node.attrs?.latex ?? ""), block: false })
          },
        },
        blockOptions: {
          onClick: (node: any, pos: number) => {
            setMathEdit({ pos, latex: String(node.attrs?.latex ?? ""), block: true })
          },
        },
        katexOptions: {
          throwOnError: false,
          macros: {
            '\\RR': '\\mathbb{R}',
            '\\ZZ': '\\mathbb{Z}',
            '\\NN': '\\mathbb{N}',
            '\\QQ': '\\mathbb{Q}',
            '\\CC': '\\mathbb{C}',
            '\\deg': '°',
          },
        },
      })] : []),
      Underline,
      Subscript,
      Superscript,
      ChemicalFormula,
      ChemistryHighlight,
      RagHighlight,
      SimpleShape,
      BlockDragHandle,
      LineHeight,
      PageBreak,
      ColumnsExtension,
      DocHeader,
      DocFooter,
      HeaderFooter,
      Pagination.configure({ getParams: () => paginationParamsRef.current }),
      SpreadsheetEmbed,
      Alignment,
      EntityMention.configure({
        HTMLAttributes: {
          class: "mention-entity",
        },
        suggestion: createEntitySuggestion(entitiesRef),
        renderLabel({ node }: { node: any }) {
          return `@${node.attrs.label ?? node.attrs.id}`
        },
      }),
      LabNoteMention.configure({
        HTMLAttributes: {
          class: "mention-labnote",
        },
        suggestion: createLabNoteSuggestion(labNotesRef),
        renderLabel({ node }: { node: any }) {
          return `#${node.attrs.label ?? node.attrs.id}`
        },
      }),
      // LiteratureMention is available but omitted here to avoid conflicting with
      // ProtocolMention on the '@' trigger. Literature citations are inserted
      // as raw HTML via the ProtocolLiteraturePanel (drag-and-drop / checkbox insert),
      // and rendered with the .mention-literature CSS class.
      Indent,
      Comment,
      NodeId,
      ...(collaborationEnabled && ydoc && provider ? [
        Collaboration.configure({
          fragment: ydoc.getXmlFragment('default'),
        }),
      ] : []),
    ],
    ...(!(collaborationEnabled && ydoc && provider) ? { content } : {}),
    editable,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
      setToolbarSyncTick((current) => current + 1)
    },
    onSelectionUpdate: ({ editor }) => {
      setToolbarSyncTick((current) => current + 1)
      if (editor.state.selection.empty) {
        setIsCommenting(false)
      }
    },
    // Catches storedMarks changes (font/color/size set on a collapsed selection
    // — i.e. cursor-only, no selected text) that don't fire onUpdate or
    // onSelectionUpdate. Without this, the toolbar labels lag behind reality
    // whenever the menu stays open across multiple attribute tweaks.
    onTransaction: ({ transaction }) => {
      if (transaction.storedMarksSet) {
        setToolbarSyncTick((current) => current + 1)
      }
    },
    onCreate: () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('TiptapEditor: created')
      }
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm sm:prose lg:prose-lg xl:prose-2xl focus:outline-none p-4",
        spellcheck: "true",
        tabindex: "0",
      },
      handleDrop: (view, event, _slice, _moved) => {
        const dt = event.dataTransfer

        // Handle protocol drops - insert as mention
        const protocolData = dt?.getData("application/x-protocol")
        if (protocolData) {
          try {
            const protocol = JSON.parse(protocolData)
            event.preventDefault()

            // Get the drop position
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
            if (pos) {
              // Insert mention at drop position
              const { tr } = view.state
              const mentionNode = view.state.schema.nodes.mention?.create({
                id: protocol.id,
                label: protocol.name,
              })
              if (mentionNode) {
                tr.insert(pos.pos, mentionNode)
                view.dispatch(tr)
              }
            }
            return true
          } catch (e) {
            console.error("Failed to parse protocol data:", e)
          }
        }

        if (!dt?.files?.length) return false
        const files = Array.from(dt.files)
        const pdf = files.find((f) => f.name.toLowerCase().endsWith(".pdf") || f.type === "application/pdf")
        if (pdf) {
          event.preventDefault()
          insertPdfFromFile(pdf)
          return true
        }
        const docx = files.find((f) => f.name.toLowerCase().endsWith(".docx"))
        if (docx) {
          event.preventDefault()
          insertDocxFromFile(docx)
          return true
        }
        const html = files.find((f) => f.name.toLowerCase().endsWith(".html") || f.name.toLowerCase().endsWith(".htm"))
        if (html) {
          event.preventDefault()
          insertHtmlFromFile(html)
          return true
        }
        const spreadsheet = files.find((f) => isSpreadsheetFile(f))
        if (spreadsheet) {
          event.preventDefault()
          insertSpreadsheetFromFile(spreadsheet)
          return true
        }
        const md = files.find((f) => f.name.toLowerCase().endsWith(".md") || f.name.toLowerCase().endsWith(".markdown"))
        if (md) {
          event.preventDefault()
          insertMarkdownFromFile(md)
          return true
        }
        const txt = files.find((f) => f.name.toLowerCase().endsWith(".txt"))
        if (txt) {
          event.preventDefault()
          insertPlainTextFromFile(txt)
          return true
        }
        const images = files.filter((f) => f.type.startsWith("image/"))
        if (images.length === 0) return false
        event.preventDefault()
        insertImagesFromFileList(images)
        return true
      },
      handlePaste: (_view, event) => {
        const files = event.clipboardData?.files
        if (files && files.length) {
          const arr = Array.from(files)
          const pdf = arr.find((f) => f.name.toLowerCase().endsWith(".pdf") || f.type === "application/pdf")
          if (pdf) {
            event.preventDefault()
            insertPdfFromFile(pdf)
            return true
          }
          const docx = arr.find((f) => f.name.toLowerCase().endsWith(".docx"))
          if (docx) {
            event.preventDefault()
            insertDocxFromFile(docx)
            return true
          }
          const html = arr.find((f) => f.name.toLowerCase().endsWith(".html") || f.name.toLowerCase().endsWith(".htm"))
          if (html) {
            event.preventDefault()
            insertHtmlFromFile(html)
            return true
          }
          const spreadsheet = arr.find((f) => isSpreadsheetFile(f))
          if (spreadsheet) {
            event.preventDefault()
            insertSpreadsheetFromFile(spreadsheet)
            return true
          }
          const md = arr.find((f) => f.name.toLowerCase().endsWith(".md") || f.name.toLowerCase().endsWith(".markdown"))
          if (md) {
            event.preventDefault()
            insertMarkdownFromFile(md)
            return true
          }
          const txt = arr.find((f) => f.name.toLowerCase().endsWith(".txt"))
          if (txt) {
            event.preventDefault()
            insertPlainTextFromFile(txt)
            return true
          }
          const imgs = arr.filter((f) => f.type.startsWith("image/"))
          if (imgs.length) {
            event.preventDefault()
            insertImagesFromFileList(imgs)
            return true
          }
        }
        const clipboard = event.clipboardData
        const html = clipboard?.getData("text/html")?.trim()
        const text = clipboard?.getData("text/plain") ?? ""

        if (html && isEditorNativeClipboardHtml(html)) {
          return false
        }

        if (!html && !text.trim()) {
          return false
        }

        event.preventDefault()
        void (async () => {
          const resolved = await resolveClipboardPaste({ html, plain: text })
          if (!resolved || !editor) return
          editor.chain().focus().insertContent(sanitizeHtml(resolved)).run()
        })()
        return true
      },
      handleDOMEvents: {
        dragover: (_view, ev) => {
          ev.preventDefault()
          return false
        },
      },
    },
  })

  const applyCitationStyleChange = useCallback(
    (newStyle: string) => {
      // Choosing/changing the style is the trigger that lets citations roll up
      // into a references section.
      markCitationStyleChosen()
      if (!editor) {
        citationDispatch({ type: "SET_STYLE", style: newStyle })
        if (paperMode) {
          skipNextPaperCitationEventRef.current = true
          writePaperCitationStyle(newStyle)
        }
        return
      }

      const html = editor.getHTML()
      const parsed = parseCitationsFromHtml(html)
      const entriesFromDoc: CitationEntry[] = parsed.map((p, i) => ({
        key: p.paperId || `cite-${p.number}-${i}`,
        metadata: {
          citationNumber: i + 1,
          url: p.url,
          title: p.title,
          authors: p.authors,
          year: p.year,
          journal: p.journal,
          doi: p.doi,
          paperId: p.paperId,
        },
      }))

      citationDispatch({ type: "SET_STYLE", style: newStyle })
      citationDispatch({ type: "SYNC_FROM_HTML", entries: entriesFromDoc })

      if (paperMode) {
        skipNextPaperCitationEventRef.current = true
        writePaperCitationStyle(newStyle)
      }

      const metaMap = buildMetadataMap({
        entries: entriesFromDoc,
        style: newStyle,
      })

      let updated = reformatInlineCitations(html, newStyle)
      if (metaMap.size > 0) {
        updated = reformatBibliography(updated, metaMap, newStyle)
      }
      if (updated !== html) {
        editor.commands.setContent(updated)
      }
    },
    [paperMode, editor, citationDispatch, markCitationStyleChosen]
  )

  useEffect(() => {
    if (!paperMode || !editor) return
    const handler = (e: Event) => {
      if (skipNextPaperCitationEventRef.current) {
        skipNextPaperCitationEventRef.current = false
        return
      }
      const v = (e as CustomEvent<string>).detail
      if (!v || !isValidTiptapCitationStyle(v)) return
      if (v === citationState.style) return
      applyCitationStyleChange(v)
    }
    window.addEventListener(PAPER_CITATION_STYLE_EVENT, handler)
    return () => window.removeEventListener(PAPER_CITATION_STYLE_EVENT, handler)
  }, [paperMode, editor, citationState.style, applyCitationStyleChange])

  useEffect(() => {
    editorRef.current = editor
    if (editor) onEditorReady?.(editor)
  }, [editor])

  // Inline diff widget — render a DOM element at the cursor position when inlineDiffHtml is set
  useEffect(() => {
    if (!editor || !editorContainer) return
    // Clean up any existing widget
    const existing = editorContainer.querySelector('.inline-diff-widget')
    if (existing) existing.remove()

    if (!inlineDiffHtml) return

    // Get the cursor position in the DOM
    const { state } = editor
    const { selection } = state
    const pos = selection.anchor

    // Create the widget element
    const widget = document.createElement('div')
    widget.className = 'inline-diff-widget'
    widget.contentEditable = 'false'

    // Header
    const header = document.createElement('div')
    header.className = 'inline-diff-header'
    header.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.855z"/></svg><span>AI Suggestion</span><span class="diff-badge">Insert</span>`
    widget.appendChild(header)

    // Body — render the HTML content. AI-generated diff HTML is sanitized
    // before insertion to prevent XSS via injected <script>/event handlers.
    const body = document.createElement('div')
    body.className = 'inline-diff-body'
    body.innerHTML = sanitizeHtml(inlineDiffHtml)
    widget.appendChild(body)

    // Actions bar
    const actions = document.createElement('div')
    actions.className = 'inline-diff-actions'

    const acceptBtn = document.createElement('button')
    acceptBtn.className = 'accept-btn'
    acceptBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Accept`
    acceptBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      onAcceptInlineDiff?.()
    })

    const discardBtn = document.createElement('button')
    discardBtn.className = 'discard-btn'
    discardBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Discard`
    discardBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      onDismissInlineDiff?.()
    })

    actions.appendChild(acceptBtn)
    actions.appendChild(discardBtn)
    widget.appendChild(actions)

    // Insert the widget into the editor DOM at the cursor position
    try {
      const domAtPos = editor.view.domAtPos(pos)
      const parentNode = domAtPos.node as HTMLElement
      if (parentNode.nodeType === Node.TEXT_NODE) {
        // Insert after the text node's parent element
        const parentEl = parentNode.parentElement
        if (parentEl) {
          parentEl.after(widget)
        }
      } else if (parentNode.nodeType === Node.ELEMENT_NODE) {
        // Insert as a child or after the element
        const childNodes = parentNode.childNodes
        if (domAtPos.offset < childNodes.length) {
          const refNode = childNodes[domAtPos.offset]
          parentNode.insertBefore(widget, refNode)
        } else {
          parentNode.appendChild(widget)
        }
      }
    } catch {
      // Fallback: append to the editor container's ProseMirror div
      const proseMirror = editorContainer.querySelector('.ProseMirror')
      if (proseMirror) {
        proseMirror.appendChild(widget)
      }
    }

    // Scroll the widget into view
    setTimeout(() => widget.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)

    return () => {
      widget.remove()
    }
  }, [editor, editorContainer, inlineDiffHtml, onAcceptInlineDiff, onDismissInlineDiff])

  // Track active comment via DOM click events - reads data attributes directly
  useEffect(() => {
    if (!editorContainer) return

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement

      // Imported citations: inline [N] scrolls to its reference entry; a DOI/URL
      // inside a reference entry opens the source.
      const anchor = target.closest("a") as HTMLAnchorElement | null
      if (anchor) {
        const href = anchor.getAttribute("href") || ""
        if (href.startsWith("#cite-ref-")) {
          const num = href.slice("#cite-ref-".length)
          // Prefer the preserved id; fall back to the reference paragraph that
          // starts with "[N] " (the id can be stripped by the editor schema).
          let refEl = editorContainer.querySelector(`[id="${href.slice(1)}"]`) as HTMLElement | null
          if (!refEl && /^\d+$/.test(num)) {
            const startRe = new RegExp(`^\\s*\\[${num}\\]\\s`)
            refEl =
              (Array.from(editorContainer.querySelectorAll("p, li")).find(
                (el) => startRe.test(el.textContent || ""),
              ) as HTMLElement | undefined) ?? null
          }
          if (refEl) {
            refEl.scrollIntoView({ behavior: "smooth", block: "center" })
            refEl.classList.add("cite-ref-flash")
            window.setTimeout(() => refEl?.classList.remove("cite-ref-flash"), 1200)
            e.preventDefault()
            return
          }
        } else if (
          /^https?:\/\//i.test(href) &&
          (anchor.closest('[id^="cite-ref-"]') || /^\s*\[\d+\]\s/.test(anchor.closest("p, li")?.textContent || ""))
        ) {
          window.open(href, "_blank", "noopener,noreferrer")
          e.preventDefault()
          return
        }
      }

      const commentEl =
        (target.closest('.comment-mark') as HTMLElement | null) ??
        (target.closest('[data-image-comment]') as HTMLElement | null)

      if (commentEl) {
        const content = commentEl.getAttribute('data-content')
        const author = commentEl.getAttribute('data-author')
        const createdAt = commentEl.getAttribute('data-created-at')
        const id = commentEl.getAttribute('data-id')

        if (content) {
          const rect = commentEl.getBoundingClientRect()
          setActiveCommentData({
            author: author || "Unknown",
            content: content,
            createdAt: createdAt ? Number(createdAt) : Date.now(),
            id: id || "",
            rect,
          })
          return
        }
      }
      // Clicked outside a comment mark in the editor - close tooltip
      setActiveCommentData(null)
    }

    editorContainer.addEventListener('click', handleClick)
    return () => {
      editorContainer.removeEventListener('click', handleClick)
    }
  }, [editorContainer])

  // Close comment tooltip on scroll or outside click
  useEffect(() => {
    if (!activeCommentData) return

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Don't close if clicking inside the tooltip itself
      if (target.closest('[data-comment-tooltip]')) return
      // Don't close if clicking a comment mark (handled above)
      if (target.closest('.comment-mark')) return
      setActiveCommentData(null)
    }

    const handleScroll = () => {
      setActiveCommentData(null)
    }

    // Delay listener to avoid catching the same click
    const timeout = setTimeout(() => {
      document.addEventListener('click', handleGlobalClick)
      window.addEventListener('scroll', handleScroll, true)
    }, 0)

    return () => {
      clearTimeout(timeout)
      document.removeEventListener('click', handleGlobalClick)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [activeCommentData])

  // Mirror `content` prop into the editor ONLY when an external source changes
  // it (note switch, AI insert, etc.) — not when the change came from this
  // editor's own onUpdate -> parent setState round trip. `lastEmittedHtmlRef`
  // captures whatever we just emitted upward so we can compare against it.
  const lastEmittedHtmlRef = useRef<string>(content ?? "")
  useEffect(() => {
    if (!editor) return
    if (content === lastEmittedHtmlRef.current) return
    if (content === editor.getHTML()) return
    editor.commands.setContent(content)
    lastEmittedHtmlRef.current = content
  }, [content, editor])

  // AI writing helpers (improve/continue/shorter/longer/simplify/grammar/structure)
  // previously routed through Google Gemini and were removed when the product
  // stopped using any Google APIs. `aiCite` below uses an independent citation-
  // search endpoint and is intentionally kept.

  // 1) Repository first: look for an already-saved paper that matches the
  // selected text. This is a fast, local Supabase lookup (RLS-scoped to the
  // user's organization) so common "cite a paper I already have" cases resolve
  // instantly without hitting the web.
  const searchRepositoryCitations = useCallback(async (rawQuery: string): Promise<Paper[]> => {
    const keywords = extractCiteKeywords(rawQuery)
    if (keywords.length === 0) return []
    // Strip characters that would break PostgREST's `.or()` filter grammar.
    const safe = keywords.map((k) => k.replace(/[(),*%:]/g, "")).filter((k) => k.length >= 4)
    if (safe.length === 0) return []

    const supabase = createClient()
    const orFilter = safe.map((k) => `title.ilike.%${k}%,abstract.ilike.%${k}%`).join(",")
    const { data, error } = await supabase
      .from("literature_reviews")
      .select("id,title,authors,journal,publication_year,doi,pmid,url,abstract,catalog_placement")
      .eq("catalog_placement", "repository")
      .or(orFilter)
      .limit(50)
    if (error || !data) return []

    // Rank candidates by keyword hits (title weighted over abstract).
    const scored = data
      .map((row: any) => {
        const title = String(row.title ?? "").toLowerCase()
        const abstract = String(row.abstract ?? "").toLowerCase()
        let score = 0
        for (const k of safe) {
          if (title.includes(k)) score += 3
          if (abstract.includes(k)) score += 1
        }
        return { row, score }
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)

    return scored.map(({ row }) => {
      const bareDoi = row.doi ? String(row.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim() : ""
      const sourceUrl =
        (row.url ? String(row.url) : "") ||
        (bareDoi ? `https://doi.org/${bareDoi}` : "") ||
        (row.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${row.pmid}/` : "")
      const authors =
        typeof row.authors === "string" && row.authors.trim()
          ? row.authors.split(/[;,]/).map((a: string) => a.trim()).filter(Boolean)
          : []
      const year =
        typeof row.publication_year === "number"
          ? row.publication_year
          : row.publication_year
            ? Number(row.publication_year) || null
            : null
      return {
        id: String(row.id),
        title: String(row.title ?? ""),
        authors,
        year,
        journal: String(row.journal ?? ""),
        source_url: sourceUrl,
        doi: bareDoi,
      }
    })
  }, [])

  // 2) Web fallback: the in-app, web-enabled literature search (Catalyst, with
  // a legacy PubMed/Europe PMC/OpenAlex fallback inside the route).
  const searchWebCitations = useCallback(async (rawQuery: string): Promise<Paper[]> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120000)
    try {
      const query = rawQuery.trim().slice(0, 1000)
      const response = await fetch(`/api/search-papers?query=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error("Citation search failed")
      const payload = (await response.json()) as { papers?: SearchPaper[] }
      const papers = payload.papers ?? []

      const seen = new Set<string>()
      const uniqueData: Paper[] = []
      for (const p of papers) {
        const key = (p.title || "").trim().toLowerCase()
        if (!key || seen.has(key)) continue
        seen.add(key)
        const bareDoi = p.doi ? p.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim() : ""
        const sourceUrl =
          p.articlePageUrl ||
          p.pdfUrl ||
          (bareDoi ? `https://doi.org/${bareDoi}` : "") ||
          (p.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/` : "")
        uniqueData.push({
          id: p.id || bareDoi || p.pmid || key,
          title: p.title,
          authors: p.authors ?? [],
          year: p.year ?? null,
          journal: p.journal ?? "",
          source_url: sourceUrl,
          doi: bareDoi,
        })
      }
      return uniqueData
    } finally {
      clearTimeout(timeoutId)
    }
  }, [])

  const aiCite = useCallback(async () => {
    if (!editor) return
    const { from, to } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to, " ")

    if (!selectedText || selectedText.trim().length < 10) {
      toast.error('Please select text (at least 10 characters) to find citations', {
        duration: 4000,
        description: 'Highlight the text you want to cite, then click this button again.'
      })
      setToolbarClusterMenu(null)
      return
    }

    const query = selectedText.trim().slice(0, 1000)
    setCitationInsertPosition(to)
    setLastCiteQuery(query)

    try {
      setIsCiteProcessing(true)

      // Repository first — instant if the paper is already saved.
      const repoResults = await searchRepositoryCitations(query)
      if (repoResults.length > 0) {
        setFoundPapers(repoResults)
        setSelectedPapers(new Set())
        setCitationSource("repository")
        setCitationModalOpen(true)
        return
      }

      // Otherwise search the web-enabled literature service.
      const webResults = await searchWebCitations(query)
      if (webResults.length > 0) {
        setFoundPapers(webResults)
        setSelectedPapers(new Set())
        setCitationSource("web")
        setCitationModalOpen(true)
      } else {
        toast.error('No citations found for the selected text', {
          duration: 4000,
          description: 'Try selecting different text or rephrasing your query.'
        })
      }
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError"
      console.error('Citation search error:', error)
      toast.error(aborted ? 'Citation search timed out' : 'Failed to fetch citations', {
        duration: 4000,
        description: 'Please check your connection and try again.'
      })
    } finally {
      setIsCiteProcessing(false)
      setToolbarClusterMenu(null)
    }
  }, [editor, searchRepositoryCitations, searchWebCitations])

  // Triggered from the modal when the repository results aren't what the user
  // wants and they choose to search the web instead.
  const runWebCitationSearch = useCallback(async () => {
    if (!lastCiteQuery) return
    try {
      setIsCiteProcessing(true)
      const webResults = await searchWebCitations(lastCiteQuery)
      if (webResults.length > 0) {
        setFoundPapers(webResults)
        setSelectedPapers(new Set())
        setCitationSource("web")
      } else {
        toast.error('No web citations found for the selected text', { duration: 4000 })
      }
    } catch {
      toast.error('Web citation search failed', { duration: 4000 })
    } finally {
      setIsCiteProcessing(false)
    }
  }, [lastCiteQuery, searchWebCitations])

  const handleCiteSelected = useCallback(() => {
    if (!editor || selectedPapers.size === 0) return

    const html = editor.getHTML()

    // Determine insert position among existing citations by counting
    // how many citation anchors appear before the cursor position
    const beforeCursor = html.substring(0, editor.state.selection.from)
    const existingBeforeCursor = (beforeCursor.match(/<a[^>]*data-paper-title="[^"]*"[^>]*>[^<]*<\/a>/g) || []).length
    // Also count plain-text [N] before cursor
    const strippedBefore = beforeCursor.replace(/<a[^>]*>[^<]*<\/a>/g, '')
    const plainBefore = (strippedBefore.match(/\[(\d+)\]/g) || []).length
    const insertAfterNumber = existingBeforeCursor + plainBefore

    // Build new citation entries from selected papers
    const sortedIndices = Array.from(selectedPapers).sort((a, b) => a - b)
    const newEntries: CitationEntry[] = sortedIndices.map((index) => {
      const paper = foundPapers[index]
      return {
        key: paper?.id?.toString() || `new-${Date.now()}-${index}`,
        metadata: {
          citationNumber: 0, // will be assigned by reducer
          url: paper?.source_url || '',
          title: paper?.title || '',
          authors: paper?.authors || [],
          year: paper?.year || 0,
          journal: paper?.journal || '',
          doi: paper?.doi || '',
          paperId: paper?.id?.toString() || '',
        },
      }
    })

    // Add to store — reducer handles renumbering everything
    citationDispatch({ type: 'ADD_CITATIONS', citations: newEntries, afterNumber: insertAfterNumber })

    // Build the HTML for the new citations to insert at cursor
    // We need to compute the numbers they'll get after insertion
    const startNumber = insertAfterNumber + 1
    let citationText = ''
    newEntries.forEach((entry, i) => {
      const num = startNumber + i
      const meta = { ...entry.metadata, citationNumber: num }
      const inlineLabel = formatInlineCitation(num, meta, selectedCitationStyle)
      const authorsJson = JSON.stringify(meta.authors || []).replace(/"/g, '&quot;')
      citationText += `<a href="${meta.url}" data-paper-id="${meta.paperId}" data-paper-title="${meta.title.replace(/"/g, '&quot;')}" data-paper-authors="${authorsJson}" data-paper-year="${meta.year}" data-paper-journal="${(meta.journal || '').replace(/"/g, '&quot;')}" data-paper-doi="${meta.doi || ''}" target="_blank" rel="noopener noreferrer">${inlineLabel}</a>`
    })

    // Insert at cursor position
    editor.chain().focus().setTextSelection(citationInsertPosition).insertContent(citationText).run()

    // Renumber all existing citations in the document to match store order
    setTimeout(() => {
      const updatedHtml = editor.getHTML()
      const newHtml = reformatInlineCitations(updatedHtml, selectedCitationStyle)
      if (newHtml !== updatedHtml) {
        editor.commands.setContent(newHtml)
      }
    }, 100)

    // Close modal and reset
    setCitationModalOpen(false)
    setFoundPapers([])
    setSelectedPapers(new Set())
  }, [editor, selectedPapers, foundPapers, citationInsertPosition, selectedCitationStyle, citationDispatch])

  const togglePaperSelection = useCallback((index: number) => {
    setSelectedPapers(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }, [])

  const handleGenerateBibliography = useCallback(async () => {
    if (!editor) return

    // Citations only roll up into a references/bibliography once the user has
    // picked a citation style. Until then the bibliography stays empty.
    if (!citationStyleChosen) {
      toast.info('Choose a citation style first', {
        description: 'Pick a citation style (APA, MLA, …) from the dropdown to build your references. Citations stay out of the bibliography until then.',
        duration: 5000,
      })
      return
    }

    const html = editor.getHTML()
    const citations = parseCitationsFromHtml(html)

    if (citations.length === 0) {
      toast.error('No citations found', {
        description: 'Add citations using "Cite with AI" or paste text containing [1], [2] style references.',
        duration: 4000,
      })
      return
    }

    setIsCiteProcessing(true)

    try {
      // Sync store with parsed citations
      const entries: CitationEntry[] = citations.map(c => ({
        key: c.paperId || `cite-${c.number}`,
        metadata: {
          citationNumber: c.number,
          url: c.url,
          title: c.title || '',
          authors: c.authors || [],
          year: c.year || 0,
          journal: c.journal || '',
          doi: c.doi || '',
          paperId: c.paperId,
        },
      }))
      citationDispatch({ type: 'SYNC_FROM_HTML', entries })
      setBibliographyModalOpen(true)
    } catch (error) {
      console.error('Error generating bibliography:', error)
      toast.error('Failed to generate bibliography', { description: 'Please try again.', duration: 4000 })
    } finally {
      setIsCiteProcessing(false)
    }
  }, [editor, citationStyleChosen, citationDispatch])

  const handleInsertBibliography = useCallback(() => {
    if (!editor || citationState.entries.length === 0) return

    const currentHtml = editor.getHTML()
    const updatedHtml = applyStoreToHtml(currentHtml, citationState)

    if (updatedHtml !== currentHtml) {
      editor.commands.setContent(updatedHtml)
    }
    setBibliographyModalOpen(false)
    toast.success('Bibliography updated successfully')
  }, [editor, citationState])

  const insertScientificSymbol = useCallback((symbol: string) => {
    if (!editor) return
    editor.chain().focus().insertContent(symbol).run()
    setToolbarClusterMenu(null)
  }, [editor])

  const insertArrowSymbol = useCallback((symbol: string) => {
    if (!editor) return
    editor.chain().focus().insertContent(` ${symbol} `).run()
    setToolbarClusterMenu(null)
  }, [editor])

  // Download functions
  const downloadAsMarkdown = useCallback(async () => {
    if (!editor) return
    // Convert the editor HTML to Markdown (headings, bold/italic, lists, tables,
    // links, code) instead of dumping plain text — keeps the export faithful to
    // what's in the editor.
    const { exportNoteAsMarkdown } = await import("@/lib/note-export")
    await exportNoteAsMarkdown(editor.getHTML(), title)
  }, [editor, title])

  const downloadAsHTML = useCallback(async () => {
    if (!editor) return
    const { prepareHtmlForExport } = await import("@/lib/print-export")
    const html = prepareHtmlForExport(editor.getHTML())
    const fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: Calibri, 'Segoe UI', sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
    }
    [style*="font-family"], [style*="font-size"], [style*="color"] { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h1, h2, h3 { margin-top: 1.5em; }
    code, kbd { font-family: Consolas, "Courier New", monospace; background: #f3f4f6; color: #111827; padding: 2px 6px; border-radius: 3px; }
    pre { font-family: Consolas, "Courier New", monospace; background: #f3f4f6; color: #111827; padding: 15px; border-radius: 5px; overflow-x: auto; white-space: pre-wrap; }
    pre code { background: transparent; color: inherit; padding: 0; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 20px; color: #666; }
    table { border-collapse: collapse; width: 100% !important; table-layout: auto !important; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; width: auto !important; min-width: 0 !important; }
    th { background: #f4f4f4; }
    .chemical-formula { font-family: monospace; font-weight: 500; }
    .chemistry-term { color: #0066cc; font-weight: 500; }
  </style>
</head>
<body>
  ${html}
</body>
</html>`
    const blob = new Blob([fullHTML], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${title}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [editor, title])

  const downloadAsText = useCallback(() => {
    if (!editor) return
    const text = editor.getText()
    const blob = new Blob([text], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${title}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [editor, title])

  const downloadAsJSON = useCallback(() => {
    if (!editor) return
    const json = JSON.stringify(editor.getJSON(), null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${title}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [editor, title])

  const downloadAsPDF = useCallback(async () => {
    if (!editor) return
    try {
      const { prepareHtmlForExport } = await import("@/lib/print-export")
      const exportHtml = prepareHtmlForExport(editor.getHTML())
      // Create an iframe for complete style isolation
      const iframe = document.createElement("iframe")
      iframe.style.cssText = `
        position: absolute;
        left: -9999px;
        width: 800px;
        height: 1px;
        border: none;
      `
      document.body.appendChild(iframe)

      // Wait for iframe to be ready
      await new Promise(resolve => setTimeout(resolve, 100))

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
      if (!iframeDoc) {
        throw new Error("Could not access iframe document")
      }

      // Write isolated HTML with comprehensive Tiptap-like styles
      iframeDoc.open()
      iframeDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            /* Reset */
            * { margin: 0; padding: 0; box-sizing: border-box; }
            
            /* Base */
            body {
              font-family: Calibri, 'Segoe UI', sans-serif;
              font-size: 12pt;
              line-height: 1.55;
              padding: 48px;
              background: #fff;
              color: #1a1a1a;
              max-width: 800px;
            }
            
            /* Typography */
            h1 { font-size: 2em; font-weight: 700; margin: 1.2em 0 0.6em; line-height: 1.3; }
            h2 { font-size: 1.6em; font-weight: 600; margin: 1.1em 0 0.5em; line-height: 1.35; }
            h3 { font-size: 1.3em; font-weight: 600; margin: 1em 0 0.4em; line-height: 1.4; }
            h4 { font-size: 1.1em; font-weight: 600; margin: 0.9em 0 0.4em; }
            h5, h6 { font-size: 1em; font-weight: 600; margin: 0.8em 0 0.3em; }
            
            p { margin: 0.8em 0; }
            
            /* Text formatting */
            strong, b { font-weight: 700; }
            em, i { font-style: italic; }
            u { text-decoration: underline; }
            s, strike { text-decoration: line-through; }
            sub { vertical-align: sub; font-size: 0.8em; }
            sup { vertical-align: super; font-size: 0.8em; }
            mark { background: #fff3a3; padding: 0 2px; }
            
            /* Links */
            a { color: #2563eb; text-decoration: underline; }
            
            /* Lists */
            ul, ol { margin: 0.8em 0; padding-left: 1.8em; }
            li { margin: 0.3em 0; }
            li > ul, li > ol { margin: 0.2em 0; }
            ul { list-style-type: disc; }
            ol { list-style-type: decimal; }
            ul ul { list-style-type: circle; }
            ul ul ul { list-style-type: square; }
            
            /* Task lists */
            ul[data-type="taskList"] { list-style: none; padding-left: 0; }
            ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; }
            ul[data-type="taskList"] input[type="checkbox"] { margin-top: 4px; }
            
            /* Blockquotes */
            blockquote {
              border-left: 4px solid #d1d5db;
              padding-left: 16px;
              margin: 1em 0;
              color: #4b5563;
              font-style: italic;
            }
            
            /* Code */
            code {
              font-family: Consolas, 'SF Mono', 'Monaco', 'Menlo', monospace;
              font-size: 0.9em;
              background: #f3f4f6 !important;
              padding: 2px 6px;
              border-radius: 4px;
              color: #111827 !important;
            }
            pre {
              font-family: Consolas, 'SF Mono', 'Monaco', 'Menlo', monospace;
              font-size: 0.9em;
              background: #f3f4f6 !important;
              color: #111827 !important;
              padding: 16px;
              border-radius: 8px;
              margin: 1em 0;
              overflow-x: auto;
              white-space: pre-wrap;
              word-break: break-word;
            }
            pre code, code, kbd {
              font-family: Consolas, 'SF Mono', 'Monaco', 'Menlo', monospace;
              background: #f3f4f6 !important;
              color: #111827 !important;
            }
            pre code { padding: 0; }
            
            /* Tables - High contrast for PDF */
            table {
              border-collapse: collapse;
              width: 100% !important;
              table-layout: auto !important;
              margin: 1em 0;
              font-size: 0.95em;
              border: 1px solid #000;
            }
            th, td {
              border: 1px solid #000;
              padding: 10px 14px;
              text-align: left;
              vertical-align: top;
              width: auto !important;
              min-width: 0 !important;
              max-width: none !important;
            }
            th {
              background: #f3f4f6;
              font-weight: 700;
            }
            tr:nth-child(even) { background: #fafafa; }
            
            /* Images */
            img { max-width: 100%; height: auto; border-radius: 4px; margin: 0.5em 0; }
            
            /* Horizontal rule */
            hr { border: none; border-top: 2px solid #e5e7eb; margin: 1.5em 0; }
            
            /* Highlight colors */
            [data-color="red"] { color: #dc2626; }
            [data-color="orange"] { color: #ea580c; }
            [data-color="yellow"] { color: #ca8a04; }
            [data-color="green"] { color: #16a34a; }
            [data-color="blue"] { color: #2563eb; }
            [data-color="purple"] { color: #9333ea; }
            [data-color="pink"] { color: #db2777; }
            
            /* Math formulas */
            .math-inline, .math-block { font-family: 'Times New Roman', serif; }
            
            /* Hide resize handles */
            .table-col-handle, .table-row-handle, .table-diag-handle { display: none !important; }
          </style>
        </head>
        <body>${exportHtml}</body>
        </html>
      `)
      iframeDoc.close()

      // Wait for content to render
      await new Promise(resolve => setTimeout(resolve, 200))

      // Use browser's print functionality
      const printWindow = iframe.contentWindow
      if (printWindow) {
        iframeDoc.title = title
        printWindow.print()
      }

      // Clean up after a delay
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe)
        }
      }, 1000)
    } catch (error) {
      console.error("PDF export error:", error)
      alert("Failed to export PDF.")
    }
  }, [editor, title])

  const downloadAsDOCX = useCallback(async () => {
    if (!editor) return
    setIsAIProcessing(true)

    try {
      const html = editor.getHTML()

      // Dynamically import the DOCX export function (proper .docx format!)
      const { exportHtmlToDocx } = await import('@/lib/docx-export')

      // Export to DOCX (works on Mac, Windows, Linux!)
      await exportHtmlToDocx(html, title || 'Document')

      setIsAIProcessing(false)
    } catch (error) {
      console.error("DOCX export error:", error)
      setIsAIProcessing(false)
      alert("Failed to export DOCX. Please try again.")
    }
  }, [editor, title])

  const startSpeechToText = useCallback(() => {
    lastFinalIndexRef.current = 0
    lastInterimTextRef.current = ""
    startAwsTranscribe()
  }, [startAwsTranscribe])

  const stopSpeechToText = useCallback(() => {
    stopAwsTranscribe()
    clearInterimFromEditor()
    lastFinalIndexRef.current = 0
  }, [stopAwsTranscribe, clearInterimFromEditor])

  const toolbarPositionContainerRef = useRef<HTMLDivElement>(null)
  const toolbarRailRef = useRef<HTMLDivElement>(null)
  const textMenuLayoutRef = useRef<HTMLDivElement>(null)
  const imageUploadInputRef = useRef<HTMLInputElement>(null)
  const cameraCaptureInputRef = useRef<HTMLInputElement>(null)
  const toolbarShortcutModeUntilRef = useRef(0)
  /** Mounted editor shell; state (not ref-only) so popper gets a stable collision boundary after first paint. */
  const [editorPopoverBoundaryEl, setEditorPopoverBoundaryEl] = useState<HTMLDivElement | null>(null)
  const [pendingToolbarShortcutFocus, setPendingToolbarShortcutFocus] = useState<ToolbarShortcutTarget | null>(null)

  const handleToolbarClusterChange = useCallback((id: ToolbarClusterId) => {
    return (open: boolean) => {
      setToolbarClusterMenu((prev) => (open ? id : prev === id ? null : prev))
    }
  }, [])

  const openToolbarCluster = useCallback(
    (id: ToolbarClusterId, target?: ToolbarShortcutTarget) => {
      setToolbarClusterMenu(id)
      setPendingToolbarShortcutFocus(target ?? null)
    },
    [],
  )

  useEffect(() => {
    if (toolbarClusterMenu !== "text" || !editor) return
    const raw = editor.getAttributes("textStyle").fontSize as string | undefined
    const n = clampChannel(parseInt(String(raw || "16").replace(/px/gi, ""), 10) || 16, 8, 96)
    setTextMenuFontSizeInput(String(n))
    const col = editor.getAttributes("textStyle").color as string | undefined
    if (col && typeof col === "string") {
      const t = col.trim()
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) {
        setTextMenuBaseColor(normalizeHex(t))
      }
    }
  }, [toolbarClusterMenu, editor])

  useEffect(() => {
    if (!pendingToolbarShortcutFocus) return

    const focusShortcutTarget = () => {
      const toolbarRoot = editorPopoverBoundaryEl
      if (pendingToolbarShortcutFocus === "text-trigger") {
        ;(toolbarRoot?.querySelector('[data-toolbar-trigger="text"]') as HTMLElement | null)?.focus()
        setPendingToolbarShortcutFocus(null)
        return
      }

      if (pendingToolbarShortcutFocus === "insert") {
        ;(toolbarRoot?.querySelector('[data-toolbar-trigger="insert"]') as HTMLElement | null)?.focus()
        setPendingToolbarShortcutFocus(null)
        return
      }

      if (pendingToolbarShortcutFocus === "lists") {
        ;(toolbarRoot?.querySelector('[data-toolbar-trigger="lists"]') as HTMLElement | null)?.focus()
        setPendingToolbarShortcutFocus(null)
        return
      }

      if (pendingToolbarShortcutFocus === "align") {
        ;(toolbarRoot?.querySelector('[data-toolbar-trigger="align"]') as HTMLElement | null)?.focus()
        setPendingToolbarShortcutFocus(null)
        return
      }

      if (pendingToolbarShortcutFocus === "table") {
        ;(toolbarRoot?.querySelector('[data-toolbar-trigger="table"]') as HTMLElement | null)?.focus()
        setPendingToolbarShortcutFocus(null)
        return
      }

      if (pendingToolbarShortcutFocus === "sigma") {
        ;(toolbarRoot?.querySelector('[data-toolbar-trigger="sigma"]') as HTMLElement | null)?.focus()
        setPendingToolbarShortcutFocus(null)
        return
      }

      const root = textMenuLayoutRef.current
      if (!root) return

      let selector = ""
      if (pendingToolbarShortcutFocus === "font-family") {
        selector = '[data-toolbar-focus="font-family"] [data-slot="select-trigger"]'
      } else if (pendingToolbarShortcutFocus === "font-size") {
        selector = '[data-toolbar-focus="font-size"] input'
      } else if (pendingToolbarShortcutFocus === "text-color") {
        selector = '[data-toolbar-focus="text-color"] button, [data-toolbar-focus="text-color"] input[type="color"]'
      }

      const target = selector ? (root.querySelector(selector) as HTMLElement | null) : null
      if (target) {
        target.focus()
        setPendingToolbarShortcutFocus(null)
      }
    }

    const timer = window.setTimeout(focusShortcutTarget, 30)
    return () => window.clearTimeout(timer)
  }, [editorPopoverBoundaryEl, pendingToolbarShortcutFocus, toolbarClusterMenu])

  const applyTextMenuFontSizePx = useCallback(
    (px: number) => {
      if (!editor) return
      const num = clampChannel(Math.round(px), 8, 96)
      setTextMenuFontSizeInput(String(num))
      editor.chain().focus().setFontSize(`${num}px`).run()
    },
    [editor],
  )

  const pickTextColorFromScreen = useCallback(async () => {
    if (!editor) return
    type EyeDropperWindow = Window & {
      EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> }
    }
    const ctor = typeof window !== "undefined" ? (window as EyeDropperWindow).EyeDropper : undefined
    if (!ctor) {
      toast.error("Screen color picker is not supported in this browser (try Chrome or Edge).")
      return
    }
    try {
      const eye = new ctor()
      const result = await eye.open()
      const hex = normalizeHex(result.sRGBHex)
      setTextMenuBaseColor(hex)
      editor.chain().focus().setColor(hex).run()
    } catch {
      /* user dismissed pipette */
    }
  }, [editor])

  const handleEditorToolbarShortcuts = useCallback(
    (e: KeyboardEvent | React.KeyboardEvent<HTMLDivElement>) => {
      if (!editor) return

      const target = e.target as HTMLElement | null
      const focusInsideEditor =
        !!target &&
        !!(editorPopoverBoundaryEl?.contains(target) || toolbarPositionContainerRef.current?.contains(target))

      if (!focusInsideEditor) return

      const key = e.key.toLowerCase()
      const shortcutModeActive = toolbarShortcutModeUntilRef.current > Date.now()

      const isShortcutLeader = e.key === "\\"

      if (!shortcutModeActive && !isShortcutLeader && e.key !== "Escape") return

      if (e.key === "Escape") {
        if (toolbarClusterMenu !== null) {
          e.preventDefault()
          setToolbarClusterMenu(null)
          setPendingToolbarShortcutFocus(null)
          editor.commands.focus()
          return
        }
        toolbarShortcutModeUntilRef.current = 0
        return
      }

      if (isShortcutLeader) {
        e.preventDefault()
        e.stopPropagation()
        toolbarShortcutModeUntilRef.current = Date.now() + 3000
        return
      }

      if (isEditableShortcutTarget(target) && !["b", "i", "u", "t", "f", "s", "c", "n", "l", "a", "m", "e"].includes(key)) return

      if (key === "b") {
        e.preventDefault()
        toolbarShortcutModeUntilRef.current = 0
        editor.chain().focus().toggleBold().run()
        return
      }
      if (key === "i") {
        e.preventDefault()
        toolbarShortcutModeUntilRef.current = 0
        editor.chain().focus().toggleItalic().run()
        return
      }
      if (key === "u") {
        e.preventDefault()
        toolbarShortcutModeUntilRef.current = 0
        editor.chain().focus().toggleUnderline().run()
        return
      }
      if (key === "t") {
        e.preventDefault()
        toolbarShortcutModeUntilRef.current = 0
        openToolbarCluster("text", "text-trigger")
        return
      }
      if (key === "f") {
        e.preventDefault()
        toolbarShortcutModeUntilRef.current = 0
        openToolbarCluster("text", "font-family")
        return
      }
      if (key === "s") {
        e.preventDefault()
        toolbarShortcutModeUntilRef.current = 0
        openToolbarCluster("text", "font-size")
        return
      }
      if (key === "c") {
        e.preventDefault()
        toolbarShortcutModeUntilRef.current = 0
        openToolbarCluster("text", "text-color")
        return
      }
      if (key === "n") {
        e.preventDefault()
        toolbarShortcutModeUntilRef.current = 0
        openToolbarCluster("insert", "insert")
        return
      }
      if (key === "l") {
        e.preventDefault()
        toolbarShortcutModeUntilRef.current = 0
        openToolbarCluster("lists", "lists")
        return
      }
      if (key === "a") {
        e.preventDefault()
        toolbarShortcutModeUntilRef.current = 0
        openToolbarCluster("align", "align")
        return
      }
      if (key === "m") {
        e.preventDefault()
        toolbarShortcutModeUntilRef.current = 0
        openToolbarCluster("table", "table")
        return
      }
      if (key === "e") {
        e.preventDefault()
        toolbarShortcutModeUntilRef.current = 0
        openToolbarCluster("sigma", "sigma")
      }
    },
    [
      editor,
      editorPopoverBoundaryEl,
      openToolbarCluster,
      toolbarClusterMenu,
    ],
  )

  useEffect(() => {
    const boundary = editorPopoverBoundaryEl
    const toolbar = toolbarPositionContainerRef.current
    if (!boundary && !toolbar) return

    const onKeyDown = (event: KeyboardEvent) => {
      handleEditorToolbarShortcuts(event)
    }

    boundary?.addEventListener("keydown", onKeyDown, true)
    toolbar?.addEventListener("keydown", onKeyDown, true)

    return () => {
      boundary?.removeEventListener("keydown", onKeyDown, true)
      toolbar?.removeEventListener("keydown", onKeyDown, true)
    }
  }, [editorPopoverBoundaryEl, handleEditorToolbarShortcuts])

  const getSelectedTable = () => {
    if (!editor) return null
    const { $from } = editor.state.selection
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth)
      if (node.type.name === "table") {
        const pos = $from.before(depth)
        return { node, pos }
      }
    }
    return null
  }

  const growTable = (rows: number, cols: number) => {
    if (!editor) return
    const selTable = getSelectedTable()
    if (!selTable) {
      // Insert new table at cursor
      editor
        .chain()
        .focus()
        .insertTable({ rows, cols, withHeaderRow: true })
        .run()
      return
    }

    const { node: tableNode, pos } = selTable
    const currentRows = tableNode.childCount
    const currentCols = tableNode.child(0)?.childCount || 0

    const targetRows = Math.max(rows, 1)
    const targetCols = Math.max(cols, 1)

    // Extract existing cell text
    const data: string[][] = []
    tableNode.forEach((row, rowIndex) => {
      data[rowIndex] = []
      row.forEach((cell, cellIndex) => {
        data[rowIndex][cellIndex] = cell.textContent
      })
    })

    // Build HTML for new table, preserving existing data
    let html = "<table><tbody>"
    for (let r = 0; r < targetRows; r++) {
      html += "<tr>"
      for (let c = 0; c < targetCols; c++) {
        const text = data[r]?.[c] ?? ""
        html += `<td>${text || "<br>"}</td>`
      }
      html += "</tr>"
    }
    html += "</tbody></table>"

    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + tableNode.nodeSize })
      .insertContentAt(pos, html)
      .run()
  }

  const handleTable = () => {
    if (!editor) return
    const selTable = getSelectedTable()
    const currentRows = selTable ? selTable.node.childCount : 3
    const currentCols = selTable ? selTable.node.child(0)?.childCount || 3 : 3

    const rows = Math.max(tableRows || currentRows, 1)
    const cols = Math.max(tableCols || currentCols, 1)

    growTable(rows, cols)
    setToolbarClusterMenu((p) => (p === "table" ? null : p))
  }

  const openLinkDialog = useCallback(() => {
    if (!editor) return
    const { from, to, empty } = editor.state.selection
    const selectionText = empty ? "" : editor.state.doc.textBetween(from, to, " ").trim()
    const previousUrl = editor.getAttributes("link").href || ""

    setLinkUrlInput(previousUrl)
    setLinkTextInput(selectionText || "")
    setLinkDialogOpen(true)
    setToolbarClusterMenu(null)
  }, [editor])

  const applyLinkFromDialog = useCallback(() => {
    if (!editor) return

    const href = normalizeUrl(linkUrlInput)
    if (!href) {
      toast.error("Enter a link URL before inserting it.")
      return
    }

    const { from, to, empty } = editor.state.selection
    const selectedText = empty ? "" : editor.state.doc.textBetween(from, to, " ")
    const label = linkTextInput.trim() || selectedText.trim() || href
    const attrs = {
      href,
      target: "_blank",
      rel: "noopener noreferrer",
    }

    if (empty) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: label,
          marks: [{ type: "link", attrs }],
        })
        .run()
    } else if (label !== selectedText.trim() && label.length > 0) {
      editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContent({
          type: "text",
          text: label,
          marks: [{ type: "link", attrs }],
        })
        .run()
    } else {
      editor.chain().focus().extendMarkRange("link").setLink(attrs).run()
    }

    setLinkDialogOpen(false)
  }, [editor, linkTextInput, linkUrlInput])

  const removeLinkFromDialog = useCallback(() => {
    if (!editor) return
    editor.chain().focus().extendMarkRange("link").unsetLink().run()
    setLinkDialogOpen(false)
  }, [editor])

  const applyMathEdit = useCallback(() => {
    if (!mathEdit || !editorRef.current) return
    const ed = editorRef.current
    const { pos, latex, block } = mathEdit
    const safeLatex = sanitizeLatexInput(latex)
    if (pos < 0) {
      // New equation: insert at the current selection.
      if (block) {
        ed.chain().focus().insertBlockMath({ latex: safeLatex }).run()
      } else {
        ed.chain().focus().insertInlineMath({ latex: safeLatex }).run()
      }
    } else {
      const chain = ed.chain().focus().setNodeSelection(pos)
      if (block) {
        chain.updateBlockMath({ latex: safeLatex }).focus().run()
      } else {
        chain.updateInlineMath({ latex: safeLatex }).focus().run()
      }
    }
    setMathEdit(null)
  }, [mathEdit])

  const openImageDialog = useCallback(() => {
    setImageInsertDialogOpen(true)
    setToolbarClusterMenu(null)
  }, [])

  const insertImageFromUrl = useCallback(() => {
    if (!editor) return
    const src = normalizeUrl(imageUrlInput)
    if (!src) {
      toast.error("Enter an image URL before inserting it.")
      return
    }
    // Verify the URL actually resolves to an image before inserting. A common
    // cause of "image URL doesn't work" is pasting a webpage/search-result URL
    // rather than a direct link to the image file — preloading lets us give
    // clear feedback instead of silently inserting a broken image.
    const alt = imageAltInput.trim()
    // Insert immediately so the action always "works" — gating on a preload probe
    // silently dropped valid cross-origin images (CORS images never fire onload
    // on a bare probe in some browsers). We still warn, but never block.
    editor.chain().focus().setImage({ src, alt }).run()
    setImageInsertDialogOpen(false)
    setImageUrlInput("")
    setImageAltInput("")
    const probe = new window.Image()
    probe.onerror = () => {
      toast.error("That image couldn't be loaded — check it's a direct link to an image file (.png, .jpg, .gif, …).")
    }
    probe.src = src
  }, [editor, imageAltInput, imageUrlInput])

  const insertImagesFromFileList = (files: FileList | File[]) => {
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"))
    if (images.length === 0) return
    images.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        const src = reader.result as string
        editor?.chain().focus().setImage({ src, alt: file.name }).run()
      }
      reader.readAsDataURL(file)
    })
    setImageInsertDialogOpen(false)
    setImageUrlInput("")
    setImageAltInput("")
  }

  const openImageUploadPicker = useCallback(() => {
    imageUploadInputRef.current?.click()
  }, [])

  const stopCamera = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop())
    cameraStreamRef.current = null
  }, [])

  const openCameraCapturePicker = useCallback(() => {
    // Prefer a live camera preview via getUserMedia; fall back to the OS file
    // picker with capture hint (e.g. desktops without a usable getUserMedia).
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined
    if (!md || typeof md.getUserMedia !== "function") {
      cameraCaptureInputRef.current?.click()
      return
    }
    setImageInsertDialogOpen(false)
    setCameraError(null)
    setCameraDialogOpen(true)
    md
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        cameraStreamRef.current = stream
        const video = cameraVideoRef.current
        if (video) {
          video.srcObject = stream
          void video.play().catch(() => {})
        }
      })
      .catch((err) => {
        setCameraError(
          err?.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access, or use Upload instead."
            : "No camera is available on this device. Use Upload or Image URL instead.",
        )
      })
  }, [])

  const capturePhotoFromCamera = useCallback(() => {
    const video = cameraVideoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const src = canvas.toDataURL("image/png")
    editor?.chain().focus().setImage({ src, alt: "Photo" }).run()
    stopCamera()
    setCameraDialogOpen(false)
  }, [editor, stopCamera])

  // Always release the camera when the dialog closes (cancel, escape, capture).
  useEffect(() => {
    if (!cameraDialogOpen) stopCamera()
    return () => stopCamera()
  }, [cameraDialogOpen, stopCamera])

  const handleImageUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      insertImagesFromFileList(e.target.files)
    }
    e.target.value = ""
  }

  // All document-style imports (PDF / Word / Markdown / plain text / HTML) go
  // through the shared converter so every editor surface behaves identically.
  const insertImportedFile = async (file: File) => {
    if (!editor) return
    const html = await importFileToEditorHtml(file)
    if (html) editor.chain().focus().insertContent(html).run()
  }

  const insertDocxFromFile = insertImportedFile
  const insertPdfFromFile = insertImportedFile

  const insertSpreadsheetFromFile = async (file: File) => {
    if (!editor) return
    if (!isSpreadsheetFile(file)) return

    const arrayBuffer = await file.arrayBuffer()
    // Dynamic import — xlsx (~1 MB) only loads when the user actually inserts
    // a spreadsheet file, keeping it out of the initial editor bundle.
    const { readSpreadsheetWorkbook, buildSpreadsheetWorkbookSnapshot } =
      await import("@/lib/spreadsheet-workbook")
    const workbook = readSpreadsheetWorkbook(arrayBuffer, file.name)
    const workbookSnapshot = buildSpreadsheetWorkbookSnapshot(file.name, workbook)

    editor
      .chain()
      .focus()
      .insertContent({
        type: "spreadsheetEmbed",
        attrs: {
          fileName: file.name,
          workbookData: encodeSpreadsheetWorkbook(workbookSnapshot),
        },
      })
      .run()
  }

  const insertPlainTextFromFile = insertImportedFile

  // Kept for AI-generated markdown insertion (not file import).
  const insertMarkdownText = useCallback(async (text: string) => {
    if (!editor) return
    const html = await markdownToHtml(text)
    // Copy externally-linked markdown images (![](http…)) into the note.
    const { embedImagesInHtml } = await import("@/lib/embed-import-images")
    const embedded = await embedImagesInHtml(html)
    editor.chain().focus().insertContent(embedded).run()
  }, [editor])

  const insertMarkdownFromFile = insertImportedFile

  const insertHtmlFromFile = insertImportedFile

  const handleFilePicker = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".pdf,.docx,.txt,.md,.markdown,.html,.htm,.xls,.xlsx,.csv"
    input.onchange = async () => {
      const file = input.files?.[0]
      if (file) {
        const lower = file.name.toLowerCase()
        if (lower.endsWith(".pdf")) {
          await insertPdfFromFile(file)
        } else if (lower.endsWith(".docx")) {
          await insertDocxFromFile(file)
        } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv")) {
          await insertSpreadsheetFromFile(file)
        } else if (lower.endsWith(".html") || lower.endsWith(".htm")) {
          await insertHtmlFromFile(file)
        } else if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
          await insertMarkdownFromFile(file)
        } else if (lower.endsWith(".txt")) {
          await insertPlainTextFromFile(file)
        }
      }
    }
    input.click()
  }

  const handleSpreadsheetPicker = useCallback(() => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
    input.onchange = async () => {
      const file = input.files?.[0]
      if (file) {
        await insertSpreadsheetFromFile(file)
      }
    }
    input.click()
  }, [editor])

  if (!editor) {
    return null
  }

  const removeTable = () => {
    const selTable = getSelectedTable()
    if (!selTable) {
      setToolbarClusterMenu((p) => (p === "table" ? null : p))
      return
    }
    const { pos, node } = selTable
    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .run()
    setToolbarClusterMenu((p) => (p === "table" ? null : p))
  }

  const updateAlignmentInSelection = (
    types: string[],
    updater: (attrs: Record<string, any>) => Record<string, any>
  ) => {
    const { state, view } = editor
    const { tr, selection } = state
    const { from, to } = selection
    let changed = false

    if (selection.empty) {
      const { $from } = selection
      for (let depth = $from.depth; depth >= 0; depth--) {
        const node = $from.node(depth)
        if (!types.includes(node.type.name)) continue

        const pos = depth === 0 ? 0 : $from.before(depth)
        tr.setNodeMarkup(pos, undefined, updater(node.attrs))
        changed = true
        break
      }
    } else {
      tr.doc.nodesBetween(from, to, (node: any, pos: number) => {
        if (types.includes(node.type.name)) {
          tr.setNodeMarkup(pos, undefined, updater(node.attrs))
          changed = true
        }
      })
    }

    if (changed) {
      view.dispatch(tr)
    }

    return changed
  }

  const applyTextAlign = (alignment: "left" | "center" | "right" | "justify") => {
    editor.chain().focus().run()
    if (editor.isActive("image")) {
      const imageAlign =
        alignment === "justify" || alignment === "left"
          ? "left"
          : alignment === "right"
            ? "right"
            : "center"
      editor.commands.setImageAlign(imageAlign)
      return
    }
    updateAlignmentInSelection(
      ["paragraph", "heading", "tableCell", "tableHeader"],
      (attrs) => ({ ...attrs, textAlign: alignment })
    )
  }

  const applyVerticalAlign = (alignment: "top" | "middle" | "bottom") => {
    editor.chain().focus().run()
    updateAlignmentInSelection(
      ["tableCell", "tableHeader"],
      (attrs) => ({ ...attrs, verticalAlign: alignment })
    )
  }

  const currentTextAlign = editor.isActive("image")
    ? (editor.getAttributes("image").align as string) || "center"
    : editor.getAttributes("paragraph").textAlign ||
      editor.getAttributes("heading").textAlign ||
      editor.getAttributes("tableCell").textAlign ||
      editor.getAttributes("tableHeader").textAlign ||
      "left"

  const currentVerticalAlign =
    editor.getAttributes("tableCell").verticalAlign ||
    editor.getAttributes("tableHeader").verticalAlign ||
    "top"

  const inTable = editor.isActive("table")
  // Word-style ribbon tabs. "table" is contextual — only present inside a table.
  const ribbonTabs: { id: RibbonTab; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "insert", label: "Insert" },
    { id: "layout", label: "Layout" },
    ...(inTable ? [{ id: "table" as const, label: "Table" }] : []),
  ]
  const effectiveRibbonTab: RibbonTab = ribbonTabs.some((t) => t.id === ribbonTab) ? ribbonTab : "home"
  const renderRibbonTabs = () => (
    <div
      role="tablist"
      aria-label="Editor tools"
      className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/50 p-0.5"
    >
      {ribbonTabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={effectiveRibbonTab === t.id}
          onClick={() => setRibbonTab(t.id)}
          className={cn(
            "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
            effectiveRibbonTab === t.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
  const currentParagraphStyle = editor.isActive("heading", { level: 1 })
    ? "Heading 1"
    : editor.isActive("heading", { level: 2 })
      ? "Heading 2"
      : editor.isActive("heading", { level: 3 })
        ? "Heading 3"
        : "Paragraph"
  const currentParagraphValue = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
      ? "h2"
      : editor.isActive("heading", { level: 3 })
        ? "h3"
        : "p"

  const currentFontFamily =
    editor.getAttributes("textStyle").fontFamily || DEFAULT_TEXT_STYLE_FONT_STACK
  const currentFontFamilyLabel = (() => {
    const font = editor.getAttributes("textStyle").fontFamily
    if (!font) return DEFAULT_TEXT_STYLE_FONT_LABEL
    return fontLabelForAttr(font) ?? font.split(",")[0].replace(/['"]/g, "").trim()
  })()
  const isMacShortcuts = isMacLikePlatform()
  const shortcutText = {
    text: formatToolbarShortcutLabel(isMacShortcuts, "t"),
    font: formatToolbarShortcutLabel(isMacShortcuts, "f"),
    size: formatToolbarShortcutLabel(isMacShortcuts, "s"),
    color: formatToolbarShortcutLabel(isMacShortcuts, "c"),
    bold: formatToolbarShortcutLabel(isMacShortcuts, "b"),
    italic: formatToolbarShortcutLabel(isMacShortcuts, "i"),
    underline: formatToolbarShortcutLabel(isMacShortcuts, "u"),
    insert: formatToolbarShortcutLabel(isMacShortcuts, "n"),
    lists: formatToolbarShortcutLabel(isMacShortcuts, "l"),
    align: formatToolbarShortcutLabel(isMacShortcuts, "a"),
    table: formatToolbarShortcutLabel(isMacShortcuts, "m"),
    sigma: formatToolbarShortcutLabel(isMacShortcuts, "e"),
  }

  const renderToolbarDockChildren = () => {
    const dockPopperOpts = {
      container: editorPopoverBoundaryEl ?? undefined,
      collisionBoundary: editorPopoverBoundaryEl ?? undefined,
      collisionPadding: 12,
      side: "bottom" as const,
      align: "end" as const,
    }
    // Ribbon grouping: render a cluster only when its tab is active. `contents`
    // keeps the buttons as direct flex items of the rail (identical layout);
    // `hidden` removes the whole run when its tab isn't selected.
    const rg = (...tabs: RibbonTab[]) => (tabs.includes(effectiveRibbonTab) ? "contents" : "hidden")
    return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-w-0 flex-nowrap items-center gap-x-0.5 [&>*]:shrink-0">
      {/* ── Home run: undo/redo · text & font · bold/italic/underline ── */}
      <span className={rg("home")}>
      {/* Undo/Redo */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="h-8 w-8 rounded-lg p-0 shrink-0"
          >
            <Undo className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Undo</TooltipContent>
      </Tooltip>
    
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="h-8 w-8 rounded-lg p-0 shrink-0"
          >
            <Redo className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Redo</TooltipContent>
      </Tooltip>
    
      {/* Text — paragraph, font, size, color (single menu) */}
      <DropdownMenu modal={false} open={toolbarClusterMenu === "text"} onOpenChange={handleToolbarClusterChange("text")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                data-toolbar-trigger="text"
                variant="ghost"
                size="sm"
                className="inline-flex h-8 max-w-[9rem] shrink-0 gap-1.5 rounded-lg px-2.5 sm:max-w-[11rem]"
              >
                <Type className="h-4 w-4 shrink-0" />
                <span className="text-xs truncate hidden sm:inline" style={{ fontFamily: currentFontFamily }}>
                  {currentFontFamilyLabel}
                </span>
                <span className="text-xs truncate sm:hidden max-w-[3rem]">{currentParagraphStyle}</span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{`Text & font ${shortcutText.text}`}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          {...dockPopperOpts}
          className="z-[200] w-[min(16rem,calc(100vw-2rem))] max-h-[min(76vh,34rem)] overflow-hidden rounded-xl border-border/80 p-0 shadow-lg overscroll-y-contain [scrollbar-width:thin]"
          style={{
            maxHeight: "min(76vh, 34rem, var(--radix-popper-available-height, 100dvh))",
          }}
          onWheel={(e) => e.stopPropagation()}
        >
          <div ref={textMenuLayoutRef} className="flex max-h-[inherit] min-h-0 flex-col overflow-y-auto px-2 py-2 [scrollbar-width:thin]">
            <div className="space-y-1.5 rounded-lg px-1 py-1">
              <DropdownMenuLabel className="px-1 py-0 text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Paragraph
              </DropdownMenuLabel>
              <div className="px-1" onPointerDown={(e) => e.stopPropagation()}>
                <Select
                  value={currentParagraphValue}
                  onValueChange={(value) => {
                    if (value === "h1") editor.chain().focus().toggleHeading({ level: 1 }).run()
                    else if (value === "h2") editor.chain().focus().toggleHeading({ level: 2 }).run()
                    else if (value === "h3") editor.chain().focus().toggleHeading({ level: 3 }).run()
                    else editor.chain().focus().setParagraph().run()
                  }}
                >
                  <SelectTrigger size="sm" className="h-8 w-full rounded-lg text-xs">
                    <SelectValue placeholder="Select paragraph style" />
                  </SelectTrigger>
                  <SelectContent className="z-[240]">
                    <SelectItem value="p">Paragraph</SelectItem>
                    <SelectItem value="h1">Heading 1</SelectItem>
                    <SelectItem value="h2">Heading 2</SelectItem>
                    <SelectItem value="h3">Heading 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DropdownMenuSeparator className="my-1" />
            <div data-toolbar-focus="font-family" className="space-y-1.5 rounded-lg px-1 py-1">
              <DropdownMenuLabel className="px-1 py-0 text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Font
              </DropdownMenuLabel>
              <div className="px-1" onPointerDown={(e) => e.stopPropagation()}>
                <Select
                  value={currentFontFamily || "__default__"}
                  onValueChange={(value) => {
                    if (value === "__default__") editor.chain().focus().unsetFontFamily().run()
                    else editor.chain().focus().setFontFamily(value).run()
                  }}
                >
                  <SelectTrigger size="sm" className="h-8 w-full rounded-lg text-xs">
                    <SelectValue placeholder="Select font family" />
                  </SelectTrigger>
                  <SelectContent className="z-[240]" viewportClassName="max-h-72">
                    {ALL_FONT_MENU_VARIANTS.map(({ label, value }) => (
                      <SelectItem key={value || "__default__"} value={value || "__default__"}>
                        <span style={value ? { fontFamily: value } : undefined}>{label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DropdownMenuSeparator className="my-1" />
            <div data-toolbar-focus="font-size" className="space-y-1.5 rounded-lg px-1 py-1">
              <DropdownMenuLabel className="px-1 py-0 text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Size
              </DropdownMenuLabel>
              <div className="px-1">
                <div className="flex items-center overflow-hidden rounded-lg border border-border bg-background" onPointerDown={(e) => e.stopPropagation()}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 rounded-none border-r border-border p-0"
                    onClick={() => {
                      const cur = parseInt(textMenuFontSizeInput, 10)
                      const base = Number.isNaN(cur)
                        ? clampChannel(parseInt(String(editor.getAttributes("textStyle").fontSize || "16").replace(/px/gi, ""), 10) || 16, 8, 96)
                        : cur
                      applyTextMenuFontSizePx(base - 1)
                    }}
                  >
                    <span className="text-sm font-medium">-</span>
                  </Button>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={textMenuFontSizeInput}
                    onChange={(e) => setTextMenuFontSizeInput(e.target.value.replace(/[^\d]/g, ""))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        const v = parseInt(textMenuFontSizeInput, 10)
                        if (!Number.isNaN(v)) applyTextMenuFontSizePx(v)
                        else {
                          const raw = editor.getAttributes("textStyle").fontSize as string | undefined
                          const n = clampChannel(parseInt(String(raw || "16").replace(/px/gi, ""), 10) || 16, 8, 96)
                          setTextMenuFontSizeInput(String(n))
                        }
                      }
                    }}
                    onBlur={() => {
                      const v = parseInt(textMenuFontSizeInput, 10)
                      if (!Number.isNaN(v)) applyTextMenuFontSizePx(v)
                      else {
                        const raw = editor.getAttributes("textStyle").fontSize as string | undefined
                        const n = clampChannel(parseInt(String(raw || "16").replace(/px/gi, ""), 10) || 16, 8, 96)
                        setTextMenuFontSizeInput(String(n))
                      }
                    }}
                    className="h-8 min-w-0 flex-1 rounded-none border-0 bg-transparent px-1 py-0 text-center text-xs tabular-nums shadow-none focus-visible:z-[1] focus-visible:ring-0 focus-visible:ring-offset-0"
                    aria-label="Font size in pixels (8-96)"
                  />
                  <div className="flex h-8 items-center border-l border-border px-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                    px
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 rounded-none border-l border-border p-0"
                    onClick={() => {
                      const cur = parseInt(textMenuFontSizeInput, 10)
                      const base = Number.isNaN(cur)
                        ? clampChannel(parseInt(String(editor.getAttributes("textStyle").fontSize || "16").replace(/px/gi, ""), 10) || 16, 8, 96)
                        : cur
                      applyTextMenuFontSizePx(base + 1)
                    }}
                  >
                    <span className="text-sm font-medium">+</span>
                  </Button>
                </div>
              </div>
            </div>
            <DropdownMenuSeparator className="my-1" />
            <div data-toolbar-focus="text-color" className="space-y-2 rounded-lg px-1 py-1">
              <DropdownMenuLabel className="px-1 py-0 text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Color
              </DropdownMenuLabel>
              <div className="flex items-center gap-2 px-1">
                <span className="h-4 w-4 rounded-sm border border-foreground/30" style={{ backgroundColor: textMenuBaseColor }} aria-hidden />
                <span className="text-xs font-medium tabular-nums text-foreground">{textMenuBaseColor.toUpperCase()}</span>
              </div>
              <div className="grid grid-cols-4 gap-1 px-1">
                {["#111827", "#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#8e24aa", "#ffffff"].map((color) => (
                  <button
                    type="button"
                    key={color}
                    onClick={() => {
                      setTextMenuBaseColor(normalizeHex(color))
                      editor.chain().focus().setColor(color).run()
                    }}
                    className="h-7 w-full rounded-md border border-border/70 transition-transform duration-150 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{ backgroundColor: color }}
                    aria-label={`Set color ${color}`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 px-1" onPointerDown={(e) => e.stopPropagation()}>
                <label className="relative h-8 w-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border">
                  <input
                    type="color"
                    value={textMenuBaseColor}
                    onChange={(e) => {
                      const v = normalizeHex(e.target.value)
                      setTextMenuBaseColor(v)
                      editor.chain().focus().setColor(v).run()
                    }}
                    className="absolute -left-1/2 -top-1/2 h-[200%] w-[200%] cursor-pointer border-0 p-0"
                    aria-label="Open full color spectrum"
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 justify-center gap-1 rounded-lg px-2 text-xs"
                  onClick={() => void pickTextColorFromScreen()}
                  title="Pick a color from anywhere on screen"
                >
                  <Pipette className="h-3.5 w-3.5" />
                  Pipette
                </Button>
              </div>
              <DropdownMenuItem onClick={() => editor.chain().focus().unsetColor().run()} className="mx-1 rounded-lg">
                Clear color
              </DropdownMenuItem>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="mx-px h-5 shrink-0" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn("h-8 w-8 rounded-lg p-0 shrink-0", editor.isActive("bold") && "bg-accent")}
          >
            <Bold className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{`Bold ${shortcutText.bold}`}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn("h-8 w-8 rounded-lg p-0 shrink-0", editor.isActive("italic") && "bg-accent")}
          >
            <Italic className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{`Italic ${shortcutText.italic}`}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={cn("h-8 w-8 rounded-lg p-0 shrink-0", editor.isActive("underline") && "bg-accent")}
          >
            <UnderlineIcon className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{`Underline ${shortcutText.underline}`}</TooltipContent>
      </Tooltip>
      </span>

      {/* ── Insert run: insert menu ── */}
      <span className={rg("insert")}>
      <DropdownMenu modal={false} open={toolbarClusterMenu === "insert"} onOpenChange={handleToolbarClusterChange("insert")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button data-toolbar-trigger="insert" variant="ghost" size="sm" className="h-8 w-8 rounded-lg p-0 shrink-0">
                <Plus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{`Insert ${shortcutText.insert}`}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent {...dockPopperOpts} className="z-[200] w-48">
          <DropdownMenuItem onClick={openLinkDialog}>
            <Link2 className="mr-2 h-4 w-4" />
            Link…
            <DropdownMenuShortcut>{shortcutText.insert}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Arrows</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => insertArrowSymbol("→")}>
            <ArrowRight className="mr-2 h-4 w-4" />
            Right arrow
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => insertArrowSymbol("⇌")}>
            <ArrowRight className="mr-2 h-4 w-4" />
            Equilibrium arrow
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => insertArrowSymbol("⇒")}>
            <ArrowRight className="mr-2 h-4 w-4" />
            Double arrow
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!editor.state.selection.empty) {
                setIsCommenting(true)
                editor.chain().focus().run()
              } else {
                setCommentsSidebarOpen(!commentsSidebarOpen)
              }
            }}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Comments
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleFilePicker}>
            <FileInput className="mr-2 h-4 w-4" />
            Import file…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </span>

      {/* ── Home run: lists & indent ── */}
      <span className={rg("home")}>
      <DropdownMenu modal={false} open={toolbarClusterMenu === "lists"} onOpenChange={handleToolbarClusterChange("lists")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                data-toolbar-trigger="lists"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 w-8 rounded-lg p-0 shrink-0",
                  (editor.isActive("taskList") || editor.isActive("bulletList") || editor.isActive("orderedList")) &&
                    "bg-accent",
                )}
              >
                <List className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{`Lists & indent ${shortcutText.lists}`}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent {...dockPopperOpts} className="z-[200] w-48">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Task</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            className={cn(editor.isActive("taskList") && "bg-accent")}
          >
            <ListChecks className="mr-2 h-4 w-4" />
            Checklist
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Bullets &amp; numbering</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn(editor.isActive("bulletList") && "bg-accent")}
          >
            <List className="mr-2 h-4 w-4" />
            Bullet list
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={cn(editor.isActive("orderedList") && "bg-accent")}
          >
            <ListOrdered className="mr-2 h-4 w-4" />
            Numbered list
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Indent</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => (editor.chain().focus() as any).unsetIndent().run()}>
            <IndentDecrease className="mr-2 h-4 w-4" />
            Decrease indent
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => (editor.chain().focus() as any).setIndent().run()}>
            <IndentIncrease className="mr-2 h-4 w-4" />
            Increase indent
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </span>

      {/* ── Insert run: image · spreadsheet · dictation ── */}
      <span className={rg("insert")}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={openImageDialog}
            className="h-8 w-8 rounded-lg p-0 shrink-0"
          >
            <ImagePlus className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Insert image</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleSpreadsheetPicker()}
            className="h-8 w-8 rounded-lg p-0 shrink-0"
          >
            <Sheet className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Insert spreadsheet</TooltipContent>
      </Tooltip>

      <div className="inline-flex shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={isListening ? stopSpeechToText : startSpeechToText}
              className={cn("h-8 w-8 rounded-lg p-0 shrink-0", isListening && "bg-accent text-red-500")}
            >
              <Mic className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isListening ? "Stop dictation" : "Start dictation"}</TooltipContent>
        </Tooltip>
        {isListening && <VoiceWaveform getWaveformData={getWaveformData} />}
      </div>
      </span>

      {/* ── Home run: alignment ── */}
      <span className={rg("home")}>
      <DropdownMenu modal={false} open={toolbarClusterMenu === "align"} onOpenChange={handleToolbarClusterChange("align")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button data-toolbar-trigger="align" variant="ghost" size="sm" className="h-8 w-8 rounded-lg p-0 shrink-0">
                {currentTextAlign === "center" ? (
                  <AlignCenter className="h-4 w-4" />
                ) : currentTextAlign === "right" ? (
                  <AlignRight className="h-4 w-4" />
                ) : currentTextAlign === "justify" ? (
                  <AlignJustify className="h-4 w-4" />
                ) : (
                  <AlignLeft className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{`Alignment ${shortcutText.align}`}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent {...dockPopperOpts} className="z-[200] w-48">
          <DropdownMenuLabel>Text alignment</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => applyTextAlign("left")}
            className={cn(currentTextAlign === "left" && "bg-accent")}
          >
            <AlignLeft className="mr-2 h-4 w-4" />
            Left
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => applyTextAlign("center")}
            className={cn(currentTextAlign === "center" && "bg-accent")}
          >
            <AlignCenter className="mr-2 h-4 w-4" />
            Center
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => applyTextAlign("right")}
            className={cn(currentTextAlign === "right" && "bg-accent")}
          >
            <AlignRight className="mr-2 h-4 w-4" />
            Right
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => applyTextAlign("justify")}
            className={cn(currentTextAlign === "justify" && "bg-accent")}
          >
            <AlignJustify className="mr-2 h-4 w-4" />
            Justify
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Cell vertical alignment</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!inTable}
            onClick={() => applyVerticalAlign("top")}
            className={cn(currentVerticalAlign === "top" && "bg-accent")}
          >
            Top
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!inTable}
            onClick={() => applyVerticalAlign("middle")}
            className={cn(currentVerticalAlign === "middle" && "bg-accent")}
          >
            Middle
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!inTable}
            onClick={() => applyVerticalAlign("bottom")}
            className={cn(currentVerticalAlign === "bottom" && "bg-accent")}
          >
            Bottom
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </span>

      {/* ── Insert run: table · equations & chemistry · calculator · citations ── */}
      <span className={rg("insert")}>
      <Separator orientation="vertical" className="mx-px h-5 shrink-0" />

      <DropdownMenu
        modal={false}
        open={toolbarClusterMenu === "table"}
        onOpenChange={(open) => {
          handleToolbarClusterChange("table")(open)
          if (open) {
            const selTable = getSelectedTable()
            const currentRows = selTable ? selTable.node.childCount : 3
            const currentCols = selTable ? selTable.node.child(0)?.childCount || 3 : 3
            setTableRows(currentRows)
            setTableCols(currentCols)
          }
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button data-toolbar-trigger="table" variant="ghost" size="sm" className="h-8 w-8 rounded-lg p-0 shrink-0">
                <TableIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{`Insert / resize table ${shortcutText.table}`}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent {...dockPopperOpts} className="z-[200] w-48">
          <DropdownMenuLabel className="text-xs">Rows &amp; columns</DropdownMenuLabel>
          <div className="grid grid-cols-2 gap-2 px-2 py-2">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Rows</span>
              <Input
                type="number"
                min={1}
                value={tableRows}
                onChange={(e) => setTableRows(Math.max(parseInt(e.target.value || "1", 10), 1))}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Columns</span>
              <Input
                type="number"
                min={1}
                value={tableCols}
                onChange={(e) => setTableCols(Math.max(parseInt(e.target.value || "1", 10), 1))}
                className="h-8"
              />
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleTable} className="justify-center font-medium">
            Apply
          </DropdownMenuItem>
          <DropdownMenuItem onClick={removeTable} className="justify-center text-destructive">
            Delete table
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="mx-px h-5 shrink-0" />

      <DropdownMenu modal={false} open={toolbarClusterMenu === "sigma"} onOpenChange={handleToolbarClusterChange("sigma")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button data-toolbar-trigger="sigma" variant="ghost" size="sm" className="h-8 w-8 rounded-lg p-0 shrink-0">
                <Sigma className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{`Chemistry & equations ${shortcutText.sigma}`}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent {...dockPopperOpts} className="z-[200] w-56">
          <DropdownMenuItem
            onClick={() => {
              const { from, to } = editor.state.selection
              const selectedText = editor.state.doc.textBetween(from, to, " ")
              if (!selectedText.trim()) {
                // No selection — let the user type a formula (e.g. H2O, CO2, Ca(OH)2).
                setChemInput("")
                setChemDialogOpen(true)
                return
              }
              const formatted = formatChemicalFormula(selectedText)
              editor.chain().focus().deleteRange({ from, to }).insertContent(formatted).run()
            }}
          >
            <FlaskConical className="mr-2 h-4 w-4" />
            Chemical formula
          </DropdownMenuItem>
          {enableMath && (
            <>
              <DropdownMenuItem
                onClick={() => {
                  const { from, to } = editor.state.selection
                  const selectedText = from !== to ? editor.state.doc.textBetween(from, to, " ") : ""
                  if (from !== to) editor.chain().focus().deleteRange({ from, to }).run()
                  // Open the equation editor (live preview) instead of inserting blindly.
                  setMathEdit({ pos: -1, latex: selectedText, block: false })
                }}
              >
                <Sigma className="mr-2 h-4 w-4" />
                Inline equation ($…$)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const { from, to } = editor.state.selection
                  const selectedText = from !== to ? editor.state.doc.textBetween(from, to, " ") : ""
                  if (from !== to) editor.chain().focus().deleteRange({ from, to }).run()
                  setMathEdit({ pos: -1, latex: selectedText, block: true })
                }}
              >
                <Sigma className="mr-2 h-4 w-4" />
                Equation block ($$…$$)
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Scientific symbols</DropdownMenuLabel>
          <div className="space-y-1 px-2 py-2">
            {SCIENTIFIC_SYMBOL_GROUPS.map((group, groupIndex) => (
              <div key={`symbol-group-${groupIndex}`} className="grid grid-cols-6 gap-1">
                {group.map((symbol) => (
                  <button
                    key={symbol.id}
                    type="button"
                    onClick={() => insertScientificSymbol(symbol.value)}
                    className="flex h-8 items-center justify-center rounded-md border border-border/70 bg-background text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                    title={symbol.label}
                  >
                    {symbol.value}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {onOpenScientificCalculator && (
        <>
          <Separator orientation="vertical" className="mx-px h-5 shrink-0" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-tour="editor-calculator"
                className="h-8 w-8 shrink-0 rounded-lg p-0"
                onClick={onOpenScientificCalculator}
                aria-label="Scientific calculator"
              >
                <Calculator className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Scientific calculator (molarity, dilution, …)</TooltipContent>
          </Tooltip>
        </>
      )}

      {showAITools && (
        <>
          <Separator orientation="vertical" className="mx-px h-5 shrink-0" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" data-tour="editor-cite" className="h-8 gap-1 rounded-lg px-2 shrink-0" onClick={aiCite} disabled={isCiteProcessing}>
                {isCiteProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Quote className="h-4 w-4" />}
                <span className="text-xs hidden sm:inline">Cite</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Cite with AI</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <select
                value={citationStyleChosen ? selectedCitationStyle : ""}
                onChange={(e) => {
                  const value = e.target.value
                  if (!value) return
                  applyCitationStyleChange(value)
                }}
                className="h-8 px-2 rounded-lg border border-border bg-background text-xs cursor-pointer shrink-0 max-w-[120px]"
                title="Citation style"
              >
                {!citationStyleChosen && (
                  <option value="" disabled>
                    Citation style…
                  </option>
                )}
                {CITATION_STYLE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </TooltipTrigger>
            <TooltipContent>Citation style — affects inline citations &amp; bibliography</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" data-tour="editor-bibliography" className="h-8 gap-1 rounded-lg px-2 shrink-0" onClick={handleGenerateBibliography} disabled={isCiteProcessing}>
                <BookOpen className="h-4 w-4" />
                <span className="text-xs hidden sm:inline">Bibliography</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Generate bibliography</TooltipContent>
          </Tooltip>
        </>
      )}
      </span>

      {/* ── Table run: contextual table tools (only while the cursor is in a table) ── */}
      <span className={rg("table")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().addRowAfter().run()} className="h-8 gap-1 rounded-lg px-2 shrink-0">
              <Rows className="h-4 w-4" />
              <span className="text-xs hidden sm:inline">Row</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add row below</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().addColumnAfter().run()} className="h-8 gap-1 rounded-lg px-2 shrink-0">
              <Columns className="h-4 w-4" />
              <span className="text-xs hidden sm:inline">Column</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add column right</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleHeaderRow().run()} className="h-8 w-8 rounded-lg p-0 shrink-0">
              <TableIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle header row</TooltipContent>
        </Tooltip>
        <Separator orientation="vertical" className="mx-px h-5 shrink-0" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={() => moveTopLevelBlock(editor, -1)} className="h-8 w-8 rounded-lg p-0 shrink-0">
              <ArrowUp className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Move table up</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={() => moveTopLevelBlock(editor, 1)} className="h-8 w-8 rounded-lg p-0 shrink-0">
              <ArrowDown className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Move table down</TooltipContent>
        </Tooltip>
        <Separator orientation="vertical" className="mx-px h-5 shrink-0" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().deleteRow().run()} className="h-8 w-8 rounded-lg p-0 shrink-0 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete row</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={removeTable} className="h-8 gap-1 rounded-lg px-2 shrink-0 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
              <span className="text-xs hidden sm:inline">Table</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete table</TooltipContent>
        </Tooltip>
      </span>

      {/* ── Layout run: line spacing · columns · page break ── */}
      <span className={rg("layout")}>
        <DropdownMenu modal={false}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-lg px-2 shrink-0">
                  <MoveVertical className="h-4 w-4" />
                  <span className="text-xs hidden sm:inline">Spacing</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Line spacing</TooltipContent>
          </Tooltip>
          <DropdownMenuContent {...dockPopperOpts} className="z-[200] w-44">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Line spacing</DropdownMenuLabel>
            {["1", "1.15", "1.5", "2", "2.5"].map((v) => (
              <DropdownMenuItem key={v} onClick={() => (editor.chain().focus() as any).setLineHeight(v).run()}>
                {v === "1" ? "Single" : v === "1.5" ? "1.5 lines" : v === "2" ? "Double" : `${v}×`}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => (editor.chain().focus() as any).unsetLineHeight().run()}>
              Reset spacing
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu modal={false}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-lg px-2 shrink-0">
                  <Columns className="h-4 w-4" />
                  <span className="text-xs hidden sm:inline">Columns</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Text columns</TooltipContent>
          </Tooltip>
          <DropdownMenuContent {...dockPopperOpts} className="z-[200] w-44">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Columns</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => (editor.chain().focus() as any).unsetColumns().run()}>One (single)</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const e = editor as any
                if (editor.isActive("columns")) e.chain().focus().setColumnCount(2).run()
                else e.chain().focus().setColumns(2).run()
              }}
            >
              Two columns
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const e = editor as any
                if (editor.isActive("columns")) e.chain().focus().setColumnCount(3).run()
                else e.chain().focus().setColumns(3).run()
              }}
            >
              Three columns
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={() => (editor.chain().focus() as any).setPageBreak().run()} className="h-8 gap-1 rounded-lg px-2 shrink-0">
              <SeparatorHorizontal className="h-4 w-4" />
              <span className="text-xs hidden sm:inline">Page break</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Insert page break</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-px h-5 shrink-0" />

        <DropdownMenu modal={false}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-lg px-2 shrink-0">
                  <FileText className="h-4 w-4" />
                  <span className="text-xs hidden sm:inline">Header / Footer</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Header &amp; footer</TooltipContent>
          </Tooltip>
          <DropdownMenuContent {...dockPopperOpts} className="z-[200] w-48">
            <DropdownMenuItem onClick={() => (editor.chain().focus() as any).toggleDocHeader().run()}>
              Toggle header
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => (editor.chain().focus() as any).toggleDocFooter().run()}>
              Toggle footer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu modal={false}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-lg px-2 shrink-0">
                  <FileText className="h-4 w-4" />
                  <span className="text-xs hidden sm:inline">Page</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Page setup (print / PDF)</TooltipContent>
          </Tooltip>
          <DropdownMenuContent {...dockPopperOpts} className="z-[200] w-52">
            <DropdownMenuItem onClick={() => setPageSetup((p) => ({ ...p, pageView: !p.pageView }))}>
              <FileText className="mr-2 h-4 w-4" />
              Page view {pageSetup.pageView ? "✓" : ""}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Orientation</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setPageSetup((p) => ({ ...p, orientation: "portrait" }))}>
              Portrait {pageSetup.orientation === "portrait" ? "✓" : ""}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPageSetup((p) => ({ ...p, orientation: "landscape" }))}>
              Landscape {pageSetup.orientation === "landscape" ? "✓" : ""}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Margins</DropdownMenuLabel>
            {(
              [
                { key: "narrow", px: 48 },
                { key: "normal", px: 96 },
                { key: "wide", px: 144 },
              ] as const
            ).map((m) => (
              <DropdownMenuItem
                key={m.key}
                onClick={() =>
                  setPageSetup((p) => ({ ...p, margins: { top: m.px, right: m.px, bottom: m.px, left: m.px } }))
                }
              >
                <span className="capitalize">{m.key}</span>{" "}
                {pageSetup.margins.left === m.px && pageSetup.margins.right === m.px ? "✓" : ""}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <p className="px-2 py-1 text-2xs text-muted-foreground">
              Tip: in Page view, drag the ruler markers to fine-tune margins.
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
      </div>
    </TooltipProvider>
    )
  }

  const citationStoreValue = { state: citationState, dispatch: citationDispatch }

  /** When fullscreen targets only the editor shell, the page-level title is covered — surface `title` here. */
  const fullscreenTitleRaw = String(title ?? "")
  const fullscreenTitleDisplay = fullscreenTitleRaw.trim() || "Untitled"
  const fullscreenTitleEditable = Boolean(onDocumentTitleChange) && editable
  const showFullscreenDocTitleInToolbar =
    editorRegionFullscreen &&
    fullscreenWorkspaceRef == null &&
    (fullscreenTitleEditable || fullscreenTitleRaw.trim().length > 0)

  /** Title / notes / protocol actions merged into toolbar row — needs extra layout on small screens. */
  const toolbarMergedLayout =
    leadingToolbarSlot != null ||
    trailingToolbarSlot != null ||
    showFullscreenDocTitleInToolbar

  const renderFullscreenDocumentTitle = (variant: "toolbar" | "floated") => {
    const wrapClass =
      variant === "toolbar"
        ? "min-w-0 max-w-[min(10rem,52vw)] shrink sm:max-w-[min(18rem,36vw)]"
        : "pointer-events-auto absolute left-2 top-2 z-20 max-w-[calc(100%-6rem)] min-w-0 rounded-md border border-border/60 bg-background/95 px-2 py-0.5 shadow-sm backdrop-blur-sm"

    const endTitleEdit = () => {
      setFullscreenDocTitleEditing(false)
      void onDocumentTitleCommit?.()
    }

    const inner = !fullscreenTitleEditable ? (
      <span
        className={cn(
          "truncate text-base font-semibold leading-none text-foreground",
          variant === "floated" && "block",
        )}
        title={fullscreenTitleDisplay}
      >
        {fullscreenTitleDisplay}
      </span>
    ) : fullscreenDocTitleEditing ? (
      <input
        ref={fullscreenDocTitleInputRef}
        type="text"
        value={fullscreenTitleRaw}
        onChange={(e) => onDocumentTitleChange?.(e.target.value)}
        onBlur={endTitleEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            fullscreenDocTitleInputRef.current?.blur()
          }
          if (e.key === "Escape") {
            setFullscreenDocTitleEditing(false)
            fullscreenDocTitleInputRef.current?.blur()
          }
        }}
        className="w-full min-w-0 bg-transparent text-base font-semibold leading-none text-foreground outline-none border-b border-transparent pb-0.5 focus:border-primary"
        aria-label="Edit document title"
      />
    ) : (
      <div
        className={cn(
          "truncate rounded px-0.5 -mx-0.5 cursor-pointer hover:bg-muted/60 hover:text-foreground",
          variant === "floated" && "px-1 -mx-1",
        )}
        onClick={() => setFullscreenDocTitleEditing(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setFullscreenDocTitleEditing(true)
          }
        }}
        aria-label="Click to edit document title"
      >
        <span className="text-base font-semibold leading-none text-foreground truncate">
          {fullscreenTitleDisplay}
        </span>
      </div>
    )

    return <div className={wrapClass}>{inner}</div>
  }

  return (
    <CitationContext.Provider value={citationStoreValue}>
    <>
      <div
        ref={editorShellRef}
        className={cn(
          "border border-border rounded-lg bg-background flex min-h-0 flex-col h-full w-full max-w-full overflow-hidden",
          hideToolbar && "relative",
          editorRegionFullscreen && !fullscreenWorkspaceRef && "rounded-xl border-border bg-background shadow-lg",
          panelEmbed && !editorRegionFullscreen && "rounded-t-none border-t-0",
          className,
        )}
        {...(paperMode ? { "data-paper-mode": "" } : {})}
      >
        {!hideToolbar && editor && (
          <div
            ref={toolbarPositionContainerRef}
            data-tour="editor-toolbar"
            className={cn(
              "shrink-0 border-b border-border/70 bg-background/95 backdrop-blur-sm",
              "flex flex-col gap-1.5 px-2 py-1.5 sm:pl-3",
              panelEmbed && "gap-1 py-1.5",
            )}
          >
            {/* Row 1 (merged surfaces only): document title + actions on their own full-width line */}
            {toolbarMergedLayout && (
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-0.5 sm:gap-1">
                  {leadingToolbarSlot}
                  {showFullscreenDocTitleInToolbar && renderFullscreenDocumentTitle("toolbar")}
                </div>
                <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 touch-manipulation text-muted-foreground hover:text-foreground"
                    onClick={() => setEditorRegionFullscreen((v) => !v)}
                    aria-label={editorRegionFullscreen ? "Exit fullscreen" : "Fullscreen editor"}
                    title={editorRegionFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen editor"}
                  >
                    {editorRegionFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                  </Button>
                  {trailingToolbarSlot ? (
                    <div className="flex min-w-0 items-center justify-end gap-0.5 sm:gap-1">
                      {trailingToolbarSlot}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
            {/* Row 2: ribbon tabs + the active tab's tools (one stretchable row, no name eating the space) */}
            <div className="flex min-w-0 items-center gap-2">
              {renderRibbonTabs()}
              <Separator orientation="vertical" className="h-5 shrink-0" />
              <div
                ref={toolbarRailRef}
                className={cn(
                  "flex min-h-0 min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:thin] touch-pan-x",
                  panelEmbed && "sm:h-full",
                )}
              >
                {renderToolbarDockChildren()}
              </div>
              {!toolbarMergedLayout && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 touch-manipulation text-muted-foreground hover:text-foreground"
                  onClick={() => setEditorRegionFullscreen((v) => !v)}
                  aria-label={editorRegionFullscreen ? "Exit fullscreen" : "Fullscreen editor"}
                  title={editorRegionFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen editor"}
                >
                  {editorRegionFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
        )}
        {hideToolbar && (
          <>
            {showFullscreenDocTitleInToolbar && renderFullscreenDocumentTitle("floated")}
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute z-20 h-8 w-8 border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:text-foreground max-sm:right-[max(0.5rem,env(safe-area-inset-right,0px))] max-sm:top-[max(0.5rem,env(safe-area-inset-top,0px))] sm:right-2 sm:top-2"
              onClick={() => setEditorRegionFullscreen((v) => !v)}
              aria-label={editorRegionFullscreen ? "Exit fullscreen" : "Fullscreen editor"}
              title={editorRegionFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen editor"}
            >
              {editorRegionFullscreen ? (
                <Minimize className="h-4 w-4" />
              ) : (
                <Maximize className="h-4 w-4" />
              )}
            </Button>
          </>
        )}
        <div
          ref={setEditorPopoverBoundaryEl}
          className="flex-1 min-h-0 overflow-hidden relative w-full h-full max-w-full"
          style={
            panelEmbed || fillParentHeight || editorRegionFullscreen
              ? { minHeight: 0, maxHeight: "100%" }
              : { minHeight, maxHeight: "calc(100dvh - 300px)" }
          }
        >
          {/* Editor Content - add right padding to prevent text from going under TOC */}
          <div
            data-tour="editor-content"
            data-page-orientation={pageSetup.orientation}
            {...(pageSetup.pageView ? { "data-page-view": "" } : {})}
            className={cn(
              "overflow-y-auto overflow-x-auto h-full min-h-0 relative w-full max-w-full",
              pageSetup.pageView ? "bg-muted/40 px-0 pt-2 pb-8" : "px-2 pb-2 pr-20",
            )}
            style={
              panelEmbed || fillParentHeight || editorRegionFullscreen
                ? { minHeight: 0, maxHeight: "100%" }
                : { minHeight, maxHeight: "calc(100dvh - 300px)" }
            }
            ref={(node) => setEditorContainer(node)}
          >
            {pageSetup.pageView && (
              <div className="sticky top-0 z-20 mb-2 flex justify-center gap-1.5 bg-muted/40 pt-1 pb-1.5">
                {/* corner spacer aligns the horizontal ruler with the page (past the vertical ruler) */}
                <div className="w-6 shrink-0" aria-hidden />
                <EditorRuler
                  orientation="horizontal"
                  lengthPx={pageWidthPx}
                  marginStartPx={pageSetup.margins.left}
                  marginEndPx={pageSetup.margins.right}
                  onChange={({ start, end }) =>
                    setPageSetup((p) => ({
                      ...p,
                      margins: {
                        ...p.margins,
                        ...(start != null ? { left: start } : null),
                        ...(end != null ? { right: end } : null),
                      },
                    }))
                  }
                />
              </div>
            )}
            <div className={cn(pageSetup.pageView && "flex justify-center gap-1.5")}>
              {pageSetup.pageView && (
                <EditorRuler
                  orientation="vertical"
                  lengthPx={pageMinHeightPx}
                  marginStartPx={pageSetup.margins.top}
                  marginEndPx={pageSetup.margins.bottom}
                  onChange={({ start, end }) =>
                    setPageSetup((p) => ({
                      ...p,
                      margins: {
                        ...p.margins,
                        ...(start != null ? { top: start } : null),
                        ...(end != null ? { bottom: end } : null),
                      },
                    }))
                  }
                  className="shrink-0 self-start"
                />
              )}
              <div
                className={cn(pageSetup.pageView && "n9-page")}
                style={
                  pageSetup.pageView
                    ? {
                        width: pageWidthPx,
                        minHeight: pageMinHeightPx,
                        paddingTop: pageSetup.margins.top,
                        paddingRight: pageSetup.margins.right,
                        paddingBottom: pageSetup.margins.bottom,
                        paddingLeft: pageSetup.margins.left,
                      }
                    : undefined
                }
              >
                <EditorContextMenu
                  editor={editor}
                  actions={{
                    insertLink: openLinkDialog,
                    insertImage: openImageDialog,
                    insertTable: () => growTable(tableRows || 3, tableCols || 3),
                    insertEquation: enableMath ? () => setMathEdit({ pos: -1, latex: "", block: false }) : undefined,
                  }}
                >
                  <EditorContent editor={editor} />
                </EditorContextMenu>
              </div>
            </div>
            {activeTable && mounted && createPortal(
              <TableControlsOverlay
                table={activeTable}
                editor={editor}
                view={editor.view}
                boundary={editorContainer}
              />,
              document.body
            )}
          </div>
          {/* TOC and Comment Sidebar positioned absolutely relative to the card */}
          {editor && <TableOfContents editor={editor} className={cn(commentsSidebarOpen ? "right-[304px]" : "right-4")} />}
          {editor && <CommentSidebar editor={editor} open={commentsSidebarOpen} onClose={() => setCommentsSidebarOpen(false)} />}

          {editor && (
            <BubbleMenu
              pluginKey="comment-input"
              editor={editor}
              shouldShow={({ editor }) => {
                if (editor.isActive("comment")) return false
                if (editor.isActive("image")) {
                  const attrs = editor.getAttributes("image")
                  return !attrs.commentId
                }
                return !editor.state.selection.empty
              }}
              className="z-[200]"
            >
              {!isCommenting ? (
                <Button
                  size="sm"
                  className="shadow-xl bg-background border hover:bg-accent text-foreground h-8 px-3 gap-2"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsCommenting(true);
                  }}
                >
                  <MessageSquarePlus className="h-4 w-4" /> Add Comment
                </Button>
              ) : (
                <div className="flex items-center gap-2 p-2 bg-background border border-border rounded-md shadow-lg min-w-[300px] pointer-events-auto">
                  <Input
                    className="h-8 text-xs flex-1"
                    placeholder="Type comment..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (commentText.trim()) {
                          if (editor.isActive("image")) {
                            editor.chain().focus().setImageComment({ author: "You", content: commentText.trim() }).run()
                          } else {
                            editor.chain().focus().setComment({ author: "You", content: commentText.trim() }).run()
                          }
                          setCommentText("");
                          setIsCommenting(false);
                        }
                      } else if (e.key === 'Escape') {
                        setIsCommenting(false);
                      }
                    }}
                    autoFocus
                  />
                  <Button size="sm" className="h-7 px-2" onClick={() => {
                    if (commentText.trim()) {
                      if (editor.isActive("image")) {
                        editor.chain().focus().setImageComment({ author: "You", content: commentText.trim() }).run()
                      } else {
                        editor.chain().focus().setComment({ author: "You", content: commentText.trim() }).run()
                      }
                      setCommentText("");
                      setIsCommenting(false);
                    }
                  }}>Save</Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsCommenting(false)}><X className="h-4 w-4" /></Button>
                </div>
              )}
            </BubbleMenu>
          )}

          {activeCommentData && mounted && createPortal(
            <div
              data-comment-tooltip
              className="fixed z-[9999] flex flex-col gap-1 rounded-lg border bg-background p-3 shadow-lg text-xs w-64 animate-in fade-in zoom-in-95 duration-150"
              style={{
                top: activeCommentData.rect.bottom + 6,
                left: Math.max(8, Math.min(activeCommentData.rect.left, window.innerWidth - 272)),
              }}
            >
              <div className="font-semibold text-muted-foreground flex justify-between items-center">
                <span>{activeCommentData.author}</span>
                <span className="text-2xs opacity-70">
                  {activeCommentData.createdAt ? new Date(activeCommentData.createdAt).toLocaleString() : ""}
                </span>
              </div>
              <div className="text-foreground mt-1">{activeCommentData.content}</div>
              <div className="flex justify-end mt-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (editor && activeCommentData.id) {
                      editor.commands.deleteComment(activeCommentData.id)
                    }
                    setActiveCommentData(null)
                  }}
                  title="Delete comment"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>,
            document.body
          )}
          <style jsx global>{`
          .ProseMirror ul {
            list-style-type: disc;
            padding-left: 1.5rem;
            margin: 0.5rem 0;
          }
          .ProseMirror ol {
            list-style-type: decimal;
            padding-left: 1.5rem;
            margin: 0.5rem 0;
          }
          .ProseMirror li {
            list-style-position: outside;
          }
          .ProseMirror blockquote {
            border-left: 3px solid var(--border);
            padding-left: 0.75rem;
            margin: 0.5rem 0;
            color: var(--muted-foreground);
            font-style: italic;
          }
          /* Keep wide tables inside the editor: the wrapper scrolls horizontally
             instead of letting the table overflow past the editor bounds. */
          .ProseMirror .tableWrapper {
            overflow-x: auto;
            max-width: 100%;
            margin: 1rem 0;
          }
          .ProseMirror .tableWrapper table {
            margin: 0;
          }
          .ProseMirror table {
            border-collapse: collapse;
            /* Fixed layout makes the colgroup (our drag-set column widths)
               authoritative, so columns resize in both directions immediately
               instead of being pinned to the cells' default width. */
            table-layout: fixed;
            width: auto;
            min-width: 175px !important;
            margin: 1rem 0;
            color: var(--foreground);
            background: var(--card);
            border: 1px solid var(--border);
            position: relative;
          }
          .ProseMirror table td,
          .ProseMirror table th {
            border: 1px solid var(--border);
            padding: 0.35rem 0.5rem;
            vertical-align: top;
            min-width: 75px !important;
            width: 175px;
            position: relative;
            overflow-wrap: break-word;
            word-break: break-word;
          }
          .ProseMirror table th {
            background: var(--muted);
            color: var(--foreground);
            font-weight: 600;
          }
          /* The built-in column-resize handle is hidden: our overlay provides the
             single resize guide line. The plugin stays enabled so the colgroup
             (which actually renders column widths) keeps working. */
          .ProseMirror table .column-resize-handle {
            display: none !important;
          }
          .ProseMirror table .selectedCell {
            background: rgba(59, 130, 246, 0.1);
          }
          /* Brief highlight when an inline citation scrolls to its reference. */
          .ProseMirror .cite-ref-flash {
            background: color-mix(in srgb, var(--primary) 18%, transparent);
            border-radius: 4px;
            transition: background 1s ease;
          }
          /* Imported reference entries are scroll targets for inline citations. */
          .ProseMirror [id^="cite-ref-"] { scroll-margin-top: 1rem; }

          /* Monochrome gradient border animation for Cite with AI button */
          @keyframes rainbow-border {
            0% {
              background-position: 0% 50%;
            }
            100% {
              background-position: 200% 50%;
            }
          }
          
          .rainbow-border-button::before {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: 0.375rem;
            padding: 2px;
            background: linear-gradient(
              90deg,
              #ffffff,
              #d1d5db,
              #9ca3af,
              #6b7280,
              #4b5563,
              #374151,
              #1f2937,
              #000000,
              #1f2937,
              #374151,
              #4b5563,
              #6b7280,
              #9ca3af,
              #d1d5db,
              #ffffff
            );
            background-size: 200% 100%;
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            animation: rainbow-border 4s linear infinite;
            pointer-events: none;
          }

          .comment-mark {
            background-color: rgba(255, 235, 59, 0.2);
            border-bottom: 2px solid rgba(255, 214, 0, 0.4);
            cursor: pointer;
            transition: background-color 0.2s;
            position: relative;
          }

          .comment-mark::after {
            content: "";
            display: inline-block;
            width: 14px;
            height: 14px;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23eab308' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7.9 20A9 9 0 1 0 4 16.1L2 22Z'/%3E%3C/svg%3E");
            background-size: contain;
            background-repeat: no-repeat;
            vertical-align: middle;
            margin-left: 4px;
            cursor: pointer;
            opacity: 0.7;
            transform: translateY(-1px);
            transition: transform 0.2s, opacity 0.2s;
          }

          .comment-mark:hover {
            background-color: rgba(255, 235, 59, 0.3);
          }

          .comment-mark:hover::after {
            opacity: 1;
            transform: translateY(-1px) scale(1.1);
          }
          /* Subtle toolbar animation */
          .animate-logo-subtle {
            animation: logo-float 4s ease-in-out infinite;
          }

          @keyframes logo-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-1px); }
          }
        `}</style>
        </div>



        {/* AI Processing Indicator */}
        {
          (isAIProcessing || isCiteProcessing) && (
            <div className="border-t border-border p-2 bg-muted/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{isCiteProcessing ? 'Searching for citations...' : 'AI is processing your request...'}</span>
              </div>
            </div>
          )
        }

        <input
          ref={imageUploadInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImageUploadChange}
        />
        <input
          ref={cameraCaptureInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleImageUploadChange}
        />

        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
          <DialogContent dialogSize="sm">
            <DialogHeader>
              <DialogTitle>{editor?.isActive("link") ? "Edit link" : "Insert link"}</DialogTitle>
              <DialogDescription>
                Add a clean link without leaving the editor. You can apply it to selected text or insert a new linked label.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Link URL</label>
                <Input
                  value={linkUrlInput}
                  onChange={(e) => setLinkUrlInput(e.target.value)}
                  placeholder="https://example.com"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Link text</label>
                <Input
                  value={linkTextInput}
                  onChange={(e) => setLinkTextInput(e.target.value)}
                  placeholder="Optional label"
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setLinkDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={applyLinkFromDialog}>
                  Apply link
                </Button>
              </div>
              {editor?.isActive("link") && (
                <Button type="button" variant="ghost" onClick={removeLinkFromDialog}>
                  Remove link
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {enableMath && (
          <Dialog
            open={!!mathEdit}
            onOpenChange={(open) => {
              if (!open) setMathEdit(null)
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{mathEdit && mathEdit.pos < 0 ? "Insert equation" : "Edit equation"}</DialogTitle>
                <DialogDescription>
                  Type LaTeX and see a live preview. Example: <code className="font-mono">EE\% = \frac{"{"}Total-Free{"}"}{"{"}Total{"}"} \times 100</code>
                </DialogDescription>
              </DialogHeader>
              <Textarea
                value={mathEdit?.latex ?? ""}
                onChange={(e) =>
                  setMathEdit((m) => (m ? { ...m, latex: e.target.value } : null))
                }
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault()
                    applyMathEdit()
                  }
                }}
                className="min-h-[120px] font-mono text-sm"
                placeholder="Enter LaTeX (KaTeX)…  e.g.  EE\% = \frac{Total-Free}{Total} \times 100"
                autoFocus
              />
              {(() => {
                const raw = (mathEdit?.latex ?? "").trim()
                if (!raw) {
                  return (
                    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
                      Preview appears here as you type.
                    </div>
                  )
                }
                let html = ""
                let error = ""
                try {
                  html = katex.renderToString(sanitizeLatexInput(raw), {
                    throwOnError: true,
                    displayMode: !!mathEdit?.block,
                  })
                } catch (err) {
                  error = err instanceof Error ? err.message : "Invalid LaTeX"
                }
                return error ? (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    {error}
                  </div>
                ) : (
                  <div className="flex min-h-[56px] items-center justify-center overflow-x-auto rounded-lg border border-border bg-background px-3 py-3">
                    <span dangerouslySetInnerHTML={{ __html: html }} />
                  </div>
                )
              })()}
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setMathEdit(null)}>
                  Cancel
                </Button>
                <Button type="button" onClick={applyMathEdit}>
                  {mathEdit && mathEdit.pos < 0 ? "Insert" : "Apply"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        <Dialog open={chemDialogOpen} onOpenChange={setChemDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Chemical formula</DialogTitle>
              <DialogDescription>
                Type a formula and it's converted to proper subscripts/superscripts (e.g. H2O → H₂O, Ca^2+ → Ca²⁺).
              </DialogDescription>
            </DialogHeader>
            <Input
              value={chemInput}
              onChange={(e) => setChemInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && chemInput.trim()) {
                  e.preventDefault()
                  editor.chain().focus().insertContent(formatChemicalFormula(chemInput)).run()
                  setChemDialogOpen(false)
                }
              }}
              placeholder="e.g. H2O, CO2, Ca(OH)2, SO4^2-"
              autoFocus
            />
            {chemInput.trim() ? (
              <div className="flex min-h-[44px] items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-lg">
                {formatChemicalFormula(chemInput)}
              </div>
            ) : null}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setChemDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!chemInput.trim()}
                onClick={() => {
                  editor.chain().focus().insertContent(formatChemicalFormula(chemInput)).run()
                  setChemDialogOpen(false)
                }}
              >
                Insert
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={cameraDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              stopCamera()
              setCameraDialogOpen(false)
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Take a photo</DialogTitle>
              <DialogDescription>Position your subject and capture a still to insert into the note.</DialogDescription>
            </DialogHeader>
            {cameraError ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-6 text-center text-sm text-destructive">
                {cameraError}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-black">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video ref={cameraVideoRef} className="aspect-video w-full object-cover" playsInline muted />
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  stopCamera()
                  setCameraDialogOpen(false)
                }}
              >
                Cancel
              </Button>
              {!cameraError && (
                <Button type="button" onClick={capturePhotoFromCamera}>
                  <Camera className="mr-2 h-4 w-4" />
                  Capture
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={imageInsertDialogOpen} onOpenChange={setImageInsertDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Insert image</DialogTitle>
              <DialogDescription>
                Upload images, take a photo, or add one by URL. Inserted images are placed directly into the notes area.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={openImageUploadPicker}
                  className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/40"
                >
                  <ImagePlus className="h-5 w-5" />
                  Upload image
                  <span className="text-xs font-normal text-muted-foreground">PNG, JPG, HEIC, GIF and more</span>
                </button>
                <button
                  type="button"
                  onClick={openCameraCapturePicker}
                  className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-4 text-sm font-medium text-foreground transition-colors hover:bg-accent/40"
                >
                  <Camera className="h-5 w-5" />
                  Take photo
                  <span className="text-xs font-normal text-muted-foreground">Works best on mobile and camera-enabled devices</span>
                </button>
              </div>

              <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Image URL</label>
                  <Input
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    placeholder="https://example.com/image.png"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Alt text</label>
                  <Input
                    value={imageAltInput}
                    onChange={(e) => setImageAltInput(e.target.value)}
                    placeholder="Optional description"
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="button" onClick={insertImageFromUrl}>
                    Insert from URL
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setImageInsertDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Citation Selection Modal */}
        <Dialog open={citationModalOpen} onOpenChange={setCitationModalOpen}>
          <DialogContent dialogSize="md" className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Select Citations</DialogTitle>
              <DialogDescription>
                {citationSource === "repository"
                  ? "Matches from your saved repository. Click a source to select it, or search the web for more."
                  : "Results from the web. Click a source to select/deselect it."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {foundPapers.map((paper, index) => {
                const year = paper.year && paper.year > 0 ? paper.year : null
                const isSelected = selectedPapers.has(index)

                return (
                  <div
                    key={paper.id}
                    onClick={() => togglePaperSelection(index)}
                    className={cn(
                      "p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md",
                      isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/50"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-semibold transition-colors",
                        isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                      )}>
                        {isSelected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm line-clamp-2 mb-1">
                          {paper.title}
                        </h4>
                        {year && (
                          <p className="text-xs text-muted-foreground mb-2">
                            {year}
                          </p>
                        )}
                        {paper.source_url && (
                          <a
                            href={paper.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-primary hover:underline inline-block"
                          >
                            View source →
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setCitationModalOpen(false)
                  setSelectedPapers(new Set())
                }}
              >
                Cancel
              </Button>
              <div className="flex gap-2">
                {citationSource === "repository" && (
                  <Button
                    variant="ghost"
                    onClick={runWebCitationSearch}
                    disabled={isCiteProcessing}
                    className="gap-1.5"
                  >
                    {isCiteProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                    Search the web
                  </Button>
                )}
                <Button
                  onClick={handleCiteSelected}
                  disabled={selectedPapers.size === 0}
                >
                  Cite Selected ({selectedPapers.size})
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bibliography Generation Modal */}
        <Dialog open={bibliographyModalOpen} onOpenChange={setBibliographyModalOpen}>
          <DialogContent dialogSize="lg" className="max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Generate Bibliography</DialogTitle>
              <DialogDescription>
                Preview your formatted bibliography ({citationMetadata.size} citation{citationMetadata.size !== 1 ? 's' : ''}, {selectedCitationStyle} style)
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-3 py-2">

              {/* Preview - More compact */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Preview</label>
                <div className="border rounded-lg p-3 bg-muted/30 max-h-[450px] overflow-y-auto">
                  <h3 className="text-base font-semibold mb-2">References</h3>
                  <div className="space-y-1.5">
                    {Array.from(citationMetadata.entries())
                      .sort(([a], [b]) => (a as number) - (b as number))
                      .map((entry) => {
                        const [number, metadata] = entry as [number, ReturnType<typeof buildMetadataMap> extends Map<number, infer V> ? V : never]
                        return (
                          <div key={number} className="text-sm leading-relaxed">
                            <span className="font-medium inline-block min-w-[2rem]">[{number}]</span>
                            <span
                              className="inline"
                              dangerouslySetInnerHTML={{
                                __html: formatCitation(metadata, selectedCitationStyle)
                              }}
                            />
                          </div>
                        )
                      })}
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="mt-2">
              <Button
                variant="outline"
                onClick={() => setBibliographyModalOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleInsertBibliography}>
                Insert at End
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog >
      </div >
    </>
    </CitationContext.Provider>
  );
}
