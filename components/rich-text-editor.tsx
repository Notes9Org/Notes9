"use client"

import React, { useState, useCallback, useEffect } from 'react'
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
  const [tableCols, setTableCols] = useState(3)
  const editorRef = React.useRef<HTMLDivElement>(null)

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

  // Handle table click to show controls
  useEffect(() => {
    if (!editorRef.current) return

    const handleMouseUp = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const table = target.closest('table') as HTMLTableElement
      setSelectedTable(table)
    }

    editorRef.current.addEventListener('mouseup', handleMouseUp)
    return () => {
      editorRef.current?.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // Close table controls when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!editorRef.current?.contains(e.target as Node)) {
        setSelectedTable(null)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

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
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          disabled={disabled}
          title="Insert Table"
        >
          <TableIcon className="h-4 w-4" />
        </Button>

        {editor.isActive('table') && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().addColumnBefore().run()}
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
              onClick={() => editor.chain().focus().addRowBefore().run()}
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
              onClick={() => editor.chain().focus().deleteColumn().run()}
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
              onClick={() => editor.chain().focus().deleteRow().run()}
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
              onClick={() => editor.chain().focus().deleteTable().run()}
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
      <div ref={editorRef} className="relative">
        <EditorContent
          editor={editor}
          className="prose prose-sm max-w-none p-3 min-h-[120px] focus-within:outline-none"
        />
      </div>
    </div>
  )
}