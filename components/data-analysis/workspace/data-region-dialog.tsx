"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useMemo as _um } from "react"
import { ArrowCounterClockwise, ArrowRight, ArrowUp, CheckCircle, Crosshair, Warning, X } from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { FlareIcon } from "@/components/ui/flare-icon"
import { EASE_OUT } from "./motion"
import type { Finding, FindingAction, FindingLocation, ReceiptLine } from "@/lib/data-analysis/workspace/data-quality"
import type { SpecMutation } from "@/lib/data-analysis/spec/mutations"
import {
  cellAddress,
  columnLetter,
  detectHeader,
  planColumnRange,
  planDataRange,
  type HeaderOverride,
  type HeaderPlan,
} from "@/lib/data-analysis/workspace/bootstrap"

/**
 * Where is your table? — rebuilt around one gesture.
 *
 * The first version of this dialog exposed the detector's whole vocabulary:
 * header row, header row COUNT with a stepper, first column, last column, last
 * data row, unit row — six controls a first-time user had to map onto their own
 * sheet before charting anything. The controls were faithful to the mechanism
 * and useless as an interface: nobody thinks "my header spans two rows", they
 * think "THAT cell is where my table starts".
 *
 * So the rebuilt dialog asks exactly that, in the grid itself:
 *
 *   tap the FIRST HEADER CELL → tap the LAST DATA CELL → done.
 *
 * Everything else is derived or demoted. The two taps define the region's four
 * bounds (start cell fixes the header row AND the first column). A two-row
 * merged header and a unit row are still detected automatically and shown as
 * labelled row tags on the grid — with one-tap "2-row header?" / "units?"
 * pills to correct a wrong guess, replacing the stepper that asked users to
 * know the answer in advance. Typing works too: the range field accepts
 * `C3:F27` for anyone faster with a keyboard than a mouse. Cells above the
 * header remain tappable to pick a chart title, because that is where run
 * titles live.
 */

export interface RegionAxisSuggestion {
  x: string
  y: string[]
  evidence: string
  fromRoles: boolean
}

/** `C4` → {row: 3, col: 2}; null when the text is not a cell ref. */
export function parseCellRef(text: string): { row: number; col: number } | null {
  const m = /^\s*([A-Za-z]{1,3})\s*([0-9]{1,7})\s*$/.exec(text)
  if (!m) return null
  let col = 0
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { row: Number(m[2]) - 1, col: col - 1 }
}

/** `C3:F27` → the override it means; null when unparseable. */
export function parseRangeRef(text: string): HeaderOverride | null {
  const [a, b] = text.split(":")
  if (!a || !b) return null
  const start = parseCellRef(a)
  const end = parseCellRef(b)
  if (!start || !end) return null
  return {
    startRow: Math.min(start.row, end.row),
    endRow: Math.max(start.row, end.row),
    startCol: Math.min(start.col, end.col),
    endCol: Math.max(start.col, end.col),
  }
}

const PREVIEW_ROWS = 12
const PREVIEW_COLS = 10

