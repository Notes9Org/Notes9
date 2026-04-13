"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createClient } from "@/lib/supabase/client"
import { useLiteratureAgentStream } from "@/hooks/use-literature-agent-stream"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import {
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  History,
  Loader2,
  MessageSquare,
  NotebookPen,
  PenBox,
  Plus,
  Square,
  Trash2,
  X,
  PanelRightClose,
} from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  LITERATURE_PAPER_DRAG_MIME,
  type LiteraturePaperItem,
} from "./protocol-literature-panel"
import { formatDistanceToNow } from "date-fns"
import { diffWords } from "diff"
import { MarkdownRenderer, tightenChatMarkdown } from "@/components/catalyst/markdown-renderer"
import { markdownToHtml } from "@/lib/markdown-to-editor-html"
import { copyMarkdownForRichPaste } from "@/lib/copy-markdown-rich-paste"
import { ClipboardInfoIcon } from "@/components/ui/clipboard-info-icon"
import { Notes9LoaderGif } from "@/components/brand/notes9-loader-gif"
import { useChatSessions } from "@/hooks/use-chat-sessions"
import type { ChatMessage as DbChatMessage } from "@/hooks/use-chat-sessions"

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

interface ProtocolContextItem {
  id: string
  name: string
  content: string
  version: string | null
}

interface ViewerTab {
  key: string
  kind: "literature" | "protocol"
  id: string
  title: string
  pdfUrl?: string | null
  abstract?: string | null
  content?: string | null
}

type ProtocolSidebarAgentMode = "protocol" | "general" | "notes9"

export interface ProtocolAiSidechatProps {
  /** Persists chat history under this protocol (Supabase). */
  protocolId: string
  templateShellHtml: string
  protocolTitle: string
  currentEditorContent: string
  currentVersion: string
  aiContextPapers: LiteraturePaperItem[]
  aiContextProtocols: ProtocolContextItem[]
  /** Papers shown in the filtered literature panel — used to resolve @ mentions. */
  literatureCandidates?: LiteraturePaperItem[]
  /** Add papers to AI context (drag-drop, @ pick). */
  onAddPapers?: (papers: LiteraturePaperItem[]) => void
  onAddProtocols?: (protocols: ProtocolContextItem[]) => void
  onRemovePaper: (id: string) => void
  onRemoveProtocol: (id: string) => void
  /** Called when the user applies an AI suggestion into the editor. */
  onApplyToEditor: (html: string) => void
  /** Highlight a text excerpt in the protocol editor (same-page navigation). */
  onHighlightInEditor?: (excerpt: string) => void
  onClose?: () => void
  className?: string
}

function parseLiteratureDragPayload(json: string): LiteraturePaperItem | null {
  try {
    const o = JSON.parse(json) as {
      type?: string
      id?: string
      title?: string
      authors?: string | null
      journal?: string | null
      publication_year?: number | null
    }
    if (o?.type !== "literature" || !o.id || typeof o.title !== "string") return null
    return {
      id: o.id,
      title: o.title,
      authors: o.authors ?? null,
      journal: o.journal ?? null,
      publication_year: o.publication_year ?? null,
    }
  } catch {
    return null
  }
}

function parseProtocolDragPayload(json: string): { id: string; name: string } | null {
  try {
    const o = JSON.parse(json) as { type?: string; id?: string; name?: string }
    if (o?.type !== "protocol" || !o.id) return null
    return { id: o.id, name: o.name || "Untitled protocol" }
  } catch {
    return null
  }
}

/* ─── component ──────────────────────────────────────────────────────────── */

function uiMessageFromDb(
  row: DbChatMessage,
  overrides?: Partial<Pick<ChatMessage, "state" | "steps">>
): ChatMessage {
  const role = row.role === "assistant" ? "assistant" : "user"
  return {
    id: row.id,
    role,
    text: row.content,
    state:
      overrides?.state ??
      (role === "assistant" ? "applied" : undefined),
    steps: overrides?.steps,
  }
}

