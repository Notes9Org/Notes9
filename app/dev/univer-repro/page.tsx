"use client"

/**
 * DEV-ONLY repro harness for the fullscreen "+" (new sheet) bug.
 *
 * Mounts UniverWorkbookView in the exact conditions of the maximized data
 * editor inside workspace fullscreen: a position:fixed, overflow-auto shell,
 * the workspace variant, compact={false}, the same heightClass. No auth, no
 * workspace, no other state — if "+" fails here, the bug is in the view or
 * Univer; if it works here, the bug is in the workspace around it.
 *
 * Reached only in development: the middleware opens /dev/ in dev builds, and
 * this component 404s outside them.
 */
import { notFound } from "next/navigation"
import { useMemo, useRef, useState } from "react"
import * as XLSX from "xlsx"
import { UniverWorkbookView } from "@/components/spreadsheet/univer-workbook-view"
import { buildSpreadsheetWorkbookSnapshot } from "@/lib/spreadsheet-workbook"

export default function UniverRepro() {
  if (process.env.NODE_ENV === "production") notFound()
  /* eslint-disable react-hooks/rules-of-hooks */
  const snap = useMemo(() => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Conc", "OD450"],
        [1.5625, 0.089],
        [3.125, 0.171],
        [6.25, 0.402],
      ]),
      "Sheet1"
    )
    return buildSpreadsheetWorkbookSnapshot("repro.xlsx", wb)
  }, [])
  const box = useRef<{ current: Record<string, unknown> | null }>({ current: null })
  const [persists, setPersists] = useState(0)
  const sheetCount = () =>
    ((box.current.current?.sheetOrder as string[] | undefined) ?? []).length

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50 }}
      className="overflow-auto bg-background p-6"
      data-repro-shell
    >
      <p data-repro-status className="mb-2 font-mono text-xs">
        persists={persists} sheets={sheetCount() || 1}
      </p>
      <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card/80">
        <div className="p-2" data-n9-sheet>
          <UniverWorkbookView
            instanceKey={1}
            workbookSnapshot={snap}
            latestSnapshotRef={box.current}
            variant="workspace"
            compact={false}
            heightClass="h-[calc(100vh-13rem)]"
            onPersistSnapshot={(s) => {
              box.current.current = s
              setPersists((n) => n + 1)
              // eslint-disable-next-line no-console
              console.log(
                "[REPRO] persist",
                ((s.sheetOrder as string[] | undefined) ?? []).length,
                "sheets"
              )
            }}
          />
        </div>
      </div>
    </div>
  )
}
