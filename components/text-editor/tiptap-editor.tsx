"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import { StarterKit } from "@tiptap/starter-kit"
import { Placeholder } from "@tiptap/extension-placeholder"
import Collaboration from "@tiptap/extension-collaboration"
import { Link } from "@tiptap/extension-link"
import { Image } from "@tiptap/extension-image"
import { Highlight } from "@tiptap/extension-highlight"
import { TextStyle } from "@tiptap/extension-text-style"
import { Color } from "@tiptap/extension-color"
import { TaskList } from "@tiptap/extension-task-list"
import { TaskItem } from "@tiptap/extension-task-item"
import { Table } from "@tiptap/extension-table"
import { TableRow } from "@tiptap/extension-table-row"
import { TableCell } from "@tiptap/extension-table-cell"
import { TableHeader } from "@tiptap/extension-table-header"
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
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Undo,
  Redo,
  Link2,
  Mic,
  Image as ImageIcon,
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
} from "lucide-react"
import { Extension, mergeAttributes } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { cn } from "@/lib/utils"
import { useCallback, useEffect, useRef, useState } from "react"
import type * as Y from "yjs"
// @ts-ignore
import * as mammoth from "mammoth"
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
import { ChemicalFormula, formatChemicalFormula } from "./extensions/chemical-formula"
import { ChemistryHighlight } from "./extensions/chemistry-highlight"
// @ts-ignore - CSS import for KaTeX math rendering
import "katex/dist/katex.min.css"

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
  collaboration?: TiptapCollaborationConfig
}

export interface TiptapCollaborationUser {
  id: string
  name: string
  color: string
}

