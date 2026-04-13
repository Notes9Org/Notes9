"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { UniverWorkbookView } from "@/components/spreadsheet/univer-workbook-view"
import {
  downloadSnapshotAsXlsxFile,
  exportSnapshotFirstSheetAsCsv,
} from "@/lib/spreadsheet-workbook"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Download, FileSpreadsheet, Loader2, Maximize2, Minimize2 } from "lucide-react"

export function isTabularExperimentFile(file: {
  file_name: string
  file_type?: string | null
  tabular_format?: string | null
}): boolean {
  if (file.tabular_format) return true
  const n = file.file_name.toLowerCase()
  return n.endsWith(".csv") || n.endsWith(".xlsx") || n.endsWith(".xls")
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  experimentId: string
  fileId: string
  fileName: string
}

export function ExperimentDataTabularDialog({
  open,
  onOpenChange,
  experimentId,
  fileId,
  fileName,
}: Props) {
  const { toast } = useToast()
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [fullPage, setFullPage] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestSnapshotRef = useRef<Record<string, unknown> | null>(null)

  const flushSave = useCallback(
    async (snap: Record<string, unknown>, syncStorage: boolean) => {
      try {
        const res = await fetch(
          `/api/experiments/${experimentId}/data-files/${fileId}/workbook`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workbook_snapshot: snap, sync_storage: syncStorage }),
          }
        )
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || res.statusText)
        }
      } catch (e: unknown) {
        console.error(e)
        toast({
          title: "Save failed",
          description: e instanceof Error ? e.message : "Could not save workbook",
          variant: "destructive",
        })
      }
    },
    [experimentId, fileId, toast]
  )

  const scheduleSave = useCallback(
    (snap: Record<string, unknown>, syncStorage: boolean) => {
      latestSnapshotRef.current = snap
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        const s = latestSnapshotRef.current
        if (s) void flushSave(s, syncStorage)
      }, 900)
    },
    [flushSave]
  )

  useEffect(() => {
    if (!open) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      const pending = latestSnapshotRef.current
      if (pending) void flushSave(pending, false)
      setSnapshot(null)
      setFullPage(false)
      return
    }

    let cancelled = false
    setLoading(true)

    const load = async () => {
      try {
        const res = await fetch(
          `/api/experiments/${experimentId}/data-files/${fileId}/workbook`
        )
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        if (cancelled) return

        if (data.workbook_snapshot) {
          const snap = data.workbook_snapshot as Record<string, unknown>
          setSnapshot(snap)
          latestSnapshotRef.current = snap
        } else {
          const post = await fetch(
            `/api/experiments/${experimentId}/data-files/${fileId}/workbook`,
            { method: "POST" }
          )
          if (!post.ok) throw new Error(await post.text())
          const again = await fetch(
            `/api/experiments/${experimentId}/data-files/${fileId}/workbook`
          )
          const d2 = await again.json()
          if (!cancelled) {
            const snap = (d2.workbook_snapshot as Record<string, unknown>) ?? null
            setSnapshot(snap)
            latestSnapshotRef.current = snap
          }
        }
      } catch (e: unknown) {
        if (!cancelled) {
          toast({
            title: "Could not load spreadsheet",
            description: e instanceof Error ? e.message : "Unknown error",
            variant: "destructive",
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [open, experimentId, fileId, toast, flushSave])

  const handleExportCsv = () => {
    if (!snapshot) return
    const csv = exportSnapshotFirstSheetAsCsv(snapshot)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = fileName.toLowerCase().endsWith(".csv")
      ? fileName.replace(/\.[^.]+$/, "") + "-export.csv"
      : (fileName.replace(/\.[^.]+$/, "") || "export") + ".csv"
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const handleExportXlsx = () => {
    if (!snapshot) return
    const name = fileName.toLowerCase().endsWith(".xlsx")
      ? fileName
      : (fileName.replace(/\.[^.]+$/, "") || "export") + ".xlsx"
    downloadSnapshotAsXlsxFile(snapshot, name)
  }

  const handleSaveAndSync = () => {
    const s = latestSnapshotRef.current || snapshot
    if (s) void flushSave(s, true)
  }

  const gridHeightClass = fullPage ? "min-h-0 flex-1 h-[min(72vh,calc(100vh-11rem))]" : "min-h-[420px] h-[560px]"

  const preventDialogDismissForUniverPopup = (e: { target: EventTarget | null; preventDefault: () => void }) => {
    const target = e.target as Element | null
    if (
      target?.closest?.("#univer-popup-portal") ||
      target?.closest?.('[data-u-comp="rect-popup"]') ||
      target?.closest?.('[data-u-comp="rect-popup-mask"]') ||
      target?.closest?.(".univer-popup") ||
      target?.closest?.(".univer-popup-mask")
    ) {
      e.preventDefault()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={!loading}
        className={cn(
          "overflow-hidden flex flex-col gap-0 p-0",
          fullPage
            ? "top-4 left-4 right-4 max-h-[calc(100vh-2rem)] h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-none translate-x-0 translate-y-0 sm:max-w-none data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100"
            : "max-h-[90vh] max-w-5xl sm:max-w-5xl"
        )}
        onInteractOutside={(e) => {
          // Univer toolbar popups (color picker, font picker, border panel, etc.) are
          // rendered as position:fixed elements outside the dialog DOM via React portals.
          // Radix DismissableLayer treats clicks on them as "outside" and would close the
          // dialog. Prevent that so users can interact with Univer's popups normally.
          preventDialogDismissForUniverPopup(e)
        }}
        onPointerDownOutside={preventDialogDismissForUniverPopup}
        onFocusOutside={preventDialogDismissForUniverPopup}
      >
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0 border-b sm:px-6 sm:pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
            <DialogTitle className="flex min-w-0 items-center gap-2 text-base">
              <FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-600" />
              <span className="truncate">{fileName}</span>
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setFullPage((v) => !v)}
                title={fullPage ? "Exit full page" : "Full page"}
              >
                {fullPage ? (
                  <>
                    <Minimize2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Exit full page</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Full page</span>
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleExportCsv} disabled={!snapshot}>
                Export CSV
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleExportXlsx} disabled={!snapshot}>
                Export XLSX
              </Button>
              <Button type="button" size="sm" onClick={handleSaveAndSync} disabled={!snapshot}>
                Save & sync file
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className={cn("flex min-h-0 flex-1 flex-col px-1 pb-2 sm:px-2 sm:pb-3", fullPage && "min-h-0")}>
          {loading && (
            <div className="flex h-[420px] flex-1 items-center justify-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
          {!loading && snapshot && (
            <div className={cn("flex min-h-0 flex-1 flex-col", gridHeightClass)}>
              <UniverWorkbookView
                instanceKey={fileId}
                variant="workspace"
                workbookSnapshot={snapshot}
                fileName={fileName}
                heightClass={fullPage ? "h-full min-h-[320px]" : "h-[520px]"}
                onPersistSnapshot={(s) => {
                  latestSnapshotRef.current = s
                  scheduleSave(s, false)
                }}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