export function DataRegionDialog({
  open,
  fileName,
  sheetName,
  grid,
  override,
  suggestion,
  onApply,
  onConfirm,
  onDismiss,
  onAskAi,
  applied = [],
  decisions = [],
  onChoose,
  onUndo,
  locate,
  onReveal,
}: {
  open: boolean
  fileName: string | null
  sheetName: string | null
  grid: (string | number | null | undefined)[][]
  override: HeaderOverride
  suggestion: RegionAxisSuggestion | null
  onApply: (next: HeaderOverride) => void
  onConfirm: (chosen: { xKey?: string; yKeys?: string[]; title?: string }) => void
  onDismiss: () => void
  onAskAi?: (prompt: string) => void
  /**
   * The quality review, merged in. One overlay per attach: WHERE the data is
   * (left, the grid) and WHAT needs deciding about it (right), one confirm.
   * Two sequential modals asked the researcher to context-switch twice about
   * one file; side by side, fixing the region visibly updates the findings.
   */
  applied?: ReceiptLine[]
  decisions?: Finding[]
  onChoose?: (finding: Finding, actionIndex: number, mutations: SpecMutation[], previous: FindingAction | null) => void
  onUndo?: (mutation: SpecMutation) => void
  locate?: (loc: FindingLocation) => string | null
  onReveal?: (loc: FindingLocation) => void
}) {
  const reduce = useReducedMotion()
  const plan = useMemo(() => detectHeader(grid, override), [grid, override])

  /** Two-tap flow: the next tap sets the start, then the end, then back. */
  const [picking, setPicking] = useState<"start" | "end" | "axes">("start")
  const [title, setTitle] = useState<string | null>(null)
  const [xPick, setXPick] = useState<string | null>(null)
  const [yPick, setYPick] = useState<string[] | null>(null)
  /** The range field's in-progress text; null = mirror the plan. */
  const [rangeDraft, setRangeDraft] = useState<string | null>(null)
  const [chosen, setChosen] = useState<Record<string, number>>({})
  /** Excel's own gesture: press on the first header cell, drag to the last
      data cell, release. Taps still work; the stage pills are also buttons,
      so a mis-click is one tap back instead of a dead end. */
  const dragStart = useRef<{ r: number; c: number } | null>(null)
  const [dragNow, setDragNow] = useState<{ r: number; c: number } | null>(null)

  useEffect(() => {
    if (open) {
      setPicking("start")
      setTitle(null)
      setXPick(null)
      setYPick(null)
      setRangeDraft(null)
      setChosen({})
    }
  }, [open, fileName, sheetName])

  const x = xPick && plan.columns.includes(xPick) ? xPick : (suggestion?.x ?? "")
  const y = (yPick ?? suggestion?.y ?? []).filter((c) => plan.columns.includes(c))
  const dataRange = planDataRange(plan)
  /** The whole table, header included — what the two taps define. */
  const tableRange =
    plan.columns.length > 0 && plan.dataEnd >= plan.startRow
      ? `${cellAddress(plan.startCol, plan.startRow)}:${cellAddress(plan.endCol, plan.dataEnd)}`
      : ""

  const previewRows = Math.min(Math.max(plan.dataEnd + 2, PREVIEW_ROWS), grid.length)
  const previewCols = Math.min(
    Math.max(plan.endCol + 2, PREVIEW_COLS),
    Math.max(...grid.slice(0, previewRows).map((r) => (r ?? []).length), 1)
  )

  const isHeader = (r: number, c: number) =>
    c >= plan.startCol && c <= plan.endCol && r >= plan.startRow && r < plan.startRow + plan.rowCount

  const commitDrag = (a: { r: number; c: number }, b: { r: number; c: number }) => {
    onApply({
      ...override,
      startRow: Math.min(a.r, b.r),
      startCol: Math.min(a.c, b.c),
      endRow: Math.max(a.r, b.r),
      endCol: Math.max(a.c, b.c),
    })
    setPicking("axes")
  }
  const inDrag = (r: number, c: number) => {
    const a = dragStart.current
    const b = dragNow
    if (!a || !b) return false
    return r >= Math.min(a.r, b.r) && r <= Math.max(a.r, b.r) && c >= Math.min(a.c, b.c) && c <= Math.max(a.c, b.c)
  }

  const tapCell = (r: number, c: number) => {
    setRangeDraft(null)
    // Above the header, a tap means "this text is my chart title" — that is
    // where instrument run titles live, and it is the only thing up there
    // worth tapping.
    const raw = (grid[r] ?? [])[c]
    const text = raw == null ? "" : String(raw).trim()
    if (r < plan.startRow && text !== "" && !Number.isFinite(Number(text))) {
      setTitle((t) => (t === text ? null : text))
      return
    }
    if (picking === "start") {
      onApply({ ...override, startRow: r, startCol: c })
      setPicking("end")
      return
    }
    if (picking === "end") {
      onApply({
        ...override,
        endRow: Math.max(r, plan.startRow),
        endCol: Math.max(c, plan.startCol),
      })
      setPicking("axes")
      return
    }
    // Axes stage. A header-row tap cycles that column none → X → Y → none —
    // the grid is the picker, not a set of dropdowns beside it. A data-cell
    // tap starts a fresh region instead.
    if (isHeader(r, c)) {
      const col = plan.columns[c - plan.startCol]
      if (!col) return
      if (x === col) {
        setXPick(null)
        setYPick([...y.filter((k) => k !== col), col])
      } else if (y.includes(col)) {
        setYPick(y.filter((k) => k !== col))
      } else {
        setXPick(col)
        if (y.includes(col)) setYPick(y.filter((k) => k !== col))
      }
      return
    }
    onApply({ ...override, startRow: r, startCol: c })
    setPicking("end")
  }

  const commitRange = (text: string) => {
    const parsed = parseRangeRef(text)
    if (parsed) onApply({ ...override, ...parsed })
    setRangeDraft(null)
  }

  const inRegion = (r: number, c: number) =>
    c >= plan.startCol && c <= plan.endCol && r >= plan.dataStart && r <= plan.dataEnd
  const isUnit = (r: number, c: number) => plan.unitRow === r && c >= plan.startCol && c <= plan.endCol

  /** The tag a row wears in the gutter: the demarcation, written on the grid. */
  const rowTag = (r: number): { label: string; cls: string } | null => {
    if (r === plan.startRow) return { label: plan.rowCount === 2 ? "X·Y heads ½" : "X·Y headers", cls: "text-[var(--n9-accent,#965034)]" }
    if (plan.rowCount === 2 && r === plan.startRow + 1) return { label: "header ²⁄₂", cls: "text-[var(--n9-accent,#965034)]" }
    if (r === plan.unitRow) return { label: "units", cls: "text-amber-700 dark:text-amber-400" }
    if (r === plan.dataStart && r <= plan.dataEnd) return { label: "X·Y data", cls: "text-muted-foreground" }
    if (r === plan.dataEnd && r > plan.dataStart) return { label: "end", cls: "text-muted-foreground" }
    return null
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }} aria-hidden onClick={onDismiss}
            className="fixed inset-0 z-50 bg-foreground/25 backdrop-blur-[3px]"
          />
          <motion.div
            role="dialog" aria-modal="true" aria-label="Select your data" tabIndex={-1}
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onDismiss() } }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.99 }}
            transition={reduce ? { duration: 0.12 } : { duration: 0.24, ease: EASE_OUT }}
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(72rem,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            {/* ── header ─────────────────────────────────────────────── */}
            <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--n9-accent,#965034)]">
                  Check your data
                </p>
                <p className="truncate text-[14px] font-semibold leading-tight tracking-[-0.01em]">
                  {fileName ?? "This sheet"}{sheetName ? ` · ${sheetName}` : ""}
                </p>
              </div>
              {/* The range, typed. `C3:F27` sets all four bounds at once. */}
              <input
                value={rangeDraft ?? tableRange}
                onChange={(e) => setRangeDraft(e.target.value)}
                onBlur={(e) => rangeDraft !== null && commitRange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitRange(e.currentTarget.value) } }}
                aria-label="Table range"
                spellCheck={false}
                className="h-8 w-[9.5rem] shrink-0 rounded-lg border border-border bg-background px-2.5 text-center font-mono text-[12.5px] font-semibold tabular-nums outline-none transition-all focus:border-[var(--n9-accent,#965034)]/50 focus:ring-2 focus:ring-[var(--n9-accent,#965034)]/15"
              />
              <button
                type="button" onClick={onDismiss} aria-label="Close" title="Keep as detected"
                className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="min-h-0 overflow-auto px-5 py-4">
              {/* ── the one instruction ─────────────────────────────── */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPicking("start")}
                  title="Jump back to this step"
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[12px] font-medium transition-all duration-150 active:scale-95",
                    picking === "start"
                      ? "bg-[var(--n9-accent,#965034)] text-white"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  1 · First header cell
                </button>
                <ArrowRight className="size-3.5 text-muted-foreground/50" />
                <button
                  type="button"
                  onClick={() => setPicking("end")}
                  title="Jump back to this step"
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[12px] font-medium transition-all duration-150 active:scale-95",
                    picking === "end"
                      ? "bg-[var(--n9-accent,#965034)] text-white"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  2 · Last data cell
                </button>
                <ArrowRight className="size-3.5 text-muted-foreground/50" />
                <button
                  type="button"
                  onClick={() => setPicking("axes")}
                  title="Jump back to this step"
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[12px] font-medium transition-all duration-150 active:scale-95",
                    picking === "axes"
                      ? "bg-[var(--n9-accent,#965034)] text-white"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  3 · Tap headers: X → Y
                </button>
                <span className="text-[11px] text-muted-foreground">· drag across the table works too · pills jump back</span>
              </div>

              {/* ── the grid IS the interface ───────────────────────── */}
              <div className="overflow-auto rounded-xl border border-border">
                <table className="border-collapse text-[11.5px] tabular-nums">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 border-b border-r border-border bg-muted/60 px-1.5 py-1" />
                      {Array.from({ length: previewCols }, (_, c) => (
                        <th key={c} className={cn(
                          "border-b border-r border-border px-2 py-0.5 font-mono text-[10px] font-semibold",
                          c >= plan.startCol && c <= plan.endCol ? "text-foreground" : "text-muted-foreground/50"
                        )}>
                          {columnLetter(c)}
                          {(() => {
                            const col = plan.columns[c - plan.startCol]
                            if (!col) return null
                            if (col === x) return <span className="ml-1 rounded bg-[var(--n9-accent,#965034)] px-1 text-[8.5px] text-white">X</span>
                            if (y.includes(col)) return <span className="ml-1 rounded bg-emerald-600 px-1 text-[8.5px] text-white">Y</span>
                            return null
                          })()}
                        </th>
                      ))}
                      <th className="border-b border-border bg-muted/40 px-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: previewRows }, (_, r) => {
                      const tag = rowTag(r)
                      return (
                        <tr key={r}>
                          <th className={cn(
                            "sticky left-0 z-10 border-b border-r border-border px-1.5 py-1 font-mono text-[10px] font-semibold",
                            r >= plan.startRow && r <= plan.dataEnd ? "bg-muted/60 text-foreground" : "bg-muted/40 text-muted-foreground/50"
                          )}>{r + 1}</th>
                          {Array.from({ length: previewCols }, (_, c) => {
                            const raw = (grid[r] ?? [])[c]
                            const text = raw == null ? "" : String(raw)
                            const isStart = r === plan.startRow && c === plan.startCol
                            const isEnd = r === plan.dataEnd && c === plan.endCol
                            const isTitle = title !== null && text.trim() === title && r < plan.startRow
                            return (
                              <td
                                key={c}
                                onPointerDown={(e) => {
                                  if (e.button !== 0) return
                                  dragStart.current = { r, c }
                                  setDragNow({ r, c })
                                }}
                                onPointerEnter={() => {
                                  if (dragStart.current) setDragNow({ r, c })
                                }}
                                onPointerUp={() => {
                                  const a = dragStart.current
                                  dragStart.current = null
                                  setDragNow(null)
                                  if (a && (a.r !== r || a.c !== c)) commitDrag(a, { r, c })
                                  else tapCell(r, c)
                                }}
                                title={
                                  r < plan.startRow
                                    ? "Tap to use as the chart title"
                                    : picking === "start"
                                      ? "Tap: first header cell"
                                      : picking === "end"
                                        ? "Tap: last data cell"
                                        : isHeader(r, c)
                                          ? "Tap: X → tap again: Y → again: off"
                                          : "Tap: reselect the region"
                                }
                                className={cn(
                                  "max-w-[9rem] cursor-pointer select-none truncate border-b border-r border-border/60 px-2 py-1 transition-colors duration-100",
                                  isHeader(r, c) && "bg-[var(--n9-accent,#965034)]/15 font-semibold text-foreground",
                                  isUnit(r, c) && "bg-amber-500/12 italic",
                                  !isHeader(r, c) && !isUnit(r, c) && inRegion(r, c) &&
                                    (plan.columns[c - plan.startCol] === x
                                      ? "bg-[var(--n9-accent,#965034)]/[0.07]"
                                      : y.includes(plan.columns[c - plan.startCol] ?? "")
                                        ? "bg-emerald-500/[0.07]"
                                        : "bg-background"),
                                  !isHeader(r, c) && !isUnit(r, c) && !inRegion(r, c) && "bg-muted/25 text-muted-foreground/45",
                                  "hover:bg-[var(--n9-accent,#965034)]/20",
                                  (isStart || isEnd) && "ring-2 ring-inset ring-[var(--n9-accent,#965034)]",
                                  inDrag(r, c) && "bg-[var(--n9-accent,#965034)]/20",
                                  isTitle && "ring-2 ring-inset ring-[var(--n9-accent,#965034)]/60 font-medium"
                                )}
                              >{text}</td>
                            )
                          })}
                          {/* the demarcation, written where it applies */}
                          <td className={cn("whitespace-nowrap border-b border-border/60 bg-muted/40 px-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide", tag?.cls)}>
                            {tag?.label ?? ""}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── the two guesses worth correcting, as pills ──────── */}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11.5px]">
                <button
                  type="button"
                  onClick={() => onApply({ ...override, rowCount: plan.rowCount === 2 ? 1 : 2 })}
                  aria-pressed={plan.rowCount === 2}
                  title="A merged group label above the column names"
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-medium transition-all duration-150 active:scale-95",
                    plan.rowCount === 2
                      ? "border-[var(--n9-accent,#965034)]/50 bg-[var(--n9-accent,#965034)]/10 text-[var(--n9-accent,#965034)]"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >2-row header</button>
                <button
                  type="button"
                  onClick={() => onApply({ ...override, unitRow: plan.unitRow === null })}
                  aria-pressed={plan.unitRow !== null}
                  title="The row under the header holds units (pg/mL, %)"
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-medium transition-all duration-150 active:scale-95",
                    plan.unitRow !== null
                      ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >units row</button>
                {(override.startRow !== undefined || override.startCol !== undefined || override.endRow !== undefined || override.endCol !== undefined || override.rowCount !== undefined || override.unitRow !== undefined) && (
                  <button type="button" onClick={() => { onApply({}); setPicking("start") }}
                    className="rounded-full px-2 py-0.5 text-muted-foreground transition-colors hover:text-foreground">
                    Reset
                  </button>
                )}
                {onAskAi && (
                  <button
                    type="button"
                    onClick={() => onAskAi(`My table is read as ${tableRange || "(nothing)"} with columns ${plan.columns.join(", ")}. Is that right, and what should X and Y be?`)}
                    className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-[var(--n9-accent,#965034)] transition-colors hover:bg-[var(--n9-accent,#965034)]/10"
                  ><FlareIcon className="size-3" /> Ask</button>
                )}
              </div>

              {/* ── axes, one compact row ───────────────────────────── */}
              {plan.columns.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <ArrowRight className="size-3" /> X
                  </span>
                  <select value={x} onChange={(e) => setXPick(e.target.value)} aria-label="X axis column"
                    className="h-7 max-w-[13rem] rounded-lg border border-border bg-background px-2 text-[12px] outline-none transition-colors focus:border-[var(--n9-accent,#965034)]/50">
                    {plan.columns.map((c, i) => <option key={`${c}-${i}`} value={c}>{c || `Column ${i + 1}`}</option>)}
                  </select>
                  <span className="ml-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <ArrowUp className="size-3" /> Y
                  </span>
                  {y.map((c) => (
                    <button key={c} type="button" onClick={() => setYPick(y.filter((k) => k !== c))}
                      title={`${planColumnRange(plan, plan.columns.indexOf(c))} — tap to remove`}
                      className="group inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-0.5 text-[12px] transition-colors hover:border-[var(--n9-accent,#965034)]/40">
                      {c}<X className="size-2.5 text-muted-foreground group-hover:text-foreground" />
                    </button>
                  ))}
                  <select value="" onChange={(e) => e.target.value && setYPick([...y, e.target.value])} aria-label="Add Y series"
                    className="h-7 rounded-lg border border-dashed border-border bg-transparent px-1.5 text-[12px] text-muted-foreground outline-none">
                    <option value="">+ series</option>
                    {plan.columns.filter((c) => c !== x && !y.includes(c)).map((c, i) => <option key={`${c}-${i}`} value={c}>{c}</option>)}
                  </select>
                  {title && (
                    <span className="ml-auto max-w-[16rem] truncate rounded-lg bg-muted px-2 py-0.5 text-[11.5px]" title="Chart title, from the tapped cell">
                      “{title}”
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* ── the review, beside the grid it is about ───────────── */}
            <aside className="min-h-0 overflow-auto border-t border-border bg-muted/15 px-4 py-4 lg:border-l lg:border-t-0">
              {applied.length === 0 && decisions.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted-foreground">
                  Reads cleanly — nothing to fix, nothing to decide.
                </p>
              ) : (
                <div className="space-y-4">
                  {applied.length > 0 && (
                    <section>
                      <p className="mb-1.5 flex items-baseline gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Fixed for you
                        <span className="rounded-full bg-muted px-1.5 font-mono text-[10px] normal-case tracking-normal">{applied.length}</span>
                      </p>
                      <ul className="overflow-hidden rounded-xl border border-border/70 bg-background">
                        {applied.map((line, i) => (
                          <li key={i} className={cn("flex items-start gap-2 px-2.5 py-2", i > 0 && "border-t border-border/50")}>
                            <CheckCircle className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" weight="fill" />
                            <span className="flex-1 text-[12px] leading-snug">{line.text}</span>
                            {line.undo && onUndo && (
                              <button type="button" onClick={() => onUndo(line.undo as SpecMutation)}
                                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground" title="Undo">
                                <ArrowCounterClockwise className="size-3.5" />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {decisions.length > 0 && (
                    <section>
                      <p className="mb-1.5 flex items-baseline gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Your call
                        <span className="rounded-full bg-amber-500/15 px-1.5 font-mono text-[10px] normal-case tracking-normal text-amber-700 dark:text-amber-400">{decisions.length}</span>
                      </p>
                      <ul className="space-y-2">
                        {decisions.map((f) => {
                          const pick = chosen[f.id]
                          return (
                            <li key={f.id} className="rounded-xl border border-border/70 bg-background p-2.5">
                              <p className="flex items-start gap-1.5 text-[12.5px] font-semibold leading-snug tracking-[-0.01em]">
                                <Warning className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" weight="fill" />
                                {f.summary}
                              </p>
                              <p className="mt-0.5 pl-5 font-mono text-[10.5px] leading-relaxed text-muted-foreground">{f.evidence}</p>
                              {f.locations.length > 0 && locate && (
                                <div className="mt-1 flex flex-wrap gap-1 pl-5">
                                  {f.locations.slice(0, 4).map((loc) => {
                                    const a = locate(loc)
                                    if (!a) return null
                                    return (
                                      <button key={`${loc.rowId}:${loc.column ?? ""}`} type="button" onClick={() => onReveal?.(loc)}
                                        className="inline-flex items-center gap-1 rounded border border-border px-1 py-0.5 font-mono text-[10px] transition-colors hover:border-[var(--n9-accent,#965034)]/50">
                                        <Crosshair className="size-2.5 text-muted-foreground" />{a}
                                        {loc.value != null && <span className="text-muted-foreground">{String(loc.value)}</span>}
                                      </button>
                                    )
                                  })}
                                  {f.locations.length > 4 && <span className="text-[10px] text-muted-foreground">+{f.locations.length - 4}</span>}
                                </div>
                              )}
                              <div className="mt-1.5 flex flex-wrap gap-1 pl-5">
                                {f.actions.map((action, i) => (
                                  <button key={action.label} type="button"
                                    onClick={() => {
                                      const prev = chosen[f.id]
                                      setChosen((c) => ({ ...c, [f.id]: i }))
                                      onChoose?.(f, i, action.mutations, prev === undefined || prev === i ? null : f.actions[prev])
                                    }}
                                    aria-pressed={pick === i}
                                    className={cn(
                                      "rounded-md border px-1.5 py-0.5 text-[11px] transition-all duration-150 active:scale-95",
                                      pick === i ? "border-foreground/70 bg-foreground text-background" : "border-border hover:bg-muted"
                                    )}>
                                    {action.label}
                                    {f.recommended === i && pick === undefined && <span className="text-muted-foreground"> ·✦</span>}
                                  </button>
                                ))}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                      <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
                        Undecided = left alone. Nothing here changes your numbers without a tap.
                      </p>
                    </section>
                  )}
                </div>
              )}
            </aside>
            </div>

            {/* ── footer ─────────────────────────────────────────────── */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
              <p className="font-mono text-[11.5px] text-muted-foreground">
                {plan.columns.length > 0
                  ? `${plan.columns.length} col · ${Math.max(0, plan.dataEnd - plan.dataStart + 1)} rows${dataRange ? ` · ${dataRange}` : ""}`
                  : "Nothing selected"}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => onConfirm({})}>Skip</Button>
                <Button size="sm" disabled={plan.columns.length === 0}
                  className="transition-transform active:scale-95"
                  onClick={() => onConfirm({ xKey: x || undefined, yKeys: y, title: title ?? undefined })}>
                  Looks right
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
