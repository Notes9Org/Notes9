"use client"

import { useState } from "react"
import { diffWords } from "diff"
import {
  History,
  Clock,
  Plus,
  Minus,
  User,
  ChevronDown,
  ChevronUp,
  Download,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  exportSegmentsPlain,
  joinAddedExcerpts,
  joinRemovedExcerpts,
  resolveDiffDisplay,
} from "@/lib/content-diff-segments"
import {
  formatStructureHintsDisplay,
  parseStructureHintsFromDb,
} from "@/lib/content-diff-structure"
import type { ContentDiff, ContentDiffStructureHints } from "@/lib/db/schema"

interface ContentDiffHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  diffs: ContentDiff[]
  loading: boolean
  error: string | null
  /** Included in the downloadable log header and filename when set. */
  exportContext?: {
    recordType: "protocol" | "lab_note"
    recordId: string
  }
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

function sanitizeFilenameSegment(s: string): string {
  return s.replace(/[^\w.-]+/g, "_").slice(0, 80) || "export"
}

function parseStructureHints(diff: ContentDiff): ContentDiffStructureHints {
  return parseStructureHintsFromDb(diff.structure_hints)
}

/** Compact export: +/- lines and shortened unchanged runs — avoids duplicating full document twice per entry. */
function compactWordDiffForExport(prevPlain: string, nextPlain: string): string {
  const parts = diffWords(prevPlain, nextPlain)
  const lines: string[] = []
  const NEUTRAL_CAP = 220
  for (const part of parts) {
    const singleLine = part.value.replace(/\s+/g, " ").trim()
    if (!singleLine) continue
    if (part.added) lines.push(`+ ${singleLine}`)
    else if (part.removed) lines.push(`- ${singleLine}`)
    else
      lines.push(
        singleLine.length <= NEUTRAL_CAP
          ? `  ${singleLine}`
          : `  … (${singleLine.length} characters unchanged) …`
      )
  }
  return lines.length > 0 ? lines.join("\n") : "(no textual change)"
}

/** Plain-text audit log for download; every entry includes the diff row `id`. */
export function buildContentDiffsExportText(
  diffs: ContentDiff[],
  opts: { title: string; recordType?: "protocol" | "lab_note"; recordId?: string | null }
): string {
  const lines: string[] = [
    "=".repeat(80),
    "CONTENT CHANGE HISTORY EXPORT",
    "=".repeat(80),
    `Exported at (UTC): ${new Date().toISOString()}`,
    `UI title: ${opts.title}`,
  ]
  if (opts.recordType) lines.push(`Record type: ${opts.recordType}`)
  if (opts.recordId) lines.push(`Record ID: ${opts.recordId}`)
  lines.push(
    `Entry order: newest first (${diffs.length} entr${diffs.length === 1 ? "y" : "ies"})`,
    "",
  )

  for (let i = 0; i < diffs.length; i++) {
    const diff = diffs[i]
    const userName = diff.user
      ? `${diff.user.first_name} ${diff.user.last_name}`.trim() || diff.user.email
      : "(unknown profile)"
    const resolved = resolveDiffDisplay(diff)
    let diffBody: string
    if (resolved.kind === "segments") {
      diffBody = exportSegmentsPlain(resolved.segments)
    } else if (resolved.kind === "legacy") {
      diffBody = compactWordDiffForExport(resolved.prevPlain, resolved.nextPlain)
    } else {
      diffBody = "(no stored diff detail for this entry)"
    }

    lines.push(
      "-".repeat(80),
      `DIFF ID: ${diff.id}`,
      `Sequence #: ${i + 1} of ${diffs.length} (newest-first)`,
      `Created at: ${diff.created_at}`,
      `User ID: ${diff.user_id}`,
      `User: ${userName}`,
      `Words added: ${diff.words_added} · Words removed: ${diff.words_removed}`,
      diff.change_summary ? `Summary: ${diff.change_summary}` : "Summary: (none)",
      "",
    )

    const hints = parseStructureHints(diff)
    if (hints.document_title?.trim()) {
      lines.push(`Document title (approx.): ${hints.document_title.trim()}`)
    }
    if (hints.sections.length > 0) {
      lines.push(`Sections (approx.): ${hints.sections.join(" · ")}`)
    }
    lines.push(
      "",
      "--- Change detail (compact segments or legacy diff) ---",
      diffBody,
      "",
    )
  }

  lines.push("=".repeat(80), "END OF EXPORT", "=".repeat(80))
  return lines.join("\n")
}

