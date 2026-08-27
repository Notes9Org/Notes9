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

/**
 * Univer's `ICommandService` command type enum value for MUTATION commands.
 * Mirrors `CommandType.MUTATION` from `@univerjs/core` (kept as a local constant
 * to avoid a brittle deep import). If Univer changes this enum, update here.
 */
const UNIVER_COMMAND_TYPE_MUTATION = 2

/**
 * The spreadsheet grid stays light in both themes, deliberately.
 *
 * Univer was previously given an inverted palette in dark mode (cells at
 * #1C1D22, text at #E4E6EF). In practice that was close to unreadable: the
 * grid lines, the cell fills and the surrounding app chrome all collapsed into
 * the same near-black, and any cell styling authored against a light background
 * (which is what users actually author, and what imported .xlsx files carry)
 * lost its contrast entirely.
 *
 * A light canvas inside a dark shell is the norm for document surfaces, the
 * page in a word processor, the artboard in a design tool, and for a lab
 * notebook it carries the right metaphor besides. It also fixes a latent bug:
 * `isDark` was excluded from the mount effect's deps to avoid destroying
 * unsaved edits on every theme toggle, so the grid's theme silently lagged the
 * rest of the UI until the next remount anyway.
 */

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
   * `embed`, compact sheet (notes). `workspace`, full ribbon (Start / Formulas / …), toolbars, closer to desktop Excel.
   */
  variant?: "embed" | "workspace"
  /**
   * Chromeless grid: hides the toolbar / formula bar / status footer, leaving a
   * clean sheet (column & row headers + cells). Right-click menu stays. Use for
   * narrow rails where the full ribbon is too heavy. Opt-in; defaults off.
   */
  compact?: boolean
  /** Outer scroll boundary height */
  heightClass?: string
  /** Changes remount Univer instance */
  instanceKey?: string | number
  /**
   * Where the live workbook is kept across remounts.
   *
   * `workbookSnapshot` is read once per mount, and several things remount an
   * already-edited instance without any new data arriving -- toggling `compact`
   * (the maximize/restore control) is in this effect's dependency array, and
   * the rail and the maximized editor are different positions in the tree, so
   * React unmounts one and mounts the other. Re-reading the prop there restored
   * whatever the parent last passed at LOAD time, silently dropping every edit
   * and every added sheet since; the next autosave from the fresh instance then
   * wrote that stale workbook back over the parent's live copy.
   *
   * A ref rather than a prop because the ordering is the whole point: the
   * outgoing instance writes here SYNCHRONOUSLY as it tears down, while the
   * `onPersistSnapshot` that carries the same bytes into React state is a
   * microtask that does not land until after the incoming instance has already
   * mounted. Only the ref is current at the moment it is read.
   */
  latestSnapshotRef?: { current: Record<string, unknown> | null }
  /** Fires when the active cell/selection changes (for wiring cells → chart). */
  onSelectionChange?: (sel: SheetSelection | null) => void
}

/** The active sheet selection surfaced to callers. */
export type SheetSelection = {
  /** A1 notation of the active cell, e.g. "B2". */
  a1: string
  row: number
  col: number
  /** Display text of the active cell. */
  text: string
  /** Text of the header cell (row 1) in the active cell's column. */
  columnHeader: string
}

