"use client"

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CharacterCount from '@tiptap/extension-character-count'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Image } from '@tiptap/extension-image'
import { Link } from '@tiptap/extension-link'
import { Mathematics } from '@tiptap/extension-mathematics'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { useEffect } from 'react'
import { LabNotesToolbar } from './tiptap-toolbar'
import { cn } from '@/lib/utils'
import 'katex/dist/katex.min.css'

const lowlight = createLowlight(common)

interface LabNotesEditorProps {
  initialContent?: any
  onChange?: (json: any, html: string) => void
  className?: string
  editable?: boolean
}

export function LabNotesEditor({
  initialContent,
  onChange,
  className,
  editable = true
}: LabNotesEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
        codeBlock: false, // Disable default code block
      }),
      CodeBlockLowlight.configure({
        lowlight,
        languageClassPrefix: 'language-',
      }),
      Underline,
      Highlight.configure({
        multicolor: true,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right', 'justify'],
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'lab-notes-table',
        },
      }),
      TableRow,
      TableCell,
      TableHeader,
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          class: 'lab-notes-image',
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'lab-notes-link',
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      Mathematics.configure({
        katexOptions: {
          throwOnError: false,
          displayMode: false,
        },
      }),
      Subscript,
      Superscript,
      CharacterCount,
    ],
    content: initialContent,
    editable,
    editorProps: {
      attributes: {
        class: cn(
          'tiptap prose prose-invert max-w-none focus:outline-none min-h-[600px] p-6',
          className
        ),
      },
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON()
      const html = editor.getHTML()
      onChange?.(json, html)
    },
  })

  // Update editor content when initialContent changes
  useEffect(() => {
    if (editor && initialContent && JSON.stringify(editor.getJSON()) !== JSON.stringify(initialContent)) {
      editor.commands.setContent(initialContent)
    }
  }, [editor, initialContent])

  if (!editor) {
    return (
      <div className={cn("border rounded-lg bg-card", className)}>
        <div className="flex items-center justify-center min-h-[600px] text-muted-foreground">
          Loading editor...
        </div>
      </div>
    )
  }

  return (
    <div className={cn("border rounded-lg bg-card overflow-hidden h-full flex flex-col", className)}>
      {editable && <LabNotesToolbar editor={editor} />}
      
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
      
      {editable && (
        <div className="flex justify-between items-center px-4 py-2 text-xs text-muted-foreground border-t bg-muted/30">
          <span>
            {editor.storage.characterCount.characters()} characters
          </span>
          <span>
            {editor.storage.characterCount.words()} words
          </span>
        </div>
      )}
    </div>
  )
}
