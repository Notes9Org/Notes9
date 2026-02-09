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

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  ListChecks,
  Undo,
  Redo,
  Link2,
  Mic,
  Highlighter,
  Palette,
  Table as TableIcon,
  FileText,
  FileInput,
  Sparkles,
  WandSparkles,
  Loader2,
  FlaskConical,
  Sigma,
  Underline as UnderlineIcon,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Type,
  Paintbrush,
  MessageSquarePlus,
  IndentDecrease,
  IndentIncrease,
  ChevronDown,
  Trash2,
  X,
} from "lucide-react"
import { Extension, Mark, mergeAttributes } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { cn } from "@/lib/utils"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
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
} from "@/components/ui/dropdown-menu"
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
// @ts-ignore - CSS import for KaTeX math rendering
import "katex/dist/katex.min.css"

interface Paper {
  id: string
  title: string
  authors: string[]
  year: number
  journal: string
  abstract: string
  url: string
  source: string
}

interface CitationMetadata {
  citationNumber: number
  url: string
  title: string
  authors: string[]
  year: number
  journal: string
  source: string
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
  /** When set, the toolbar is rendered into this container (e.g. card header) instead of above the editor. */
  toolbarPortalRef?: React.RefObject<HTMLDivElement | null>
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
})

// Plugin to enable manual pointer-based table resizing (row, column, diagonal)
const TableHandleExtension = Extension.create({
  name: 'tableHandle',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('tableHandle'),
        view: (editorView) => {
          // Drag state
          let dragState: {
            type: 'col' | 'row' | 'both'
            table: HTMLTableElement
            colIndex: number
            rowIndex: number
            startX: number
            startY: number
            startColWidths: number[]
            startRowHeights: number[]
          } | null = null

          // Add resize handles to all tables
          const setupTables = () => {
            const tables = editorView.dom.querySelectorAll('table')
            tables.forEach((table: HTMLTableElement) => {
              if (table.dataset.resizeSetup === 'true') return
              table.dataset.resizeSetup = 'true'
              table.style.position = 'relative'
              table.style.borderCollapse = 'collapse'

              // Add handles to each cell
              addHandlesToTable(table)
            })
          }

          const addHandlesToTable = (table: HTMLTableElement) => {
            const rows = table.querySelectorAll('tr')
            rows.forEach((row, rowIndex) => {
              const cells = row.querySelectorAll('td, th')
              cells.forEach((cellEl, colIndex) => {
                const cell = cellEl as HTMLElement
                cell.style.position = 'relative'

                // Column resize handle (right edge) - similar to Sheets
                const colHandle = document.createElement('div')
                colHandle.className = 'table-col-handle'
                colHandle.style.cssText = `
                  position: absolute;
                  top: 0;
                  right: -4px;
                  width: 8px;
                  height: 100%;
                  cursor: col-resize;
                  z-index: 10;
                  background: transparent;
                  transition: background 0.15s;
                `
                colHandle.addEventListener('pointerenter', () => {
                  colHandle.style.background = 'rgba(59, 130, 246, 0.4)'
                })
                colHandle.addEventListener('pointerleave', () => {
                  colHandle.style.background = 'transparent'
                })
                colHandle.addEventListener('pointerdown', (e) => startDrag('col', table, colIndex, rowIndex, e))
                cell.appendChild(colHandle)

                // Row resize handle (bottom edge) - similar to Sheets
                const rowHandle = document.createElement('div')
                rowHandle.className = 'table-row-handle'
                rowHandle.style.cssText = `
                  position: absolute;
                  bottom: -4px;
                  left: 0;
                  height: 8px;
                  width: 100%;
                  cursor: row-resize;
                  z-index: 10;
                  background: transparent;
                  transition: background 0.15s;
                `
                rowHandle.addEventListener('pointerenter', () => {
                  rowHandle.style.background = 'rgba(59, 130, 246, 0.4)'
                })
                rowHandle.addEventListener('pointerleave', () => {
                  rowHandle.style.background = 'transparent'
                })
                rowHandle.addEventListener('pointerdown', (e) => startDrag('row', table, colIndex, rowIndex, e))
                cell.appendChild(rowHandle)

                // Diagonal handle (bottom-right corner) - only on last cell of each row
                if (colIndex === cells.length - 1) {
                  const diagHandle = document.createElement('div')
                  diagHandle.className = 'table-diag-handle'
                  diagHandle.style.cssText = `
                    position: absolute;
                    right: -4px;
                    bottom: -4px;
                    width: 10px;
                    height: 10px;
                    cursor: nwse-resize;
                    z-index: 20;
                    background: linear-gradient(135deg, transparent 50%, var(--primary, #3b82f6) 50%);
                    border-radius: 0 0 3px 0;
                    opacity: 0.4;
                  `
                  diagHandle.addEventListener('pointerdown', (e) => startDrag('both', table, colIndex, rowIndex, e))
                  diagHandle.addEventListener('pointerenter', () => { diagHandle.style.opacity = '1' })
                  diagHandle.addEventListener('pointerleave', () => { diagHandle.style.opacity = '0.4' })
                  cell.appendChild(diagHandle)
                }
              })
            })
          }

          const getColWidths = (table: HTMLTableElement): number[] => {
            const firstRow = table.querySelector('tr')
            if (!firstRow) return []
            const cells = firstRow.querySelectorAll('td, th')
            return Array.from(cells).map(c => (c as HTMLElement).offsetWidth)
          }

          const getRowHeights = (table: HTMLTableElement): number[] => {
            const rows = table.querySelectorAll('tr')
            return Array.from(rows).map(r => (r as HTMLElement).offsetHeight)
          }

          const startDrag = (
            type: 'col' | 'row' | 'both',
            table: HTMLTableElement,
            colIndex: number,
            rowIndex: number,
            e: PointerEvent
          ) => {
            e.preventDefault()
            e.stopPropagation()
            dragState = {
              type,
              table,
              colIndex,
              rowIndex,
              startX: e.clientX,
              startY: e.clientY,
              startColWidths: getColWidths(table),
              startRowHeights: getRowHeights(table),
            }
            document.body.style.cursor = type === 'col' ? 'col-resize' : type === 'row' ? 'row-resize' : 'nwse-resize'
            document.body.style.userSelect = 'none'
          }

          const onPointerMove = (e: PointerEvent) => {
            if (!dragState) return

            const dx = e.clientX - dragState.startX
            const dy = e.clientY - dragState.startY
            const { table, type, colIndex, rowIndex, startColWidths, startRowHeights } = dragState

            // Update column widths
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

            // Update row heights
            if (type === 'row' || type === 'both') {
              const newHeight = Math.max(24, startRowHeights[rowIndex] + dy)
              const rows = table.querySelectorAll('tr')
              if (rows[rowIndex]) {
                (rows[rowIndex] as HTMLElement).style.height = `${newHeight}px`
              }
            }
          }

          const onPointerUp = () => {
            if (dragState) {
              // Persist the table width to the document
              persistTableSize(dragState.table)
              dragState = null
              document.body.style.cursor = ''
              document.body.style.userSelect = ''
            }
          }

          const persistTableSize = (table: HTMLTableElement) => {
            try {
              const pos = editorView.posAtDOM(table, 0)
              if (pos < 0) return

              const $pos = editorView.state.doc.resolve(pos)
              let tablePos = -1

              for (let d = $pos.depth; d >= 0; d--) {
                const node = $pos.node(d)
                if (node && node.type.name === 'table') {
                  tablePos = $pos.before(d)
                  break
                }
              }

              if (tablePos === -1) {
                const nodeAt = editorView.state.doc.nodeAt(pos)
                if (nodeAt?.type.name === 'table') {
                  tablePos = pos
                }
              }

              if (tablePos >= 0) {
                const tableNode = editorView.state.doc.nodeAt(tablePos)
                if (tableNode) {
                  const width = `${table.offsetWidth}px`
                  const { tr } = editorView.state
                  tr.setNodeMarkup(tablePos, undefined, {
                    ...tableNode.attrs,
                    width: width,
                  })
                  editorView.dispatch(tr)
                }
              }
            } catch (e) {
              console.warn('Failed to persist table size:', e)
            }
          }

          // Global event listeners
          window.addEventListener('pointermove', onPointerMove)
          window.addEventListener('pointerup', onPointerUp)

          // Initial setup
          setTimeout(setupTables, 100)

          return {
            update: () => {
              setTimeout(setupTables, 50)
            },
            destroy: () => {
              window.removeEventListener('pointermove', onPointerMove)
              window.removeEventListener('pointerup', onPointerUp)
            },
          }
        },
      }),
    ]
  },
})

