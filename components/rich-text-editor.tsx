"use client"

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Button } from '@/components/ui/button'
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Table as TableIcon,
  Minus,
  Plus
} from 'lucide-react'
import { cn } from '@/lib/utils'
import '@/styles/rich-text-editor.css'

interface RichTextEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = "Enter description...",
  disabled = false,
  className
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editable: !disabled,
    immediatelyRender: false,
  })

  if (!editor) {
    return (
      <div className={cn("border rounded-md p-3 min-h-[120px] bg-muted/10", className)}>
        <div className="text-muted-foreground">Loading editor...</div>
      </div>
    )
  }

  const addTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }

  const deleteTable = () => {
    editor.chain().focus().deleteTable().run()
  }

  const addColumnBefore = () => {
    editor.chain().focus().addColumnBefore().run()
  }

  const deleteColumn = () => {
    editor.chain().focus().deleteColumn().run()
  }

  const addRowBefore = () => {
    editor.chain().focus().addRowBefore().run()
  }

  const deleteRow = () => {
    editor.chain().focus().deleteRow().run()
  }

  const isTableActive = editor.isActive('table')

  return (
    <div className={cn("border rounded-md rich-text-editor", className)}>
      {/* Toolbar */}
      <div className="border-b p-2 flex flex-wrap gap-1">
        {/* Text formatting */}
        <Button
          type="button"
          variant={editor.isActive('bold') ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={disabled}
        >
          <Bold className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant={editor.isActive('italic') ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={disabled}
        >
          <Italic className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Lists */}
        <Button
          type="button"
          variant={editor.isActive('bulletList') ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={disabled}
        >
          <List className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant={editor.isActive('orderedList') ? 'default' : 'ghost'}
          size="sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          disabled={disabled}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Table controls */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addTable}
          disabled={disabled}
          title="Insert Table"
        >
          <TableIcon className="h-4 w-4" />
        </Button>

        {isTableActive && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addColumnBefore}
              disabled={disabled}
              title="Add Column Before"
            >
              <Plus className="h-4 w-4" />
              <span className="text-xs ml-1">Col</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addRowBefore}
              disabled={disabled}
              title="Add Row Before"
            >
              <Plus className="h-4 w-4" />
              <span className="text-xs ml-1">Row</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={deleteColumn}
              disabled={disabled}
              title="Delete Column"
            >
              <Minus className="h-4 w-4" />
              <span className="text-xs ml-1">Col</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={deleteRow}
              disabled={disabled}
              title="Delete Row"
            >
              <Minus className="h-4 w-4" />
              <span className="text-xs ml-1">Row</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={deleteTable}
              disabled={disabled}
              title="Delete Table"
            >
              <Minus className="h-4 w-4" />
              <span className="text-xs ml-1">Table</span>
            </Button>
          </>
        )}
      </div>

      {/* Editor */}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none p-3 min-h-[120px] focus-within:outline-none"
      />
    </div>
  )
}