function downloadContentDiffsLog(
  diffs: ContentDiff[],
  opts: {
    title: string
    recordType?: "protocol" | "lab_note"
    recordId?: string | null
  }
) {
  const body = buildContentDiffsExportText(diffs, opts)
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  const seg = opts.recordId
    ? sanitizeFilenameSegment(`${opts.recordType ?? "record"}_${opts.recordId}`)
    : "content-change-history"
  a.href = url
  a.download = `${seg}_${new Date().toISOString().replace(/[:.]/g, "-")}.txt`
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function DiffEntry({ diff }: { diff: ContentDiff }) {
  const [expanded, setExpanded] = useState(false)
  const { date, time, relative } = formatDateTime(diff.created_at)
  const userName = diff.user
    ? `${diff.user.first_name} ${diff.user.last_name}`.trim() || diff.user.email
    : diff.user_id.slice(0, 8) + "…"

  const resolved = resolveDiffDisplay(diff)
  const legacyParts =
    expanded && resolved.kind === "legacy"
      ? diffWords(resolved.prevPlain, resolved.nextPlain)
      : []
  const structureHints = parseStructureHints(diff)
  const structureHintsLine = formatStructureHintsDisplay(structureHints)
  const hasStructureHints = Boolean(structureHintsLine)

  return (
    <div className="group rounded-lg border border-border/60 bg-card overflow-hidden">
      {/* Header row */}
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
          <User className="h-3 w-3 text-muted-foreground" />
        </div>

        <div className="min-w-0 flex-1 space-y-0">
          <p className="text-xs font-medium leading-snug text-foreground">
            <span className="font-normal text-muted-foreground">User </span>
            {userName}
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground" title={`${date} at ${time}`}>
            {relative} · {date} at {time}
          </p>
          {diff.change_summary ? (
            <p className="mt-2 text-xs leading-relaxed text-foreground/90 line-clamp-4">{diff.change_summary}</p>
          ) : null}
          {(diff.words_added > 0 || diff.words_removed > 0) && (
            <div className="mt-2 flex flex-col gap-0.5 text-[10px]">
              {diff.words_added > 0 && (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <Plus className="h-2.5 w-2.5 shrink-0" aria-hidden />
                  {diff.words_added} word{diff.words_added === 1 ? "" : "s"} added
                </span>
              )}
              {diff.words_removed > 0 && (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <Minus className="h-2.5 w-2.5 shrink-0" aria-hidden />
                  {diff.words_removed} word{diff.words_removed === 1 ? "" : "s"} removed
                </span>
              )}
            </div>
          )}
          {hasStructureHints && (
            <p
              className="mt-2 text-[10px] leading-relaxed text-muted-foreground line-clamp-6"
              title={structureHintsLine}
            >
              <span className="font-medium text-foreground/80">Document / sections</span>
              {": "}
              {structureHintsLine}
            </p>
          )}
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
      {expanded && resolved.kind === "none" && (
        <div className="border-t border-border/40 bg-muted/10 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">
            No diff detail is stored for this entry (e.g. created before compact diff storage).
          </p>
        </div>
      )}

      {expanded && resolved.kind === "segments" && (
        <div className="border-t border-border/40 bg-muted/10 px-3 pb-3 pt-2">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Word-level diff · removed / added (unchanged runs shown as ···)
          </p>
          <div className="max-h-48 overflow-y-auto rounded border border-border/40 bg-background p-2">
            <p className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
              {resolved.segments.map((seg, i) => {
                if (seg.k === "_") {
                  return (
                    <span
                      key={i}
                      className="inline text-muted-foreground/70"
                      title={`${seg.n} characters unchanged`}
                    >
                      ···
                    </span>
                  )
                }
                if (seg.k === "-") {
                  return (
                    <span
                      key={i}
                      className="rounded px-0.5 bg-destructive/15 text-destructive line-through"
                    >
                      {seg.v}
                    </span>
                  )
                }
                return (
                  <span
                    key={i}
                    className="rounded px-0.5 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                  >
                    {seg.v}
                  </span>
                )
              })}
            </p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Removed
              </p>
              <div className="max-h-28 overflow-y-auto rounded border border-border/40 bg-background p-1.5">
                <p className="text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap break-words font-mono">
                  {joinRemovedExcerpts(resolved.segments).trim() || "(none)"}
                </p>
              </div>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Added</p>
              <div className="max-h-28 overflow-y-auto rounded border border-border/40 bg-background p-1.5">
                <p className="text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap break-words font-mono">
                  {joinAddedExcerpts(resolved.segments).trim() || "(none)"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {expanded && resolved.kind === "legacy" && (
        <div className="border-t border-border/40 bg-muted/10 px-3 pb-3 pt-2">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Word-level diff · previous → current
          </p>
          <div className="max-h-48 overflow-y-auto rounded border border-border/40 bg-background p-2">
            <p className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
              {legacyParts.map((part, i) => {
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
                  {resolved.prevPlain || "(empty)"}
                </p>
              </div>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Current</p>
              <div className="max-h-28 overflow-y-auto rounded border border-border/40 bg-background p-1.5">
                <p className="text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap break-words font-mono">
                  {resolved.nextPlain || "(empty)"}
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
  exportContext,
}: ContentDiffHistoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl w-full flex max-h-[80vh] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-muted-foreground" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {/* flex-1 min-h-0 + overflow-y-auto keeps the list scrollable inside max-h-[80vh] (Radix ScrollArea alone often grows with content and never scrolls). */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 [scrollbar-gutter:stable]">
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
              <p className="text-xs text-center">
                Make sure you&apos;ve applied{" "}
                <code className="font-mono">scripts/039_content_diffs.sql</code> and, for existing DBs,{" "}
                <code className="font-mono">scripts/042_content_diffs_diff_segments.sql</code> and{" "}
                <code className="font-mono">scripts/043_content_diffs_structure_hints.sql</code>.
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
        </div>

        {!loading && diffs.length > 0 && (
          <div className="shrink-0 border-t border-border/40 px-4 py-2 flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground min-w-0">
              {diffs.length} change{diffs.length !== 1 ? "s" : ""} · append-only log
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[11px] shrink-0"
              onClick={() =>
                downloadContentDiffsLog(diffs, {
                  title,
                  recordType: exportContext?.recordType,
                  recordId: exportContext?.recordId ?? null,
                })
              }
            >
              <Download className="h-3.5 w-3.5" />
              Download log
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
