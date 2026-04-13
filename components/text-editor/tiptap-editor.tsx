"use client"

// @ts-ignore
import { useEditor, EditorContent } from "@tiptap/react"
// @ts-ignore
import { BubbleMenu } from "@tiptap/react/menus"
// @ts-ignore
import { StarterKit } from "@tiptap/starter-kit"
import { Placeholder } from "@tiptap/extension-placeholder"
import { Link } from "@tiptap/extension-link"
import { Image } from "@tiptap/extension-image"
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
import { createProtocolSuggestion, ProtocolItem, ProtocolMention } from "./extensions/protocol-mention"
import { createLabNoteSuggestion, LabNoteItem, LabNoteMention } from "./extensions/labnote-mention"
import { createLiteratureSuggestion, LiteratureItem, LiteratureMention } from "./extensions/literature-mention"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
  Trash2,
  X,
  Columns,
  Rows,
  Maximize2,
  Minimize2,
  MessageSquare,
  Plus,
  Pipette,
  Paintbrush,
  ImagePlus,
  Square,
  Circle,
  ArrowRight,
} from "lucide-react"
import { Extension, Mark, mergeAttributes } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { TextSelection } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { cn } from "@/lib/utils"
import { useAwsTranscribe } from "@/hooks/use-aws-transcribe"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import "@/styles/inline-diff.css"
// @ts-ignore
import * as mammoth from "mammoth"
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
import { SimpleShape, type SimpleShapeVariant } from "./extensions/simple-shape"
import { SpreadsheetEmbed } from "./extensions/spreadsheet-embed"
// @ts-ignore - CSS import for KaTeX math rendering
import "katex/dist/katex.min.css"
import {
  buildSpreadsheetWorkbookSnapshot,
  encodeSpreadsheetWorkbook,
  isSpreadsheetFile,
  readSpreadsheetWorkbook,
} from "@/lib/spreadsheet-workbook"
import { looksLikeMarkdown, markdownToHtml } from "@/lib/markdown-to-editor-html"

interface Paper {
  id: number
  title: string
  authors: string[]
  year: number | null
  journal: string
  source_url: string
  doi: string
}

