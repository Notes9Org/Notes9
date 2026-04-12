"use client"

import { useEffect, useState } from "react"
import { diffWords } from "diff"
import { History, Clock, Plus, Minus, User, ChevronDown, ChevronUp } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { ContentDiff } from "@/lib/db/schema"

interface ContentDiffHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  diffs: ContentDiff[]
  loading: boolean
  error: string | null
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }),
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
    relative: formatRelative(d),
  }
}

function formatRelative(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 60) return "just now"
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function DiffEntry({ diff }: { diff: ContentDiff }) {
  const [expanded, setExpanded] = useState(false)
  const { date, time, relative } = formatDateTime(diff.created_at)
  const userName = diff.user
    ? `${diff.user.first_name} ${diff.user.last_name}`.trim() || diff.user.email
    : diff.user_id.slice(0, 8) + "…"

  const prevText = stripHtml(diff.previous_content)
  const nextText = stripHtml(diff.new_content)
  const diffParts = expanded ? diffWords(prevText, nextText) : []

  return (
    <div className="group rounded-lg border border-border/60 bg-card overflow-hidden">
      {/* Header row */}
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
          <User className="h-3 w-3 text-muted-foreground" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-xs font-medium text-foreground">{userName}</span>
            <span className="text-[10px] text-muted-foreground" title={`${date} at ${time}`}>
              {relative} · {date} at {time}
            </span>
          </div>
          {diff.change_summary && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {diff.change_summary}
            </p>
          )}
          <div className="mt-1 flex items-center gap-2">
            {diff.words_added > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                <Plus className="h-2.5 w-2.5" />
                {diff.words_added} words added
              </span>
            )}
            {diff.words_removed > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-destructive">
                <Minus className="h-2.5 w-2.5" />
                {diff.words_removed} words removed
              </span>
            )}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-6 shrink-0 gap-1 px-1.5 text-[10px] text-muted-foreground"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Hide diff" : "Show diff"}
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "Hide" : "Diff"}
        </Button>
      </div>

      {/* Inline diff view */}
      {expanded && (
        <div className="border-t border-border/40 bg-muted/10 px-3 pb-3 pt-2">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Word-level diff · previous → current
          </p>
          <div className="max-h-48 overflow-y-auto rounded border border-border/40 bg-background p-2">
            <p className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
              {diffParts.map((part, i) => {
                if (!part.added && !part.removed) {
                  return (
                    <span key={i} className="text-foreground/60">
                      {part.value}
                    </span>
                  )
                }
                return (
                  <span
                    key={i}
                    className={cn(
                      "rounded px-0.5",
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
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Previous</p>
              <div className="max-h-28 overflow-y-auto rounded border border-border/40 bg-background p-1.5">
                <p className="text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap break-words font-mono">
                  {prevText || "(empty)"}
                </p>
              </div>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Current</p>
              <div className="max-h-28 overflow-y-auto rounded border border-border/40 bg-background p-1.5">
                <p className="text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap break-words font-mono">
                  {nextText || "(empty)"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function ContentDiffHistoryDialog({
  open,
  onOpenChange,
  title = "Change History",
  diffs,
  loading,
  error,
}: ContentDiffHistoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl w-full flex flex-col max-h-[80vh] gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b border-border/60 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-muted-foreground" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 px-4 py-3">
          {loading && (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <Clock className="h-6 w-6 opacity-40" />
              <p className="text-sm">{error}</p>
              <p className="text-xs">
                Make sure you&apos;ve applied <code className="font-mono">scripts/039_content_diffs.sql</code>
              </p>
            </div>
          )}

          {!loading && !error && diffs.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <Clock className="h-8 w-8 opacity-30" />
              <p className="text-sm font-medium">No change history yet</p>
              <p className="text-xs text-center">
                Changes will appear here after you save content.
              </p>
            </div>
          )}

          {!loading && !error && diffs.length > 0 && (
            <div className="space-y-2 pb-2">
              {diffs.map((diff) => (
                <DiffEntry key={diff.id} diff={diff} />
              ))}
            </div>
          )}
        </ScrollArea>

        {!loading && diffs.length > 0 && (
          <div className="shrink-0 border-t border-border/40 px-4 py-2">
            <p className="text-[10px] text-muted-foreground">
              {diffs.length} change{diffs.length !== 1 ? "s" : ""} · append-only log
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