export interface IndentOptions {
  types: string[];
  indentLevels: number[];
  defaultIndentLevel: number;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      setIndent: () => ReturnType;
      unsetIndent: () => ReturnType;
    };
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

  addCommands() {
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

export interface CommentOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      setComment: (attributes: { author: string; content: string; createdAt?: number }) => ReturnType;
      unsetComment: () => ReturnType;
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
        parseHTML: (element: HTMLElement) => element.getAttribute('data-created-at'),
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
        getAttrs: (element) => !!(element as HTMLElement).getAttribute('data-comment') && null,
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
    };
  },
});

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
  toolbarPortalRef,
}: TiptapEditorProps & { hideToolbar?: boolean }) {
  const [isAIProcessing, setIsAIProcessing] = useState(false)
  const [isCiteProcessing, setIsCiteProcessing] = useState(false)
  const [aiDropdownOpen, setAiDropdownOpen] = useState(false)
  const [tableMenuOpen, setTableMenuOpen] = useState(false)
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)
  const [isListening, setIsListening] = useState(false)
  const [citationModalOpen, setCitationModalOpen] = useState(false)
  const [bibliographyModalOpen, setBibliographyModalOpen] = useState(false)
  const [foundPapers, setFoundPapers] = useState<Paper[]>([])
  const [selectedPapers, setSelectedPapers] = useState<Set<number>>(new Set())
  const [citationInsertPosition, setCitationInsertPosition] = useState<number>(0)
  const [citationMetadata, setCitationMetadata] = useState<Map<number, CitationMetadata>>(new Map())
  const [selectedCitationStyle, setSelectedCitationStyle] = useState<'APA' | 'MLA' | 'Chicago' | 'Harvard' | 'IEEE' | 'Vancouver'>('APA')
  const [isCommenting, setIsCommenting] = useState(false)
  const [commentText, setCommentText] = useState("")
  const recognitionRef = useRef<any>(null)
  const lastFinalIndexRef = useRef<number>(0)
  const lastInterimTextRef = useRef<string>("")

  // Use ref for protocols so the mention extension always has access to current protocols
  const protocolsRef = useRef<ProtocolItem[]>(protocols)
  const labNotesRef = useRef<LabNoteItem[]>(labNotes)

  // Keep the refs in sync with props
  useEffect(() => {
    protocolsRef.current = protocols
  }, [protocols])

  useEffect(() => {
    labNotesRef.current = labNotes
  }, [labNotes])



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
      /* Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline cursor-pointer",
        },
      }), */
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
      }),
      TableHandleExtension,
      TableRow,
      TableHeader,
      TableCell,
      Mathematics.configure({}),
      // Underline,
      Subscript,
      Superscript,
      ChemicalFormula,
      ChemistryHighlight,
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
      Indent,
      Comment,
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
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
        const txt = files.find((f) => f.name.toLowerCase().endsWith(".txt") || f.name.toLowerCase().endsWith(".md") || f.name.toLowerCase().endsWith(".markdown"))
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
          const txt = arr.find((f) => f.name.toLowerCase().endsWith(".txt") || f.name.toLowerCase().endsWith(".md") || f.name.toLowerCase().endsWith(".markdown"))
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
    setAiDropdownOpen(false)
  }, [editor, callGeminiAPI])

  const aiContinue = useCallback(async () => {
    if (!editor) return
    const text = editor.getText()
    const continuation = await callGeminiAPI("continue", text)
    editor.chain().focus().insertContent(" " + continuation).run()
    setAiDropdownOpen(false)
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
    setAiDropdownOpen(false)
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
    setAiDropdownOpen(false)
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
    setAiDropdownOpen(false)
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
    setAiDropdownOpen(false)
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
    setAiDropdownOpen(false)
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
      setAiDropdownOpen(false)
      return
    }

    try {
      setIsCiteProcessing(true)

      // Call the literature search API with limit=3
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_AI_SERVICE_URL || 'http://13.221.90.39:8000'}/literature/search?q=${encodeURIComponent(selectedText)}&limit=3`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        }
      )

      if (!response.ok) {
        throw new Error('Literature search failed')
      }

      const data = await response.json()

      if (data.papers && data.papers.length > 0) {
        // Store papers and open modal
        setFoundPapers(data.papers)
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

    setAiDropdownOpen(false)
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
        url: paper?.url || '',
        paperId: paper?.id || '',
        title: paper?.title || '',
        authors: paper?.authors || [],
        year: paper?.year || 0,
        journal: paper?.journal || '',
        source: paper?.source || ''
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
        const citationHtml = `<a href="${newCit.url}" data-paper-id="${newCit.paperId}" data-paper-title="${newCit.title.replace(/"/g, '&quot;')}" data-paper-authors="${authorsJson}" data-paper-year="${newCit.year}" data-paper-journal="${(newCit.journal || '').replace(/"/g, '&quot;')}" data-paper-source="${newCit.source}" target="_blank" rel="noopener noreferrer">[${finalNumber}]</a>`
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
    const citations: { number: number; url: string; paperId: string; title: string; source: string; authors: string[]; year: number; journal: string }[] = []

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
      const paperSourceMatch = fullTag.match(/data-paper-source="([^"]*)"/)
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
          source: paperSourceMatch ? paperSourceMatch[1] : '',
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
        try {
          // If we have stored metadata (title, paperId), try to fetch full details
          if (citation.paperId) {
            const response = await fetch(
              `${process.env.NEXT_PUBLIC_AI_SERVICE_URL || 'http://13.221.90.39:8000'}/literature/search?q=${encodeURIComponent(citation.paperId)}&limit=1`,
              {
                method: 'GET',
                headers: {
                  'Accept': 'application/json',
                },
              }
            )

            if (response.ok) {
              const data = await response.json()
              console.log(`API response for citation ${citation.number}:`, data) // Debug log

              if (data.papers && data.papers.length > 0) {
                const paper = data.papers[0]
                citationMetadataMap.set(citation.number, {
                  citationNumber: citation.number,
                  url: citation.url,
                  title: paper.title || citation.title || 'Unknown Title',
                  authors: paper.authors || citation.authors || [],
                  year: paper.year || citation.year || 0,
                  journal: paper.journal || citation.journal || '',
                  source: paper.source || citation.source || '',
                  paperId: paper.id || citation.paperId
                })
                continue
              }
            }
          }

          // Fallback: use stored data from citation attributes
          citationMetadataMap.set(citation.number, {
            citationNumber: citation.number,
            url: citation.url,
            title: citation.title || 'Unknown Title',
            authors: citation.authors || [],
            year: citation.year || 0,
            journal: citation.journal || '',
            source: citation.source || '',
            paperId: citation.paperId
          })
        } catch (error) {
          console.error(`Failed to fetch metadata for citation ${citation.number}:`, error)
          // Add fallback metadata using stored data
          citationMetadataMap.set(citation.number, {
            citationNumber: citation.number,
            url: citation.url,
            title: citation.title || 'Unknown Title',
            authors: citation.authors || [],
            year: citation.year || 0,
            journal: citation.journal || '',
            source: citation.source || '',
            paperId: citation.paperId
          })
        }
      }

      // Store the fetched metadata and open modal
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

  if (!editor) {
    return null
  }

  const getSelectedTable = () => {
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
    const selTable = getSelectedTable()
    const currentRows = selTable ? selTable.node.childCount : 3
    const currentCols = selTable ? selTable.node.child(0)?.childCount || 3 : 3

    const rows = Math.max(tableRows || currentRows, 1)
    const cols = Math.max(tableCols || currentCols, 1)

    growTable(rows, cols)
    setTableMenuOpen(false)
  }

  const handleSetLink = () => {
    if (!editor) return
    const previousUrl = editor.getAttributes("link").href || ""
    const url = window.prompt("Enter URL", previousUrl)
    if (url === null) return
    if (url === "") {
      editor.chain().focus().unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
  }

  const handleInsertImage = () => {
    if (!editor) return
    const url = window.prompt("Image URL")
    if (!url) return
    const alt = window.prompt("Alt text (optional)") || ""
    editor.chain().focus().setImage({ src: url, alt }).run()
  }

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
  }

  const insertDocxFromFile = async (file: File) => {
    if (!editor || !file.name.toLowerCase().endsWith(".docx")) return
    const arrayBuffer = await file.arrayBuffer()
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer })
    editor.chain().focus().insertContent(html).run()
  }

  const insertPlainTextFromFile = async (file: File) => {
    const text = await file.text()
    editor?.chain().focus().insertContent(text).run()
  }

  const insertHtmlFromFile = async (file: File) => {
    const html = await file.text()
    editor?.chain().focus().insertContent(html).run()
  }

  const handleFilePicker = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".docx,.txt,.md,.markdown,.html,.htm"
    input.onchange = async () => {
      const file = input.files?.[0]
      if (file) {
        const lower = file.name.toLowerCase()
        if (lower.endsWith(".docx")) {
          await insertDocxFromFile(file)
        } else if (lower.endsWith(".html") || lower.endsWith(".htm")) {
          await insertHtmlFromFile(file)
        } else if (lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".txt")) {
          await insertPlainTextFromFile(file)
        }
      }
    }
    input.click()
  }

  const startSpeechToText = () => {
    const SpeechRecognition =
      typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.")
      return
    }

    // Reset tracking variables
    lastFinalIndexRef.current = 0
    lastInterimTextRef.current = ""

    const recognition = new SpeechRecognition()
    recognition.lang = "en-US"
    recognition.interimResults = true
    recognition.continuous = true

    recognition.onresult = (event: any) => {
      if (!editor) return

      let newFinalText = ""
      let latestInterimText = ""

      // Process all results to find new final results and latest interim
      for (let i = 0; i < event.results.length; ++i) {
        const result = event.results[i]
        const transcript = result[0].transcript

        if (result.isFinal) {
          // Only process final results we haven't processed yet
          if (i >= lastFinalIndexRef.current) {
            newFinalText += transcript + " "
            // Update index as we go
            lastFinalIndexRef.current = i + 1
          }
        } else {
          // Track the latest interim result (last one in the array)
          latestInterimText = transcript
        }
      }

      // Insert new final results first (permanent)
      if (newFinalText) {
        // Remove interim text before inserting final
        if (lastInterimTextRef.current) {
          const currentPos = editor.state.selection.anchor
          const interimLength = lastInterimTextRef.current.length
          const deleteFrom = Math.max(0, currentPos - interimLength)
          const deleteTo = currentPos

          if (deleteFrom < deleteTo) {
            editor.chain()
              .focus()
              .setTextSelection({ from: deleteFrom, to: deleteTo })
              .deleteSelection()
              .run()
          }
          lastInterimTextRef.current = ""
        }

        editor.chain().focus().insertContent(newFinalText).run()
      }

      // Update interim text only if it changed (for streaming effect)
      if (latestInterimText && latestInterimText !== lastInterimTextRef.current) {
        // Remove previous interim text if it exists
        if (lastInterimTextRef.current) {
          const currentPos = editor.state.selection.anchor
          const interimLength = lastInterimTextRef.current.length
          const deleteFrom = Math.max(0, currentPos - interimLength)
          const deleteTo = currentPos

          if (deleteFrom < deleteTo) {
            editor.chain()
              .focus()
              .setTextSelection({ from: deleteFrom, to: deleteTo })
              .deleteSelection()
              .run()
          }
        }

        // Insert new interim text
        editor.chain().focus().insertContent(latestInterimText).run()
        lastInterimTextRef.current = latestInterimText
      }
    }

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error)
      setIsListening(false)
      // Clean up interim text on error
      if (lastInterimTextRef.current && editor) {
        const currentPos = editor.state.selection.anchor
        const interimLength = lastInterimTextRef.current.length
        const deleteFrom = Math.max(0, currentPos - interimLength)
        const deleteTo = currentPos

        if (deleteFrom < deleteTo) {
          editor.chain()
            .focus()
            .setTextSelection({ from: deleteFrom, to: deleteTo })
            .deleteSelection()
            .run()
        }
        lastInterimTextRef.current = ""
      }
    }

    recognition.onend = () => {
      setIsListening(false)
      // Clean up any remaining interim text
      if (lastInterimTextRef.current && editor) {
        const currentPos = editor.state.selection.anchor
        const interimLength = lastInterimTextRef.current.length
        const deleteFrom = Math.max(0, currentPos - interimLength)
        const deleteTo = currentPos

        if (deleteFrom < deleteTo) {
          editor.chain()
            .focus()
            .setTextSelection({ from: deleteFrom, to: deleteTo })
            .deleteSelection()
            .run()
        }
        lastInterimTextRef.current = ""
      }
      // Reset for next session
      lastFinalIndexRef.current = 0
    }

    recognition.start()
    recognitionRef.current = recognition
    setIsListening(true)
  }

  const stopSpeechToText = () => {
    recognitionRef.current?.stop()
    setIsListening(false)
    // Clean up interim text when manually stopped
    if (lastInterimTextRef.current && editor) {
      const currentPos = editor.state.selection.anchor
      const interimLength = lastInterimTextRef.current.length
      const deleteFrom = Math.max(0, currentPos - interimLength)
      const deleteTo = currentPos

      if (deleteFrom < deleteTo) {
        editor.chain()
          .focus()
          .setTextSelection({ from: deleteFrom, to: deleteTo })
          .deleteSelection()
          .run()
      }
      lastInterimTextRef.current = ""
    }
    lastFinalIndexRef.current = 0
  }

  const removeTable = () => {
    const selTable = getSelectedTable()
    if (!selTable) {
      setTableMenuOpen(false)
      return
    }
    const { pos, node } = selTable
    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .run()
    setTableMenuOpen(false)
  }

  return (
    <>
      {/* Toolbar - outside the editor card, or portaled to toolbarPortalRef when provided */}
      {!hideToolbar && (() => {
        const toolbar = (
          <div className="box-content flex items-center gap-x-2 gap-y-1.5 p-2 rounded-lg border border-border flex-wrap bg-muted/30 m-2 min-h-9">
            <TooltipProvider delayDuration={300}>
              {/* Undo/Redo */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => editor.chain().focus().undo().run()}
                    disabled={!editor.can().undo()}
                    className="h-8 w-8 p-0 shrink-0"
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
                    className="h-8 w-8 p-0 shrink-0"
                  >
                    <Redo className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Redo</TooltipContent>
              </Tooltip>

              {/* Paragraph styles - Google Docs style */}
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 shrink-0">
                        <Type className="h-4 w-4 shrink-0" />
                        <span className="text-xs max-w-[4rem] truncate">
                          {editor.isActive("heading", { level: 1 }) ? "Heading 1" : editor.isActive("heading", { level: 2 }) ? "Heading 2" : editor.isActive("heading", { level: 3 }) ? "Heading 3" : "Normal text"}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Paragraph style</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem onClick={() => editor.chain().focus().setParagraph().run()}>
                    Normal text
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
                    Heading 1
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
                    Heading 2
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
                    Heading 3
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Separator orientation="vertical" className="h-5 shrink-0 mx-0.5" />

              {/* Font family - Google Docs style */}
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 min-w-[7rem] justify-between shrink-0">
                        <span className="text-xs truncate max-w-[5.5rem]" style={{ fontFamily: editor.getAttributes("textStyle").fontFamily || "inherit" }}>
                          {editor.getAttributes("textStyle").fontFamily || "Default"}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Font</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="w-48 max-h-[16rem] overflow-y-auto">
                  {[
                    { label: "Default", value: "" },
                    { label: "Arial", value: "Arial, sans-serif" },
                    { label: "Times New Roman", value: "'Times New Roman', serif" },
                    { label: "Georgia", value: "Georgia, serif" },
                    { label: "Verdana", value: "Verdana, sans-serif" },
                    { label: "Courier New", value: "'Courier New', monospace" },
                    { label: "Comic Sans MS", value: "'Comic Sans MS', cursive" },
                    { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
                    { label: "Lucida Sans", value: "'Lucida Sans Unicode', sans-serif" },
                  ].map(({ label, value }) => (
                    <DropdownMenuItem
                      key={value || "default"}
                      onClick={() => (value ? editor.chain().focus().setFontFamily(value).run() : editor.chain().focus().unsetFontFamily().run())}
                    >
                      <span style={value ? { fontFamily: value } : undefined}>{label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Font size - Google Docs style: minus, value, plus */}
              <div className="flex items-center gap-0 rounded-md border border-border bg-background overflow-hidden h-8 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-none border-r border-border"
                      onClick={() => {
                        const current = editor.getAttributes("textStyle").fontSize || "16px";
                        const num = Math.max(8, parseInt(current, 10) - 1);
                        editor.chain().focus().setFontSize(`${num}px`).run();
                      }}
                    >
                      <span className="text-sm font-medium">−</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Decrease font size</TooltipContent>
                </Tooltip>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 min-w-[2.25rem] px-2 rounded-none text-xs font-normal hover:bg-muted/50">
                      {(() => {
                        const fs = editor.getAttributes("textStyle").fontSize || "16px";
                        return fs.replace("px", "");
                      })()}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-24">
                    {[8, 9, 10, 11, 12, 14, 16, 18, 24, 36].map((n) => (
                      <DropdownMenuItem
                        key={n}
                        onClick={() => editor.chain().focus().setFontSize(`${n}px`).run()}
                      >
                        {n}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-none border-l border-border"
                      onClick={() => {
                        const current = editor.getAttributes("textStyle").fontSize || "16px";
                        const num = Math.min(96, parseInt(current, 10) + 1);
                        editor.chain().focus().setFontSize(`${num}px`).run();
                      }}
                    >
                      <span className="text-sm font-medium">+</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Increase font size</TooltipContent>
                </Tooltip>
              </div>



              <Separator orientation="vertical" className="h-5 shrink-0 mx-0.5" />

              {/* Text Color */}
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 font-serif text-base font-bold underline decoration-2 underline-offset-1 shrink-0">
                        A
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Text Color</TooltipContent>
                </Tooltip>
                <DropdownMenuContent className="w-40">
                  <DropdownMenuLabel>Colors</DropdownMenuLabel>
                  <div className="grid grid-cols-4 gap-1 p-2">
                    {[
                      "#e53935",
                      "#fb8c00",
                      "#fdd835",
                      "#43a047",
                      "#1e88e5",
                      "#8e24aa",
                      "#ffffff",
                      "#000000",
                    ].map((color) => (
                      <button
                        type="button"
                        key={color}
                        onClick={() =>
                          editor.chain().focus().setColor(color).run()
                        }
                        className="h-6 w-6 rounded border border-border"
                        style={{ backgroundColor: color }}
                        aria-label={`Set color ${color}`}
                      />
                    ))}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => editor.chain().focus().unsetColor().run()}
                  >
                    Clear color
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Text Formatting */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={cn(
                      "h-8 w-8 p-0 shrink-0",
                      editor.isActive("bold") && "bg-accent"
                    )}
                  >
                    <Bold className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Bold</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={cn(
                      "h-8 w-8 p-0 shrink-0",
                      editor.isActive("italic") && "bg-accent"
                    )}
                  >
                    <Italic className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Italic</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    className={cn(
                      "h-8 w-8 p-0 shrink-0",
                      editor.isActive("strike") && "bg-accent"
                    )}
                  >
                    <Strikethrough className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Strikethrough</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    className={cn(
                      "h-8 w-8 p-0 shrink-0",
                      editor.isActive("underline") && "bg-accent"
                    )}
                  >
                    <UnderlineIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Underline</TooltipContent>
              </Tooltip>

              {/* Subscript / Superscript - single dropdown */}
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-8 w-8 p-0 shrink-0",
                          (editor.isActive("subscript") || editor.isActive("superscript")) && "bg-accent"
                        )}
                      >
                        <SubscriptIcon className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Subscript / Superscript</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem
                    onClick={() => (editor.chain().focus() as any).toggleSubscript().run()}
                    className={cn(editor.isActive("subscript") && "bg-accent")}
                  >
                    <SubscriptIcon className="h-4 w-4 mr-2" />
                    Subscript
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => (editor.chain().focus() as any).toggleSuperscript().run()}
                    className={cn(editor.isActive("superscript") && "bg-accent")}
                  >
                    <SuperscriptIcon className="h-4 w-4 mr-2" />
                    Superscript
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => editor.chain().focus().toggleCode().run()}
                    className={cn(
                      "h-8 w-8 p-0 shrink-0",
                      editor.isActive("code") && "bg-accent"
                    )}
                  >
                    <Code className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Inline Code</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => editor.chain().focus().toggleHighlight({ color: 'var(--highlight)' }).run()}
                    className={cn(
                      "h-8 w-8 p-0 shrink-0",
                      editor.isActive("highlight") && "bg-accent"
                    )}
                  >
                    <Highlighter className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Highlight</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSetLink}
                    className={cn(
                      "h-8 w-8 p-0 shrink-0",
                      editor.isActive("link") && "bg-accent"
                    )}
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Insert Link</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-8 w-8 p-0 shrink-0",
                      editor.isActive("comment") && "bg-accent"
                    )}
                    onMouseDown={(e) => {
                      // Prevent focus loss from editor to keep selection
                      e.preventDefault();
                    }}
                    onClick={() => {
                      console.log("Comment button clicked, selection empty:", editor.state.selection.empty);
                      if (editor.isActive('comment')) {
                        editor.chain().focus().unsetComment().run();
                      } else if (editor.state.selection.empty) {
                        toast.error("Please select text to comment on");
                      } else {
                        setIsCommenting(true);
                        editor.chain().focus().run();
                      }
                    }}
                  >
                    <MessageSquarePlus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Insert comment</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleFilePicker}
                    className="h-8 w-8 p-0 shrink-0"
                  >
                    <FileInput className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Import File (.docx, .txt, .md, .html)
                </TooltipContent>
              </Tooltip>

              {/* Checklist */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => editor.chain().focus().toggleTaskList().run()}
                    className={cn(
                      "h-8 w-8 p-0 shrink-0",
                      editor.isActive("taskList") && "bg-accent"
                    )}
                  >
                    <ListChecks className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Checklist</TooltipContent>
              </Tooltip>

              {/* Bullet list & Numbered list - single dropdown */}
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-8 w-8 p-0 shrink-0",
                          (editor.isActive("bulletList") || editor.isActive("orderedList")) && "bg-accent"
                        )}
                      >
                        <List className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>List style</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={cn(editor.isActive("bulletList") && "bg-accent")}
                  >
                    <List className="h-4 w-4 mr-2" />
                    Bullet list
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    className={cn(editor.isActive("orderedList") && "bg-accent")}
                  >
                    <ListOrdered className="h-4 w-4 mr-2" />
                    Numbered list
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Indent - single dropdown */}
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                        <IndentIncrease className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Indent</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem onClick={() => editor.chain().focus().unsetIndent().run()}>
                    <IndentDecrease className="h-4 w-4 mr-2" />
                    Decrease indent
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => editor.chain().focus().setIndent().run()}>
                    <IndentIncrease className="h-4 w-4 mr-2" />
                    Increase indent
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Separator orientation="vertical" className="h-5 shrink-0 mx-0.5" />

              <DropdownMenu
                open={tableMenuOpen}
                onOpenChange={(open) => {
                  setTableMenuOpen(open);
                  if (open) {
                    const selTable = getSelectedTable();
                    const currentRows = selTable ? selTable.node.childCount : 3;
                    const currentCols = selTable
                      ? selTable.node.child(0)?.childCount || 3
                      : 3;
                    setTableRows(currentRows);
                    setTableCols(currentCols);
                  }
                }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                        <TableIcon className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Insert / Resize Table</TooltipContent>
                </Tooltip>
                <DropdownMenuContent side="bottom" align="start" className="w-48">
                  <DropdownMenuLabel className="text-xs">
                    Rows & Columns
                  </DropdownMenuLabel>
                  <div className="grid grid-cols-2 gap-2 px-2 py-2">
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Rows</span>
                      <Input
                        type="number"
                        min={1}
                        value={tableRows}
                        onChange={(e) =>
                          setTableRows(
                            Math.max(parseInt(e.target.value || "1"), 1)
                          )
                        }
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">
                        Columns
                      </span>
                      <Input
                        type="number"
                        min={1}
                        value={tableCols}
                        onChange={(e) =>
                          setTableCols(
                            Math.max(parseInt(e.target.value || "1"), 1)
                          )
                        }
                        className="h-8"
                      />
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleTable}
                    className="justify-center font-medium"
                  >
                    Apply
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={removeTable}
                    className="justify-center text-destructive"
                  >
                    Delete Table
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Separator orientation="vertical" className="h-5 shrink-0 mx-0.5" />

              {/* Chemistry & Equations - single dropdown */}
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                        <Sigma className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Chemistry & Equations</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem
                    onClick={() => {
                      const { from, to } = editor.state.selection;
                      const selectedText = editor.state.doc.textBetween(from, to, " ");
                      if (selectedText) {
                        const formatted = formatChemicalFormula(selectedText);
                        editor.chain().focus().deleteRange({ from, to }).insertContent(formatted).run();
                      }
                    }}
                  >
                    <FlaskConical className="h-4 w-4 mr-2" />
                    Chemical Formula
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const { from, to } = editor.state.selection;
                      if (from === to) {
                        editor.chain().focus().insertContent("$ $").run();
                        editor.chain().focus().setTextSelection(from + 1).run();
                      } else {
                        const text = editor.state.doc.textBetween(from, to, " ");
                        editor.chain().focus().deleteRange({ from, to }).insertContent(`$${text}$`).run();
                      }
                    }}
                  >
                    <Sigma className="h-4 w-4 mr-2" />
                    Inline Equation
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const { from, to } = editor.state.selection;
                      if (from === to) {
                        editor.chain().focus().insertContent("$$\n\n$$").run();
                        editor.chain().focus().setTextSelection(from + 3).run();
                      } else {
                        const text = editor.state.doc.textBetween(from, to, " ");
                        editor.chain().focus().deleteRange({ from, to }).insertContent(`$$\n${text}\n$$`).run();
                      }
                    }}
                  >
                    <Sigma className="h-4 w-4 mr-2" />
                    Equation Block
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* AI Tools */}
              {showAITools && (
                <>
                  <Separator orientation="vertical" className="h-5 shrink-0 mx-0.5" />

                  {/* Speech to text */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isListening ? "secondary" : "ghost"}
                        size="sm"
                        className="h-8 w-8 p-0 shrink-0"
                        onClick={
                          isListening ? stopSpeechToText : startSpeechToText
                        }
                      >
                        <Mic className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isListening ? "Stop dictation" : "Start dictation"}
                    </TooltipContent>
                  </Tooltip>

                  {/* Cite with AI - Standalone Button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2 relative overflow-hidden border-0 bg-background hover:bg-accent/50 transition-colors rainbow-border-button"
                        onClick={aiCite}
                        disabled={isCiteProcessing}
                      >
                        {isCiteProcessing ? (
                          <Loader2 className="h-4 w-4 animate-spin relative z-10" />
                        ) : (
                          <FileText className="h-4 w-4 relative z-10" />
                        )}
                        <span className="text-xs font-medium relative z-10">Cite with AI</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium mb-1">Find and insert citations</p>
                      <p className="text-xs text-muted-foreground">Select text (at least 10 characters) and click to search for relevant citations</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Generate Bibliography Button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2"
                        onClick={handleGenerateBibliography}
                        disabled={isCiteProcessing}
                      >
                        {isCiteProcessing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                        <span className="text-xs font-medium">Bibliography</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Generate formatted bibliography from citations in document</TooltipContent>
                  </Tooltip>

                  <DropdownMenu
                    open={aiDropdownOpen}
                    onOpenChange={setAiDropdownOpen}
                  >
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 px-2"
                        disabled={isAIProcessing}
                      >
                        {isAIProcessing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        <span className="text-xs">AI</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuLabel className="flex items-center gap-2">
                        <WandSparkles className="h-4 w-4" />
                        AI Writing Tools
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={aiImprove}
                        disabled={isAIProcessing}
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        Improve Writing
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={aiContinue}
                        disabled={isAIProcessing}
                      >
                        <WandSparkles className="mr-2 h-4 w-4" />
                        Continue Writing
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={aiShorter}
                        disabled={isAIProcessing}
                      >
                        Make Shorter
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={aiLonger}
                        disabled={isAIProcessing}
                      >
                        Make Longer
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={aiSimplify}
                        disabled={isAIProcessing}
                      >
                        Simplify Language
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={aiGrammar}
                        disabled={isAIProcessing}
                      >
                        Fix Grammar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="flex items-center gap-2">
                        <FlaskConical className="h-4 w-4" />
                        Chemistry Tools
                      </DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={aiStructure}
                        disabled={isAIProcessing}
                      >
                        <FlaskConical className="mr-2 h-4 w-4" />
                        Structure Properly
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </TooltipProvider>

            <div className="flex-1" />


          </div>
        );
        return toolbarPortalRef?.current ? createPortal(toolbar, toolbarPortalRef.current) : toolbar;
      })()}

      <div
        className={cn(
          "border border-border rounded-lg bg-card relative overflow-hidden",
          className
        )}
      >
        {/* Editor Content - add right padding to prevent text from going under TOC */}
        <div
          className="overflow-y-auto px-2 pb-2 pr-20 h-full"
          style={{ minHeight, maxHeight: "calc(100vh - 300px)" }}
        >
          <EditorContent editor={editor} />
        </div>
        {/* TOC positioned absolutely relative to the card, not the scrollable content */}
        {editor && <TableOfContents editor={editor} />}
        {editor && (
          <BubbleMenu
            editor={editor}
            shouldShow={({ editor }) => {
              const show = !editor.isActive('comment') && isCommenting && !editor.state.selection.empty;
              return show;
            }}
            className="z-[200]"
          >
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
          </BubbleMenu>
        )}

        {editor && (
          <BubbleMenu
            editor={editor}
            shouldShow={({ editor }: { editor: any }) => editor.isActive("comment")}
            className="flex flex-col gap-1 rounded-lg border bg-background p-2 shadow-md text-xs w-64 z-50"
          >
            {editor.getAttributes("comment").author && (
              <div className="font-semibold text-muted-foreground flex justify-between items-center">
                <span>{editor.getAttributes("comment").author}</span>
                <span className="text-[10px] opacity-70">
                  {editor.getAttributes("comment").createdAt ? new Date(editor.getAttributes("comment").createdAt).toLocaleDateString() : ""}
                </span>
              </div>
            )}
            <div className="text-foreground">{editor.getAttributes("comment").content}</div>
            <div className="flex justify-end mt-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:bg-destructive/10"
                onClick={() => editor.chain().focus().unsetComment().run()}
                title="Delete comment"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </BubbleMenu>
        )}


        {editor && (
          <BubbleMenu
            editor={editor}
            shouldShow={({ editor }: { editor: any }) => editor.isActive("comment")}
            className="flex flex-col gap-1 rounded-lg border bg-background p-2 shadow-md text-xs w-64 z-50"
          >
            {editor.getAttributes("comment").author && (
              <div className="font-semibold text-muted-foreground flex justify-between items-center">
                <span>{editor.getAttributes("comment").author}</span>
                <span className="text-[10px] opacity-70">
                  {editor.getAttributes("comment").createdAt ? new Date(editor.getAttributes("comment").createdAt).toLocaleDateString() : ""}
                </span>
              </div>
            )}
            <div className="text-foreground">{editor.getAttributes("comment").content}</div>
            <div className="flex justify-end mt-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:bg-destructive/10"
                onClick={() => editor.chain().focus().unsetComment().run()}
                title="Delete comment"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </BubbleMenu>
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
            table-layout: fixed;
            width: auto;
            min-width: 150px;
            max-width: 100%;
            margin: 1rem 0;
            color: var(--foreground);
            background: var(--card);
            border: 1px solid var(--border);
            /* box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.2); */
            position: relative;
          }
          .ProseMirror table td,
          .ProseMirror table th {
            border: 1px solid var(--border);
            padding: 0.35rem 0.5rem;
            vertical-align: top;
            min-width: 1em;
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
          /* Table styles for manual resize handles */
          .ProseMirror table {
            position: relative;
            border-collapse: collapse;
          }
          .ProseMirror table:hover {
            outline: 1px solid rgba(59, 130, 246, 0.2);
          }
          /* Custom cursor SVGs for resize handles */
          .table-col-handle {
            cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2'%3E%3Cpath d='M18 8l4 4-4 4'/%3E%3Cpath d='M6 8l-4 4 4 4'/%3E%3Cline x1='2' y1='12' x2='22' y2='12'/%3E%3C/svg%3E") 12 12, col-resize !important;
          }
          .table-row-handle {
            cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2'%3E%3Cpath d='M8 18l4 4 4-4'/%3E%3Cpath d='M8 6l4-4 4 4'/%3E%3Cline x1='12' y1='2' x2='12' y2='22'/%3E%3C/svg%3E") 12 12, row-resize !important;
          }
          .table-diag-handle {
            cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2'%3E%3Cpath d='M15 3h6v6'/%3E%3Cpath d='M9 21H3v-6'/%3E%3Cline x1='21' y1='3' x2='3' y2='21'/%3E%3C/svg%3E") 12 12, nwse-resize !important;
          }
          /* Highlight handles on hover */
          .table-col-handle:hover {
            background: rgba(59, 130, 246, 0.4) !important;
          }
          .table-row-handle:hover {
            background: rgba(59, 130, 246, 0.4) !important;
          }
          .table-diag-handle:hover {
            opacity: 1 !important;
            background: linear-gradient(135deg, transparent 40%, rgba(59, 130, 246, 0.8) 40%) !important;
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
                      {paper.abstract && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                          {paper.abstract}
                        </p>
                      )}
                      {paper.url && (
                        <a
                          href={paper.url}
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
    </>
  );
}
