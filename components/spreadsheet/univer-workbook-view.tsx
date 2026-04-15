"use client"

import { useEffect, useRef, useState } from "react"
import "@univerjs/preset-sheets-core/lib/index.css"
import sheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US"
import {
  buildFallbackTable,
  encodeWorkbookAttr,
  decodeWorkbookAttr,
  handleSpreadsheetWheel,
  hasUniverWorkbookApi,
  normalizeWorkbookSnapshot,
  registerSpreadsheetEmbedWheelIsolation,
  scheduleMicrotask,
} from "@/components/spreadsheet/spreadsheet-univer-shared"

function canonicalEncodedFromProp(enc: string, fileName?: string): string | null {
  try {
    const parsed = JSON.parse(decodeWorkbookAttr(enc))
    const workbook = normalizeWorkbookSnapshot(parsed, fileName)
    return encodeWorkbookAttr(JSON.stringify(workbook))
  } catch {
    return null
  }
}

function canonicalJsonFromSnapshot(snap: Record<string, unknown>, fileName?: string): string | null {
  try {
    const workbook = normalizeWorkbookSnapshot(snap, fileName)
    return JSON.stringify(workbook)
  } catch {
    return null
  }
}

export type UniverWorkbookViewProps = {
  /** TipTap-style URI-encoded JSON workbook string */
  workbookEncoded?: string
  /** Raw workbook object (e.g. from DB jsonb) */
  workbookSnapshot?: Record<string, unknown> | null
  fileName?: string
  /** Persist as encoded string (editor embeds) */
  onPersistEncoded?: (encoded: string) => void
  /** Persist as plain object (experiment_data workbook_snapshot) */
  onPersistSnapshot?: (snapshot: Record<string, unknown>) => void
  readOnly?: boolean
  /**
   * `embed` — compact sheet (notes). `workspace` — full ribbon (Start / Formulas / …), toolbars, closer to desktop Excel.
   */
  variant?: "embed" | "workspace"
  /** Outer scroll boundary height */
  heightClass?: string
  /** Changes remount Univer instance */
  instanceKey?: string | number
}

