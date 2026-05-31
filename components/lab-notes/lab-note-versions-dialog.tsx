"use client"

import { useMemo, useState, useEffect } from "react"
import { diffLines } from "diff"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Loader2, RotateCcw, GitCompare, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { htmlToDiffPlainText } from "@/lib/content-diff-plain-text"
import {
  type DocumentVersion,
  versionAuthorName,
} from "@/hooks/use-document-versions"

/** `diffLines` can be heavy on huge bodies; cap the text it sees. */
const MAX_DIFF_TEXT_LEN = 200_000

type Row =
  | { kind: "add"; text: string }
  | { kind: "del"; text: string }
  | { kind: "ctx"; text: string }

/** Build a GitHub-PR-style line diff (old → new) from two HTML bodies. */
function buildLineDiff(prevHtml: string, nextHtml: string): Row[] {
  let prev = htmlToDiffPlainText(prevHtml || "")
  let next = htmlToDiffPlainText(nextHtml || "")
  if (prev.length > MAX_DIFF_TEXT_LEN) prev = prev.slice(0, MAX_DIFF_TEXT_LEN)
  if (next.length > MAX_DIFF_TEXT_LEN) next = next.slice(0, MAX_DIFF_TEXT_LEN)

  const parts = diffLines(prev, next)
  const rows: Row[] = []
  for (const part of parts) {
    const lines = part.value.split("\n")
    // diffLines keeps a trailing "" after the final newline — drop it.
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop()
    for (const line of lines) {
      if (part.added) rows.push({ kind: "add", text: line })
      else if (part.removed) rows.push({ kind: "del", text: line })
      else rows.push({ kind: "ctx", text: line })
    }
  }
  return rows
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

const actionBadge: Record<DocumentVersion["action"], { label: string; cls: string }> = {
  create: { label: "Created", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  update: { label: "Edited", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20" },
  restore: { label: "Restored", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" },
  delete: { label: "Deleted", cls: "bg-destructive/10 text-destructive border-destructive/20" },
}

export function LabNoteVersionsDialog({
  open,
  onOpenChange,
  versions,
  loading,
  error,
  /** The live, possibly-uncommitted editor body — used as the "current" side of the newest diff. */
  currentContent,
  onRestore,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  versions: DocumentVersion[]
  loading: boolean
  error: string | null
  currentContent: string
  onRestore: (version: DocumentVersion) => Promise<void>
}) {
  // versions arrive newest-first. The selected version is diffed against the one
  // immediately before it (or empty for v1).
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<DocumentVersion | null>(null)

  useEffect(() => {
    if (!open) return
    setSelectedId((prev) => prev ?? versions[0]?.id ?? null)
  }, [open, versions])

  const selected = versions.find((v) => v.id === selectedId) ?? versions[0] ?? null
  const selectedIdx = selected ? versions.findIndex((v) => v.id === selected.id) : -1
  // Newest-first array → the "previous" version sits at idx+1.
  const previous = selectedIdx >= 0 ? versions[selectedIdx + 1] ?? null : null
  const isNewest = selectedIdx === 0

  const diffRows = useMemo(() => {
    if (!selected) return []
    const prevBody = previous?.content ?? ""
    // For the newest version, compare against the live editor body so the user
    // sees any still-uncommitted edits too; otherwise compare snapshot→snapshot.
    const nextBody = isNewest ? currentContent : selected.content ?? ""
    return buildLineDiff(prevBody, nextBody)
  }, [selected, previous, isNewest, currentContent])

  const addCount = diffRows.filter((r) => r.kind === "add").length
  const delCount = diffRows.filter((r) => r.kind === "del").length

  const handleRestore = async (v: DocumentVersion) => {
    setRestoring(v.id)
    try {
      await onRestore(v)
    } finally {
      setRestoring(null)
      setConfirmRestore(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] max-h-[80vh] w-[min(96vw,72rem)] max-w-[min(96vw,72rem)] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <GitCompare className="h-4 w-4" />
            Version history
          </DialogTitle>
          <DialogDescription className="sr-only">
            Browse, compare, and restore previous versions of this lab note.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* Version list */}
          <aside className="flex max-h-40 min-h-0 shrink-0 flex-col overflow-y-auto border-b border-border/60 sm:max-h-none sm:w-64 sm:border-b-0 sm:border-r">
            {loading && versions.length === 0 ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : error ? (
              <div className="p-4 text-sm text-destructive">{error}</div>
            ) : versions.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No versions yet. Press Save to create one.</div>
            ) : (
              <ul className="flex flex-col">
                {versions.map((v) => {
                  const badge = actionBadge[v.action]
                  const isSel = selected?.id === v.id
                  return (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(v.id)}
                        className={cn(
                          "flex w-full flex-col items-start gap-1 border-b border-border/40 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                          isSel && "bg-muted",
                        )}
                      >
                        <div className="flex w-full items-center gap-2">
                          <span className="font-medium tabular-nums">v{v.version_no}</span>
                          <Badge variant="outline" className={cn("text-2xs", badge.cls)}>
                            {badge.label}
                          </Badge>
                          <span className="ml-auto text-2xs text-muted-foreground tabular-nums">
                            {v.words_added > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{v.words_added} </span>}
                            {v.words_removed > 0 && <span className="text-destructive">-{v.words_removed}</span>}
                          </span>
                        </div>
                        <span className="truncate text-xs text-muted-foreground">
                          {versionAuthorName(v)} · {fmtDate(v.created_at)}
                        </span>
                        {v.change_summary && (
                          <span className="line-clamp-1 text-xs text-foreground/70">{v.change_summary}</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </aside>

          {/* Diff pane */}
          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            {selected ? (
              <>
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2">
                  <span className="text-sm font-medium">
                    {previous ? `v${previous.version_no} → v${selected.version_no}` : `v${selected.version_no} (initial)`}
                    {isNewest ? " · current" : ""}
                  </span>
                  {addCount > 0 && (
                    <Badge variant="outline" className="text-2xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">
                      +{addCount} lines
                    </Badge>
                  )}
                  {delCount > 0 && (
                    <Badge variant="outline" className="text-2xs bg-destructive/10 text-destructive border-destructive/20">
                      -{delCount} lines
                    </Badge>
                  )}
                  <span
                    className="ml-auto inline-flex items-center gap-1 text-2xs text-muted-foreground"
                    title={`content hash ${selected.content_hash}`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span className="font-mono">{selected.content_hash.slice(0, 10)}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1"
                    disabled={restoring !== null || isNewest}
                    title={isNewest ? "This is already the current version" : `Restore v${selected.version_no}`}
                    onClick={() => setConfirmRestore(selected)}
                  >
                    {restoring === selected.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    Restore
                  </Button>
                </div>

                <div className="min-h-0 flex-1 overflow-auto bg-muted/10">
                  {diffRows.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No textual differences.</p>
                  ) : (
                    <pre className="m-0 min-w-full whitespace-pre-wrap break-words p-0 font-mono text-xs leading-relaxed">
                      {diffRows.map((r, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex gap-2 px-3 py-0.5",
                            r.kind === "add" && "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
                            r.kind === "del" && "bg-destructive/10 text-destructive",
                          )}
                        >
                          <span className="shrink-0 select-none opacity-60">
                            {r.kind === "add" ? "+" : r.kind === "del" ? "-" : " "}
                          </span>
                          <span className="min-w-0 break-words">{r.text || " "}</span>
                        </div>
                      ))}
                    </pre>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Select a version to see its changes.
              </div>
            )}
          </section>
        </div>
      </DialogContent>

      <AlertDialog open={confirmRestore !== null} onOpenChange={(o) => { if (!o) setConfirmRestore(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore v{confirmRestore?.version_no}?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces the note's current content with the v{confirmRestore?.version_no} snapshot and records it as a
              new, audited "restore" version. Nothing is deleted — the current content stays in history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (confirmRestore) void handleRestore(confirmRestore)
              }}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
