"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  X, Send, Sparkles, Loader2, RotateCcw, Check, XIcon, Eye, FileText,
  History, ChevronDown, CornerDownLeft, Trash2, Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MarkdownRenderer } from "@/components/catalyst/markdown-renderer"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { usePaperChatHistory, type PaperChatMessage } from "@/hooks/use-paper-chat-history"
import { ALL_CITATION_STYLES, DEFAULT_CITATION_STYLE, getCitationStyle } from "@/lib/citation-styles"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

// ─── Types ───────────────────────────────────────────────────────────────────

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
  /** Function that returns the current paper HTML content (always fresh) */
  getContent: () => string
  onInsert: (html: string) => void
  paperTitle?: string
  paperId?: string
  getEditorContext?: () => { before: string; after: string }
  embedded?: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractInsertableContent(text: string): { insertable: string; hasMarkers: boolean } {
  const startMarker = "---INSERTABLE_START---"
  const endMarker = "---INSERTABLE_END---"
  const startIdx = text.indexOf(startMarker)
  const endIdx = text.indexOf(endMarker)
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return { insertable: text.slice(startIdx + startMarker.length, endIdx).trim(), hasMarkers: true }
  }
  return { insertable: text, hasMarkers: false }
}

function splitMessageParts(text: string): { type: "commentary" | "insertable"; text: string }[] {
  const startMarker = "---INSERTABLE_START---"
  const endMarker = "---INSERTABLE_END---"
  const startIdx = text.indexOf(startMarker)
  const endIdx = text.indexOf(endMarker)
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
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

/** Strip duplicate section headers that already exist in the paper */
function stripDuplicateHeaders(html: string, paperContent: string): string {
  const existingHeaders = new Set<string>()
  const headerRegex = /<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi
  let m: RegExpExecArray | null
  while ((m = headerRegex.exec(paperContent)) !== null) {
    existingHeaders.add(m[1].trim().toLowerCase())
  }
  return html.replace(/<h([1-3])[^>]*>(.*?)<\/h\1>/gi, (match, level, content) => {
    if (existingHeaders.has(content.trim().toLowerCase())) return ""
    return match
  })
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PaperAIPanel({ open, onClose, getContent, onInsert, paperTitle, paperId, getEditorContext, embedded }: PaperAIPanelProps) {
  const chatHistory = usePaperChatHistory(paperId || "default")
  const [messages, setMessages] = useState<PaperChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [diffPreview, setDiffPreview] = useState<DiffPreview | null>(null)
  const [citationStyleId, setCitationStyleId] = useState(DEFAULT_CITATION_STYLE)
  const [showHistory, setShowHistory] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Load saved citation style
  useEffect(() => {
    const saved = localStorage.getItem("paper-ai-citation-style")
    if (saved) setCitationStyleId(saved)
  }, [])

  // When a session is selected, load its messages
  useEffect(() => {
    if (chatHistory.currentSession) {
      setMessages([...chatHistory.currentSession.messages])
    }
  }, [chatHistory.currentSession])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, diffPreview])

  useEffect(() => {
    if (open && !showHistory) setTimeout(() => textareaRef.current?.focus(), 100)
  }, [open, showHistory])

  const getPlainText = useCallback((html: string) => {
    if (typeof window === "undefined") return html
    const div = document.createElement("div")
    div.innerHTML = html
    return div.textContent || div.innerText || ""
  }, [])

  const sendMessage = useCallback(async (text: string, mode?: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    // Ensure we have a session
    let sessionId = chatHistory.currentSessionId
    if (!sessionId) {
      sessionId = chatHistory.createSession()
    }

    const userMsg: PaperChatMessage = {
      id: crypto.randomUUID(), role: "user", content: trimmed, timestamp: Date.now(),
    }
    setMessages(prev => [...prev, userMsg])
    chatHistory.addMessage(sessionId!, userMsg)
    setInput("")
    setIsLoading(true)

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      // Call getContent() at send time to get the CURRENT paper content
      const plainPaper = getPlainText(getContent())
      const history = messages.map(m => ({ role: m.role, content: m.content }))
      const style = getCitationStyle(citationStyleId)

      const res = await fetch("/api/ai/paper-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: trimmed,
          history,
          paperContent: plainPaper,
          paperTitle: paperTitle || "Untitled",
          sessionId,
          citationStylePrompt: style?.promptInstructions,
          mode: mode || undefined,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }))
        throw new Error(err.error || "AI request failed")
      }

      const data = await res.json()
      const assistantMsg: PaperChatMessage = {
        id: crypto.randomUUID(), role: "assistant",
        content: data.text || "No response received.", timestamp: Date.now(),
      }
      setMessages(prev => [...prev, assistantMsg])
      chatHistory.addMessage(sessionId!, assistantMsg)
    } catch (err: any) {
      toast.error(err.message || "Failed to get AI response")
      setMessages(prev => prev.filter(m => m.id !== userMsg.id))
      setInput(text)
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, messages, getContent, paperTitle, getPlainText, chatHistory, citationStyleId])

  const handleSubmit = useCallback(() => {
    sendMessage(input)
  }, [input, sendMessage])

  const markdownToHtml = useCallback((md: string): string => {
    let html = md
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
    const paragraphs = html.split(/\n\n+/)
    html = paragraphs.map(p => {
      const t = p.trim()
      if (!t) return ""
      if (t.startsWith("### ")) return `<h3>${t.slice(4)}</h3>`
      if (t.startsWith("## ")) return `<h2>${t.slice(3)}</h2>`
      if (t.startsWith("# ")) return `<h1>${t.slice(2)}</h1>`
      if (/^[-*]\s/.test(t)) {
        const items = t.split(/\n/).map(l => `<li>${l.replace(/^[-*]\s+/, "")}</li>`).join("")
        return `<ul>${items}</ul>`
      }
      if (/^\d+\.\s/.test(t)) {
        const items = t.split(/\n/).map(l => `<li>${l.replace(/^\d+\.\s+/, "")}</li>`).join("")
        return `<ol>${items}</ol>`
      }
      return `<p>${t.replace(/\n/g, "<br>")}</p>`
    }).filter(Boolean).join("")
    return html
  }, [])

  const buildDiffLines = useCallback((content: string, beforeCtx: string, afterCtx: string): { lines: DiffLine[]; addCount: number } => {
    const result: DiffLine[] = []
    let lineNum = 1
    if (beforeCtx) {
      const ctxLines = beforeCtx.split("\n").filter(l => l.trim()).slice(-4)
      lineNum = Math.max(1, 100 - ctxLines.length)
      for (const line of ctxLines) result.push({ type: "context", content: line, lineNumber: lineNum++ })
      result.push({ type: "separator", content: "" })
    }
    const newLines = content.split("\n").filter(l => l.trim())
    for (const line of newLines) result.push({ type: "add", content: line, lineNumber: lineNum++ })
    if (afterCtx) {
      result.push({ type: "separator", content: "" })
      const ctxLines = afterCtx.split("\n").filter(l => l.trim()).slice(0, 4)
      for (const line of ctxLines) result.push({ type: "context", content: line, lineNumber: lineNum++ })
    }
    return { lines: result, addCount: newLines.length }
  }, [])

  const handleShowDiff = useCallback((messageId: string, content: string) => {
    const { insertable } = extractInsertableContent(content)
    const html = markdownToHtml(insertable)
    let beforeContext = "", afterContext = ""
    if (getEditorContext) {
      const ctx = getEditorContext()
      beforeContext = ctx.before
      afterContext = ctx.after
    }
    const { lines, addCount } = buildDiffLines(insertable, beforeContext, afterContext)
    setDiffPreview({ messageId, lines, html, addCount })
  }, [markdownToHtml, getEditorContext, buildDiffLines])

  const handleAcceptDiff = useCallback(() => {
    if (!diffPreview) return
    const cleanHtml = stripDuplicateHeaders(diffPreview.html, getContent())
    onInsert(cleanHtml)
    toast.success("Inserted into document")
    setDiffPreview(null)
  }, [diffPreview, onInsert, getContent])

  const handleRejectDiff = useCallback(() => { setDiffPreview(null) }, [])

  const handleRevertToMessage = useCallback((messageId: string) => {
    if (!chatHistory.currentSessionId) return
    chatHistory.revertToMessage(chatHistory.currentSessionId, messageId)
    const msgIdx = messages.findIndex(m => m.id === messageId)
    if (msgIdx !== -1) setMessages(messages.slice(0, msgIdx + 1))
    toast.success("Reverted to this point")
  }, [chatHistory, messages])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  const handleNewChat = useCallback(() => {
    const id = chatHistory.createSession()
    setMessages([])
    setDiffPreview(null)
    setShowHistory(false)
  }, [chatHistory])

  const handleClear = () => { setMessages([]); setInput(""); setDiffPreview(null) }

  if (!open) return null

  const maxLineNum = diffPreview ? Math.max(...diffPreview.lines.filter(l => l.lineNumber).map(l => l.lineNumber!), 0) : 0
  const gutterWidth = Math.max(3, String(maxLineNum).length)
  const currentStyle = getCitationStyle(citationStyleId)

  return (
    <div className={cn("flex flex-col h-full bg-background", embedded ? "w-full min-w-0" : "w-[400px] min-w-[400px] border-l border-border")}>
      {/* Header */}
      <div className="flex h-12 sm:h-14 shrink-0 items-center justify-between border-b border-border/45 px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium">Write with AI</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setShowHistory(!showHistory)} title="Chat history">
            <History className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={handleNewChat} title="New chat">
            <Plus className="size-3.5" />
          </Button>
          {messages.length > 0 && (
            <Button variant="ghost" size="icon" className="size-8" onClick={handleClear} title="Clear">
              <RotateCcw className="size-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="size-8" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* History sidebar */}
      {showHistory ? (
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-2 border-b border-border/50">
            <p className="text-xs font-medium text-muted-foreground">Chat History</p>
          </div>
          {chatHistory.sessions.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">No conversations yet</div>
          ) : (
            <div className="flex flex-col">
              {chatHistory.sessions.map(s => (
                <div
                  key={s.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-accent/50 border-b border-border/30 group",
                    chatHistory.currentSessionId === s.id && "bg-accent"
                  )}
                  onClick={() => { chatHistory.setCurrentSessionId(s.id); setShowHistory(false) }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{s.title}</p>
                    <p className="text-[10px] text-muted-foreground">{s.messages.length} messages · {new Date(s.updatedAt).toLocaleDateString()}</p>
                  </div>
                  <Button
                    variant="ghost" size="icon" className="size-6 opacity-0 group-hover:opacity-100 shrink-0"
                    onClick={(e) => { e.stopPropagation(); chatHistory.deleteSession(s.id) }}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : diffPreview ? (
        /* ─── Diff Preview ─── */
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground truncate">{paperTitle || "Untitled"} — AI suggestion</span>
            <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-green-500/15 text-green-600 dark:text-green-400">+{diffPreview.addCount}</span>
          </div>
          <div className="px-3 py-1.5 bg-blue-500/8 dark:bg-blue-500/10 border-b border-border/50">
            <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400">@@ Insert at cursor position @@</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="font-mono text-[12px] leading-[20px]">
              {diffPreview.lines.map((line, i) => {
                if (line.type === "separator") {
                  return (
                    <div key={`sep-${i}`} className="flex items-center h-[20px] bg-muted/30">
                      <div className="shrink-0 text-right pr-2 text-muted-foreground/30 select-none border-r border-border/50 bg-muted/50" style={{ width: `${gutterWidth + 2}ch` }}>···</div>
                      <div className="flex-1 border-b border-dashed border-border/40" />
                    </div>
                  )
                }
                const isAdd = line.type === "add"
                return (
                  <div key={`line-${i}`} className={cn("flex min-h-[20px]", isAdd ? "bg-green-500/10 dark:bg-green-500/8" : "bg-transparent")}>
                    <div className={cn("shrink-0 text-right pr-2 select-none border-r", isAdd ? "text-green-600/60 border-green-500/20 bg-green-500/15" : "text-muted-foreground/40 border-border/50 bg-muted/30")} style={{ width: `${gutterWidth + 2}ch` }}>{line.lineNumber ?? ""}</div>
                    <div className={cn("w-5 shrink-0 text-center select-none font-medium", isAdd ? "text-green-600 dark:text-green-400" : "text-transparent")}>{isAdd ? "+" : " "}</div>
                    <div className={cn("flex-1 pr-3 whitespace-pre-wrap break-words", isAdd ? "text-green-800 dark:text-green-300" : "text-muted-foreground")}>{line.content || "\u00A0"}</div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border bg-muted/20">
            <Button size="sm" className="flex-1 gap-1.5 h-8" onClick={handleAcceptDiff}><Check className="h-3.5 w-3.5" />Accept</Button>
            <Button size="sm" variant="outline" className="flex-1 gap-1.5 h-8" onClick={handleRejectDiff}><XIcon className="h-3.5 w-3.5" />Discard</Button>
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
                  <p className="text-sm font-semibold">Writing Assistant</p>
                  <p className="text-xs text-muted-foreground mt-1">Write sections, improve text, add citations, or get expert feedback.</p>
                </div>
                <div className="flex flex-col gap-1.5 w-full mt-2">
                  {["Write an abstract for this paper", "Improve the introduction section", "Add citations to the results section", "Suggest a methodology structure"].map(s => (
                    <button key={s} className="text-xs text-left px-3 py-2 rounded-md border border-border hover:bg-accent transition-colors text-foreground/70"
                      onClick={() => { setInput(s); textareaRef.current?.focus() }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-5 px-4 py-4">
                {messages.map((msg, msgIdx) => (
                  <div key={msg.id} className={cn("flex flex-col gap-1.5 group/msg", msg.role === "user" ? "items-end" : "items-start")}>
                    {msg.role === "user" ? (
                      <div className="rounded-xl px-3.5 py-2.5 text-sm max-w-[95%] bg-primary text-primary-foreground">
                        <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                      </div>
                    ) : (
                      <div className="max-w-[95%] flex flex-col gap-3">
                        {splitMessageParts(msg.content).map((part, idx) =>
                          part.type === "insertable" ? (
                            <div key={idx} className="rounded-lg border border-green-500/30 bg-green-500/5 overflow-hidden">
                              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 border-b border-green-500/20">
                                <FileText className="h-3 w-3 text-green-600 dark:text-green-400" />
                                <span className="text-[11px] font-medium text-green-700 dark:text-green-400">Suggested Content</span>
                              </div>
                              <div className="px-3 py-2.5">
                                <MarkdownRenderer content={part.text} className="text-sm leading-relaxed" />
                              </div>
                            </div>
                          ) : (
                            <div key={idx} className="rounded-xl px-3.5 py-2.5 text-sm bg-muted/50">
                              <MarkdownRenderer content={part.text} className="text-sm leading-relaxed" />
                            </div>
                          )
                        )}
                      </div>
                    )}
                    {/* Action buttons for assistant messages */}
                    {msg.role === "assistant" && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {extractInsertableContent(msg.content).hasMarkers && (
                          <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-foreground px-2"
                            onClick={() => handleShowDiff(msg.id, msg.content)}>
                            <Eye className="h-3 w-3" />Review & Insert
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-foreground px-2 opacity-0 group-hover/msg:opacity-100"
                          onClick={() => handleRevertToMessage(msg.id)} title="Revert chat to this point">
                          <CornerDownLeft className="h-3 w-3" />Revert here
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs px-1">
                    <Loader2 className="h-3 w-3 animate-spin" /><span>Writing...</span>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>

          {/* Toolbar + Input */}
          <div className="border-t border-border">
            {/* Action toolbar */}
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/40 overflow-x-auto">
              {/* Citation style picker */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1 px-2 shrink-0">
                    <span className="text-muted-foreground">Cite:</span>
                    <span>{currentStyle?.name || "Vancouver"}</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel className="text-xs">Citation Style</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {ALL_CITATION_STYLES.map(s => (
                    <DropdownMenuItem key={s.id} onClick={() => { setCitationStyleId(s.id); localStorage.setItem("paper-ai-citation-style", s.id) }}>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium">{s.name} <span className="text-muted-foreground font-normal ml-1">{s.inlineExample}</span></span>
                        <span className="text-[10px] text-muted-foreground">{s.description}</span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="w-px h-4 bg-border/60 mx-0.5" />
            </div>

            {/* Text input */}
            <div className="p-3">
              <div className="relative">
                <Textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder="Ask about your paper..." className="min-h-[60px] max-h-[120px] resize-none pr-10 text-sm" disabled={isLoading} />
                <Button size="icon" className="absolute bottom-2 right-2 h-7 w-7 rounded-full" onClick={handleSubmit} disabled={!input.trim() || isLoading}>
                  {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
