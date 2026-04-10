"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createClient } from "@/lib/supabase/client"
import { useLiteratureAgentStream } from "@/hooks/use-literature-agent-stream"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Notes9LoaderGif } from "@/components/brand/notes9-loader-gif"
import { cn } from "@/lib/utils"
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clipboard,
  ClipboardCheck,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
  PanelRightClose,
} from "lucide-react"
import type { LiteraturePaperItem } from "./protocol-literature-panel"
import { diffWords } from "diff"
import { MarkdownRenderer, tightenChatMarkdown } from "@/components/catalyst/markdown-renderer"

/* ─── helpers ──────────────────────────────────────────────────────────────── */

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  return t.length <= max ? t : t.slice(0, max) + "…"
}

function bumpVersion(version: string): string {
  const parts = version.split(".")
  const last = parseInt(parts[parts.length - 1] ?? "0", 10)
  if (!isNaN(last)) {
    parts[parts.length - 1] = String(last + 1)
    return parts.join(".")
  }
  return version + ".1"
}

/* ─── types ─────────────────────────────────────────────────────────────────── */

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  text: string
  /** For assistant messages: pending = user hasn't applied/discarded yet */
  state?: "pending" | "applied" | "discarded"
  /** Background steps captured at stream completion */
  steps?: string[]
}

interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
}

export interface ProtocolAiSidechatProps {
  templateShellHtml: string
  protocolTitle: string
  currentEditorContent: string
  currentVersion: string
  aiContextPapers: LiteraturePaperItem[]
  onRemovePaper: (id: string) => void
  /** Called when the user applies an AI suggestion into the editor. */
  onApplyToEditor: (html: string) => void
  onClose?: () => void
  className?: string
}

/* ─── component ──────────────────────────────────────────────────────────── */

