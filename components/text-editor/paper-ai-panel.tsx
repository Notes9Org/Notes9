"use client"

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react"
import {
  X,
  Loader2,
  Check,
  XIcon,
  Eye,
  FileText,
  History,
  ChevronDown,
  CornerDownLeft,
  Trash2,
  Plus,
  ArrowUp,
  Sparkles,
  MessageSquare,
  BookOpen,
  NotebookPen,
  Minimize2,
  Maximize2,
  RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MarkdownRenderer } from "@/components/catalyst/markdown-renderer"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { usePaperChatHistory, type PaperChatMessage } from "@/hooks/use-paper-chat-history"
import {
  CITATION_STYLE_OPTIONS,
  DEFAULT_CITATION_STYLE as DEFAULT_TIPTAP_CITATION_STYLE,
} from "@/components/text-editor/citation-utils"
import {
  readPaperCitationStyle,
  writePaperCitationStyle,
  getPaperAiCitationPrompt,
  PAPER_CITATION_STYLE_EVENT,
  PAPER_CITATION_STYLE_STORAGE_KEY,
  isValidTiptapCitationStyle,
} from "@/components/text-editor/paper-citation-style-sync"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Notes9LoaderGif } from "@/components/brand/notes9-loader-gif"
import { ClipboardInfoIcon } from "@/components/ui/clipboard-info-icon"
import type { CatalystAgentMode } from "@/lib/catalyst-agent-types"

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
  /** Switch to main Catalyst sidebar with another agent (Writing panel hides until user picks Writing again). */
  onSwitchToCatalystAgent?: (mode: CatalystAgentMode) => void
  isExpanded?: boolean
  onToggleExpand?: () => void
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