export interface TiptapCollaborationConfig {
  document: Y.Doc
  provider?: {
    setAwarenessField?: (key: string, value: unknown) => void
  } | null
  user: TiptapCollaborationUser
  field?: string
  isSynced?: boolean
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
  collaboration,
}: TiptapEditorProps & { hideToolbar?: boolean }) {
  const [isAIProcessing, setIsAIProcessing] = useState(false)
  const [aiDropdownOpen, setAiDropdownOpen] = useState(false)
  const [tableMenuOpen, setTableMenuOpen] = useState(false)
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const lastFinalIndexRef = useRef<number>(0)
  const lastInterimTextRef = useRef<string>("")

  // Use ref for protocols so the mention extension always has access to current protocols
  const protocolsRef = useRef<ProtocolItem[]>(protocols)
  const labNotesRef = useRef<LabNoteItem[]>(labNotes)
  const hasHydratedCollaborativeContentRef = useRef(false)
  const isCollaborative = Boolean(collaboration?.document)

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
        undoRedo: isCollaborative ? false : {},
      }),
      ...(collaboration
        ? [
          Collaboration.configure({
            document: collaboration.document,
            field: collaboration.field ?? "default",
          }),
        ]
        : []),
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
    ],
    content: isCollaborative ? undefined : content,
    editable,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm sm:prose lg:prose-lg xl:prose-2xl focus:outline-none p-4",
        spellcheck: "true",
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
  }, [isCollaborative, collaboration?.document, collaboration?.provider, collaboration?.field])

  useEffect(() => {
    if (isCollaborative) return
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content)
    }
  }, [content, editor, isCollaborative])

  useEffect(() => {
    hasHydratedCollaborativeContentRef.current = false
  }, [collaboration?.document])

  useEffect(() => {
    if (!editor || !collaboration || !collaboration.isSynced) return
    if (hasHydratedCollaborativeContentRef.current) return

    const fragment = collaboration.document.getXmlFragment(collaboration.field ?? "default")
    if (fragment.length === 0 && content) {
      editor.commands.setContent(content)
    }

    hasHydratedCollaborativeContentRef.current = true
  }, [editor, collaboration, content])

  useEffect(() => {
    if (!editor || !collaboration) return
    const maybeUpdateUser = (editor.commands as { updateUser?: (user: TiptapCollaborationUser) => boolean }).updateUser

    if (typeof maybeUpdateUser === "function") {
      maybeUpdateUser(collaboration.user)
      return
    }

    // Fallback when the cursor command isn't registered yet.
    collaboration.provider?.setAwarenessField?.("user", collaboration.user)
  }, [
    editor,
    collaboration?.user.id,
    collaboration?.user.name,
    collaboration?.user.color,
    collaboration,
  ])

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
    <div
      className={cn(
        "border border-border rounded-lg bg-card overflow-hidden",
        className
      )}
    >
      {/* Toolbar */}
      {!hideToolbar && (
        <div className="flex items-center gap-1 p-2 border-b border-border flex-wrap bg-muted/30">
          <TooltipProvider delayDuration={300}>
            {/* Undo/Redo */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().undo().run()}
                  disabled={!editor.can().undo()}
                  className="h-8 w-8 p-0"
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
                  className="h-8 w-8 p-0"
                >
                  <Redo className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* Colors */}
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <Palette className="h-4 w-4" />
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
                    "h-8 w-8 p-0",
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
                    "h-8 w-8 p-0",
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
                    "h-8 w-8 p-0",
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
                    "h-8 w-8 p-0",
                    editor.isActive("underline") && "bg-accent"
                  )}
                >
                  <UnderlineIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Underline</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => (editor.chain().focus() as any).toggleSubscript().run()}
                  className={cn(
                    "h-8 w-8 p-0",
                    editor.isActive("subscript") && "bg-accent"
                  )}
                >
                  <SubscriptIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Subscript</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => (editor.chain().focus() as any).toggleSuperscript().run()}
                  className={cn(
                    "h-8 w-8 p-0",
                    editor.isActive("superscript") && "bg-accent"
                  )}
                >
                  <SuperscriptIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Superscript</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleCode().run()}
                  className={cn(
                    "h-8 w-8 p-0",
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
                  onClick={() => editor.chain().focus().toggleHighlight().run()}
                  className={cn(
                    "h-8 w-8 p-0",
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
                    "h-8 w-8 p-0",
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
                  onClick={handleInsertImage}
                  className="h-8 w-8 p-0"
                >
                  <ImageIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Insert Image</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleFilePicker}
                  className="h-8 w-8 p-0"
                >
                  <FileInput className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Import File (.docx, .txt, .md, .html)
              </TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* Headings */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    editor.chain().focus().toggleHeading({ level: 1 }).run()
                  }
                  className={cn(
                    "h-8 w-8 p-0",
                    editor.isActive("heading", { level: 1 }) && "bg-accent"
                  )}
                >
                  <Heading1 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Heading 1</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    editor.chain().focus().toggleHeading({ level: 2 }).run()
                  }
                  className={cn(
                    "h-8 w-8 p-0",
                    editor.isActive("heading", { level: 2 }) && "bg-accent"
                  )}
                >
                  <Heading2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Heading 2</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    editor.chain().focus().toggleHeading({ level: 3 }).run()
                  }
                  className={cn(
                    "h-8 w-8 p-0",
                    editor.isActive("heading", { level: 3 }) && "bg-accent"
                  )}
                >
                  <Heading3 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Heading 3</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* Lists */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    editor.chain().focus().toggleBulletList().run()
                  }
                  className={cn(
                    "h-8 w-8 p-0",
                    editor.isActive("bulletList") && "bg-accent"
                  )}
                >
                  <List className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Bullet List</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    editor.chain().focus().toggleOrderedList().run()
                  }
                  className={cn(
                    "h-8 w-8 p-0",
                    editor.isActive("orderedList") && "bg-accent"
                  )}
                >
                  <ListOrdered className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Numbered List</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleTaskList().run()}
                  className={cn(
                    "h-8 w-8 p-0",
                    editor.isActive("taskList") && "bg-accent"
                  )}
                >
                  <ListChecks className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Task List</TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* Block Elements */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    editor.chain().focus().toggleBlockquote().run();
                    const { from, to } = editor.state.selection;
                    // wrap current line/selection in quotes
                    editor
                      .chain()
                      .focus()
                      .insertContentAt(
                        { from, to },
                        `"${editor.state.doc.textBetween(from, to, " ")}"`
                      )
                      .run();
                  }}
                  className={cn(
                    "h-8 w-8 p-0",
                    editor.isActive("blockquote") && "bg-accent"
                  )}
                >
                  <Quote className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Blockquote</TooltipContent>
            </Tooltip>

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
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
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

            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* Chemistry Tools */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const { from, to } = editor.state.selection;
                    const selectedText = editor.state.doc.textBetween(
                      from,
                      to,
                      " "
                    );
                    if (selectedText) {
                      const formatted = formatChemicalFormula(selectedText);
                      editor
                        .chain()
                        .focus()
                        .deleteRange({ from, to })
                        .insertContent(formatted)
                        .run();
                    }
                  }}
                  className="h-8 w-8 p-0"
                >
                  <FlaskConical className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Format Chemical Formula</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const { from, to } = editor.state.selection
                    if (from === to) {
                      editor.chain().focus().insertContent('$ $').run()
                      editor.chain().focus().setTextSelection(from + 1).run()
                    } else {
                      const text = editor.state.doc.textBetween(from, to, ' ')
                      editor.chain().focus().deleteRange({ from, to }).insertContent(`$${text}$`).run()
                    }
                  }}
                  className="h-8 w-8 p-0"
                >
                  <Sigma className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Insert Equation (Inline: $...$)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const { from, to } = editor.state.selection
                    if (from === to) {
                      editor.chain().focus().insertContent('$$\n\n$$').run()
                      editor.chain().focus().setTextSelection(from + 3).run()
                    } else {
                      const text = editor.state.doc.textBetween(from, to, ' ')
                      editor.chain().focus().deleteRange({ from, to }).insertContent(`$$\n${text}\n$$`).run()
                    }
                  }}
                  className="h-8 w-8 p-0"
                >
                  <div className="relative">
                    <Sigma className="h-4 w-4" />
                    <div className="absolute -bottom-1 -right-1 text-[8px] font-bold">2</div>
                  </div>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Insert Equation (Block: $$...$$)</TooltipContent>
            </Tooltip>

            {/* AI Tools */}
            {showAITools && (
              <>
                <Separator orientation="vertical" className="h-6 mx-1" />

                {/* Speech to text */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isListening ? "secondary" : "ghost"}
                      size="sm"
                      className="h-8 w-8 p-0"
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

      )
      }

      {/* Editor Content */}
      <div
        className="overflow-y-auto"
        style={{ minHeight, maxHeight: "calc(100vh - 300px)" }}
      >
        <EditorContent editor={editor} />
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
        `}</style>
      </div>

      {/* AI Processing Indicator */}
      {
        isAIProcessing && (
          <div className="border-t border-border p-2 bg-muted/50">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>AI is processing your request...</span>
            </div>
          </div>
        )
      }
    </div >
  );
}
