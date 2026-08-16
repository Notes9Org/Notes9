"use client"

import { useMemo } from "react"
import { MagnifyingGlass, Table as TableIcon, WarningCircle } from "@phosphor-icons/react/ssr"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { DataFileRow } from "@/components/data-analysis/data-files-list"

/**
 * ADR-017's `{ error: "unreadable", reason }` failure body, mirrored on the
 * client. `too-large` and `forbidden` are server-decided (before or instead of
 * a download); `not-a-spreadsheet`, `parse-failed` and `no-bytes` only surface
 * after this dialog has actually tried to open the row.
 */
export type WorkbookUnreadableReason = "not-a-spreadsheet" | "parse-failed" | "forbidden" | "no-bytes" | "too-large"

export function isWorkbookUnreadableReason(value: unknown): value is WorkbookUnreadableReason {
  return (
    value === "not-a-spreadsheet" ||
    value === "parse-failed" ||
    value === "forbidden" ||
    value === "no-bytes" ||
    value === "too-large"
  )
}

/** One line each, because this renders inline on a list row, not in a dialog of its own. */
const REASON_LABEL: Record<WorkbookUnreadableReason, string> = {
  "not-a-spreadsheet": "Not a spreadsheet",
  "parse-failed": "File is corrupt or unreadable",
  forbidden: "Shared with you, but the file itself is not — ask the owner to share the project's organization",
  "no-bytes": "Couldn't read this file's contents",
  "too-large": "File is too large to open (over 25MB)",
}

/**
 * Above this, the row count stops implying the list is complete — it matches
 * the page's existing `experiment_data` query ceiling (see ARCHITECTURE.md,
 * "10x files"). The query itself, and any virtualisation past this size, is
 * out of this dialog's scope; the note only stops the list from lying about
 * being exhaustive at the ceiling.
 */
const LIBRARY_ROW_LIMIT = 500

/**
 * The Data Analysis file picker (ADR-017).
 *
 * Every `experiment_data` row the caller can see is listed here — no
 * extension or `file_type` guessing. A row only stops being clickable once an
 * open attempt has actually told us why it can't be opened; `tabularFormat`
 * and `hasSnapshot` being unknown is the ordinary, optimistic case (the file
 * simply hasn't been parsed yet), not a reason to hide or disable it.
 */
export function LibraryDialog({
  open,
  onOpenChange,
  files,
  search,
  onSearchChange,
  loadingFileId,
  fileErrors,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  files: DataFileRow[]
  search: string
  onSearchChange: (value: string) => void
  loadingFileId: string | null
  /** Populated as opens fail, keyed by file id. Never removes a row from `files`. */
  fileErrors: Record<string, WorkbookUnreadableReason>
  onSelect: (file: DataFileRow) => void
}) {
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matched = !q
      ? files
      : files.filter(
          (f) =>
            f.file_name.toLowerCase().includes(q) ||
            (f.experiment_name ?? "").toLowerCase().includes(q) ||
            (f.project_name ?? "").toLowerCase().includes(q),
        )
    return matched.slice(0, LIBRARY_ROW_LIMIT)
  }, [files, search])

  const truncated = files.length > LIBRARY_ROW_LIMIT && visible.length === LIBRARY_ROW_LIMIT

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import from your data files</DialogTitle>
          <DialogDescription>Load a file you&rsquo;ve uploaded to an experiment straight into the analysis workspace.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <MagnifyingGlass className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search files…" className="pl-8" />
        </div>
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {visible.map((f) => {
            const reason = fileErrors[f.id]
            const disabled = reason != null || loadingFileId != null
            return (
              <button
                key={f.id}
                onClick={() => onSelect(f)}
                disabled={disabled}
                className="flex w-full items-start gap-3 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {reason ? (
                  <WarningCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                ) : (
                  <TableIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{f.file_name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {f.experiment_name ?? "-"}
                    {f.project_name ? ` · ${f.project_name}` : ""}
                  </div>
                  {reason && <div className="mt-0.5 text-xs text-destructive">{REASON_LABEL[reason]}</div>}
                </div>
                {!reason && (
                  <span className="shrink-0 text-xs font-medium text-[var(--n9-accent,#965034)]">
                    {loadingFileId === f.id ? "Loading…" : "Load"}
                  </span>
                )}
              </button>
            )
          })}
          {visible.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {search ? "No files match your search." : "No data files in your library yet."}
            </p>
          )}
          {truncated && (
            <p className="pt-1 text-center text-xs text-muted-foreground">
              Showing the first {LIBRARY_ROW_LIMIT} files — search to narrow the list.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