export function PaperAIPanel({
  open,
  onClose,
  getContent,
  onInsert,
  paperTitle,
  paperId,
  getEditorContext,
  embedded,
  onSwitchToCatalystAgent,
  isExpanded,
  onToggleExpand,
}: PaperAIPanelProps) {
  const chatHistory = usePaperChatHistory(paperId || "default")
  const [messages, setMessages] = useState<PaperChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [diffPreview, setDiffPreview] = useState<DiffPreview | null>(null)
  const [citationStyleTiptap, setCitationStyleTiptap] = useState(
    () => readPaperCitationStyle() ?? DEFAULT_TIPTAP_CITATION_STYLE
  )
  const [showHistory, setShowHistory] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  /** Stay aligned with TipTap toolbar + other tabs (storage + event). */
  useEffect(() => {
    const handler = (e: Event) => {
      const v = (e as CustomEvent<string>).detail
      if (v && isValidTiptapCitationStyle(v)) setCitationStyleTiptap(v)
    }
    window.addEventListener(PAPER_CITATION_STYLE_EVENT, handler)
    return () => window.removeEventListener(PAPER_CITATION_STYLE_EVENT, handler)
  }, [])

  /** Same tick as open — pick up toolbar changes before paint. */
  useLayoutEffect(() => {
    if (!open) return
    const s = readPaperCitationStyle()
    if (s && isValidTiptapCitationStyle(s)) setCitationStyleTiptap(s)
  }, [open])

  /** Other browser tabs updating localStorage */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== PAPER_CITATION_STYLE_STORAGE_KEY || e.newValue == null) return
      if (isValidTiptapCitationStyle(e.newValue)) setCitationStyleTiptap(e.newValue)
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  // When a session is selected, load its messages
  useEffect(() => {
    if (chatHistory.currentSession) {
      setMessages([...chatHistory.currentSession.messages])
    }
  }, [chatHistory.currentSession])

  /** Scroll only the chat list — avoid scrollIntoView (scrolls ancestors / breaks under TipTap fullscreen). */
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
      })
    })
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
      const citationStylePrompt = getPaperAiCitationPrompt(citationStyleTiptap)

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
          citationStylePrompt,
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
  }, [isLoading, messages, getContent, paperTitle, getPlainText, chatHistory, citationStyleTiptap])

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
  const currentCitationLabel =
    CITATION_STYLE_OPTIONS.find((o) => o.value === citationStyleTiptap)?.label ?? citationStyleTiptap

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-background",
        embedded ? "min-w-0 w-full flex-1" : "w-[400px] min-w-[400px] border-l border-border"
      )}
    >
      {/* Header — aligned with main Catalyst sidebar */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/40 bg-[color:var(--n9-header-bg)]/80 px-2 backdrop-blur-md sm:h-14 sm:px-4">
        <div className="flex min-w-0 items-center gap-1 overflow-hidden">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground sm:size-9"
            onClick={() => setShowHistory(!showHistory)}
            aria-label="Chat history"
            title="Chat history"
          >
            <History className="size-4" />
          </Button>
          <Button
            variant="secondary"
            className="h-8 shrink-0 text-muted-foreground sm:h-9"
            onClick={handleNewChat}
            aria-label="New chat"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">New Chat</span>
          </Button>
          {messages.length > 0 ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground sm:size-9"
              onClick={handleClear}
              title="Clear conversation"
              aria-label="Clear conversation"
            >
              <RotateCcw className="size-3.5" />
            </Button>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1">
          {onToggleExpand ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground sm:size-9"
              onClick={onToggleExpand}
              aria-label={isExpanded ? "Exit full screen" : "Expand chat"}
            >
              {isExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground sm:size-9"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>

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
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="relative mb-1">
                  <Notes9LoaderGif alt="Catalyst AI" widthPx={64} className="!translate-y-0" />
                </div>
                <h2 className="text-xl font-bold tracking-tight text-transparent bg-gradient-to-r from-orange-500 to-pink-600 bg-clip-text">
                  Catalyst AI
                </h2>
                <h3 className="text-lg font-semibold tracking-tight text-transparent bg-gradient-to-r from-orange-500 to-pink-600 bg-clip-text">
                  For Writing
                </h3>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Write sections, improve text, add citations, or get expert feedback on your draft.
                </p>
                <div className="mt-2 flex w-full flex-col gap-1.5">
                  {[
                    "Write an abstract for this paper",
                    "Improve the introduction section",
                    "Add citations to the results section",
                    "Suggest a methodology structure",
                  ].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="rounded-md border border-border px-3 py-2 text-left text-xs text-foreground/70 transition-colors hover:bg-accent"
                      onClick={() => {
                        setInput(s)
                        textareaRef.current?.focus()
                      }}
                    >
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
              </div>
            )}
          </div>

          {/* Composer — Cursor-style card + agent row (matches main Catalyst sidebar) */}
          <div className="flex-shrink-0 border-t border-border bg-background/95 p-4 backdrop-blur">
            <div className="mx-auto min-w-0 max-w-3xl">
              <div
                className={cn(
                  "rounded-xl border bg-card/50 shadow-sm transition-all focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50",
                  "overflow-hidden"
                )}
              >
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your paper…"
                  className="min-h-[68px] max-h-[200px] w-full resize-none border-0 bg-transparent px-4 py-2.5 text-sm shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
                  disabled={isLoading}
                />
                <div className="mt-1 flex min-h-9 items-center justify-between gap-2 px-2 pb-2">
                  <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto">
                    {onSwitchToCatalystAgent ? (
                      <>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              id="tour-paper-ai-mode"
                              variant="ghost"
                              size="sm"
                              className="h-7 shrink-0 gap-1.5 rounded-md bg-muted/50 px-2 text-xs font-medium text-muted-foreground hover:bg-muted"
                            >
                              <Sparkles className="size-3.5" />
                              Writing
                              <ChevronDown className="size-3 opacity-50" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-[200px]">
                            <DropdownMenuItem
                              onClick={() => onSwitchToCatalystAgent("protocol")}
                              className="gap-2 text-xs"
                            >
                              <ClipboardInfoIcon className="size-3.5" /> Protocol
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onSwitchToCatalystAgent("literature")}
                              className="gap-2 text-xs"
                            >
                              <BookOpen className="size-3.5" /> Literature
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onSwitchToCatalystAgent("general")}
                              className="gap-2 text-xs"
                            >
                              <MessageSquare className="size-3.5" /> General
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onSwitchToCatalystAgent("notes9")}
                              className="gap-2 text-xs"
                            >
                              <NotebookPen className="size-3.5" /> Notes9
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <div className="mx-0.5 h-4 w-px shrink-0 bg-border/60" />
                      </>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 gap-1 px-2 text-[11px] text-muted-foreground"
                        >
                          <span className="text-muted-foreground">Cite:</span>
                          <span>{currentCitationLabel}</span>
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuLabel className="text-xs">Citation Style</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {CITATION_STYLE_OPTIONS.map((opt) => (
                          <DropdownMenuItem
                            key={opt.value}
                            onClick={() => {
                              setCitationStyleTiptap(opt.value)
                              writePaperCitationStyle(opt.value)
                            }}
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-medium">{opt.longLabel}</span>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex h-9 shrink-0 items-center justify-end gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={cn(
                        "size-7 text-muted-foreground transition-colors hover:text-primary",
                        input.trim() && !isLoading && "text-primary"
                      )}
                      onClick={handleSubmit}
                      disabled={!input.trim() || isLoading}
                      aria-label="Send"
                    >
                      {isLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ArrowUp className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
