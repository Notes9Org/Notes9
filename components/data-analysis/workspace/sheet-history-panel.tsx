"use client"

import { useMemo } from "react"
import { ArrowRight, DownloadSimple, ClockCounterClockwise } from "@phosphor-icons/react/ssr"

import { Button } from "@/components/ui/button"
import {
  auditLogToCsv,
  type AuditBoundary,
  type SheetAuditEntry,
} from "@/lib/data-analysis/workspace/sheet-audit"

/**
 * What changed in the spreadsheet, and when.
 *
 * The one edit on this page that used to leave no trace. Exclusions carry who
 * and why; rail edits are typed mutations on the provenance card; a cell typed
 * over in the grid was simply the new value, with the old one gone.
 *
 * Entries are cut at boundaries — an attach, a save, a sheet the app appends —
 * so this is a record of what changed between two points, not of the order the
 * changes were made in. That limit is stated in the panel rather than left for
 * someone to discover during an audit.
 */

const BOUNDARY_LABEL: Record<AuditBoundary, string> = {
  attach: "File attached",
  save: "Saved",
  "app-sheet": "Written by Notes9",
  manual: "Marked here",
}

function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const shown = (v: string | number | null) =>
  v === null || v === "" ? <span className="italic text-muted-foreground/70">empty</span> : String(v)

export function SheetHistoryPanel({
  log,
  fileName,
}: {
  log: SheetAuditEntry[]
  /** Names the exported file. */
  fileName: string
}) {
  // Newest first: the question asked of a history is almost always "what
  // happened last", and the trail can run to fifty entries.
  const entries = useMemo(() => [...log].reverse(), [log])

  const exportCsv = () => {
    const blob = new Blob([auditLogToCsv(log)], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${(fileName || "analysis").replace(/\.[^.]+$/, "")}-sheet-history.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (entries.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <ClockCounterClockwise className="size-5 text-muted-foreground/60" />
        <p className="text-[13px] text-muted-foreground">No changes to the sheet yet.</p>
        <p className="max-w-[36ch] text-[11.5px] leading-relaxed text-muted-foreground/80">
          Edits are recorded when you save, attach a file, or Notes9 writes a sheet — with the value
          that was there before.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Sheet history
        </span>
        <Button variant="outline" size="sm" className="ml-auto h-7" onClick={exportCsv}>
          <DownloadSimple className="mr-1.5 size-3.5" /> Export (.csv)
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="overflow-hidden rounded-xl border border-border/70">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border/60 bg-muted/25 px-3 py-2">
                <span className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">{entry.label}</span>
                <span className="rounded bg-background px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                  {BOUNDARY_LABEL[entry.boundary]}
                </span>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  {when(entry.at)}
                </span>
                <span className="w-full text-[11px] text-muted-foreground">
                  {entry.actor} ·{" "}
                  {entry.changeCount === 0
                    ? "no cell changes"
                    : `${entry.changeCount} cell${entry.changeCount === 1 ? "" : "s"} changed`}
                </span>
              </div>

              {entry.sheetChanges.length > 0 && (
                <ul className="border-b border-border/60 px-3 py-1.5">
                  {entry.sheetChanges.map((sc, i) => (
                    <li key={i} className="py-0.5 text-[12px] text-muted-foreground">
                      {sc.kind === "sheet-added" && <>Sheet “{sc.sheet}” added</>}
                      {sc.kind === "sheet-removed" && <>Sheet “{sc.sheet}” removed</>}
                      {sc.kind === "sheet-renamed" && (
                        <>
                          Sheet renamed “{sc.from}” → “{sc.sheet}”
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {entry.changes.length > 0 && (
                <table className="w-full text-[12px] tabular-nums">
                  <tbody>
                    {entry.changes.map((c) => (
                      <tr key={`${c.sheet}:${c.a1}`} className="border-b border-border/40 last:border-b-0">
                        <td className="w-px whitespace-nowrap py-1.5 pl-3 pr-3 font-mono text-[11.5px] font-semibold text-foreground">
                          {c.a1}
                          <span className="ml-1.5 font-sans text-[10.5px] font-normal text-muted-foreground">
                            {c.sheet}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 font-mono text-muted-foreground line-through decoration-muted-foreground/40">
                          {shown(c.before)}
                        </td>
                        <td className="w-px py-1.5 pr-1.5">
                          <ArrowRight className="size-3 text-muted-foreground/60" />
                        </td>
                        <td className="py-1.5 pr-3 font-mono font-medium text-foreground">
                          {shown(c.after)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {entry.truncated && (
                <p className="px-3 py-1.5 text-[11.5px] text-muted-foreground">
                  {entry.changeCount - entry.changes.length} further change
                  {entry.changeCount - entry.changes.length === 1 ? "" : "s"} counted but not listed.
                </p>
              )}
            </li>
          ))}
        </ul>

        <p className="mt-3 px-1 text-[11px] leading-relaxed text-muted-foreground/80">
          Recorded per session, at each save or attach. Shows what changed between those points and
          what was there before — not the order individual cells were edited in.
        </p>
      </div>
    </div>
  )
}
