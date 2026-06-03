"use client"

import { useState, useMemo, useEffect } from "react"
import { diffWords } from "diff"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  AlertCircle,
  History,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useContentDiffs } from "@/hooks/use-content-diffs"
import { ContentDiffHistoryDialog } from "@/components/content-diff-history-dialog"
import { htmlToDiffPlainText } from "@/lib/content-diff-plain-text"

/** `diff` can overflow the call stack on very long strings; stats stay approximate when truncated. */
const MAX_DIFF_TEXT_LEN = 200_000

function bumpVersion(version: string): string {
  const parts = version.split(".")
  const last = parseInt(parts[parts.length - 1] ?? "0", 10)
  if (!isNaN(last)) {
    parts[parts.length - 1] = String(last + 1)
    return parts.join(".")
  }
  return `${version}.1`
}

type BaseProps = {
  savedContent: string
  draftContent: string
  onReject: () => void
  isVisible?: boolean
  /** When true, pending changes are shown even if body HTML matches (e.g. template metadata). */
  extraDirty?: boolean
}

export type ContentChangeApprovalBarProps = BaseProps &
  (
    | {
        variant: "protocol"
        protocolId: string
        currentVersion: string
        /** Shown in change history “Document / sections” when heading-based hints are sparse. */
        documentTitle?: string | null
        onAccept: (newContent: string, newVersion: string) => Promise<void>
      }
    | {
        variant: "lab_note"
        noteId: string | null
        onAccept: (newContent: string) => Promise<void>
      }
  )

