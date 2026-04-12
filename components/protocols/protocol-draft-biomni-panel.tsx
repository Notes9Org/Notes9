"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useLiteratureAgentStream } from "@/hooks/use-literature-agent-stream"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Loader2,
  MessageSquare,
  PanelRightClose,
  Send,
  Sparkles,
  X,
} from "lucide-react"
import type { LiteraturePaperItem } from "./protocol-literature-panel"
import { cn } from "@/lib/utils"

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return t.slice(0, max) + "…"
}

/** Turn plain assistant text into minimal HTML for TipTap */
function assistantTextToHtml(text: string): string {
  const blocks = text.split(/\n\n+/)
  return blocks
    .map((b) => {
      const lines = b.split("\n")
      const inner = lines.map((l) => l.trim()).join("<br/>")
      return `<p>${inner}</p>`
    })
    .join("")
}

export interface ProtocolDraftBiomniPanelProps {
  /** Letterhead / template shell HTML (not the full procedure). */
  templateShellHtml: string
  protocolTitle: string
  /** Papers the user attached for Biomni context (literature_review ids). */
  aiContextPapers: LiteraturePaperItem[]
  onRemovePaper: (id: string) => void
  /** Append AI draft into the protocol editor. */
  onApplyToEditor: (html: string) => void
  /** Collapse the whole AI column */
  onRequestClose?: () => void
  className?: string
}

