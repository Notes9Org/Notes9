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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  exportSegmentsPlain,
  joinAddedExcerpts,
  formatUnchangedSegment,
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

/** Expanded diff body, rendered inside a full-width table row beneath the header row. */
function DiffDetailBody({ diff }: { diff: ContentDiff }) {
  const resolved = resolveDiffDisplay(diff)
  const legacyParts =
    resolved.kind === "legacy"
      ? diffWords(resolved.prevPlain, resolved.nextPlain)
      : []
  const structureHints = parseStructureHints(diff)
  const structureHintsLine = formatStructureHintsDisplay(structureHints)

  return (
    <div className="space-y-2 bg-muted/10 px-3 py-2.5">
      {structureHintsLine && (
        <p className="text-2xs leading-relaxed text-muted-foreground" title={structureHintsLine}>
          <span className="font-medium text-foreground/80">Document / sections</span>
          {": "}
          <span className="break-words">{structureHintsLine}</span>
        </p>
      )}

      {resolved.kind === "none" && (
        <p className="text-micro text-muted-foreground">
          No diff detail is stored for this entry (e.g. created before compact diff storage).
        </p>
      )}

      {resolved.kind === "segments" && (
        <>
          <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            Word-level diff
          </p>
          <div className="max-h-[min(45vh,14rem)] overflow-y-auto rounded border border-border/40 bg-background p-2">
            <p className="font-mono text-micro leading-relaxed whitespace-pre-wrap break-words">
              {resolved.segments.map((seg, i) => {
                if (seg.k === "_") {
                  const unchanged = formatUnchangedSegment(seg)
                  const title = "n" in seg ? `${seg.n} characters unchanged` : "Unchanged"
                  return (
                    <span
                      key={i}
                      className="inline text-muted-foreground/80 whitespace-pre-wrap"
                      title={title}
                    >
                      {unchanged}
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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                Removed
              </p>
              <div className="max-h-28 overflow-y-auto rounded border border-border/40 bg-background p-1.5">
                <p className="font-mono text-micro leading-relaxed text-foreground/80 whitespace-pre-wrap break-words">
                  {joinRemovedExcerpts(resolved.segments).trim() || "(none)"}
                </p>
              </div>
            </div>
            <div>
              <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                Added
              </p>
              <div className="max-h-28 overflow-y-auto rounded border border-border/40 bg-background p-1.5">
                <p className="font-mono text-micro leading-relaxed text-foreground/80 whitespace-pre-wrap break-words">
                  {joinAddedExcerpts(resolved.segments).trim() || "(none)"}
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {resolved.kind === "legacy" && (
        <>
          <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            Word-level diff · previous → current
          </p>
          <div className="max-h-[min(45vh,14rem)] overflow-y-auto rounded border border-border/40 bg-background p-2">
            <p className="font-mono text-micro leading-relaxed whitespace-pre-wrap break-words">
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
                      part.removed && "bg-destructive/15 text-destructive line-through",
                    )}
                  >
                    {part.value}
                  </span>
                )
              })}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function DiffTableRows({ diff }: { diff: ContentDiff }) {
  const [expanded, setExpanded] = useState(false)
  const { date, time, relative } = formatDateTime(diff.created_at)
  const userName = diff.user
    ? `${diff.user.first_name} ${diff.user.last_name}`.trim() || diff.user.email
    : diff.user_id.slice(0, 8) + "…"

  return (
    <>
      <TableRow className="align-top">
        <TableCell className="w-[8.5rem] whitespace-nowrap py-2 align-top text-xs text-foreground/90">
          <div className="font-medium">{relative}</div>
          <div className="text-2xs text-muted-foreground" title={`${date} at ${time}`}>
            {date} · {time}
          </div>
        </TableCell>
        <TableCell className="w-[8rem] py-2 align-top text-xs">
          <div className="flex items-center gap-1.5 text-foreground/90">
            <User className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate" title={userName}>
              {userName}
            </span>
          </div>
        </TableCell>
        <TableCell className="py-2 align-top text-xs text-foreground/90">
          <p className="leading-snug line-clamp-3">{diff.change_summary || "—"}</p>
        </TableCell>
        <TableCell className="w-[7rem] whitespace-nowrap py-2 align-top text-2xs tabular-nums">
          <div className="flex flex-col gap-0.5">
            {diff.words_added > 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Plus className="h-2.5 w-2.5 shrink-0" aria-hidden />+{diff.words_added}
              </span>
            )}
            {diff.words_removed > 0 && (
              <span className="inline-flex items-center gap-1 text-destructive">
                <Minus className="h-2.5 w-2.5 shrink-0" aria-hidden />−{diff.words_removed}
              </span>
            )}
            {diff.words_added === 0 && diff.words_removed === 0 && (
              <span className="text-muted-foreground">0</span>
            )}
          </div>
        </TableCell>
        <TableCell className="w-12 py-2 pr-2 align-top text-right">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Hide diff" : "Show diff"}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/5 hover:bg-muted/5">
          <TableCell colSpan={5} className="p-0">
            <DiffDetailBody diff={diff} />
          </TableCell>
        </TableRow>
      )}
    </>
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
      <DialogContent className="flex h-[min(90dvh,92vh)] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[80vh]">
        <DialogHeader className="shrink-0 border-b border-border/60 px-3 py-3 sm:px-4">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-muted-foreground" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {/* flex-1 min-h-0 + overflow-y-auto keeps the table scrollable inside max-h-[80vh] (Radix ScrollArea alone often grows with content and never scrolls). */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          {loading && (
            <div className="space-y-2 px-3 py-3 sm:px-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-muted-foreground sm:px-4">
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
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-muted-foreground sm:px-4">
              <Clock className="h-8 w-8 opacity-30" />
              <p className="text-sm font-medium">No change history yet</p>
              <p className="text-xs text-center">
                Changes will appear here after you save content.
              </p>
            </div>
          )}

          {!loading && !error && diffs.length > 0 && (
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="h-9 w-[8.5rem] text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                    When
                  </TableHead>
                  <TableHead className="h-9 w-[8rem] text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                    User
                  </TableHead>
                  <TableHead className="h-9 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Summary
                  </TableHead>
                  <TableHead className="h-9 w-[7rem] text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Words
                  </TableHead>
                  <TableHead className="h-9 w-12 text-right text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Diff
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diffs.map((diff) => (
                  <DiffTableRows key={diff.id} diff={diff} />
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {!loading && diffs.length > 0 && (
          <div className="flex shrink-0 flex-col gap-2 border-t border-border/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-4">
            <p className="text-2xs text-muted-foreground min-w-0">
              {diffs.length} change{diffs.length !== 1 ? "s" : ""} · append-only log
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-full gap-1.5 text-micro touch-manipulation sm:h-7 sm:w-auto sm:shrink-0"
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
