"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import Link from "@tiptap/extension-link"
import Image from "@tiptap/extension-image"
import Highlight from "@tiptap/extension-highlight"
import TextStyle from "@tiptap/extension-text-style"
import Color from "@tiptap/extension-color"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import Table from "@tiptap/extension-table"
import TableRow from "@tiptap/extension-table-row"
import TableCell from "@tiptap/extension-table-cell"
import TableHeader from "@tiptap/extension-table-header"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
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
  Image as ImageIcon,
  Highlighter,
  Table as TableIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Sparkles,
  WandSparkles,
  Download,
  FileText,
  FileCode,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useCallback, useEffect } from "react"
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

interface TiptapEditorProps {
  content?: string
  onChange?: (content: string) => void
  placeholder?: string
  className?: string
  editable?: boolean
  minHeight?: string
  showAITools?: boolean
  title?: string
}

export function TiptapEditor({
  content = "",
  onChange,
  placeholder = "Start typing...",
  className,
  editable = true,
  minHeight = "400px",
  showAITools = true,
  title = "document",
}: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline cursor-pointer",
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: "rounded-lg max-w-full h-auto",
        },
      }),
      Highlight.configure({
        multicolor: true,
      }),
      TextStyle,
      Color,
      TaskList.configure({
        HTMLAttributes: {
          class: "not-prose",
        },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: "flex items-start gap-2",
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: "border-collapse table-auto w-full",
        },
      }),
      TableRow.configure({
        HTMLAttributes: {
          class: "border border-border",
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          class: "border border-border p-2",
        },
      }),
      TableHeader.configure({
        HTMLAttributes: {
          class: "border border-border p-2 bg-muted font-semibold",
        },
      }),
    ],
    content,
    editable,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none px-4 py-3",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onChange?.(html)
    },
  })

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content)
    }
  }, [content, editor])

  const setLink = useCallback(() => {
    if (!editor) return
    const previousUrl = editor.getAttributes("link").href
    const url = window.prompt("URL", previousUrl)

    if (url === null) return
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
  }, [editor])

  const addImage = useCallback(() => {
    if (!editor) return
    const url = window.prompt("Image URL")
    if (url) {
      editor.chain().focus().setImage({ src: url }).run()
    }
  }, [editor])

  const addTable = useCallback(() => {
    if (!editor) return
    editor
      .chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run()
  }, [editor])

  const aiImprove = useCallback(() => {
    if (!editor) return
    const { from, to } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to, " ")
    
    if (selectedText) {
      console.log("AI Improve text:", selectedText)
      // Simulate AI improvement with better text
      const improved = `${selectedText} (✨ AI-enhanced with better clarity and style)`
      editor.chain().focus().deleteRange({ from, to }).insertContent(improved).run()
    } else {
      // If no selection, show a message
      editor.chain().focus().insertContent("✨ Please select some text to improve").run()
    }
  }, [editor])

  const aiComplete = useCallback(() => {
    if (!editor) return
    console.log("AI Complete from cursor position")
    const demoText = " This is AI-generated continuation text. In production, this would call an actual AI API like OpenAI to continue your writing based on context."
    editor.chain().focus().insertContent(demoText).run()
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
      // Dynamic import to avoid SSR issues
      const jsPDF = (await import('jspdf')).default
      const html2canvas = (await import('html2canvas')).default
      
      // Create a temporary div with the content
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = editor.getHTML()
      tempDiv.style.cssText = `
        position: absolute;
        left: -9999px;
        width: 800px;
        padding: 40px;
        font-family: system-ui, -apple-system, sans-serif;
        line-height: 1.6;
        color: #000;
        background: #fff;
      `
      document.body.appendChild(tempDiv)

      // Convert to canvas
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        logging: false,
      })

      // Remove temp div
      document.body.removeChild(tempDiv)

      // Create PDF
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      const imgWidth = 210 // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)
      pdf.save(`${title}.pdf`)
    } catch (error) {
      console.error('PDF export error:', error)
      alert('Failed to export PDF. Please try another format.')
    }
  }, [editor, title])

  const downloadAsDOCX = useCallback(async () => {
    if (!editor) return
    try {
      // Dynamic import to avoid SSR issues
      const htmlDocx = await import('html-docx-js/dist/html-docx')
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>${title}</title>
        </head>
        <body>
          <h1>${title}</h1>
          ${editor.getHTML()}
        </body>
        </html>
      `
      
      const converted = htmlDocx.asBlob(html)
      const url = URL.createObjectURL(converted)
      const a = document.createElement('a')
      a.href = url
      a.download = `${title}.docx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('DOCX export error:', error)
      alert('Failed to export DOCX. Please try another format.')
    }
  }, [editor, title])

  if (!editor) {
    return null
  }

  return (
    <div
      className={cn(
        "border border-border rounded-lg bg-card overflow-hidden",
        className
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b border-border flex-wrap bg-muted/30">
        <TooltipProvider delayDuration={300}>
          {/* Undo/Redo */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().undo()}
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
                className="h-8 w-8 p-0"
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().redo()}
              >
                <Redo className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Text Formatting */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 w-8 p-0",
                  editor.isActive("bold") && "bg-accent"
                )}
                onClick={() => editor.chain().focus().toggleBold().run()}
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
                className={cn(
                  "h-8 w-8 p-0",
                  editor.isActive("italic") && "bg-accent"
                )}
                onClick={() => editor.chain().focus().toggleItalic().run()}
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
                className={cn(
                  "h-8 w-8 p-0",
                  editor.isActive("strike") && "bg-accent"
                )}
                onClick={() => editor.chain().focus().toggleStrike().run()}
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
                className={cn(
                  "h-8 w-8 p-0",
                  editor.isActive("code") && "bg-accent"
                )}
                onClick={() => editor.chain().focus().toggleCode().run()}
              >
                <Code className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Inline Code</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Headings */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 w-8 p-0",
                  editor.isActive("heading", { level: 1 }) && "bg-accent"
                )}
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 1 }).run()
                }
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
                className={cn(
                  "h-8 w-8 p-0",
                  editor.isActive("heading", { level: 2 }) && "bg-accent"
                )}
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 2 }).run()
                }
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
                className={cn(
                  "h-8 w-8 p-0",
                  editor.isActive("heading", { level: 3 }) && "bg-accent"
                )}
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 3 }).run()
                }
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
                className={cn(
                  "h-8 w-8 p-0",
                  editor.isActive("bulletList") && "bg-accent"
                )}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
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
                className={cn(
                  "h-8 w-8 p-0",
                  editor.isActive("orderedList") && "bg-accent"
                )}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
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
                className={cn(
                  "h-8 w-8 p-0",
                  editor.isActive("taskList") && "bg-accent"
                )}
                onClick={() => editor.chain().focus().toggleTaskList().run()}
              >
                <ListChecks className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Task List</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Additional Formatting */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 w-8 p-0",
                  editor.isActive("blockquote") && "bg-accent"
                )}
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
              >
                <Quote className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Quote</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 w-8 p-0",
                  editor.isActive("highlight") && "bg-accent"
                )}
                onClick={() => editor.chain().focus().toggleHighlight().run()}
              >
                <Highlighter className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Highlight</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Insert Elements */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={setLink}
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
                className="h-8 w-8 p-0"
                onClick={addImage}
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
                className="h-8 w-8 p-0"
                onClick={addTable}
              >
                <TableIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Insert Table</TooltipContent>
          </Tooltip>

          {/* AI Tools */}
          {showAITools && (
            <>
              <Separator orientation="vertical" className="h-6 mx-1" />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 gap-1 text-primary"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span className="text-xs font-medium">AI</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={aiImprove}>
                    <WandSparkles className="h-4 w-4 mr-2" />
                    Improve Writing
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={aiComplete}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Continue Writing
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const { from, to } = editor.state.selection
                      const text = editor.state.doc.textBetween(from, to, " ")
                      if (text) {
                        console.log("Make it shorter:", text)
                        const shortened = text.substring(0, Math.floor(text.length / 2)) + "... (📉 AI-shortened)"
                        editor.chain().focus().deleteRange({ from, to }).insertContent(shortened).run()
                      } else {
                        editor.chain().focus().insertContent("📉 Please select text to shorten").run()
                      }
                    }}
                  >
                    Make Shorter
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const { from, to } = editor.state.selection
                      const text = editor.state.doc.textBetween(from, to, " ")
                      if (text) {
                        console.log("Make it longer:", text)
                        const expanded = `${text} (📈 AI-expanded with additional context, details, and explanations)`
                        editor.chain().focus().deleteRange({ from, to }).insertContent(expanded).run()
                      } else {
                        editor.chain().focus().insertContent("📈 Please select text to expand").run()
                      }
                    }}
                  >
                    Make Longer
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const { from, to } = editor.state.selection
                      const text = editor.state.doc.textBetween(from, to, " ")
                      if (text) {
                        console.log("Simplify:", text)
                        const simplified = `${text} (🔤 AI-simplified to use simpler language)`
                        editor.chain().focus().deleteRange({ from, to }).insertContent(simplified).run()
                      } else {
                        editor.chain().focus().insertContent("🔤 Please select text to simplify").run()
                      }
                    }}
                  >
                    Simplify Language
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const { from, to } = editor.state.selection
                      const text = editor.state.doc.textBetween(from, to, " ")
                      if (text) {
                        console.log("Fix grammar:", text)
                        const fixed = `${text} (✅ AI-corrected for grammar and spelling)`
                        editor.chain().focus().deleteRange({ from, to }).insertContent(fixed).run()
                      } else {
                        editor.chain().focus().insertContent("✅ Please select text to fix").run()
                      }
                    }}
                  >
                    Fix Grammar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </TooltipProvider>
      </div>

      {/* Editor Content */}
      <div style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