export function UniverWorkbookView({
  workbookEncoded,
  workbookSnapshot,
  fileName,
  onPersistEncoded,
  onPersistSnapshot,
  readOnly = false,
  variant = "embed",
  compact = false,
  heightClass = "h-[520px]",
  instanceKey = 0,
  onSelectionChange,
  latestSnapshotRef,
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
  const onSelectionChangeRef = useRef(onSelectionChange)
  onSelectionChangeRef.current = onSelectionChange

  const workbookEncodedPropRef = useRef(workbookEncoded)
  const workbookSnapshotPropRef = useRef(workbookSnapshot)
  workbookEncodedPropRef.current = workbookEncoded
  workbookSnapshotPropRef.current = workbookSnapshot
  const latestSnapshotRefRef = useRef(latestSnapshotRef)
  latestSnapshotRefRef.current = latestSnapshotRef

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
    let resizeObserver: ResizeObserver | null = null

    const mount = async () => {
      if (disposed) return
      if (!containerRef.current) return

      const encProp = workbookEncodedPropRef.current
      /**
       * The box this instance reads from and writes back to, captured ONCE here
       * and never re-read from the prop.
       *
       * This is the fix for "importing a new file re-opens the old sheet".
       * React tears the outgoing instance down AFTER the parent has already
       * pointed at the new workbook, and the teardown saves what that instance
       * was showing — the OLD sheet — straight over the parent's new value. The
       * incoming instance then read it back and the import appeared to do
       * nothing.
       *
       * The parent hands out a NEW box whenever it installs a different
       * workbook, so the departing instance writes to the box it was mounted
       * with, which by then nobody reads. Capturing it here rather than through
       * `latestSnapshotRefRef` at write time is the whole mechanism: read late
       * and the closure would find the new box again.
       */
      const box = latestSnapshotRefRef.current ?? null
      const rememberLatest = (snapshot: Record<string, unknown> | null | undefined) => {
        if (box && snapshot) box.current = snapshot
      }
      // The live workbook wins over the mount-time prop, so a remount that is
      // not a data change (maximize, dock toggle) keeps the researcher's edits.
      const snapProp = box?.current ?? workbookSnapshotPropRef.current

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

        const [{ createUniver, LocaleType, defaultTheme }, { UniverSheetsCorePreset }] = await Promise.all([
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
          // Compact mode strips the ribbon and the formula bar for a clean grid.
          header: !compact,
          toolbar: !compact,
          formulaBar: !compact,
          // The FOOTER IS THE SHEET BAR: the sheet tabs and the "+" that adds a
          // sheet live there and nowhere else. Gating it on `!compact` meant the
          // only place in data-analysis that could add a sheet was the maximized
          // data editor -- the two rail-mounted hosts render compact, so "new
          // sheet" was simply absent from the view users spend their time in.
          // The ribbon is what compact exists to remove; the sheet bar is a
          // navigation control, and hiding it removes a capability rather than
          // chrome. `statusBarStatistic` below still goes, so compact keeps the
          // slim tab strip without the sum/average readout beside it.
          footer: true,
          menu: !compact,
          contextMenu: true,
          statusBarStatistic: !compact,
          // Always disable Univer auto-focus so it does not fight Radix Dialog focus / cell editor.
          disableAutoFocus: true,
          ribbonType: "classic",
        }

        // Always the light palette, see the note at the top of this file.
        const theme = defaultTheme

        // The `workspace` variant (data-analysis workbench + full-screen data
        // editor) gets the Excel-grade feature suite, sort, filter, find &
        // replace, conditional formatting, data validation, structured tables,
        // notes, threaded comments, hyperlinks, images. The lean `embed`
        // variant used inside note pages stays core-only. Loaded dynamically so
        // the notes editor never bundles the extra plugins.
        let featurePresets: unknown[] = []
        let localeBundle: typeof sheetsCoreEnUS = sheetsCoreEnUS
        if (variant === "workspace") {
          try {
            const { buildWorkspaceSheetFeatures } = await import(
              "@/components/spreadsheet/univer-workspace-presets"
            )
            if (disposed || !containerRef.current) return
            const features = buildWorkspaceSheetFeatures()
            featurePresets = features.presets
            localeBundle = features.locale
          } catch (error) {
            console.warn(
              "Univer workspace feature presets failed to load; using core preset only.",
              error
            )
          }
        }

        const { univer, univerAPI } = createUniver({
          locale: LocaleType.EN_US,
          locales: {
            [LocaleType.EN_US]: localeBundle,
          },
          theme,
          presets: [
            UniverSheetsCorePreset(presetConfig),
            ...featurePresets,
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
              rememberLatest(snapshot as Record<string, unknown>)
              // Avoid setState while the user is typing, re-renders can steal focus from the cell editor.
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
                // MUTATION covers value changes, cell style (color, font,
                // background, bold, italic, borders, merges, number format) and all
                // structural changes (insert/delete/rename/hide sheet, etc.)
                if (command.type === UNIVER_COMMAND_TYPE_MUTATION) {
                  persistWorkbook()
                }
              }),
            ]

        // Surface the active selection (best-effort via the Facade API) so
        // callers can bind sheet cells to chart title/axis/series. Defensive:
        // if the facade shape differs, the feature simply stays inert.
        if (onSelectionChangeRef.current) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const api = univerAPI as any
            const evt = api.Event?.SelectionChanged ?? api.Event?.SelectionMoveEnd
            const emit = () => {
              try {
                const wb = api.getActiveWorkbook?.()
                const sheet = wb?.getActiveSheet?.()
                const range = sheet?.getActiveRange?.()
                if (!range) return onSelectionChangeRef.current?.(null)
                const rawValue = typeof range.getValue === "function" ? range.getValue() : null
                const row = typeof range.getRow === "function" ? range.getRow() : 0
                const col = typeof range.getColumn === "function" ? range.getColumn() : 0
                const a1 = typeof range.getA1Notation === "function" ? range.getA1Notation() : ""
                let columnHeader = ""
                try {
                  const h = sheet?.getRange?.(0, col)?.getValue?.()
                  columnHeader = h == null ? "" : String(h)
                } catch {
                  /* header lookup optional */
                }
                onSelectionChangeRef.current?.({
                  a1: String(a1 ?? ""),
                  row,
                  col,
                  text: rawValue == null ? "" : String(rawValue),
                  columnHeader,
                })
              } catch {
                onSelectionChangeRef.current?.(null)
              }
            }
            if (evt) disposables.push(univerAPI.addEvent(evt, emit))
          } catch {
            /* selection wiring is optional */
          }
        }

        cleanup = () => {
          mountedRef.current = false
          if (saveTimer) {
            clearTimeout(saveTimer)
          }
          try {
            const snapshot = fWorkbook?.save?.()
            if (snapshot && !readOnly) {
              // Unconditional, and before the equality check below: the check
              // asks "does React already know this?", which is a different
              // question from "what does the next mount read?". A teardown whose
              // bytes happen to match the last autosave still has to leave the
              // ref pointing at them, or the incoming instance falls back to the
              // load-time prop.
              rememberLatest(snapshot as Record<string, unknown>)
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
          } catch (e) {
            console.warn("Univer cleanup: snapshot persist failed", e)
          }
          disposables.forEach((disposable) => {
            try {
              disposable.dispose()
            } catch (e) {
              console.warn("Univer cleanup: disposable.dispose() failed", e)
            }
          })
          try {
            const univerDisposable = univer as { dispose?: () => void }
            const canDispose = !!mountHost?.isConnected
            if (canDispose) {
              window.setTimeout(() => {
                try {
                  univerDisposable.dispose?.()
                } catch (e) {
                  console.warn("Univer cleanup: univer.dispose() failed", e)
                }
              }, 0)
            }
          } catch (e) {
            console.warn("Univer cleanup: teardown failed", e)
          }
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

    const startMountAttempt = () => {
      if (disposed) return
      if (!containerRef.current) return

      const width = containerRef.current.clientWidth
      const height = containerRef.current.clientHeight

      if (width > 0 && height > 0) {
        if (resizeObserver) {
          resizeObserver.disconnect()
          resizeObserver = null
        }
        void mount()
      } else {
        if (!resizeObserver && typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
              const { width: w, height: h } = entry.contentRect
              if (w > 0 && h > 0) {
                if (resizeObserver) {
                  resizeObserver.disconnect()
                  resizeObserver = null
                }
                void mount()
              }
            }
          })
          resizeObserver.observe(containerRef.current)
        } else if (typeof ResizeObserver === "undefined") {
          // Fallback if ResizeObserver is somehow absent (e.g. SSR/old environments)
          void mount()
        }
      }
    }

    startMountAttempt()

    return () => {
      cleanup?.()
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      disposed = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceKey, variant, compact, readOnly, fileName, dataRevision, canAttemptMount])

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