export function ProtocolAiSidechat({
  protocolId,
  templateShellHtml,
  protocolTitle,
  currentEditorContent,
  currentVersion,
  aiContextPapers,
  aiContextProtocols,
  literatureCandidates = [],
  onAddPapers,
  onAddProtocols,
  onRemovePaper,
  onRemoveProtocol,
  onApplyToEditor,
  onHighlightInEditor,
  onClose,
  className,
}: ProtocolAiSidechatProps) {
  const router = useRouter()
  const pathname = usePathname()
  const {
    sessions,
    currentSessionId: activeSessionId,
    setCurrentSessionId: setActiveSessionId,
    loading: sessionsLoading,
    createSession,
    updateSessionTitle,
    deleteSession: deleteSessionFromDb,
    clearSessionMessages,
    loadMessages,
    saveMessage,
  } = useChatSessions(protocolId)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [input, setInput] = useState("")
  const [mentionMenu, setMentionMenu] = useState<{
    start: number
    query: string
    matches: LiteraturePaperItem[]
  } | null>(null)
  const [mentionHighlightIndex, setMentionHighlightIndex] = useState(0)
  const [dropTargetActive, setDropTargetActive] = useState(false)
  const [viewerTabs, setViewerTabs] = useState<ViewerTab[]>([])
  const [activeViewerTabKey, setActiveViewerTabKey] = useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = useState(true)
  const [agentMode, setAgentMode] = useState<ProtocolSidebarAgentMode>("protocol")
  const dragDepthRef = useRef(0)
  const mentionQueryKeyRef = useRef<string | null>(null)
  const mentionListRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const creatingSessionRef = useRef(false)

  const syncMentionFromInput = useCallback(
    (text: string, cursor: number) => {
      const before = text.slice(0, cursor)
      const at = before.lastIndexOf("@")
      if (at === -1) {
        mentionQueryKeyRef.current = null
        setMentionMenu(null)
        return
      }
      const prevChar = at === 0 ? "\n" : before[at - 1]!
      if (prevChar !== " " && prevChar !== "\n" && at > 0) {
        mentionQueryKeyRef.current = null
        setMentionMenu(null)
        return
      }
      const query = before.slice(at + 1)
      if (/[\s\n]/.test(query)) {
        mentionQueryKeyRef.current = null
        setMentionMenu(null)
        return
      }
      const q = query.toLowerCase()
      const matches = literatureCandidates
        .filter((p) => !q || p.title.toLowerCase().includes(q))
        .slice(0, 50)
      const key = `${at}:${query}`
      if (mentionQueryKeyRef.current !== key) {
        mentionQueryKeyRef.current = key
        setMentionHighlightIndex(0)
      } else {
        setMentionHighlightIndex((i) =>
          Math.min(i, Math.max(0, matches.length - 1))
        )
      }
      setMentionMenu({ start: at, query, matches })
    },
    [literatureCandidates]
  )

  const applyMentionPick = useCallback(
    (paper: LiteraturePaperItem) => {
      if (!mentionMenu) return
      const el = textareaRef.current
      const cursor = el?.selectionStart ?? input.length
      const { start } = mentionMenu
      const before = input.slice(0, start)
      const after = input.slice(cursor)
      const next = before + after
      setInput(next)
      setMentionMenu(null)
      mentionQueryKeyRef.current = null
      onAddPapers?.([paper])
      requestAnimationFrame(() => {
        if (!el) return
        el.focus()
        const pos = before.length
        el.setSelectionRange(pos, pos)
        syncMentionFromInput(next, pos)
      })
    },
    [mentionMenu, input, onAddPapers, syncMentionFromInput]
  )

  const handleLiteratureDrop = useCallback(
    async (e: React.DragEvent) => {
      dragDepthRef.current = 0
      setDropTargetActive(false)

      const raw = e.dataTransfer.getData(LITERATURE_PAPER_DRAG_MIME)
      const paper = raw ? parseLiteratureDragPayload(raw) : null
      if (paper) {
        e.preventDefault()
        onAddPapers?.([paper])
        const supabase = createClient()
        const { data } = await supabase
          .from("literature_reviews")
          .select("id, title, abstract, pdf_file_url")
          .eq("id", paper.id)
          .single()
        const row = data as
          | { id: string; title: string; abstract: string | null; pdf_file_url: string | null }
          | null
        const tab: ViewerTab = {
          key: `literature:${paper.id}`,
          kind: "literature",
          id: paper.id,
          title: row?.title || paper.title,
          // Use authenticated same-origin stream route; avoids broken public bucket URLs.
          pdfUrl: `/api/literature/${paper.id}/viewer-pdf`,
          abstract: row?.abstract ?? null,
        }
        setViewerTabs((prev) => [...prev.filter((t) => t.key !== tab.key), tab])
        setActiveViewerTabKey(tab.key)
        setViewerOpen(true)
        return
      }

      const rawJson = e.dataTransfer.getData("application/json")
      const droppedProtocol = rawJson ? parseProtocolDragPayload(rawJson) : null
      if (!droppedProtocol) return
      e.preventDefault()
      const supabase = createClient()
      const { data } = await supabase
        .from("protocols")
        .select("id, name, content, version")
        .eq("id", droppedProtocol.id)
        .single()
      const protocolRow = data as ProtocolContextItem | null
      if (protocolRow) onAddProtocols?.([protocolRow])
      const tab: ViewerTab = {
        key: `protocol:${droppedProtocol.id}`,
        kind: "protocol",
        id: droppedProtocol.id,
        title: protocolRow?.name || droppedProtocol.name,
        content: protocolRow?.content ?? null,
      }
      setViewerTabs((prev) => [...prev.filter((t) => t.key !== tab.key), tab])
      setActiveViewerTabKey(tab.key)
      setViewerOpen(true)
    },
    [onAddPapers, onAddProtocols]
  )

  const hasKnownDragType = (e: React.DragEvent) =>
    Array.from(e.dataTransfer.types).includes(LITERATURE_PAPER_DRAG_MIME) ||
    Array.from(e.dataTransfer.types).includes("application/json")

  useLayoutEffect(() => {
    if (!mentionMenu?.matches.length) return
    const row = mentionListRef.current?.querySelector(
      `[data-mention-index="${mentionHighlightIndex}"]`
    )
    row?.scrollIntoView({ block: "nearest" })
  }, [mentionHighlightIndex, mentionMenu?.matches.length])

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

  // Ensure a DB session exists and a valid active id (Protocol AI is always scoped by protocolId).
  useEffect(() => {
    if (sessionsLoading) return
    if (sessions.length > 0) {
      creatingSessionRef.current = false
      if (
        !activeSessionId ||
        !sessions.some((s) => s.id === activeSessionId)
      ) {
        setActiveSessionId(sessions[0]!.id)
      }
      return
    }
    if (creatingSessionRef.current) return
    creatingSessionRef.current = true
    void createSession().finally(() => {
      creatingSessionRef.current = false
    })
  }, [
    sessionsLoading,
    sessions,
    activeSessionId,
    createSession,
    setActiveSessionId,
  ])

  // Load messages when the active session changes
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([])
      setMessagesLoading(false)
      return
    }
    let cancelled = false
    setMessages([])
    setMessagesLoading(true)
    void loadMessages(activeSessionId).then((rows) => {
      if (cancelled) return
      setMessages(
        rows
          .filter((r) => r.role === "user" || r.role === "assistant")
          .map((r) => uiMessageFromDb(r))
      )
      setMessagesLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [activeSessionId, loadMessages])

  // Scroll to bottom on new messages/steps
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, steps, error])

  const createNewSession = useCallback(() => {
    if (isStreaming) return
    void (async () => {
      const id = await createSession()
      if (id) {
        setMessages([])
        reset()
      }
    })()
  }, [createSession, isStreaming, reset])

  const deleteSession = useCallback(
    (sid: string) => {
      void (async () => {
        await deleteSessionFromDb(sid)
        if (activeSessionId === sid) reset()
      })()
    },
    [deleteSessionFromDb, activeSessionId, reset]
  )

  const switchSession = useCallback(
    (sid: string) => {
      if (isStreaming) return
      setActiveSessionId(sid)
      setHistoryOpen(false)
      reset()
    },
    [isStreaming, reset, setActiveSessionId]
  )

  const literatureIds = useMemo(
    () => aiContextPapers.map((p) => p.id),
    [aiContextPapers]
  )
  const hasAnyContext = aiContextPapers.length > 0 || aiContextProtocols.length > 0

  const shellSummary = useMemo(
    () => truncate(stripHtml(templateShellHtml), 4000),
    [templateShellHtml]
  )

  const buildQuery = useCallback(
    (userLine: string) => {
      if (agentMode === "general") {
        return userLine
      }
      if (agentMode === "notes9") {
        return [
          "You are Notes9, an assistant for scientific teams.",
          "Be concise, practical, and actionable.",
          "",
          `Current protocol title: ${protocolTitle || "Untitled protocol"}`,
          "",
          "User request:",
          userLine,
        ].join("\n")
      }
      return [
        "You are a scientific writing assistant helping draft a laboratory protocol.",
        `Protocol title: ${protocolTitle || "Untitled protocol"}`,
        "",
        "Current protocol template / shell (maintain tone and structure):",
        shellSummary || "(no template provided)",
        "",
        "Related protocols to use as additional context:",
        aiContextProtocols.length > 0
          ? aiContextProtocols
              .map((p, idx) => {
                const snippet = truncate(stripHtml(p.content || ""), 1000)
                return `Protocol ${idx + 1}: ${p.name || "Untitled"}${p.version ? ` (v${p.version})` : ""}\n${snippet || "(no content)"}`
              })
              .join("\n\n")
          : "(none selected)",
        "",
        "User request:",
        userLine,
      ].join("\n")
    },
    [agentMode, protocolTitle, shellSummary, aiContextProtocols]
  )

  const updateMessage = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    )
  }, [])

  const appendAssistantFromDb = useCallback(
    async (text: string, pending: boolean, capturedSteps: string[]) => {
      if (!activeSessionId) return
      const saved = await saveMessage(activeSessionId, "assistant", text)
      if (!saved) return
      setMessages((prev) => [
        ...prev,
        uiMessageFromDb(saved, {
          state: pending ? "pending" : "applied",
          steps: capturedSteps.length ? capturedSteps : undefined,
        }),
      ])
    },
    [activeSessionId, saveMessage]
  )

  const handleSend = useCallback(async () => {
    const line = input.trim()
    if (!line || isStreaming || !activeSessionId) return
    if (!hasAnyContext) return

    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    const savedUser = await saveMessage(activeSessionId, "user", line)
    if (!savedUser) return

    const sessionRow = sessions.find((s) => s.id === activeSessionId)
    if (sessionRow && !sessionRow.title?.trim()) {
      void updateSessionTitle(
        activeSessionId,
        line.slice(0, 48) + (line.length > 48 ? "…" : "")
      )
    }

    const nextMessages: ChatMessage[] = [
      ...messages,
      uiMessageFromDb(savedUser),
    ]
    setMessages(nextMessages)
    setInput("")

    const history = nextMessages.map((m) => ({
      role: m.role,
      content: m.text,
    }))

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
      const errText = `Error: ${result.error}`
      const saved = await saveMessage(activeSessionId, "assistant", errText)
      if (saved) {
        setMessages((prev) => [...prev, uiMessageFromDb(saved)])
      }
      return
    }

    if (result.donePayload?.content) {
      const text = (result.donePayload.answer || result.donePayload.content).trim()
      if (text) {
        const capturedSteps = [...steps]
        await appendAssistantFromDb(text, true, capturedSteps)
      }
    }
  }, [
    input,
    isStreaming,
    activeSessionId,
    literatureIds,
    hasAnyContext,
    messages,
    steps,
    buildQuery,
    runRequest,
    saveMessage,
    appendAssistantFromDb,
    sessions,
    updateSessionTitle,
  ])

  const handleApply = useCallback(
    (msg: ChatMessage) => {
      void (async () => {
        const md = tightenChatMarkdown(msg.text)
        const html = await markdownToHtml(md)
        onApplyToEditor(html)
        updateMessage(msg.id, { state: "applied" })
      })()
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
  const hasMessages = messages.length > 0
  const activeViewerTab = viewerTabs.find((t) => t.key === activeViewerTabKey) ?? null
  const goToLiteratureAgent = useCallback(() => {
    if (!pathname?.startsWith("/literature-reviews")) {
      router.push("/literature-reviews")
    }
  }, [pathname, router])
  const goToGeneralAgent = useCallback(() => {
    setAgentMode("general")
  }, [])
  const goToNotes9Agent = useCallback(() => {
    setAgentMode("notes9")
  }, [])

  /* ─── render ─────────────────────────────────────────────────────────── */

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full min-w-0 flex-row overflow-hidden border-l border-border/50 bg-background",
        className,
      )}
    >
      {/* ── History sidebar (matches CatalystSidebar) ──────────────────── */}
      {historyOpen && (
        <div className="flex h-full min-h-0 w-48 shrink-0 flex-col overflow-hidden border-r border-border/50 bg-muted/20">
          {/* Branding (only on empty chat, like CatalystSidebar) */}
          {!hasMessages && (
            <div className="flex flex-col items-center justify-center border-b border-border/50 py-6">
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <ClipboardInfoIcon className="size-5 text-primary" />
              </div>
              <span className="text-xs font-semibold text-muted-foreground">Protocol AI</span>
            </div>
          )}
          {/* Header — matches CatalystSidebar (catalyst-sidebar.tsx) */}
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="font-semibold text-sm">Chat History</h2>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-muted-foreground hover:text-foreground"
                onClick={createNewSession}
                disabled={isStreaming}
                title="New chat"
                aria-label="New chat"
              >
                <Plus className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-muted-foreground hover:text-foreground"
                onClick={() => setHistoryOpen(false)}
                title="Close sidebar"
                aria-label="Close history"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
          {/* Session list */}
          <ScrollArea className="min-h-0 flex-1 px-1.5">
            <div className="space-y-0.5 pb-4">
              {sessionsLoading ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</p>
              ) : sessions.length === 0 ? (
                <div className="px-2 py-8 text-center">
                  <MessageSquare className="mx-auto mb-2 size-6 opacity-30" />
                  <p className="text-xs font-medium text-muted-foreground">No conversations yet</p>
                  <p className="mt-1 text-[10px] text-muted-foreground opacity-70">Start a new chat below</p>
                </div>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      "group flex cursor-pointer items-start gap-1.5 rounded-md px-2 py-2 text-xs transition-colors",
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
                    <MessageSquare className="mt-0.5 size-3.5 shrink-0 opacity-50" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {s.title?.trim() ? s.title : "New conversation"}
                      </p>
                      <p className="text-[10px] opacity-60">
                        {formatDistanceToNow(new Date(s.updated_at), { addSuffix: true })}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteSession(s.id)
                      }}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* ── Main chat area (mirrors CatalystChat main area) ─────────────── */}
      <div
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        onDragEnter={(e) => {
          if (!hasKnownDragType(e)) return
          e.preventDefault()
          dragDepthRef.current += 1
          if (dragDepthRef.current === 1) setDropTargetActive(true)
        }}
        onDragLeave={(e) => {
          if (!hasKnownDragType(e)) return
          e.preventDefault()
          dragDepthRef.current -= 1
          if (dragDepthRef.current <= 0) {
            dragDepthRef.current = 0
            setDropTargetActive(false)
          }
        }}
        onDragOver={(e) => {
          if (!hasKnownDragType(e)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = "copy"
        }}
        onDrop={handleLiteratureDrop}
      >

        {/* ── Header: styled to match RightSidebar shell ── */}
        <header className="h-12 sm:h-14 flex items-center justify-between px-2 sm:px-4 border-b border-border/40 shrink-0 bg-[color:var(--n9-header-bg)]/80 backdrop-blur-md z-10 text-xs select-none min-w-0">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 sm:size-9 text-muted-foreground shrink-0"
              onClick={() => setHistoryOpen((v) => !v)}
              title={historyOpen ? "Hide history" : "Show history"}
              aria-label="Show chat history"
            >
              {historyOpen ? <PanelRightClose className="size-4" /> : <History className="size-4" />}
            </Button>
            <ClipboardInfoIcon className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate text-sm font-medium text-muted-foreground">
              Protocol AI
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="secondary"
              className="h-8 sm:h-9 text-muted-foreground"
              onClick={createNewSession}
              disabled={isStreaming}
              aria-label="New chat"
              title="New chat"
            >
              <Plus className="size-4" />
              <span>New Chat</span>
            </Button>
            {onClose && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 sm:size-9 text-muted-foreground"
                onClick={onClose}
                title="Close"
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
        </header>

        {viewerTabs.length > 0 && (
          <div className="shrink-0 border-b border-border/40 bg-muted/10">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Open context documents
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => setViewerOpen((v) => !v)}
              >
                {viewerOpen ? "Hide" : "Show"}
              </Button>
            </div>
            <div className="flex gap-1 overflow-x-auto px-3 pb-2">
              {viewerTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-1 text-[10px] transition-colors",
                    tab.key === activeViewerTabKey
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border/60 bg-background text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => {
                    setActiveViewerTabKey(tab.key)
                    setViewerOpen(true)
                  }}
                >
                  {tab.title}
                </button>
              ))}
            </div>
            {viewerOpen && activeViewerTab && (
              <div className="border-t border-border/40 bg-background px-3 py-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-medium text-foreground">
                    {activeViewerTab.title}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setViewerOpen(false)}
                  >
                    Back to editing
                  </Button>
                </div>
                {activeViewerTab.kind === "literature" && activeViewerTab.pdfUrl ? (
                  <iframe
                    src={activeViewerTab.pdfUrl}
                    title={activeViewerTab.title}
                    className="h-56 w-full rounded-md border"
                  />
                ) : activeViewerTab.kind === "protocol" ? (
                  <div className="max-h-56 overflow-y-auto rounded-md border bg-muted/20 p-2 text-xs text-foreground">
                    {activeViewerTab.content ? (
                      <div dangerouslySetInnerHTML={{ __html: activeViewerTab.content }} />
                    ) : (
                      <p className="text-muted-foreground">No protocol content available.</p>
                    )}
                  </div>
                ) : (
                  <div className="max-h-56 overflow-y-auto rounded-md border bg-muted/20 p-2 text-xs text-foreground">
                    <p>{activeViewerTab.abstract || "No PDF preview available for this literature item."}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Context strip (papers + protocols) */}
        {(aiContextPapers.length > 0 || aiContextProtocols.length > 0) && (
          <div className="shrink-0 border-b border-border/40 bg-muted/10 px-4 py-2">
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
              <FileText className="size-3 shrink-0" aria-hidden />
              AI context ({aiContextPapers.length} papers, {aiContextProtocols.length} protocols)
            </p>
            <ul className="flex flex-wrap gap-1">
              {aiContextPapers.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-1 rounded-full border border-border/50 bg-background px-2 py-0.5 text-[10px] text-foreground"
                >
                  <span className="max-w-[120px] truncate">{p.title}</span>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => onRemovePaper(p.id)}
                    aria-label={`Remove ${p.title}`}
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
              {aiContextProtocols.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-1 rounded-full border border-border/50 bg-background px-2 py-0.5 text-[10px] text-foreground"
                >
                  <span className="max-w-[120px] truncate">Protocol: {p.name}</span>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => onRemoveProtocol(p.id)}
                    aria-label={`Remove ${p.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Messages or greeting ─────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!hasMessages && !isStreaming && !sessionsLoading && !messagesLoading ? (
            /* ── Empty / greeting (mirrors CatalystGreeting) ── */
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto overscroll-contain px-4 py-4 text-center">
              <div className="mx-auto w-full max-w-xs">
                <div className="relative mb-3 inline-flex items-center justify-center">
                  <Notes9LoaderGif alt="Catalyst AI loader" widthPx={64} />
                </div>
                <h2 className="text-lg font-bold tracking-tight bg-gradient-to-r from-orange-500 to-pink-600 bg-clip-text text-transparent">
                  Catalyst AI
                </h2>
                <h3 className="text-sm font-semibold tracking-tight bg-gradient-to-r from-orange-500 to-pink-600 bg-clip-text text-transparent">
                  For Protocols
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {!hasAnyContext
                    ? "Add papers from Literature or select existing protocols below to provide context."
                    : "Ask me to draft or refine any section of your protocol."}
                </p>
                {hasAnyContext && (
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {["Draft methods section", "Add safety notes", "Summarize protocol"].map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                        onClick={() => setInput(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]]:overflow-x-hidden [&_[data-slot=scroll-area-viewport]>div]:!max-w-full [&_[data-slot=scroll-area-viewport]>div]:!block">
              <div
                ref={scrollRef}
                className="w-full min-w-0 max-w-full space-y-3 overflow-x-hidden px-3 py-4"
              >
                {(sessionsLoading || messagesLoading) && (
                  <p className="py-6 text-center text-xs text-muted-foreground">Loading chat…</p>
                )}

                {/* Clarify card */}
                {clarify && (
                  <div className="space-y-2 rounded-xl border border-border/60 bg-card p-3">
                    <p className="break-words text-sm font-medium text-foreground">
                      {clarify.question}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {clarifyOptions.map((opt) => (
                        <Button
                          key={opt}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-auto whitespace-normal py-1.5 text-left text-xs"
                          onClick={async () => {
                            const supabase = createClient()
                            const { data: { session } } = await supabase.auth.getSession()
                            const token = session?.access_token
                            if (!token) return
                            const res = await answerClarify(opt, token)
                            if (res.donePayload?.content) {
                              const text = (res.donePayload.answer || res.donePayload.content).trim()
                              if (text) void appendAssistantFromDb(text, true, [...steps])
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
                        className="h-auto py-1.5 text-xs"
                        onClick={async () => {
                          const supabase = createClient()
                          const { data: { session } } = await supabase.auth.getSession()
                          const token = session?.access_token
                          if (!token) return
                          const res = await skipClarify(token)
                          if (res.donePayload?.content) {
                            const text = (res.donePayload.answer || res.donePayload.content).trim()
                            if (text) void appendAssistantFromDb(text, true, [...steps])
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
                  <div key={m.id} className="w-full min-w-0 max-w-full">
                    {m.role === "user" ? (
                      <div className="flex w-full min-w-0 justify-end">
                        <div className="max-w-[88%] min-w-0 rounded-2xl rounded-tr-sm bg-primary/10 px-3 py-2 text-sm text-foreground [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
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

                {isStreaming && <ThinkingIndicator steps={steps} />}
                {error && !isStreaming && (
                  <p className="break-words text-xs text-destructive">{error}</p>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* ── Input area (mirrors Literature AI sidebar composer) ───────── */}
        <div className="mx-auto w-full min-w-0 shrink-0 px-4 pb-4 pt-2">
          <div
            className={cn(
              "relative rounded-xl border bg-card/50 shadow-sm focus-within:ring-1 focus-within:ring-ring/50 focus-within:border-ring transition-all overflow-hidden",
              dropTargetActive && "ring-2 ring-primary border-primary bg-primary/5"
            )}
          >
            {/* Context hint — inside container like Catalyst's mode toggle */}
            {!hasAnyContext && (
              <div className="border-b border-border/50 px-3 py-2">
                <p className="text-[10px] text-amber-700/90 dark:text-amber-400/90">
                  No context yet — drag papers from Literature, use @ for papers, or add existing protocols.
                </p>
              </div>
            )}
            {dropTargetActive && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-primary/5">
                <span className="rounded-md bg-background/90 px-2 py-1 text-xs font-medium text-primary shadow-sm">
                  Drop to add paper
                </span>
              </div>
            )}
            <div className="relative">
              {/* @ mention picker — anchored to composer only */}
              {mentionMenu && (
                <div
                  ref={mentionListRef}
                  className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-40 overflow-y-auto rounded-lg border border-border/60 bg-popover p-1 text-popover-foreground shadow-md"
                  role="listbox"
                  aria-label="Pick a paper"
                >
                  {mentionMenu.matches.length === 0 ? (
                    <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                      {literatureCandidates.length === 0
                        ? "No papers in the filtered list — set project/experiment in Literature."
                        : "No matching papers."}
                    </p>
                  ) : (
                    mentionMenu.matches.map((p, idx) => (
                      <button
                        key={p.id}
                        type="button"
                        role="option"
                        data-mention-index={idx}
                        aria-selected={idx === mentionHighlightIndex}
                        className={cn(
                          "flex w-full min-w-0 flex-col rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                          idx === mentionHighlightIndex
                            ? "bg-primary/15 text-foreground"
                            : "hover:bg-muted"
                        )}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          applyMentionPick(p)
                        }}
                      >
                        <span className="truncate font-medium">{p.title}</span>
                        {p.authors && (
                          <span className="truncate text-[10px] text-muted-foreground">
                            {p.authors}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
              <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                const v = e.target.value
                const c = e.target.selectionStart ?? v.length
                setInput(v)
                syncMentionFromInput(v, c)
              }}
              onSelect={(e) => {
                const t = e.target as HTMLTextAreaElement
                syncMentionFromInput(t.value, t.selectionStart ?? t.value.length)
              }}
              placeholder={
                !hasAnyContext
                  ? "Add papers/protocols first, then ask your prompt…"
                  : agentMode === "protocol"
                    ? "Ask to draft a section, refine steps, add safety notes…"
                    : agentMode === "notes9"
                      ? "Ask Notes9 about workflows, planning, or next steps…"
                      : "Ask anything about your work…"
              }
              className="w-full min-h-[68px] resize-none border-0 bg-transparent px-4 py-2.5 text-sm placeholder:text-muted-foreground/60 shadow-none focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 scrollbar-hide"
              disabled={isStreaming}
              onKeyDown={(e) => {
                const menu = mentionMenu
                if (menu && e.key === "Escape") {
                  e.preventDefault()
                  mentionQueryKeyRef.current = null
                  setMentionMenu(null)
                  return
                }
                const canPick =
                  menu &&
                  menu.matches.length > 0 &&
                  !e.shiftKey
                if (canPick) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault()
                    setMentionHighlightIndex((i) =>
                      Math.min(i + 1, menu.matches.length - 1)
                    )
                    return
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault()
                    setMentionHighlightIndex((i) => Math.max(i - 1, 0))
                    return
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault()
                    const pick = menu.matches[mentionHighlightIndex]
                    if (pick) applyMentionPick(pick)
                    return
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  void handleSend()
                }
              }}
            />
            </div>
            <div className="mt-1 flex min-h-9 items-center justify-between gap-2 px-2 pb-2">
              <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      id="tour-ai-mode"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 rounded-md bg-muted/50 px-2 text-xs font-medium text-muted-foreground hover:bg-muted shrink-0"
                    >
                      {agentMode === "protocol" ? (
                        <PenBox className="size-3.5" />
                      ) : agentMode === "notes9" ? (
                        <NotebookPen className="size-3.5" />
                      ) : (
                        <MessageSquare className="size-3.5" />
                      )}
                      {agentMode === "protocol" ? "Protocol" : agentMode === "notes9" ? "Notes9" : "General"}
                      <ChevronDown className="size-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[200px]">
                    <DropdownMenuItem onClick={goToLiteratureAgent} className="gap-2 text-xs">
                      <BookOpen className="size-3.5" /> Literature
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={goToGeneralAgent} className="gap-2 text-xs">
                      <MessageSquare className="size-3.5" /> General
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={goToNotes9Agent} className="gap-2 text-xs">
                      <NotebookPen className="size-3.5" /> Notes9
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 rounded-md bg-muted/50 px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
                  onClick={() => {
                    if (!activeSessionId) return
                    void clearSessionMessages(activeSessionId).then(() => {
                      setMessages([])
                      reset()
                    })
                  }}
                  disabled={isStreaming || messages.length === 0}
                >
                  Clear
                </Button>
              </div>
              <div className="flex h-9 shrink-0 items-center justify-end gap-1">
                <span className="mr-1 hidden text-[11px] text-muted-foreground sm:inline">
                  {input.length}/4096
                </span>
                {isStreaming ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="size-7 animate-pulse"
                    onClick={abort}
                    title="Stop generation"
                  >
                    <Square className="size-3 fill-current" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className={cn(
                      "size-7 text-muted-foreground transition-colors hover:text-primary",
                      hasAnyContext && !!input.trim() && "text-primary",
                    )}
                    disabled={!hasAnyContext || !input.trim()}
                    onClick={() => void handleSend()}
                    aria-label="Send message"
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── ThinkingIndicator ─────────────────────────────────────────────────── */

function ThinkingIndicator({ steps }: { steps: string[] }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="w-full min-w-0 max-w-full space-y-1.5 overflow-x-hidden [contain:inline-size]">
      <button
        type="button"
        onClick={() => steps.length > 0 && setExpanded((v) => !v)}
        className={cn(
          "flex w-full min-w-0 max-w-full items-start gap-2 overflow-hidden rounded-lg px-2 py-1 text-left text-xs text-muted-foreground transition-colors",
          steps.length > 0 && "cursor-pointer hover:bg-muted/60"
        )}
      >
        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
        <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
          Thinking…
        </span>
        {steps.length > 0 && (
          <ChevronDown
            className={cn(
              "mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform",
              expanded && "rotate-180"
            )}
          />
        )}
      </button>
      {expanded && steps.length > 0 && (
        <ScrollArea className="h-36 w-full min-w-0 max-w-full overflow-x-hidden rounded-md border bg-muted/20 [&_[data-slot=scroll-area-viewport]]:overflow-x-hidden">
          <div className="w-full min-w-0 max-w-full space-y-0.5 overflow-x-hidden p-2 [contain:inline-size]">
            {steps.map((s, i) => (
              <p
                key={i}
                className="max-w-full min-w-0 break-all font-mono text-[10px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere] whitespace-pre-wrap"
              >
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

  const handleCopy = useCallback(async () => {
    const md = tightenChatMarkdown(message.text)
    try {
      await copyMarkdownForRichPaste(md)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      try {
        await navigator.clipboard.writeText(md)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        /* ignore */
      }
    }
  }, [message.text])

  return (
    <div className="w-full min-w-0 max-w-full space-y-2 overflow-hidden text-sm text-foreground [overflow-wrap:anywhere]">
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
        <ScrollArea className="h-36 w-full min-w-0 max-w-full rounded-md border bg-muted/20">
          <div className="w-full min-w-0 max-w-full space-y-0.5 p-2">
            {message.steps!.map((s, i) => (
              <p
                key={i}
                className="max-w-full min-w-0 break-words font-mono text-[10px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere] whitespace-pre-wrap"
              >
                {s}
              </p>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Markdown content */}
      <div className="w-full min-w-0 max-w-full overflow-x-hidden">
        <MarkdownRenderer
          content={message.text}
          className="
            w-full min-w-0 max-w-full break-words
            text-xs
            [&_.notes9-md]:text-xs [&_p]:text-xs [&_li]:text-xs
            [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs
            [word-break:break-word] [overflow-wrap:anywhere]
            [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap
            [&_code]:break-all
            [&_table]:max-w-full [&_table]:table-fixed [&_td]:break-words [&_th]:break-words
          "
        />
      </div>

      {/* Diff preview */}
      {showDiff && (
        <div className="rounded-md border bg-muted/20 p-2.5">
          <p className="text-[10px] font-medium uppercase text-muted-foreground mb-1.5">
            Changes vs current draft (new version: {bumpVersion(currentVersion)})
          </p>
          <div className="max-h-48 w-full min-w-0 max-w-full overflow-y-auto overflow-x-hidden">
            <p className="min-w-0 max-w-full break-all pr-2 font-mono text-xs leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap [word-break:break-word]">
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
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-1 pt-0.5">
        {/* Copy as .md */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={handleCopy}
          title="Copy — Markdown and rich paste for the editor"
        >
          {copied ? (
            <Check className="size-3.5 text-green-500" />
          ) : (
            <Copy className="size-3.5" />
          )}
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

            <div className="flex items-center gap-0.5 ml-auto">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 px-1.5"
                onClick={() => onDiscard(message.id)}
              >
                <X className="size-3" />
                Discard
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-6 text-[10px] gap-1 px-2 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => onApply(message)}
              >
                <Check className="size-3" />
                Apply
              </Button>
            </div>
          </>
        )}
        {isApplied && (
          <div className="ml-1 flex items-center gap-1 text-[10px] text-muted-foreground">
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