export function UniverWorkbookView({
  workbookEncoded,
  workbookSnapshot,
  fileName,
  onPersistEncoded,
  onPersistSnapshot,
  readOnly = false,
  variant = "embed",
  heightClass = "h-[520px]",
  instanceKey = 0,
}: UniverWorkbookViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const boundaryRef = useRef<HTMLDivElement | null>(null)
  const [fallbackHtml, setFallbackHtml] = useState<string | null>(null)
  const [hasInteractiveSheet, setHasInteractiveSheet] = useState(false)
  const [dataRevision, setDataRevision] = useState(0)
  const lastSavedEncodedRef = useRef(workbookEncoded || "")
  const lastSavedSnapshotJsonRef = useRef(
    workbookSnapshot ? JSON.stringify(workbookSnapshot) : ""
  )
  const isHydratingRef = useRef(false)
  const onPersistEncodedRef = useRef(onPersistEncoded)
  const onPersistSnapshotRef = useRef(onPersistSnapshot)
  onPersistEncodedRef.current = onPersistEncoded
  onPersistSnapshotRef.current = onPersistSnapshot

  const workbookEncodedPropRef = useRef(workbookEncoded)
  const workbookSnapshotPropRef = useRef(workbookSnapshot)
  workbookEncodedPropRef.current = workbookEncoded
  workbookSnapshotPropRef.current = workbookSnapshot

  const mountedRef = useRef(false)

  /** When the parent had no workbook yet (e.g. loading) and data arrives, the mount effect must run without tying to every save. */
  const canAttemptMount =
    (workbookEncoded != null && workbookEncoded.length > 0) || workbookSnapshot != null

  /** When props change to a different workbook than the live instance (undo, server replace), bump revision to remount. */
  useEffect(() => {
    if (!mountedRef.current || isHydratingRef.current) return

    const enc = workbookEncoded
    const snap = workbookSnapshot

    if (enc) {
      const canonical = canonicalEncodedFromProp(enc, fileName)
      if (canonical == null) return
      if (canonical === lastSavedEncodedRef.current) return
      setDataRevision((r) => r + 1)
      return
    }
    if (snap) {
      const canonical = canonicalJsonFromSnapshot(snap, fileName)
      if (canonical == null) return
      if (canonical === lastSavedSnapshotJsonRef.current) return
      setDataRevision((r) => r + 1)
    }
  }, [workbookEncoded, workbookSnapshot, fileName])

  useEffect(() => {
    let disposed = false
    let cleanup: (() => void) | null = null
    let saveTimer: ReturnType<typeof setTimeout> | null = null
    let mountHost: HTMLDivElement | null = null

    const mount = async () => {
      if (!containerRef.current) return

      const encProp = workbookEncodedPropRef.current
      const snapProp = workbookSnapshotPropRef.current

      let parsed: unknown
      try {
        if (encProp) {
          parsed = JSON.parse(decodeWorkbookAttr(encProp))
        } else if (snapProp) {
          parsed = snapProp
        } else {
          return
        }
      } catch {
        return
      }

      try {
        const workbook = normalizeWorkbookSnapshot(parsed, fileName)
        const normalizedEncoded = encodeWorkbookAttr(JSON.stringify(workbook))
        lastSavedEncodedRef.current = normalizedEncoded
        lastSavedSnapshotJsonRef.current = JSON.stringify(workbook)
        setFallbackHtml(buildFallbackTable(workbook))

        const shouldHydrateEncoded =
          encProp != null &&
          encProp !== "" &&
          normalizedEncoded !== encProp &&
          !isHydratingRef.current
        if (shouldHydrateEncoded && onPersistEncodedRef.current) {
          isHydratingRef.current = true
          scheduleMicrotask(() => {
            onPersistEncodedRef.current?.(normalizedEncoded)
            window.setTimeout(() => {
              isHydratingRef.current = false
            }, 0)
          })
        }

        const [{ createUniver, LocaleType }, { UniverSheetsCorePreset }] = await Promise.all([
          import("@univerjs/presets"),
          import("@univerjs/preset-sheets-core"),
        ])

        if (disposed || !containerRef.current) return

        mountHost = document.createElement("div")
        mountHost.className = "h-full w-full"
        const host = containerRef.current
        if (!host) return
        host.replaceChildren(mountHost)

        const presetConfig: Record<string, unknown> = {
          container: mountHost,
          header: true,
          toolbar: true,
          formulaBar: true,
          footer: true,
          menu: true,
          contextMenu: true,
          statusBarStatistic: true,
          // Always disable Univer auto-focus so it does not fight Radix Dialog focus / cell editor.
          disableAutoFocus: true,
          ribbonType: "classic",
        }

        const { univer, univerAPI } = createUniver({
          locale: LocaleType.EN_US,
          locales: {
            [LocaleType.EN_US]: sheetsCoreEnUS,
          },
          presets: [
            [
              UniverSheetsCorePreset(presetConfig),
              {
                lazy: false,
              },
            ],
          ],
        })

        if (!hasUniverWorkbookApi(univerAPI)) {
          console.warn("Univer workbook API missing; using fallback table only.")
          setHasInteractiveSheet(false)
          mountedRef.current = false
          cleanup = () => {
            const el = containerRef.current
            if (el && el === mountHost?.parentElement) {
              el.replaceChildren()
            }
          }
          return
        }

        let fWorkbook: { save?: () => Record<string, unknown> }
        try {
          fWorkbook = univerAPI.createWorkbook(workbook)
        } catch (error) {
          console.error("Failed to create Univer workbook from snapshot", error)
          setHasInteractiveSheet(false)
          mountedRef.current = false
          return
        }
        mountedRef.current = true
        setHasInteractiveSheet(true)

        const persistWorkbook = () => {
          if (disposed || isHydratingRef.current || readOnly) return

          if (saveTimer) {
            clearTimeout(saveTimer)
          }

          saveTimer = setTimeout(() => {
            try {
              const snapshot = fWorkbook.save?.()
              if (!snapshot) return
              const encoded = encodeWorkbookAttr(JSON.stringify(snapshot))
              const snapJson = JSON.stringify(snapshot)
              if (encoded === lastSavedEncodedRef.current && snapJson === lastSavedSnapshotJsonRef.current) return
              lastSavedEncodedRef.current = encoded
              lastSavedSnapshotJsonRef.current = snapJson
              // Avoid setState while the user is typing — re-renders can steal focus from the cell editor.
              isHydratingRef.current = true
              scheduleMicrotask(() => {
                onPersistEncodedRef.current?.(encoded)
                onPersistSnapshotRef.current?.(snapshot as Record<string, unknown>)
                window.setTimeout(() => {
                  isHydratingRef.current = false
                }, 0)
              })
            } catch (error) {
              console.error("Failed to persist workbook", error)
            }
          }, 250)
        }

        const disposables = readOnly
          ? []
          : [
              univerAPI.onCommandExecuted((command: { type: number }) => {
                // type 2 = MUTATION — covers value changes, cell style (color, font,
                // background, bold, italic, borders, merges, number format) and all
                // structural changes (insert/delete/rename/hide sheet, etc.)
                if (command.type === 2) {
                  persistWorkbook()
                }
              }),
            ]

        cleanup = () => {
          mountedRef.current = false
          if (saveTimer) {
            clearTimeout(saveTimer)
          }
          try {
            const snapshot = fWorkbook?.save?.()
            if (snapshot && !readOnly) {
              const encoded = encodeWorkbookAttr(JSON.stringify(snapshot))
              const snapJson = JSON.stringify(snapshot)
              if (encoded !== lastSavedEncodedRef.current || snapJson !== lastSavedSnapshotJsonRef.current) {
                lastSavedEncodedRef.current = encoded
                lastSavedSnapshotJsonRef.current = snapJson
                isHydratingRef.current = true
                scheduleMicrotask(() => {
                  onPersistEncodedRef.current?.(encoded)
                  onPersistSnapshotRef.current?.(snapshot as Record<string, unknown>)
                  window.setTimeout(() => {
                    isHydratingRef.current = false
                  }, 0)
                })
              }
            }
          } catch {}
          disposables.forEach((disposable) => {
            try {
              disposable.dispose()
            } catch {}
          })
          try {
            const univerDisposable = univer as { dispose?: () => void }
            const canDispose = !!mountHost?.isConnected
            if (canDispose) {
              window.setTimeout(() => {
                try {
                  univerDisposable.dispose?.()
                } catch {}
              }, 0)
            }
          } catch {}
          const el = containerRef.current
          if (el && el === mountHost?.parentElement) {
            el.replaceChildren()
          }
        }
      } catch (error) {
        console.error("Failed to mount Univer workbook view", error)
        setHasInteractiveSheet(false)
        mountedRef.current = false
      }
    }

    void mount()

    return () => {
      cleanup?.()
      disposed = true
    }
  }, [instanceKey, variant, readOnly, fileName, dataRevision, canAttemptMount])

  useEffect(() => {
    if (variant === "embed") {
      return registerSpreadsheetEmbedWheelIsolation()
    }

    const boundary = boundaryRef.current
    if (!boundary) return

    const onWheel = (event: WheelEvent) => {
      handleSpreadsheetWheel(event, boundary)
    }

    boundary.addEventListener("wheel", onWheel, { capture: true, passive: false })
    return () => {
      boundary.removeEventListener("wheel", onWheel, true)
    }
  }, [variant, instanceKey])

  return (
    <div
      ref={boundaryRef}
      className={`${heightClass} bg-background [overscroll-behavior:contain]`}
      onTouchMoveCapture={(event) => {
        event.stopPropagation()
      }}
    >
      <div ref={containerRef} className="h-full w-full [overscroll-behavior:contain]" />
      {!hasInteractiveSheet && fallbackHtml ? (
        <div
          className={`max-h-full overflow-auto p-3 [overscroll-behavior:contain] ${heightClass}`}
          dangerouslySetInnerHTML={{ __html: fallbackHtml }}
        />
      ) : null}
    </div>
  )
}
