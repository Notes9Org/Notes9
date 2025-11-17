"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Bold, Italic, List, ListOrdered, LinkIcon, Code, Heading1, Heading2 } from 'lucide-react'
import { cn } from "@/lib/utils"

interface AffineBlockProps {
  initialContent?: string
  onChange?: (content: string) => void
  placeholder?: string
  className?: string
}

export function AffineBlock({ 
  initialContent = "", 
  onChange,
  placeholder = "Start typing...",
  className 
}: AffineBlockProps) {
  const [content, setContent] = useState(initialContent)
  const editorRef = useRef<HTMLDivElement>(null)

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const newContent = e.currentTarget.innerHTML
    setContent(newContent)
    onChange?.(newContent)
  }

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
  }

  return (
    <div className={cn("border border-border rounded-lg bg-card", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b border-border flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => execCommand("bold")}
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => execCommand("italic")}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => execCommand("formatBlock", "<h1>")}
          title="Heading 1"
        >
          <Heading1 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => execCommand("formatBlock", "<h2>")}
          title="Heading 2"
        >
          <Heading2 className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => execCommand("insertUnorderedList")}
          title="Bullet List"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => execCommand("insertOrderedList")}
          title="Numbered List"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => execCommand("formatBlock", "<pre>")}
          title="Code Block"
        >
          <Code className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => {
            const url = prompt("Enter URL:")
            if (url) execCommand("createLink", url)
          }}
          title="Insert Link"
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
      </div>

      {/* Editor Area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        className="min-h-[200px] p-4 text-foreground focus:outline-none prose prose-invert max-w-none"
        data-placeholder={placeholder}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  )
}