interface CitationMetadata {
  citationNumber: number
  url: string
  title: string
  authors: string[]
  year: number
  journal: string
  doi: string
  paperId: string
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
  protocols?: ProtocolItem[]
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

interface CommentItem {
  id: string
  text: string
  author: string
  createdAt: number
  content: string
  pos: number
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

function CommentSidebar({ editor, open, onClose }: { editor: any; open: boolean; onClose: () => void }) {
  const [comments, setComments] = useState<CommentItem[]>([])

  const updateComments = useCallback(() => {
    if (!editor) return
    const items: CommentItem[] = []
    editor.state.doc.descendants((node: any, pos: number) => {
      node.marks.forEach((mark: any) => {
        if (mark.type.name === "comment") {
          // Changed deduplication: only skip if the SAME comment (same ID) is at the SAME position (node overlap)
          // This allows copied blocks with same ID to show up multiple times in sidebar
          if (!items.find((c) => c.id === mark.attrs.id && c.pos === pos)) {
            items.push({
              id: mark.attrs.id,
              author: mark.attrs.author,
              createdAt: mark.attrs.createdAt,
              content: mark.attrs.content,
              text: node.textContent,
              pos,
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
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
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
                editor.commands.focus(comment.pos)
                const dom = editor.view.nodeDOM(comment.pos)
                if (dom) {
                  const el = dom instanceof Element ? dom : dom.parentElement
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
                }
              }}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-[10px] font-bold text-primary uppercase">{comment.author}</span>
                <span className="text-[9px] text-muted-foreground">
                  {new Date(comment.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-foreground mb-2 line-clamp-3">{comment.content}</p>
              <div className="flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[10px] text-muted-foreground italic truncate max-w-[120px]">"{comment.text}"</span>
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
  view
}: {
  table: HTMLTableElement,
  editor: any,
  view: any
}) => {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [dragState, setDragState] = useState<{
    type: 'col' | 'row' | 'both'
    colIndex: number
    rowIndex: number
    startX: number
    startY: number
    startColWidths: number[]
    startRowHeights: number[]
  } | null>(null)

  // Update rect periodically or on table change
  useEffect(() => {
    const updateRect = () => {
      setRect(table.getBoundingClientRect())
    }
    updateRect()
    const interval = setInterval(updateRect, 100)
    return () => clearInterval(interval)
  }, [table])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragState) return

      const dx = e.clientX - dragState.startX
      const dy = e.clientY - dragState.startY
      const { type, colIndex, rowIndex, startColWidths, startRowHeights } = dragState

      if (type === 'col' || type === 'both') {
        const newWidth = Math.max(50, startColWidths[colIndex] + dx)
        const rows = table.querySelectorAll('tr')
        rows.forEach(row => {
          const cells = row.querySelectorAll('td, th')
          if (cells[colIndex]) {
            (cells[colIndex] as HTMLElement).style.width = `${newWidth}px`
          }
        })
      }

      if (type === 'row' || type === 'both') {
        const newHeight = Math.max(24, startRowHeights[rowIndex] + dy)
        const rows = table.querySelectorAll('tr')
        if (rows[rowIndex]) {
          (rows[rowIndex] as HTMLElement).style.height = `${newHeight}px`
        }
      }
    }

    const onMouseUp = () => {
      if (dragState) {
        syncTableSize(table, view)
        setDragState(null)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    if (dragState) {
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [dragState, editor, table])

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

  // Get cell handles
  const handles: React.ReactNode[] = []
  const rows = Array.from(table.querySelectorAll('tr'))

  rows.forEach((row, rowIndex) => {
    const cells = Array.from(row.querySelectorAll('td, th'))
    cells.forEach((cellEl, colIndex) => {
      const cell = cellEl as HTMLElement
      const cellRect = cell.getBoundingClientRect()
      const relativeTop = cellRect.top - rect.top
      const relativeLeft = cellRect.left - rect.left

      // Vertical handle (Right edge)
      handles.push(
        <div
          key={`col-${rowIndex}-${colIndex}`}
          className="absolute cursor-col-resize hover:bg-blue-400 opacity-0 hover:opacity-100 transition-opacity"
          style={{
            top: relativeTop,
            left: relativeLeft + cellRect.width - 2,
            width: 4,
            height: cellRect.height,
            zIndex: 1001,
          }}
          onMouseDown={(e) => handleStartDrag('col', colIndex, rowIndex, e)}
        />
      )

      // Horizontal handle (Bottom edge)
      handles.push(
        <div
          key={`row-${rowIndex}-${colIndex}`}
          className="absolute cursor-row-resize hover:bg-blue-400 opacity-0 hover:opacity-100 transition-opacity"
          style={{
            top: relativeTop + cellRect.height - 2,
            left: relativeLeft,
            width: cellRect.width,
            height: 4,
            zIndex: 1001,
          }}
          onMouseDown={(e) => handleStartDrag('row', colIndex, rowIndex, e)}
        />
      )

      // Diagonal handle
      if (colIndex === cells.length - 1 && rowIndex === rows.length - 1) {
        handles.push(
          <div
            key={`diag-${rowIndex}-${colIndex}`}
            className="absolute cursor-nwse-resize opacity-40 hover:opacity-100"
            style={{
              top: relativeTop + cellRect.height - 6,
              left: relativeLeft + cellRect.width - 6,
              width: 12,
              height: 12,
              background: 'linear-gradient(135deg, transparent 50%, #3b82f6 50%)',
              zIndex: 1002,
              borderRadius: '0 0 3px 0'
            }}
            onMouseDown={(e) => handleStartDrag('both', colIndex, rowIndex, e)}
          />
        )
      }
    })
  })

  return (
    <div
      className="absolute pointer-events-none select-none"
      style={{
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
        zIndex: 1000,
      }}
    >
      <div className="relative w-full h-full">
        {handles}

        {/* Minimalistic Edit Table Trigger - Bottom Right Outside */}
        <div
          className="table-controls-overlay absolute pointer-events-auto"
          style={{
            bottom: -32,
            right: 0,
            zIndex: 1005
          }}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[10px] gap-1.5 bg-background shadow-sm hover:bg-accent border-muted-foreground/20"
              >
                <TableIcon className="h-3 w-3" /> Edit Table
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-1 bg-background/95 backdrop-blur-sm border-border shadow-2xl">
              <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground font-semibold px-2 py-1">Rows</DropdownMenuLabel>
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

              <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground font-semibold px-2 py-1">Columns</DropdownMenuLabel>
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

              <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground font-semibold px-2 py-1">Cells & Headers</DropdownMenuLabel>
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

              <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground font-semibold px-2 py-1 flex items-center gap-2">
                <Paintbrush className="h-3 w-3" /> Cell Background
              </DropdownMenuLabel>
              <div className="flex flex-wrap gap-1.5 p-2 px-3">
                {[
                  { name: 'No Color', value: null, className: 'bg-transparent border border-muted-foreground/30 flex items-center justify-center after:content-["/"] after:text-muted-foreground/40 after:text-[10px] after:font-bold' },
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
          ({ tr, state, dispatch, editor }) => {
            const { selection } = state;
            const { from, to } = selection;

            if (
              editor.isActive('bulletList') ||
              editor.isActive('orderedList') ||
              editor.isActive('taskList')
            ) {
              return editor.chain().sinkListItem('listItem').run();
            }

            tr.doc.nodesBetween(from, to, (node, pos) => {
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
          ({ tr, state, dispatch, editor }) => {
            const { selection } = state;
            const { from, to } = selection;

            if (
              editor.isActive('bulletList') ||
              editor.isActive('orderedList') ||
              editor.isActive('taskList')
            ) {
              return editor.chain().liftListItem('listItem').run();
            }

            tr.doc.nodesBetween(from, to, (node, pos) => {
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
      Tab: () => this.editor.commands.setIndent(),
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
    console.log("Comment extension addCommands called");
    return {
      setComment:
        (attributes: any) =>
          ({ commands }: { commands: any }) => {
            const id = `comment-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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
            doc.descendants((node: any, pos: number) => {
              node.marks.forEach((mark: any) => {
                if (mark.type.name === this.name && mark.attrs.id === id) {
                  tr.removeMark(pos, pos + node.nodeSize, mark.type);
                }
              });
            });
            if (dispatch) {
              dispatch(tr);
              return true;
            }
            return false;
          },
    };
  },

  addProseMirrorPlugins() {
    return []
  },
});

/** At most one of these toolbar dropdowns open at a time (mutually exclusive). */
type ToolbarClusterId = "text" | "insert" | "lists" | "align" | "table" | "sigma" | "ai"

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

function isMacLikePlatform() {
  if (typeof navigator === "undefined") return false
  const platform = navigator.platform || ""
  const userAgent = navigator.userAgent || ""
  return /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS|iPhone|iPad|iPod/i.test(userAgent)
}

function formatToolbarShortcutLabel(isMac: boolean, key: string) {
  return `\\ ${key.toUpperCase()}`
}

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
}: TiptapEditorProps & {
  hideToolbar?: boolean
  /** Accepted for lab-notes compatibility; export UI is toolbar-driven. */
  hideExportControls?: boolean
  exportIncludeCommentsInPdf?: boolean
}) {
  const [activeTable, setActiveTable] = useState<HTMLTableElement | null>(null)
  const [editorContainer, setEditorContainer] = useState<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Track table hover with hide delay
  useEffect(() => {
    if (!editorContainer) return
    let hideTimeout: any

    const onMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const table = target.closest('table')

      // Only track if the table is inside THIS editor container
      const isOurTable = table && editorContainer.contains(table)
      const overlay = target.closest('.table-controls-overlay')

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

    document.addEventListener('mousemove', onMouseMove)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      clearTimeout(hideTimeout)
    }
  }, [editorContainer])
  const [isAIProcessing, setIsAIProcessing] = useState(false)
  const [isCiteProcessing, setIsCiteProcessing] = useState(false)
  const [toolbarClusterMenu, setToolbarClusterMenu] = useState<ToolbarClusterId | null>(null)
  const [textMenuFontSizeInput, setTextMenuFontSizeInput] = useState("16")
  const [textMenuBaseColor, setTextMenuBaseColor] = useState("#1e88e5")
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkUrlInput, setLinkUrlInput] = useState("")
  const [linkTextInput, setLinkTextInput] = useState("")
  const [mathEdit, setMathEdit] = useState<{ pos: number; latex: string; block: boolean } | null>(null)
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
  const [citationMetadata, setCitationMetadata] = useState<Map<number, CitationMetadata>>(new Map())
  const [selectedCitationStyle, setSelectedCitationStyle] = useState<'APA' | 'MLA' | 'Chicago' | 'Harvard' | 'IEEE' | 'Vancouver'>('APA')
  const [isCommenting, setIsCommenting] = useState(false)
  const [commentText, setCommentText] = useState("")
  const [commentsSidebarOpen, setCommentsSidebarOpen] = useState(false)
  /* State merge: keeping activeCommentData from origin */
  const [activeCommentData, setActiveCommentData] = useState<{ author: string; content: string; createdAt: number; id: string; rect: DOMRect } | null>(null)
  const [, setToolbarSyncTick] = useState(0)
  const lastFinalIndexRef = useRef<number>(0)
  const lastInterimTextRef = useRef<string>("")
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null)

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

  const { start: startAwsTranscribe, stop: stopAwsTranscribe, isListening } = useAwsTranscribe({
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

  // Use ref for protocols so the mention extension always has access to current protocols
  const protocolsRef = useRef<ProtocolItem[]>(protocols)
  const labNotesRef = useRef<LabNoteItem[]>(labNotes)
  const literatureRef = useRef<LiteratureItem[]>(literatureItems)

  // Keep the refs in sync with props
  useEffect(() => {
    protocolsRef.current = protocols
  }, [protocols])

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
      Image.configure({
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
      TableRow,
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
      SpreadsheetEmbed,
      Alignment,
      ProtocolMention.configure({
        HTMLAttributes: {
          class: "mention-protocol",
        },
        suggestion: createProtocolSuggestion(protocolsRef),
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
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
    onSelectionUpdate: ({ editor }) => {
      setToolbarSyncTick((current) => current + 1)
      if (editor.state.selection.empty) {
        setIsCommenting(false)
      }
    },
    onCreate: () => {
      console.log('TiptapEditor: created')
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
        if (!html && looksLikeMarkdown(text)) {
          event.preventDefault()
          void insertMarkdownText(text)
          return true
        }
        return false
      },
      handleDOMEvents: {
        dragover: (_view, ev) => {
          ev.preventDefault()
          return false
        },
      },
    },
  })

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

    // Body — render the HTML content
    const body = document.createElement('div')
    body.className = 'inline-diff-body'
    body.innerHTML = inlineDiffHtml
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
      const commentEl = target.closest('.comment-mark') as HTMLElement | null

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

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content)
    }
  }, [content, editor])

  // AI Functions using Gemini API
  const callGeminiAPI = useCallback(
    async (action: string, selectedText: string) => {
      setIsAIProcessing(true)
      try {
        const response = await fetch("/api/ai/gemini", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            selectedText,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || "AI request failed")
        }

        const data = await response.json()
        return data.text
      } catch (error: any) {
        console.error("AI API error:", error)
        // Fallback to demo mode if API fails
        return `⚠️ AI API unavailable. ${error.message || "Please check your API key configuration."}`
      } finally {
        setIsAIProcessing(false)
      }
    },
    []
  )

  const aiImprove = useCallback(async () => {
    if (!editor) return
    const { from, to } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to, " ")

    if (selectedText) {
      const improved = await callGeminiAPI("improve", selectedText)
      editor.chain().focus().deleteRange({ from, to }).insertContent(improved).run()
    } else {
      editor
        .chain()
        .focus()
        .insertContent("⚠️ Please select some text to improve")
        .run()
    }
    setToolbarClusterMenu(null)
  }, [editor, callGeminiAPI])

  const aiContinue = useCallback(async () => {
    if (!editor) return
    const text = editor.getText()
    const continuation = await callGeminiAPI("continue", text)
    editor.chain().focus().insertContent(" " + continuation).run()
    setToolbarClusterMenu(null)
  }, [editor, callGeminiAPI])

  const aiShorter = useCallback(async () => {
    if (!editor) return
    const { from, to } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to, " ")

    if (selectedText) {
      const shorter = await callGeminiAPI("shorter", selectedText)
      editor.chain().focus().deleteRange({ from, to }).insertContent(shorter).run()
    } else {
      editor
        .chain()
        .focus()
        .insertContent("⚠️ Please select some text to make shorter")
        .run()
    }
    setToolbarClusterMenu(null)
  }, [editor, callGeminiAPI])

  const aiLonger = useCallback(async () => {
    if (!editor) return
    const { from, to } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to, " ")

    if (selectedText) {
      const longer = await callGeminiAPI("longer", selectedText)
      editor.chain().focus().deleteRange({ from, to }).insertContent(longer).run()
    } else {
      editor
        .chain()
        .focus()
        .insertContent("⚠️ Please select some text to expand")
        .run()
    }
    setToolbarClusterMenu(null)
  }, [editor, callGeminiAPI])

  const aiSimplify = useCallback(async () => {
    if (!editor) return
    const { from, to } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to, " ")

    if (selectedText) {
      const simplified = await callGeminiAPI("simplify", selectedText)
      editor.chain().focus().deleteRange({ from, to }).insertContent(simplified).run()
    } else {
      editor
        .chain()
        .focus()
        .insertContent("⚠️ Please select some text to simplify")
        .run()
    }
    setToolbarClusterMenu(null)
  }, [editor, callGeminiAPI])

  const aiGrammar = useCallback(async () => {
    if (!editor) return
    const { from, to } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to, " ")

    if (selectedText) {
      const corrected = await callGeminiAPI("grammar", selectedText)
      editor.chain().focus().deleteRange({ from, to }).insertContent(corrected).run()
    } else {
      editor
        .chain()
        .focus()
        .insertContent("⚠️ Please select some text to fix grammar")
        .run()
    }
    setToolbarClusterMenu(null)
  }, [editor, callGeminiAPI])

  const aiStructure = useCallback(async () => {
    if (!editor) return
    const { from, to } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to, " ")

    if (selectedText) {
      const structured = await callGeminiAPI("structure", selectedText)
      editor.chain().focus().deleteRange({ from, to }).insertContent(structured).run()
    } else {
      editor
        .chain()
        .focus()
        .insertContent("⚠️ Please select chemical text to structure properly")
        .run()
    }
    setToolbarClusterMenu(null)
  }, [editor, callGeminiAPI])

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

    try {
      setIsCiteProcessing(true)

      // Call the citation search API
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000)
      const response = await fetch(
        `https://z3thrlksg0.execute-api.us-east-1.amazonaws.com/citations_ddg`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: selectedText }),
          signal: controller.signal,
        }
      )
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error('Citation search failed')
      }

      const data: Paper[] = await response.json()

      if (data && data.length > 0) {
        // Store papers and open modal
        setFoundPapers(data)
        setSelectedPapers(new Set())
        setCitationInsertPosition(to)
        setCitationModalOpen(true)
      } else {
        toast.error('No citations found for the selected text', {
          duration: 4000,
          description: 'Try selecting different text or rephrasing your query.'
        })
      }
    } catch (error) {
      console.error('Citation search error:', error)
      toast.error('Failed to fetch citations', {
        duration: 4000,
        description: 'Please check your connection and try again.'
      })
    } finally {
      setIsCiteProcessing(false)
    }

    setToolbarClusterMenu(null)
  }, [editor])

  const handleCiteSelected = useCallback(() => {
    if (!editor || selectedPapers.size === 0) return

    // Get all citation links in the document with their positions
    const html = editor.getHTML()
    const citations: { pos: number; number: number; url: string }[] = []

    // Find all existing citations with their positions
    const citationRegex = /<a[^>]*href="([^"]*)"[^>]*>\[(\d+)\]<\/a>/g
    let match

    while ((match = citationRegex.exec(html)) !== null) {
      const citationNumber = parseInt(match[2])
      const url = match[1]
      // Find position in document (approximate based on text content)
      const textBefore = html.substring(0, match.index).replace(/<[^>]*>/g, '').length
      citations.push({ pos: textBefore, number: citationNumber, url })
    }

    // Add new citations at the insert position
    const sortedIndices = Array.from(selectedPapers).sort((a, b) => a - b)
    const newCitations = sortedIndices.map((index) => {
      const paper = foundPapers[index]
      console.log('Paper data being stored:', paper) // Debug log
      return {
        pos: citationInsertPosition,
        number: 0, // Will be assigned later
        url: paper?.source_url || '',
        paperId: paper?.id?.toString() || '',
        title: paper?.title || '',
        authors: paper?.authors || [],
        year: paper?.year || 0,
        journal: paper?.journal || '',
        doi: paper?.doi || ''
      }
    })

    // Combine and sort all citations by position
    const allCitations = [...citations, ...newCitations].sort((a, b) => a.pos - b.pos)

    // Renumber all citations sequentially
    allCitations.forEach((citation, index) => {
      citation.number = index + 1
    })

    // Create the new citation text to insert
    let citationText = ''
    newCitations.forEach((newCit) => {
      const finalNumber = allCitations.find(c => c.pos === newCit.pos && c.url === newCit.url)?.number || 1
      if (newCit.url) {
        // Store paper metadata in data attributes for later bibliography generation
        // Encode complex data as JSON to preserve arrays
        const authorsJson = JSON.stringify(newCit.authors || []).replace(/"/g, '&quot;')
        const citationHtml = `<a href="${newCit.url}" data-paper-id="${newCit.paperId}" data-paper-title="${newCit.title.replace(/"/g, '&quot;')}" data-paper-authors="${authorsJson}" data-paper-year="${newCit.year}" data-paper-journal="${(newCit.journal || '').replace(/"/g, '&quot;')}" data-paper-doi="${newCit.doi || ''}" target="_blank" rel="noopener noreferrer">[${finalNumber}]</a>`
        console.log('Citation HTML being inserted:', citationHtml) // Debug log
        citationText += citationHtml
      } else {
        citationText += `[${finalNumber}]`
      }
    })

    // Insert new citations
    editor.chain().focus().setTextSelection(citationInsertPosition).insertContent(citationText).run()

    // Now renumber all existing citations in the document
    setTimeout(() => {
      const updatedHtml = editor.getHTML()
      let newHtml = updatedHtml

      // Replace all citation numbers with their new sequential numbers
      const allCitationMatches = Array.from(updatedHtml.matchAll(/<a([^>]*href="[^"]*"[^>]*)>\[(\d+)\]<\/a>/g))

      // Sort by position to maintain order
      const citationMap = new Map<string, number>()
      let counter = 1

      allCitationMatches.forEach((match) => {
        const fullMatch = match[0]
        const attributes = match[1]

        if (!citationMap.has(fullMatch)) {
          citationMap.set(fullMatch, counter)
          const newCitation = `<a${attributes}>[${counter}]</a>`
          newHtml = newHtml.replace(fullMatch, newCitation)
          counter++
        }
      })

      // Update the editor content with renumbered citations
      if (newHtml !== updatedHtml) {
        editor.commands.setContent(newHtml)
      }
    }, 100)

    // Close modal and reset
    setCitationModalOpen(false)
    setFoundPapers([])
    setSelectedPapers(new Set())
  }, [editor, selectedPapers, foundPapers, citationInsertPosition])

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

  const formatCitation = useCallback((metadata: CitationMetadata, style: string): string => {
    const { authors, year, title, journal, url } = metadata
    const authorStr = authors && authors.length > 0
      ? authors.length === 1
        ? authors[0]
        : authors.length === 2
          ? `${authors[0]} & ${authors[1]}`
          : `${authors[0]} et al.`
      : 'Unknown Author'

    const yearStr = year && year > 0 ? year.toString() : 'n.d.'

    switch (style) {
      case 'APA':
        return `${authorStr} (${yearStr}). ${title}. ${journal ? `<em>${journal}</em>. ` : ''}${url ? `Retrieved from ${url}` : ''}`

      case 'MLA':
        return `${authorStr}. "${title}." ${journal ? `<em>${journal}</em>, ` : ''}${yearStr}. ${url ? `Web. ${url}` : ''}`

      case 'Chicago':
        return `${authorStr}. "${title}." ${journal ? `<em>${journal}</em> ` : ''}(${yearStr}). ${url || ''}`

      case 'Harvard':
        return `${authorStr}, ${yearStr}. ${title}. ${journal ? `<em>${journal}</em>. ` : ''}${url ? `Available at: ${url}` : ''}`

      case 'IEEE':
        return `${authorStr}, "${title}," ${journal ? `<em>${journal}</em>, ` : ''}${yearStr}. ${url ? `[Online]. Available: ${url}` : ''}`

      case 'Vancouver':
        // Vancouver style: Author(s). Title. Journal. Year;volume(issue):pages.
        return `${authorStr}. ${title}. ${journal ? `${journal}. ` : ''}${yearStr}. ${url ? `Available from: ${url}` : ''}`

      default:
        return `${authorStr} (${yearStr}). ${title}. ${url || ''}`
    }
  }, [])

  const handleGenerateBibliography = useCallback(async () => {
    if (!editor) return

    // Extract all citation links from the document
    const html = editor.getHTML()

    // Parse citations more flexibly - attributes can be in any order
    const citations: { number: number; url: string; paperId: string; title: string; doi: string; authors: string[]; year: number; journal: string }[] = []

    // Find all citation links
    const linkRegex = /<a[^>]*>\[(\d+)\]<\/a>/g
    let match

    while ((match = linkRegex.exec(html)) !== null) {
      const fullTag = match[0]
      const citationNumber = parseInt(match[1])

      // Extract attributes from the tag
      const hrefMatch = fullTag.match(/href="([^"]*)"/)
      const paperIdMatch = fullTag.match(/data-paper-id="([^"]*)"/)
      const paperTitleMatch = fullTag.match(/data-paper-title="([^"]*)"/)
      const paperSourceMatch = fullTag.match(/data-paper-doi="([^"]*)"/)
      const paperAuthorsMatch = fullTag.match(/data-paper-authors="([^"]*)"/)
      const paperYearMatch = fullTag.match(/data-paper-year="([^"]*)"/)
      const paperJournalMatch = fullTag.match(/data-paper-journal="([^"]*)"/)

      if (hrefMatch) {
        // Parse authors from JSON
        let authors: string[] = []
        if (paperAuthorsMatch) {
          try {
            const authorsStr = paperAuthorsMatch[1].replace(/&quot;/g, '"')
            authors = JSON.parse(authorsStr)
          } catch (e) {
            console.error('Failed to parse authors:', e)
          }
        }

        const citation = {
          number: citationNumber,
          url: hrefMatch[1],
          paperId: paperIdMatch ? paperIdMatch[1] : '',
          title: paperTitleMatch ? paperTitleMatch[1].replace(/&quot;/g, '"') : '',
          doi: paperSourceMatch ? paperSourceMatch[1] : '',
          authors: authors,
          year: paperYearMatch ? parseInt(paperYearMatch[1]) || 0 : 0,
          journal: paperJournalMatch ? paperJournalMatch[1].replace(/&quot;/g, '"') : ''
        }

        console.log('Extracted citation data:', citation) // Debug log
        citations.push(citation)
      }
    }

    // Check if there are any citations
    if (citations.length === 0) {
      toast.error('No citations found', {
        description: 'Add citations using "Cite with AI" before generating bibliography.',
        duration: 4000
      })
      return
    }

    console.log('Found citations:', citations) // Debug log

    // Fetch metadata for each citation using the paper ID
    setIsCiteProcessing(true)
    const citationMetadataMap = new Map<number, CitationMetadata>()

    try {
      for (const citation of citations) {
        citationMetadataMap.set(citation.number, {
          citationNumber: citation.number,
          url: citation.url,
          title: citation.title || 'Unknown Title',
          authors: citation.authors || [],
          year: citation.year || 0,
          journal: citation.journal || '',
          doi: citation.doi || '',
          paperId: citation.paperId
        })
      }

      // Store the metadata and open modal
      setCitationMetadata(citationMetadataMap)
      setBibliographyModalOpen(true)

    } catch (error) {
      console.error('Error generating bibliography:', error)
      toast.error('Failed to generate bibliography', {
        description: 'Please try again.',
        duration: 4000
      })
    } finally {
      setIsCiteProcessing(false)
    }
  }, [editor])

  const handleInsertBibliography = useCallback(() => {
    if (!editor || citationMetadata.size === 0) return

    // Sort citations by number
    const sortedCitations = Array.from(citationMetadata.entries())
      .sort((a, b) => a[0] - b[0])

    // Generate bibliography HTML
    let bibliographyHtml = '<h2>References</h2><div class="bibliography">'

    sortedCitations.forEach(([number, metadata]) => {
      const formattedCitation = formatCitation(metadata, selectedCitationStyle)
      bibliographyHtml += `<p class="bibliography-entry">[${number}] ${formattedCitation}</p>`
    })

    bibliographyHtml += '</div>'

    // Insert at the end of the document
    const endPos = editor.state.doc.content.size
    editor.chain().focus().setTextSelection(endPos).insertContent(bibliographyHtml).run()

    setBibliographyModalOpen(false)
    toast.success('Bibliography inserted successfully')
  }, [editor, citationMetadata, selectedCitationStyle, formatCitation])

  const insertScientificSymbol = useCallback((symbol: string) => {
    if (!editor) return
    editor.chain().focus().insertContent(symbol).run()
    setToolbarClusterMenu(null)
  }, [editor])

  const insertSimpleShape = useCallback((variant: SimpleShapeVariant) => {
    if (!editor) return
    const attrs =
      variant === "line"
        ? { variant, width: 220, height: 72 }
        : { variant, width: 220, height: 120 }

    editor.chain().focus().insertContent({ type: "simpleShape", attrs }).run()
    setToolbarClusterMenu(null)
  }, [editor])

  const insertArrowSymbol = useCallback((symbol: string) => {
    if (!editor) return
    editor.chain().focus().insertContent(` ${symbol} `).run()
    setToolbarClusterMenu(null)
  }, [editor])

  // Download functions
  const downloadAsMarkdown = useCallback(() => {
    if (!editor) return
    const text = editor.getText()
    const blob = new Blob([text], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${title}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [editor, title])

  const downloadAsHTML = useCallback(() => {
    if (!editor) return
    const html = editor.getHTML()
    const fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
    }
    h1, h2, h3 { margin-top: 1.5em; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 20px; color: #666; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
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
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
              font-size: 15px;
              line-height: 1.7;
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
              font-family: 'SF Mono', 'Monaco', 'Menlo', 'Consolas', monospace;
              font-size: 0.9em;
              background: #f3f4f6;
              padding: 2px 6px;
              border-radius: 4px;
              color: #dc2626;
            }
            pre {
              font-family: 'SF Mono', 'Monaco', 'Menlo', 'Consolas', monospace;
              font-size: 0.9em;
              background: #1f2937;
              color: #e5e7eb;
              padding: 16px;
              border-radius: 8px;
              margin: 1em 0;
              overflow-x: auto;
              white-space: pre-wrap;
              word-break: break-word;
            }
            pre code { background: none; color: inherit; padding: 0; }
            
            /* Tables - High contrast for PDF */
            table {
              border-collapse: collapse;
              width: 100%;
              margin: 1em 0;
              font-size: 0.95em;
              border: 1px solid #000;
            }
            th, td {
              border: 1px solid #000;
              padding: 10px 14px;
              text-align: left;
              vertical-align: top;
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
        <body>${editor.getHTML()}</body>
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
    const chain = ed.chain().focus().setNodeSelection(pos)
    if (block) {
      chain.updateBlockMath({ latex }).focus().run()
    } else {
      chain.updateInlineMath({ latex }).focus().run()
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
    editor.chain().focus().setImage({ src, alt: imageAltInput.trim() }).run()
    setImageInsertDialogOpen(false)
    setImageUrlInput("")
    setImageAltInput("")
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

  const openCameraCapturePicker = useCallback(() => {
    cameraCaptureInputRef.current?.click()
  }, [])

  const handleImageUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      insertImagesFromFileList(e.target.files)
    }
    e.target.value = ""
  }

  const insertDocxFromFile = async (file: File) => {
    if (!editor || !file.name.toLowerCase().endsWith(".docx")) return
    const arrayBuffer = await file.arrayBuffer()
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer })
    editor.chain().focus().insertContent(html).run()
  }

  const insertSpreadsheetFromFile = async (file: File) => {
    if (!editor) return
    if (!isSpreadsheetFile(file)) return

    const arrayBuffer = await file.arrayBuffer()
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

  const insertPlainTextFromFile = async (file: File) => {
    const text = await file.text()
    editor?.chain().focus().insertContent(text).run()
  }

  const insertMarkdownText = useCallback(async (text: string) => {
    if (!editor) return
    const html = await markdownToHtml(text)
    editor.chain().focus().insertContent(html).run()
  }, [editor])

  const insertMarkdownFromFile = async (file: File) => {
    const text = await file.text()
    await insertMarkdownText(text)
  }

  const insertHtmlFromFile = async (file: File) => {
    const html = await file.text()
    editor?.chain().focus().insertContent(html).run()
  }

  const handleFilePicker = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".docx,.txt,.md,.markdown,.html,.htm,.xls,.xlsx,.csv"
    input.onchange = async () => {
      const file = input.files?.[0]
      if (file) {
        const lower = file.name.toLowerCase()
        if (lower.endsWith(".docx")) {
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

  const currentTextAlign =
    editor.getAttributes("paragraph").textAlign ||
    editor.getAttributes("heading").textAlign ||
    editor.getAttributes("tableCell").textAlign ||
    editor.getAttributes("tableHeader").textAlign ||
    "left"

  const currentVerticalAlign =
    editor.getAttributes("tableCell").verticalAlign ||
    editor.getAttributes("tableHeader").verticalAlign ||
    "top"

  const inTable = editor.isActive("table")
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
    return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-w-0 flex-nowrap items-center gap-x-0.5 [&>*]:shrink-0">
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
              <DropdownMenuLabel className="px-1 py-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
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
              <DropdownMenuLabel className="px-1 py-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
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
              <DropdownMenuLabel className="px-1 py-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
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
                  <div className="flex h-8 items-center border-l border-border px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
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
              <DropdownMenuLabel className="px-1 py-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
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
          <DropdownMenuLabel className="text-xs text-muted-foreground">Shapes</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => insertSimpleShape("rectangle")}>
            <Square className="mr-2 h-4 w-4" />
            Rectangle
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => insertSimpleShape("ellipse")}>
            <Circle className="mr-2 h-4 w-4" />
            Ellipse
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => insertSimpleShape("line")}>
            <ArrowRight className="mr-2 h-4 w-4" />
            Line
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
          <DropdownMenuItem onClick={() => void handleSpreadsheetPicker()}>
            <Sheet className="mr-2 h-4 w-4" />
            Spreadsheet
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleFilePicker}>
            <FileInput className="mr-2 h-4 w-4" />
            Import file…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
          <DropdownMenuItem onClick={() => editor.chain().focus().unsetIndent().run()}>
            <IndentDecrease className="mr-2 h-4 w-4" />
            Decrease indent
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().setIndent().run()}>
            <IndentIncrease className="mr-2 h-4 w-4" />
            Increase indent
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={isListening ? stopSpeechToText : startSpeechToText}
            className={cn("h-8 w-8 rounded-lg p-0 shrink-0", isListening && "bg-accent")}
          >
            {isListening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isListening ? "Stop dictation" : "Start dictation"}</TooltipContent>
      </Tooltip>

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
              if (selectedText) {
                const formatted = formatChemicalFormula(selectedText)
                editor.chain().focus().deleteRange({ from, to }).insertContent(formatted).run()
              }
            }}
          >
            <FlaskConical className="mr-2 h-4 w-4" />
            Chemical formula
          </DropdownMenuItem>
          <DropdownMenuItem onClick={aiStructure} disabled={isAIProcessing}>
            <FlaskConical className="mr-2 h-4 w-4" />
            Structure properly
          </DropdownMenuItem>
          {enableMath && (
            <>
              <DropdownMenuItem
                onClick={() => {
                  const { from, to } = editor.state.selection
                  const selectedText = from !== to ? editor.state.doc.textBetween(from, to, " ") : "x^2"
                  if (from !== to) editor.chain().focus().deleteRange({ from, to }).run()
                  editor.chain().focus().insertInlineMath({ latex: selectedText }).run()
                }}
              >
                <Sigma className="mr-2 h-4 w-4" />
                Inline equation ($…$)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const { from, to } = editor.state.selection
                  const selectedText =
                    from !== to ? editor.state.doc.textBetween(from, to, " ") : "\\sum_{i=1}^{n} x_i"
                  if (from !== to) editor.chain().focus().deleteRange({ from, to }).run()
                  editor.chain().focus().insertBlockMath({ latex: selectedText }).run()
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
              <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-lg px-2 shrink-0" onClick={aiCite} disabled={isCiteProcessing}>
                {isCiteProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Quote className="h-4 w-4" />}
                <span className="text-xs hidden sm:inline">Cite</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Cite with AI</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-lg px-2 shrink-0" onClick={handleGenerateBibliography} disabled={isCiteProcessing}>
                <BookOpen className="h-4 w-4" />
                <span className="text-xs hidden sm:inline">Bibliography</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Generate bibliography</TooltipContent>
          </Tooltip>
          {showAiWritingDropdown && (
            <>
              <Separator orientation="vertical" className="mx-px h-5 shrink-0" />
              <DropdownMenu modal={false} open={toolbarClusterMenu === "ai"} onOpenChange={handleToolbarClusterChange("ai")}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={
                          showAiWritingToolbarLabel
                            ? "h-8 shrink-0 gap-1 rounded-lg px-2"
                            : "h-8 w-8 shrink-0 rounded-lg p-0"
                        }
                        disabled={isAIProcessing}
                        aria-label="AI writing tools"
                      >
                        {isAIProcessing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        {showAiWritingToolbarLabel && (
                          <span className="text-xs hidden sm:inline">AI</span>
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>AI &amp; dictation</TooltipContent>
                </Tooltip>
                <DropdownMenuContent {...dockPopperOpts} className="z-[200] w-56">
                  <DropdownMenuLabel className="flex items-center gap-2 text-xs">
                    <WandSparkles className="h-4 w-4" />
                    Writing
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={aiShorter} disabled={isAIProcessing}>
                    Make shorter
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={aiLonger} disabled={isAIProcessing}>
                    Make longer
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={aiSimplify} disabled={isAIProcessing}>
                    Simplify language
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={aiGrammar} disabled={isAIProcessing}>
                    Fix grammar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </>
      )}
      </div>
    </TooltipProvider>
    )
  }

  return (
    <>
      <div
        className={cn(
          "border border-border rounded-lg bg-background flex min-h-0 flex-col h-full w-full max-w-full overflow-hidden",
          panelEmbed && "rounded-t-none border-t-0",
          className,
        )}
        {...(paperMode ? { "data-paper-mode": "" } : {})}
      >
        {!hideToolbar && editor && (
          <div
            ref={toolbarPositionContainerRef}
            className={cn(
              "shrink-0 border-b border-border/70 bg-background/95 backdrop-blur-sm",
              panelEmbed
                ? "flex h-11 min-h-11 items-center px-2 py-0"
                : "px-3 py-2",
            )}
          >
            <div
              ref={toolbarRailRef}
              className={cn(
                "flex min-h-0 w-full min-w-0 items-center overflow-x-auto [scrollbar-width:thin]",
                panelEmbed && "h-full",
              )}
            >
              {renderToolbarDockChildren()}
            </div>
          </div>
        )}
        <div
          ref={setEditorPopoverBoundaryEl}
          className="flex-1 min-h-0 overflow-hidden relative w-full h-full max-w-full"
          style={
            panelEmbed || fillParentHeight
              ? { minHeight: 0, maxHeight: "100%" }
              : { minHeight, maxHeight: "calc(100vh - 300px)" }
          }
        >
          {/* Editor Content - add right padding to prevent text from going under TOC */}
          <div
            className="overflow-y-auto overflow-x-auto px-2 pb-2 pr-20 h-full min-h-0 relative w-full max-w-full"
            style={
              panelEmbed || fillParentHeight
                ? { minHeight: 0, maxHeight: "100%" }
                : { minHeight, maxHeight: "calc(100vh - 300px)" }
            }
            ref={(node) => setEditorContainer(node)}
          >
            <EditorContent editor={editor} />
            {activeTable && mounted && createPortal(
              <TableControlsOverlay
                table={activeTable}
                editor={editor}
                view={editor.view}
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
                const show = !editor.isActive('comment') && !editor.state.selection.empty;
                return show;
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
                          editor.chain().focus().setComment({ author: "You", content: commentText }).run();
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
                      editor.chain().focus().setComment({ author: "You", content: commentText }).run();
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
                <span className="text-[10px] opacity-70">
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
          .ProseMirror table {
            border-collapse: collapse;
            table-layout: auto;
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
          }
          .ProseMirror table th {
            background: var(--muted);
            color: var(--foreground);
            font-weight: 600;
          }
          .ProseMirror table .column-resize-handle {
            position: absolute;
            right: -2px;
            top: 0;
            bottom: -2px;
            width: 4px;
            background-color: var(--primary);
            pointer-events: none;
            z-index: 20;
          }
          .ProseMirror table .selectedCell {
            background: rgba(59, 130, 246, 0.1);
          }
          
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
          <DialogContent className="max-w-md">
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
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit equation (LaTeX)</DialogTitle>
                <DialogDescription>
                  Edit the raw LaTeX for this equation. Changes apply when you click Apply.
                </DialogDescription>
              </DialogHeader>
              <Textarea
                value={mathEdit?.latex ?? ""}
                onChange={(e) =>
                  setMathEdit((m) => (m ? { ...m, latex: e.target.value } : null))
                }
                className="min-h-[140px] font-mono text-sm"
                placeholder="Enter LaTeX (KaTeX)…"
                autoFocus
              />
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setMathEdit(null)}>
                  Cancel
                </Button>
                <Button type="button" onClick={applyMathEdit}>
                  Apply
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        <Dialog open={imageInsertDialogOpen} onOpenChange={setImageInsertDialogOpen}>
          <DialogContent className="max-w-lg">
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
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Select Citations</DialogTitle>
              <DialogDescription>
                Choose which sources you want to cite. Click on a source to select/deselect it.
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
                        {isSelected && '✓'}
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

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setCitationModalOpen(false)
                  setSelectedPapers(new Set())
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCiteSelected}
                disabled={selectedPapers.size === 0}
              >
                Cite Selected ({selectedPapers.size})
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bibliography Generation Modal */}
        <Dialog open={bibliographyModalOpen} onOpenChange={setBibliographyModalOpen}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Generate Bibliography</DialogTitle>
              <DialogDescription>
                Select citation style and preview your formatted bibliography
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-3 py-2">
              {/* Citation Style Selector - More compact */}
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium whitespace-nowrap">Citation Style:</label>
                <select
                  value={selectedCitationStyle}
                  onChange={(e) => setSelectedCitationStyle(e.target.value as any)}
                  className="flex-1 h-9 px-3 rounded-md border border-border bg-background text-sm"
                >
                  <option value="APA">APA</option>
                  <option value="MLA">MLA</option>
                  <option value="Chicago">Chicago</option>
                  <option value="Harvard">Harvard</option>
                  <option value="IEEE">IEEE</option>
                  <option value="Vancouver">Vancouver</option>
                </select>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {citationMetadata.size} citation{citationMetadata.size !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Preview - More compact */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Preview</label>
                <div className="border rounded-lg p-3 bg-muted/30 max-h-[450px] overflow-y-auto">
                  <h3 className="text-base font-semibold mb-2">References</h3>
                  <div className="space-y-1.5">
                    {Array.from(citationMetadata.entries())
                      .sort((a, b) => a[0] - b[0])
                      .map(([number, metadata]) => (
                        <div key={number} className="text-sm leading-relaxed">
                          <span className="font-medium inline-block min-w-[2rem]">[{number}]</span>
                          <span
                            className="inline"
                            dangerouslySetInnerHTML={{
                              __html: formatCitation(metadata, selectedCitationStyle)
                            }}
                          />
                        </div>
                      ))}
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
  );
}
