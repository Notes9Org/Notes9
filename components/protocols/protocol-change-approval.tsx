"use client"

import { useState, useMemo } from "react"
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
} from "lucide-react"
import { cn } from "@/lib/utils"

export interface ProtocolChangeApprovalProps {
  savedContent: string
  draftContent: string
  protocolId: string
  currentVersion: string
  onAccept: (newContent: string, newVersion: string) => Promise<void>
  onReject: () => void
  isVisible: boolean
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
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

export function ProtocolChangeApprovalBar({
  savedContent,
  draftContent,
  protocolId,
  currentVersion,
  onAccept,
  onReject,
  isVisible,
}: ProtocolChangeApprovalProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isAccepting, setIsAccepting] = useState(false)

  const diffResult = useMemo(() => {
    const savedText = stripHtmlTags(savedContent)
    const draftText = stripHtmlTags(draftContent)
    return diffWords(savedText, draftText)
  }, [savedContent, draftContent])

  const changeStats = useMemo(() => {
    let added = 0
    let removed = 0
    for (const part of diffResult) {
      const wordCount = part.value.trim().split(/\s+/).filter(Boolean).length
      if (part.added) added += wordCount
      if (part.removed) removed += wordCount
    }
    return { added, removed }
  }, [diffResult])

  const hasChanges = changeStats.added > 0 || changeStats.removed > 0

  const handleAccept = async () => {
    setIsAccepting(true)
    try {
      const newVersion = bumpVersion(currentVersion)
      await onAccept(draftContent, newVersion)
    } finally {
      setIsAccepting(false)
    }
  }

  if (!isVisible || !hasChanges) return null

  return (
    <div className="border-t bg-background shadow-[0_-2px_12px_rgba(0,0,0,0.08)] shrink-0">
      {/* Collapsed header row */}
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="text-sm font-medium text-foreground">Pending changes</span>
          <div className="flex items-center gap-1.5">
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

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground"
            onClick={() => setIsExpanded((v) => !v)}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            {isExpanded ? "Hide diff" : "Review diff"}
            {isExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>

          <Separator orientation="vertical" className="h-5" />

          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={onReject}
            disabled={isAccepting}
          >
            <XCircle className="h-3.5 w-3.5" />
            Discard
          </Button>

          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleAccept}
            disabled={isAccepting}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {isAccepting ? "Saving…" : "Accept & Save"}
          </Button>
        </div>
      </div>

      {/* Expandable diff preview */}
      {isExpanded && (
        <div className="border-t bg-muted/20">
          <div className="px-4 py-1.5 flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Word-level diff
            </span>
            <span className="text-xs text-muted-foreground">
              (new version will be {bumpVersion(currentVersion)})
            </span>
          </div>
          <div className="px-4 pb-4 max-h-52 overflow-y-auto">
            <p className="text-sm leading-relaxed font-mono whitespace-pre-wrap">
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
  )
}