export function ProtocolAiSidechat({
  templateShellHtml,
  protocolTitle,
  currentEditorContent,
  currentVersion,
  aiContextPapers,
  onRemovePaper,
  onApplyToEditor,
  onClose,
  className,
}: ProtocolAiSidechatProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const {
    runRequest,
    isStreaming,
    steps,
    error,
    clarify,
    answerClarify,
    skipClarify,
    abort,
    reset,
  } = useLiteratureAgentStream()

  // Active session
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null
  const messages = activeSession?.messages ?? []

  // Scroll to bottom on new messages/steps
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, steps, error])

  // Create first session on mount
  useEffect(() => {
    createNewSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const createNewSession = useCallback(() => {
    const id = `proto-session-${Date.now()}`
    const session: ChatSession = {
      id,
      title: "New chat",
      messages: [],
      createdAt: Date.now(),
    }
    setSessions((prev) => [session, ...prev])
    setActiveSessionId(id)
    reset()
  }, [reset])

  const deleteSession = useCallback(
    (sid: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== sid)
        if (activeSessionId === sid) {
          const first = next[0]
          if (first) setActiveSessionId(first.id)
          else {
            // create fresh if all deleted
            const id2 = `proto-session-${Date.now()}`
            const s2: ChatSession = { id: id2, title: "New chat", messages: [], createdAt: Date.now() }
            setTimeout(() => {
              setSessions([s2])
              setActiveSessionId(s2.id)
            }, 0)
          }
        }
        return next
      })
    },
    [activeSessionId]
  )

  const switchSession = useCallback(
    (sid: string) => {
      if (isStreaming) return
      setActiveSessionId(sid)
      setHistoryOpen(false)
      reset()
    },
    [isStreaming, reset]
  )

  const literatureIds = useMemo(
    () => aiContextPapers.map((p) => p.id),
    [aiContextPapers]
  )

  const shellSummary = useMemo(
    () => truncate(stripHtml(templateShellHtml), 4000),
    [templateShellHtml]
  )

  const buildQuery = useCallback(
    (userLine: string) => {
      return [
        "You are a scientific writing assistant helping draft a laboratory protocol.",
        `Protocol title: ${protocolTitle || "Untitled protocol"}`,
        "",
        "Current protocol template / shell (maintain tone and structure):",
        shellSummary || "(no template provided)",
        "",
        "User request:",
        userLine,
      ].join("\n")
    },
    [protocolTitle, shellSummary]
  )

  const addMessage = useCallback(
    (msg: ChatMessage) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== activeSessionId) return s
          const updated = { ...s, messages: [...s.messages, msg] }
          // Auto-title from first user message
          if (s.title === "New chat" && msg.role === "user") {
            updated.title = msg.text.slice(0, 48) + (msg.text.length > 48 ? "…" : "")
          }
          return updated
        })
      )
    },
    [activeSessionId]
  )

  const updateMessage = useCallback(
    (id: string, patch: Partial<ChatMessage>) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== activeSessionId) return s
          return {
            ...s,
            messages: s.messages.map((m) =>
              m.id === id ? { ...m, ...patch } : m
            ),
          }
        })
      )
    },
    [activeSessionId]
  )

  const handleSend = useCallback(async () => {
    const line = input.trim()
    if (!line || isStreaming || !activeSessionId) return
    if (literatureIds.length === 0) return

    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    const history = messages.map((m) => ({ role: m.role, content: m.text }))

    const userMsgId = `user-${Date.now()}`
    addMessage({ id: userMsgId, role: "user", text: line })
    setInput("")

    const result = await runRequest(
      "biomni",
      {
        query: buildQuery(line),
        session_id: activeSessionId,
        history,
        literature_review_ids: literatureIds,
        options: { skip_clarify: false, max_clarify_rounds: 2 },
      },
      token,
      { skipClarify: false }
    )

    if (result.error) {
      addMessage({
        id: `err-${Date.now()}`,
        role: "assistant",
        text: `Error: ${result.error}`,
        state: "applied",
      })
      return
    }

    if (result.donePayload?.content) {
      const text = (result.donePayload.answer || result.donePayload.content).trim()
      if (text) {
        const capturedSteps = [...steps]
        addMessage({
          id: `asst-${Date.now()}`,
          role: "assistant",
          text,
          state: "pending",
          steps: capturedSteps,
        })
      }
    }
  }, [
    input,
    isStreaming,
    activeSessionId,
    literatureIds,
    messages,
    steps,
    buildQuery,
    runRequest,
    addMessage,
  ])

  const handleApply = useCallback(
    (msg: ChatMessage) => {
      // Convert markdown to simple paragraphs for the TipTap editor
      const html = msg.text
        .split(/\n\n+/)
        .map((b) => `<p>${b.split("\n").map((l) => l.trim()).join("<br/>")}</p>`)
        .join("")
      onApplyToEditor(html)
      updateMessage(msg.id, { state: "applied" })
    },
    [onApplyToEditor, updateMessage]
  )

  const handleDiscard = useCallback(
    (msgId: string) => {
      updateMessage(msgId, { state: "discarded" })
    },
    [updateMessage]
  )

  // Diff: compare a suggestion against current editor content
  const getDiff = useCallback(
    (suggestionText: string) => {
      const current = stripHtml(currentEditorContent)
      const suggestion = suggestionText
      return diffWords(current, suggestion)
    },
    [currentEditorContent]
  )

  const clarifyOptions = clarify?.options ?? []

  /* ─── render ─────────────────────────────────────────────────────────── */

  return (
    <div className={cn("flex flex-col h-full min-h-0 bg-background border-l relative", className)}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 border-b shrink-0 bg-muted/20 h-12 sm:h-14">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Notes9LoaderGif alt="Protocol AI" widthPx={22} className="translate-y-0" />
          <span className="text-sm font-semibold truncate">Protocol AI</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-0.5 shrink-0">
            <Sparkles className="h-3 w-3" />
            Biomni
          </Badge>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isStreaming && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={abort}
              title="Stop generation"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={createNewSession}
            title="New chat"
            disabled={isStreaming}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "h-7 w-7 text-muted-foreground hover:text-foreground",
              historyOpen && "bg-muted text-foreground"
            )}
            onClick={() => setHistoryOpen((v) => !v)}
            title="Chat history"
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </Button>
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={onClose}
              title="Close AI panel"
            >
              <PanelRightClose className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* ── History sidebar (slide-out overlay) ────────────────────────── */}
      {historyOpen && (
        <div className="absolute inset-y-0 right-0 w-full z-10 flex flex-col bg-background border-l shadow-lg"
          style={{ top: 48 }}
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b">
            <span className="text-sm font-semibold">Chat History</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setHistoryOpen(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-1 p-2">
              {sessions.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No chats yet</p>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      "group flex items-start gap-2 rounded-lg px-3 py-2.5 cursor-pointer transition-all",
                      s.id === activeSessionId
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    onClick={() => switchSession(s.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") switchSession(s.id)
                    }}
                  >
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">
                        {s.title}
                      </p>
                      <p className="text-[10px] opacity-60">
                        {s.messages.length} message{s.messages.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteSession(s.id)
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* ── Context papers ─────────────────────────────────────────────── */}
      {aiContextPapers.length > 0 && (
        <div className="px-3 py-2 border-b shrink-0 bg-muted/10">
          <p className="text-[10px] font-medium text-muted-foreground mb-1">
            Literature context ({aiContextPapers.length})
          </p>
          <ul className="space-y-0.5">
            {aiContextPapers.map((p) => (
              <li key={p.id} className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted/60 group/paper">
                <span className="text-[10px] text-foreground truncate flex-1 min-w-0">{p.title}</span>
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 opacity-0 group-hover/paper:opacity-100 hover:bg-muted transition-opacity"
                  onClick={() => onRemovePaper(p.id)}
                  aria-label={`Remove ${p.title}`}
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Messages ───────────────────────────────────────────────────── */}
      <ScrollArea className="flex-1 min-h-0 overflow-x-hidden">
        <div ref={scrollRef} className="px-3 py-3 space-y-3 min-w-0">

          {/* Empty state */}
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <div className="rounded-full bg-muted/60 p-3">
                <Sparkles className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Protocol AI</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                  {literatureIds.length === 0
                    ? "Select papers in the literature panel, then ask me to draft sections."
                    : "Ask me to draft or refine any section of your protocol."}
                </p>
              </div>
            </div>
          )}

          {/* Clarify card */}
          {clarify && (
            <div className="rounded-lg border bg-card p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">{clarify.question}</p>
              <div className="flex flex-wrap gap-1.5">
                {clarifyOptions.map((opt) => (
                  <Button
                    key={opt}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={async () => {
                      const supabase = createClient()
                      const { data: { session } } = await supabase.auth.getSession()
                      const token = session?.access_token
                      if (!token) return
                      const res = await answerClarify(opt, token)
                      if (res.donePayload?.content) {
                        const text = (res.donePayload.answer || res.donePayload.content).trim()
                        if (text) addMessage({ id: `asst-${Date.now()}`, role: "assistant", text, state: "pending", steps: [...steps] })
                      }
                    }}
                  >
                    {opt}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={async () => {
                    const supabase = createClient()
                    const { data: { session } } = await supabase.auth.getSession()
                    const token = session?.access_token
                    if (!token) return
                    const res = await skipClarify(token)
                    if (res.donePayload?.content) {
                      const text = (res.donePayload.answer || res.donePayload.content).trim()
                      if (text) addMessage({ id: `asst-${Date.now()}`, role: "assistant", text, state: "pending", steps: [...steps] })
                    }
                  }}
                >
                  Skip
                </Button>
              </div>
            </div>
          )}

          {/* Message bubbles */}
          {messages.map((m) => (
            <div key={m.id}>
              {m.role === "user" ? (
                <div className="flex justify-end">
                  <div className="rounded-2xl rounded-tr-sm px-3 py-2 text-sm bg-primary/10 text-foreground max-w-[88%] whitespace-pre-wrap break-words">
                    {m.text}
                  </div>
                </div>
              ) : (
                <AssistantMessage
                  message={m}
                  currentEditorContent={currentEditorContent}
                  currentVersion={currentVersion}
                  getDiff={getDiff}
                  onApply={handleApply}
                  onDiscard={handleDiscard}
                />
              )}
            </div>
          ))}

          {/* Streaming: always show "Thinking…" pill; steps available on expand */}
          {isStreaming && (
            <ThinkingIndicator steps={steps} />
          )}
          {error && !isStreaming && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>
      </ScrollArea>

      {/* ── Input ──────────────────────────────────────────────────────── */}
      <div className="border-t p-2.5 shrink-0 bg-background space-y-2">
        {aiContextPapers.length === 0 && (
          <p className="text-[10px] text-amber-700 dark:text-amber-400">
            Add papers from the literature panel to enable AI drafting.
          </p>
        )}
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              literatureIds.length === 0
                ? "Select papers first…"
                : "Ask to draft a section, refine steps, add safety notes…"
            }
            className="min-h-[72px] text-sm resize-none pr-10"
            disabled={literatureIds.length === 0 || isStreaming}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            className="absolute bottom-2 right-2 h-7 w-7"
            disabled={literatureIds.length === 0 || !input.trim() || isStreaming}
            onClick={() => void handleSend()}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => {
              setSessions((prev) =>
                prev.map((s) =>
                  s.id === activeSessionId ? { ...s, messages: [], title: "New chat" } : s
                )
              )
              reset()
            }}
            disabled={isStreaming || messages.length === 0}
          >
            Clear chat
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Enter to send · Shift+Enter for newline
          </p>
        </div>
      </div>
    </div>
  )
}

/* ─── ThinkingIndicator ─────────────────────────────────────────────────── */

function ThinkingIndicator({ steps }: { steps: string[] }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => steps.length > 0 && setExpanded((v) => !v)}
        className={cn(
          "flex items-center gap-2 text-xs text-muted-foreground py-1 rounded-lg px-2 transition-colors",
          steps.length > 0 && "hover:bg-muted/60 cursor-pointer"
        )}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        <span>Thinking…</span>
        {steps.length > 0 && (
          <ChevronDown
            className={cn("h-3.5 w-3.5 ml-auto shrink-0 transition-transform", expanded && "rotate-180")}
          />
        )}
      </button>
      {expanded && steps.length > 0 && (
        <ScrollArea className="h-36 rounded-md border bg-muted/20">
          <div className="p-2 space-y-0.5">
            {steps.map((s, i) => (
              <p key={i} className="text-[10px] font-mono text-muted-foreground leading-relaxed">
                {s}
              </p>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

/* ─── AssistantMessage ───────────────────────────────────────────────────── */

interface AssistantMessageProps {
  message: ChatMessage
  currentEditorContent: string
  currentVersion: string
  getDiff: (text: string) => ReturnType<typeof diffWords>
  onApply: (msg: ChatMessage) => void
  onDiscard: (id: string) => void
}

function AssistantMessage({
  message,
  currentEditorContent,
  currentVersion,
  getDiff,
  onApply,
  onDiscard,
}: AssistantMessageProps) {
  const [showDiff, setShowDiff] = useState(false)
  const [showSteps, setShowSteps] = useState(false)
  const [copied, setCopied] = useState(false)
  const diff = useMemo(() => getDiff(message.text), [getDiff, message.text])

  const changeStats = useMemo(() => {
    let added = 0
    let removed = 0
    for (const part of diff) {
      const w = part.value.trim().split(/\s+/).filter(Boolean).length
      if (part.added) added += w
      if (part.removed) removed += w
    }
    return { added, removed }
  }, [diff])

  const isPending = message.state === "pending"
  const isApplied = message.state === "applied"
  const isDiscarded = message.state === "discarded"
  const hasSteps = (message.steps?.length ?? 0) > 0

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(tightenChatMarkdown(message.text)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [message.text])

  return (
    <div
      className={cn(
        "rounded-xl border p-3 space-y-2 text-sm min-w-0 overflow-hidden",
        isPending && "border-primary/30 bg-primary/5",
        isApplied && "border-emerald-500/20 bg-emerald-500/5 opacity-75",
        isDiscarded && "border-muted opacity-40"
      )}
    >
      {/* Reasoning toggle */}
      {hasSteps && (
        <button
          type="button"
          onClick={() => setShowSteps((v) => !v)}
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown
            className={cn("h-3 w-3 transition-transform", showSteps && "rotate-180")}
          />
          {showSteps ? "Hide reasoning" : "View reasoning"}
        </button>
      )}

      {showSteps && hasSteps && (
        <ScrollArea className="h-36 rounded-md border bg-muted/20">
          <div className="p-2 space-y-0.5">
            {message.steps!.map((s, i) => (
              <p key={i} className="text-[10px] font-mono text-muted-foreground leading-relaxed">
                {s}
              </p>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Markdown content */}
      <div className="min-w-0 overflow-hidden">
        <MarkdownRenderer
          content={message.text}
          className="text-xs [&_.notes9-md]:text-xs [&_p]:text-xs [&_li]:text-xs [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs break-words"
        />
      </div>

      {/* Diff preview */}
      {showDiff && (
        <div className="rounded-md border bg-muted/20 p-2.5">
          <p className="text-[10px] font-medium uppercase text-muted-foreground mb-1.5">
            Changes vs current draft (new version: {bumpVersion(currentVersion)})
          </p>
          <ScrollArea className="max-h-48">
            <p className="text-xs font-mono leading-relaxed whitespace-pre-wrap pr-2">
              {diff.map((part, i) => {
                if (!part.added && !part.removed) {
                  return (
                    <span key={i} className="text-foreground/50">
                      {part.value}
                    </span>
                  )
                }
                return (
                  <span
                    key={i}
                    className={cn(
                      "rounded-sm px-0.5",
                      part.added && "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
                      part.removed && "bg-destructive/15 text-destructive line-through"
                    )}
                  >
                    {part.value}
                  </span>
                )
              })}
            </p>
          </ScrollArea>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-1 pt-0.5">
        {/* Copy as .md */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={handleCopy}
          title="Copy as Markdown"
        >
          {copied ? <ClipboardCheck className="h-3 w-3 text-emerald-500" /> : <Clipboard className="h-3 w-3" />}
        </Button>

        {isPending && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] gap-1 text-muted-foreground px-1.5"
              onClick={() => setShowDiff((v) => !v)}
            >
              <ChevronRight
                className={cn("h-3 w-3 transition-transform", showDiff && "rotate-90")}
              />
              {showDiff ? "Hide diff" : "Diff"}
              {(changeStats.added > 0 || changeStats.removed > 0) && (
                <span className="text-[10px]">
                  +{changeStats.added}/−{changeStats.removed}
                </span>
              )}
            </Button>

            <div className="flex items-center gap-1 ml-auto">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 px-1.5"
                onClick={() => onDiscard(message.id)}
              >
                <X className="h-3 w-3" />
                Discard
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-6 text-[10px] gap-1 px-2"
                onClick={() => onApply(message)}
              >
                <Check className="h-3 w-3" />
                Apply
              </Button>
            </div>
          </>
        )}
        {isApplied && (
          <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 ml-1">
            <Check className="h-3 w-3" />
            Applied
          </div>
        )}
        {isDiscarded && (
          <div className="text-[10px] text-muted-foreground ml-1">Discarded</div>
        )}
      </div>
    </div>
  )
}