export function ContentChangeApprovalBar(props: ContentChangeApprovalBarProps) {
  const {
    savedContent,
    draftContent,
    onReject,
    isVisible = true,
    extraDirty = false,
  } = props

  const [isExpanded, setIsExpanded] = useState(false)
  const [isAccepting, setIsAccepting] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  const recordType = props.variant === "protocol" ? "protocol" : "lab_note"
  const recordId =
    props.variant === "protocol" ? props.protocolId : props.noteId ?? undefined

  const historyExportContext =
    props.variant === "protocol"
      ? { recordType: "protocol" as const, recordId: props.protocolId }
      : props.noteId
        ? { recordType: "lab_note" as const, recordId: props.noteId }
        : undefined

  const { diffs, loading: diffsLoading, error: diffsError, loadDiffs, recordDiff } =
    useContentDiffs(recordType, recordId)

  const isDirty = savedContent !== draftContent || extraDirty

  /** Collapse the word-level preview when there is nothing pending; avoids re-opening after accept/discard. */
  useEffect(() => {
    if (!isDirty) setIsExpanded(false)
  }, [isDirty])

  const [diffResult, setDiffResult] = useState<import("diff").Change[]>([])
  const [changeStats, setChangeStats] = useState({ added: 0, removed: 0 })

  useEffect(() => {
    const timer = setTimeout(() => {
      let savedText = htmlToDiffPlainText(savedContent)
      let draftText = htmlToDiffPlainText(draftContent)
      if (savedText.length > MAX_DIFF_TEXT_LEN) savedText = savedText.slice(0, MAX_DIFF_TEXT_LEN)
      if (draftText.length > MAX_DIFF_TEXT_LEN) draftText = draftText.slice(0, MAX_DIFF_TEXT_LEN)
      
      const diff = diffWords(savedText, draftText)
      
      let added = 0
      let removed = 0
      for (const part of diff) {
        const wordCount = part.value.trim().split(/\s+/).filter(Boolean).length
        if (part.added) added += wordCount
        if (part.removed) removed += wordCount
      }
      
      setDiffResult(diff)
      setChangeStats({ added, removed })
    }, 400) // Debounce so typing isn't blocked by massive text diffing

    return () => clearTimeout(timer)
  }, [savedContent, draftContent])

  const handleAccept = async () => {
    setIsAccepting(true)
    try {
      if (props.variant === "protocol") {
        const newVersion = bumpVersion(props.currentVersion)
        await recordDiff({
          recordType: "protocol",
          recordId: props.protocolId,
          previousContent: savedContent,
          newContent: draftContent,
          documentTitle: props.documentTitle,
        })
        await props.onAccept(draftContent, newVersion)
      } else {
        if (props.noteId) {
          await recordDiff({
            recordType: "lab_note",
            recordId: props.noteId,
            previousContent: savedContent,
            newContent: draftContent,
          })
        }
        await props.onAccept(draftContent)
      }
    } finally {
      setIsAccepting(false)
    }
  }

  const handleHistoryOpen = () => {
    if (props.variant === "lab_note" && !props.noteId) return
    setHistoryOpen(true)
    loadDiffs()
  }

  const barShellClass =
    "sticky bottom-0 z-30 shrink-0 border-t border-border/60 bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/90"

  if (!isVisible) return null

  const statusBadge =
    props.variant === "protocol" ? (
      <Badge variant="outline" className="ml-auto text-2xs tabular-nums">
        v{props.currentVersion}
      </Badge>
    ) : (
      <Badge variant="outline" className="ml-auto text-2xs tabular-nums">
        Saved
      </Badge>
    )

  const historyDisabled = props.variant === "lab_note" && !props.noteId

  if (!isDirty) {
    return (
      <>
        <div className={barShellClass} role="status" aria-live="polite">
          <div className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1.5 px-2 py-2 sm:min-h-10 sm:px-3 sm:py-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-xs text-muted-foreground">No pending changes</span>
            {statusBadge}
            <Button
              variant="ghost"
              size="sm"
              className="min-h-9 gap-1 px-2 text-micro text-muted-foreground touch-manipulation sm:min-h-6"
              onClick={handleHistoryOpen}
              disabled={historyDisabled}
              title={
                historyDisabled ? "Save the note first to see history" : "Change history"
              }
            >
              <History className="h-3.5 w-3.5" />
              History
            </Button>
          </div>
        </div>
        <ContentDiffHistoryDialog
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          diffs={diffs}
          loading={diffsLoading}
          error={diffsError}
          exportContext={historyExportContext}
        />
      </>
    )
  }

  const expandedHint =
    props.variant === "protocol" ? (
      <span className="text-xs text-muted-foreground">
        (new version will be {bumpVersion(props.currentVersion)})
      </span>
    ) : (
      <span className="text-xs text-muted-foreground">
        (changes will be saved to the server)
      </span>
    )

  return (
    <>
      <div className={barShellClass}>
        <div className="flex flex-col gap-2 px-2 py-2 sm:flex-row sm:items-center sm:gap-2 sm:px-3 sm:py-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span className="text-xs font-medium text-foreground">Pending changes</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {changeStats.added > 0 && (
                <Badge
                  variant="secondary"
                  className="text-xs gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                >
                  +{changeStats.added} words
                </Badge>
              )}
              {changeStats.removed > 0 && (
                <Badge
                  variant="secondary"
                  className="text-xs gap-1 bg-destructive/10 text-destructive border-destructive/20"
                >
                  -{changeStats.removed} words
                </Badge>
              )}
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:w-auto sm:shrink-0 sm:items-center sm:gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="min-h-10 gap-1 px-2 text-micro text-muted-foreground touch-manipulation sm:min-h-6"
              onClick={() => setIsExpanded((v) => !v)}
            >
              <ClipboardList className="h-3.5 w-3.5" />
              <span className="truncate">{isExpanded ? "Hide diff" : "Review diff"}</span>
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="min-h-10 gap-1 px-2 text-micro text-muted-foreground touch-manipulation sm:min-h-6"
              onClick={handleHistoryOpen}
              disabled={historyDisabled}
              title={
                historyDisabled ? "Save the note first to see history" : "Change history"
              }
            >
              <History className="h-3.5 w-3.5" />
              History
            </Button>

            <Separator orientation="vertical" className="hidden h-5 sm:block" />

            <Button
              variant="ghost"
              size="sm"
              className="min-h-10 min-w-0 gap-1 px-2 text-micro text-muted-foreground hover:bg-destructive/10 hover:text-destructive touch-manipulation sm:min-h-6"
              onClick={onReject}
              disabled={isAccepting}
            >
              <XCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Discard</span>
            </Button>

            <Button
              size="sm"
              data-tour="accept-save"
              className="min-h-10 min-w-0 gap-1 px-2 text-micro touch-manipulation sm:min-h-6 sm:px-2.5"
              onClick={handleAccept}
              disabled={isAccepting}
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{isAccepting ? "Saving…" : "Accept & Save"}</span>
            </Button>
          </div>
        </div>

        {/* Expandable diff preview */}
        {isExpanded && (
          <div className="border-t border-border/50 bg-muted/15">
            <div className="flex flex-col gap-0.5 px-2 py-1.5 sm:flex-row sm:items-center sm:gap-2 sm:px-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Word-level diff
              </span>
              {expandedHint}
            </div>
            <div className="max-h-[40vh] overflow-y-auto overflow-x-auto px-2 pb-3 sm:max-h-48 sm:px-3">
              <p className="text-xs leading-relaxed font-mono whitespace-pre-wrap break-words">
                {diffResult.map((part, i) => {
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
          </div>
        )}
      </div>

      <ContentDiffHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        diffs={diffs}
        loading={diffsLoading}
        error={diffsError}
        exportContext={historyExportContext}
      />
    </>
  )
}
