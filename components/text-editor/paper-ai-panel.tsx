"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { X, Send, Sparkles, Loader2, RotateCcw, Check, XIcon, Eye, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MarkdownRenderer } from "@/components/catalyst/markdown-renderer"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
}

interface DiffLine {
  type: "context" | "add" | "separator"
  content: string
  lineNumber?: number
}

interface DiffPreview {
  messageId: string
  lines: DiffLine[]
  html: string
  addCount: number
}

interface PaperAIPanelProps {
  open: boolean
  onClose: () => void
  paperContent: string
  onInsert: (html: string) => void
  paperTitle?: string
  getEditorContext?: () => { before: string; after: string }
  /** When true, fills parent container instead of using fixed width + border */
  embedded?: boolean
}

/** Extract insertable content from AI response using ---INSERTABLE_START/END--- markers */
function extractInsertableContent(text: string): { insertable: string; hasMarkers: boolean } {
  const startMarker = "---INSERTABLE_START---"
  const endMarker = "---INSERTABLE_END---"
  const startIdx = text.indexOf(startMarker)
  const endIdx = text.indexOf(endMarker)

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const extracted = text.slice(startIdx + startMarker.length, endIdx).trim()
    return { insertable: extracted, hasMarkers: true }
  }
  return { insertable: text, hasMarkers: false }
}

/**
 * Split an AI response into parts: commentary vs insertable content.
 * Returns an array of { type, text } segments for rich rendering.
 */
function splitMessageParts(text: string): { type: "commentary" | "insertable"; text: string }[] {
  const startMarker = "---INSERTABLE_START---"
  const endMarker = "---INSERTABLE_END---"
  const startIdx = text.indexOf(startMarker)
  const endIdx = text.indexOf(endMarker)

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    // No markers — everything is one block
    return [{ type: "commentary", text: text.trim() }]
  }

  const parts: { type: "commentary" | "insertable"; text: string }[] = []

  const before = text.slice(0, startIdx).trim()
  if (before) parts.push({ type: "commentary", text: before })

  const insertable = text.slice(startIdx + startMarker.length, endIdx).trim()
  if (insertable) parts.push({ type: "insertable", text: insertable })

  const after = text.slice(endIdx + endMarker.length).trim()
  if (after) parts.push({ type: "commentary", text: after })

  return parts
}