export function ProtocolDraftBiomniPanel({
  templateShellHtml,
  protocolTitle,
  aiContextPapers,
  onRemovePaper,
  onApplyToEditor,
  onRequestClose,
  className,
}: ProtocolDraftBiomniPanelProps) {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([])
  const sessionIdRef = useRef<string>("")
  const scrollRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!sessionIdRef.current) {
      sessionIdRef.current =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `proto-${Date.now()}`
    }
  }, [])

  const literatureIds = useMemo(
    () => aiContextPapers.map((p) => p.id),
    [aiContextPapers]
  )

  const shellSummary = useMemo(
    () => truncate(stripHtml(templateShellHtml), 6000),
    [templateShellHtml]
  )

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, steps, error])

  const buildQuery = useCallback(
    (userLine: string) => {
      return [
        "You are helping draft a laboratory protocol document.",
        `Protocol title: ${protocolTitle || "Untitled protocol"}`,
        "",
        "Letterhead / template shell (preserve tone and structure where relevant):",
        shellSummary || "(no template shell)",
        "",
        "User instruction:",
        userLine,
      ].join("\n")
    },
    [protocolTitle, shellSummary]
  )

  const send = useCallback(async () => {
    const line = input.trim()
    if (!line || isStreaming) return
    if (literatureIds.length === 0) return

    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return

    const history = messages.map((m) => ({
      role: m.role,
      content: m.text,
    }))

    setMessages((m) => [...m, { role: "user", text: line }])
    setInput("")

    const body = {
      query: buildQuery(line),
      session_id: sessionIdRef.current,
      history,
      literature_review_ids: literatureIds,
      options: { skip_clarify: false, max_clarify_rounds: 2 },
    }

    const result = await runRequest("biomni", body, token, { skipClarify: false })
    if (result.error) {
      setMessages((m) => [...m, { role: "assistant", text: `Error: ${result.error}` }])
      return
    }
    if (result.donePayload?.content) {
      const text = (result.donePayload.answer || result.donePayload.content).trim()
      if (text) {
        setMessages((m) => [...m, { role: "assistant", text }])
      }
    }
  }, [input, isStreaming, literatureIds, messages, buildQuery, runRequest])

  const handleApplyLast = useCallback(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant")
    if (!last?.text) return
    onApplyToEditor(assistantTextToHtml(last.text))
  }, [messages, onApplyToEditor])

  const clarifyOptions = clarify?.options ?? []

  return (
    <div className={cn("flex flex-col h-full min-h-0 border-l bg-muted/10", className)}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b shrink-0 bg-background/80">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold truncate">AI draft (Biomni)</span>
        </div>
        {onRequestClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={onRequestClose}
            aria-label="Hide AI panel"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="px-3 py-2 border-b space-y-1.5 shrink-0">
        <p className="text-[11px] text-muted-foreground leading-snug">
          Selected papers are sent to the Biomni literature stream only — they are not inserted into
          the protocol body until you apply an assistant reply below.
        </p>
        <div className="flex flex-wrap gap-1">
          {aiContextPapers.length === 0 ? (
            <span className="text-xs text-amber-700 dark:text-amber-400">
              Add papers from Linked literature (left) to enable chat.
            </span>
          ) : (
            aiContextPapers.map((p) => (
              <Badge
                key={p.id}
                variant="secondary"
                className="text-[10px] gap-1 pr-0.5 max-w-[140px] font-normal"
              >
                <span className="truncate">{p.title}</span>
                <button
                  type="button"
                  className="ml-0.5 rounded-sm p-0.5 hover:bg-muted"
                  onClick={() => onRemovePaper(p.id)}
                  aria-label={`Remove ${p.title}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} className="px-3 py-2 space-y-3">
          {clarify && (
            <div className="rounded-md border bg-card p-2 text-xs space-y-2">
              <p className="font-medium text-foreground">{clarify.question}</p>
              <div className="flex flex-wrap gap-1">
                {clarifyOptions.map((opt) => (
                  <Button
                    key={opt}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={async () => {
                      const supabase = createClient()
                      const {
                        data: { session },
                      } = await supabase.auth.getSession()
                      const token = session?.access_token
                      if (!token) return
                      const res = await answerClarify(opt, token)
                      if (res.donePayload?.content) {
                        const text = (res.donePayload.answer || res.donePayload.content).trim()
                        if (text) {
                          setMessages((m) => [...m, { role: "assistant", text }])
                        }
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
                    const {
                      data: { session },
                    } = await supabase.auth.getSession()
                    const token = session?.access_token
                    if (!token) return
                    const res = await skipClarify(token)
                    if (res.donePayload?.content) {
                      const text = (res.donePayload.answer || res.donePayload.content).trim()
                      if (text) {
                        setMessages((m) => [...m, { role: "assistant", text }])
                      }
                    }
                  }}
                >
                  Skip clarification
                </Button>
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg px-2.5 py-2 text-xs leading-relaxed",
                m.role === "user"
                  ? "bg-primary/10 text-foreground ml-4"
                  : "bg-background border mr-4"
              )}
            >
              <span className="text-[10px] uppercase text-muted-foreground font-medium block mb-1">
                {m.role === "user" ? "You" : "Assistant"}
              </span>
              <div className="whitespace-pre-wrap">{m.text}</div>
            </div>
          ))}

          {isStreaming && steps.length > 0 && (
            <div className="text-[10px] text-muted-foreground font-mono space-y-0.5 border rounded-md p-2 bg-muted/30">
              {steps.slice(-8).map((s, i) => (
                <div key={i}>{s}</div>
              ))}
            </div>
          )}

          {isStreaming && steps.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Thinking…
            </div>
          )}

          {error && !isStreaming && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>
      </ScrollArea>

      <div className="border-t p-2 space-y-2 shrink-0 bg-background">
        <div className="flex gap-1.5">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              literatureIds.length === 0
                ? "Select papers on the left first…"
                : "Ask Biomni to draft a section, list steps, or refine the protocol…"
            }
            className="min-h-[72px] text-xs resize-none"
            disabled={literatureIds.length === 0 || isStreaming}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={isStreaming}
            onClick={() => {
              reset()
              setMessages([])
            }}
          >
            Clear chat
          </Button>
          <div className="flex items-center gap-1.5">
            {isStreaming && (
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={abort}>
                Stop
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={literatureIds.length === 0 || !input.trim() || isStreaming}
              onClick={() => void send()}
            >
              <Send className="h-3.5 w-3.5" />
              Send
            </Button>
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full h-8 text-xs gap-1.5"
          onClick={handleApplyLast}
          disabled={!messages.some((m) => m.role === "assistant")}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Insert last reply into protocol
        </Button>
      </div>
    </div>
  )
}