export function PaperAIPanel({ open, onClose, paperContent, onInsert, paperTitle, getEditorContext, embedded }: PaperAIPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [diffPreview, setDiffPreview] = useState<DiffPreview | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef<string>(`paper-${Date.now()}`)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, diffPreview])

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 100)
  }, [open])

  const getPlainText = useCallback((html: string) => {
    if (typeof window === "undefined") return html
    const div = document.createElement("div")
    div.innerHTML = html
    return div.textContent || div.innerText || ""
  }, [])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading) return

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text }
    setMessages(prev => [...prev, userMsg])
    setInput("")
    setIsLoading(true)

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const plainPaper = getPlainText(paperContent)
      const history = messages.map(m => ({ role: m.role, content: m.content }))

      const res = await fetch("/api/ai/paper-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: text,
          history,
          paperContent: plainPaper,
          paperTitle: paperTitle || "Untitled",
          sessionId: sessionIdRef.current,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }))
        throw new Error(err.error || "AI request failed")
      }

      const data = await res.json()
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.text || "No response received.",
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err: any) {
      toast.error(err.message || "Failed to get AI response")
      setMessages(prev => prev.filter(m => m.id !== userMsg.id))
      setInput(text)
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, messages, paperContent, paperTitle, getPlainText])

  const markdownToHtml = useCallback((md: string): string => {
    let html = md
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")

    const paragraphs = html.split(/\n\n+/)
    html = paragraphs
      .map(p => {
        const trimmed = p.trim()
        if (!trimmed) return ""
        if (trimmed.startsWith("### ")) return `<h3>${trimmed.slice(4)}</h3>`
        if (trimmed.startsWith("## ")) return `<h2>${trimmed.slice(3)}</h2>`
        if (trimmed.startsWith("# ")) return `<h1>${trimmed.slice(2)}</h1>`
        if (/^[-*]\s/.test(trimmed)) {
          const items = trimmed.split(/\n/).map(l => `<li>${l.replace(/^[-*]\s+/, "")}</li>`).join("")
          return `<ul>${items}</ul>`
        }
        if (/^\d+\.\s/.test(trimmed)) {
          const items = trimmed.split(/\n/).map(l => `<li>${l.replace(/^\d+\.\s+/, "")}</li>`).join("")
          return `<ol>${items}</ol>`
        }
        return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`
      })
      .filter(Boolean)
      .join("")
    return html
  }, [])

  const getInsertableFromMessage = useCallback((content: string) => {
    const { insertable } = extractInsertableContent(content)
    return insertable
  }, [])

  const buildDiffLines = useCallback((content: string, beforeCtx: string, afterCtx: string): { lines: DiffLine[]; addCount: number } => {
    const result: DiffLine[] = []
    let lineNum = 1

    if (beforeCtx) {
      const ctxLines = beforeCtx.split("\n").filter(l => l.trim()).slice(-4)
      lineNum = Math.max(1, 100 - ctxLines.length)
      for (const line of ctxLines) {
        result.push({ type: "context", content: line, lineNumber: lineNum++ })
      }
      result.push({ type: "separator", content: "" })
    }

    const newLines = content.split("\n").filter(l => l.trim())
    for (const line of newLines) {
      result.push({ type: "add", content: line, lineNumber: lineNum++ })
    }

    if (afterCtx) {
      result.push({ type: "separator", content: "" })
      const ctxLines = afterCtx.split("\n").filter(l => l.trim()).slice(0, 4)
      for (const line of ctxLines) {
        result.push({ type: "context", content: line, lineNumber: lineNum++ })
      }
    }

    return { lines: result, addCount: newLines.length }
  }, [])

  const handleShowDiff = useCallback((messageId: string, content: string) => {
    const insertable = getInsertableFromMessage(content)
    const html = markdownToHtml(insertable)
    let beforeContext = ""
    let afterContext = ""
    if (getEditorContext) {
      const ctx = getEditorContext()
      beforeContext = ctx.before
      afterContext = ctx.after
    }
    const { lines, addCount } = buildDiffLines(insertable, beforeContext, afterContext)
    setDiffPreview({ messageId, lines, html, addCount })
  }, [markdownToHtml, getEditorContext, buildDiffLines, getInsertableFromMessage])

  const handleAcceptDiff = useCallback(() => {
    if (!diffPreview) return
    onInsert(diffPreview.html)
    toast.success("Inserted into document")
    setDiffPreview(null)
  }, [diffPreview, onInsert])

  const handleRejectDiff = useCallback(() => {
    setDiffPreview(null)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleClear = () => {
    setMessages([])
    setInput("")
    setDiffPreview(null)
  }

  if (!open) return null

  const maxLineNum = diffPreview
    ? Math.max(...diffPreview.lines.filter(l => l.lineNumber).map(l => l.lineNumber!), 0)
    : 0
  const gutterWidth = Math.max(3, String(maxLineNum).length)

  return (
    <div className={cn(
      "flex flex-col h-full bg-background",
      embedded ? "w-full min-w-0" : "w-[400px] min-w-[400px] border-l border-border"
    )}>
      {/* Header — match app-layout SidebarInset bar (h-12 sm:h-14) */}
      <div className="flex h-12 sm:h-14 shrink-0 items-center justify-between border-b border-border/45 bg-[var(--n9-header-bg)] px-3 sm:px-4 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium">Write with AI</span>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 sm:size-9 text-muted-foreground hover:text-foreground"
              onClick={handleClear}
              title="Clear chat"
            >
              <RotateCcw className="size-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="size-8 sm:size-9 text-muted-foreground hover:text-foreground" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Diff Preview — IDE-style */}
      {diffPreview ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground truncate">
              {paperTitle || "Untitled"} — AI suggestion
            </span>
            <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-green-500/15 text-green-600 dark:text-green-400">
              +{diffPreview.addCount}
            </span>
          </div>

          <div className="px-3 py-1.5 bg-blue-500/8 dark:bg-blue-500/10 border-b border-border/50">
            <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400">
              @@ Insert at cursor position @@
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="font-mono text-[12px] leading-[20px]">
              {diffPreview.lines.map((line, i) => {
                if (line.type === "separator") {
                  return (
                    <div key={`sep-${i}`} className="flex items-center h-[20px] bg-muted/30">
                      <div
                        className="shrink-0 text-right pr-2 text-muted-foreground/30 select-none border-r border-border/50 bg-muted/50"
                        style={{ width: `${gutterWidth + 2}ch` }}
                      >
                        ···
                      </div>
                      <div className="flex-1 border-b border-dashed border-border/40" />
                    </div>
                  )
                }
                const isAdd = line.type === "add"
                return (
                  <div
                    key={`line-${i}`}
                    className={cn(
                      "flex min-h-[20px] group",
                      isAdd ? "bg-green-500/10 dark:bg-green-500/8" : "bg-transparent"
                    )}
                  >
                    <div
                      className={cn(
                        "shrink-0 text-right pr-2 select-none border-r",
                        isAdd
                          ? "text-green-600/60 dark:text-green-400/50 border-green-500/20 bg-green-500/15"
                          : "text-muted-foreground/40 border-border/50 bg-muted/30"
                      )}
                      style={{ width: `${gutterWidth + 2}ch` }}
                    >
                      {line.lineNumber ?? ""}
                    </div>
                    <div
                      className={cn(
                        "w-5 shrink-0 text-center select-none font-medium",
                        isAdd ? "text-green-600 dark:text-green-400" : "text-transparent"
                      )}
                    >
                      {isAdd ? "+" : " "}
                    </div>
                    <div
                      className={cn(
                        "flex-1 pr-3 whitespace-pre-wrap break-words",
                        isAdd ? "text-green-800 dark:text-green-300" : "text-muted-foreground"
                      )}
                    >
                      {line.content || "\u00A0"}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border bg-muted/20">
            <Button size="sm" className="flex-1 gap-1.5 h-8" onClick={handleAcceptDiff}>
              <Check className="h-3.5 w-3.5" />
              Accept
            </Button>
            <Button size="sm" variant="outline" className="flex-1 gap-1.5 h-8" onClick={handleRejectDiff}>
              <XIcon className="h-3.5 w-3.5" />
              Discard
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
                <Sparkles className="h-8 w-8 text-primary/50" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Writing Assistant</p>
                  <p className="text-xs text-foreground/60 mt-1">
                    Ask me to write sections, improve text, suggest citations, or help structure your paper.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 w-full mt-2">
                  {["Write an abstract for this paper", "Improve the introduction section", "Suggest a methodology structure", "Help me write the discussion"].map((suggestion) => (
                    <button
                      key={suggestion}
                      className="text-xs text-left px-3 py-2 rounded-md border border-border hover:bg-accent transition-colors text-foreground/70"
                      onClick={() => { setInput(suggestion); textareaRef.current?.focus() }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-5 px-4 py-4">
                {messages.map((msg) => (
                  <div key={msg.id} className={cn("flex flex-col gap-1.5", msg.role === "user" ? "items-end" : "items-start")}>
                    {msg.role === "user" ? (
                      <div className="rounded-xl px-3.5 py-2.5 text-sm max-w-[95%] bg-primary text-primary-foreground">
                        <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                      </div>
                    ) : (
                      <div className="max-w-[95%] flex flex-col gap-3">
                        {splitMessageParts(msg.content).map((part, idx) =>
                          part.type === "insertable" ? (
                            /* Insertable content — visually distinct card */
                            <div key={idx} className="rounded-lg border border-green-500/30 bg-green-500/5 dark:bg-green-500/8 overflow-hidden">
                              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 border-b border-green-500/20">
                                <FileText className="h-3 w-3 text-green-600 dark:text-green-400" />
                                <span className="text-[11px] font-medium text-green-700 dark:text-green-400">Suggested Content</span>
                              </div>
                              <div className="px-3 py-2.5">
                                <MarkdownRenderer content={part.text} className="text-sm leading-relaxed" />
                              </div>
                            </div>
                          ) : (
                            /* Commentary — normal bubble style */
                            <div key={idx} className="rounded-xl px-3.5 py-2.5 text-sm bg-muted/50">
                              <MarkdownRenderer content={part.text} className="text-sm leading-relaxed" />
                            </div>
                          )
                        )}
                      </div>
                    )}
                    {msg.role === "assistant" && extractInsertableContent(msg.content).hasMarkers && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                        onClick={() => handleShowDiff(msg.id, msg.content)}
                      >
                        <Eye className="h-3 w-3" />
                        Review & Insert
                      </Button>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs px-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Writing...</span>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-border p-3">
            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your paper..."
                className="min-h-[60px] max-h-[120px] resize-none pr-10 text-sm"
                disabled={isLoading}
              />
              <Button
                size="icon"
                className="absolute bottom-2 right-2 h-7 w-7 rounded-full"
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
              >
                {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
