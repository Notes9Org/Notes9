"use client"

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowRight, ArrowUp, ChartLine, Sparkle, Table as TableIcon, X } from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EASE_OUT } from "./motion"
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
 * Confirm where the data actually is, before anything is charted.
 *
 * A bench sheet rarely opens with a clean header in A1: there is a run title, a
 * blank spacer column, a merged group label, a row of units, a footnote. The
 * detector handles all of those, and handled them silently — it returned a
 * `HeaderPlan` with a `rationale` written for a human to read, and nothing ever
 * showed it to one. `HeaderOverride` existed for exactly the cases no rule can
 * settle, and was passed by nothing.
 *
 * So this is not new detection. It is the detection that was already running,
 * made visible and correctable, with every claim carrying the cell it is about
 * — because "the header is on row 4" is checkable and "the header was detected"
 * is not.
 *
 * It blocks on a genuinely new attach only. A misread region silently poisons
 * every number downstream, and unlike the data-quality decisions there is no
 * defensible "leave it and see": the columns are either the data or they are
 * not.
 */

/** How much of the sheet the preview shows. Enough to see the shape. */
const PREVIEW_ROWS = 14
const PREVIEW_COLS = 12

export interface RegionAxisSuggestion {
  x: string
  y: string[]
  evidence: string
  fromRoles: boolean
}

/** A cell above the table that could be the figure's title. */
export interface TitleCandidate {
  a1: string
  text: string
}

/**
 * Title candidates: the text the detector skipped on its way to the header.
 *
 * A run title sits above the table and is thrown away by every reader in the
 * app, so the figure gets named after the file. It is right here, in a known
 * cell, and it is what the researcher would have typed.
 */
export function titleCandidates(
  grid: (string | number | null | undefined)[][],
  plan: HeaderPlan
): TitleCandidate[] {
  const out: TitleCandidate[] = []
  for (let r = 0; r < plan.startRow && r < grid.length; r++) {
    const row = grid[r] ?? []
    for (let c = 0; c < row.length; c++) {
      const text = row[c] == null ? "" : String(row[c]).trim()
      // A number above the table is a stray value, not a title.
      if (text === "" || Number.isFinite(Number(text))) continue
      out.push({ a1: cellAddress(c, r), text })
      if (out.length >= 6) return out
    }
  }
  return out
}

/**
 * The cell a column's NAME sits in.
 *
 * With a two-row header the name is on the lower of the two -- the upper row is
 * the merged group label -- so this is `startRow + rowCount - 1`, not
 * `startRow`. Showing the wrong one would send a researcher checking the axis
 * title to a cell containing something else.
 */
export function headerCellAddress(plan: HeaderPlan, columnIndex: number): string {
  if (columnIndex < 0 || columnIndex >= plan.columns.length) return ""
  return cellAddress(plan.startCol + columnIndex, plan.startRow + Math.max(plan.rowCount - 1, 0))
}

/**
 * One axis, stated as the two cells it actually comes from.
 *
 * The demarcation is the point. A column name in a dropdown says nothing about
 * WHERE the title text and the numbers are, and on a sheet with a preamble
 * those are not where anyone assumes. Header cell and data range, per axis,
 * side by side -- so "the Y axis title comes from D3 and its numbers from
 * D4:D412" is readable rather than inferable.
 */
function AxisRow({
  axis,
  column,
  plan,
  onRemove,
}: {
  axis: "x" | "y"
  column: string
  plan: HeaderPlan
  onRemove?: () => void
}) {
  const index = plan.columns.indexOf(column)
  const Icon = axis === "x" ? ArrowRight : ArrowUp
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-background px-2.5 py-1.5">
      <Icon className="size-3.5 shrink-0 text-[var(--n9-accent,#965034)]" />
      <span className="text-[12.5px] font-medium">{column}</span>
      <span className="flex items-baseline gap-1 text-[11px] text-muted-foreground">
        title
        <span className="rounded bg-muted px-1 font-mono text-[10.5px] font-semibold text-foreground">
          {headerCellAddress(plan, index) || "—"}
        </span>
      </span>
      <span className="flex items-baseline gap-1 text-[11px] text-muted-foreground">
        data
        <span className="rounded bg-muted px-1 font-mono text-[10.5px] font-semibold text-foreground">
          {planColumnRange(plan, index) || "—"}
        </span>
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title={`Remove ${column} from the Y axis`}
          className="ml-auto rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground/80">{hint}</span>}
    </label>
  )
}

const numberInput =
  "h-8 w-full rounded-lg border border-input bg-background px-2 text-[13px] tabular-nums outline-none transition-colors focus:border-[var(--n9-accent,#965034)]/50 focus:ring-2 focus:ring-[var(--n9-accent,#965034)]/20"

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
}: {
  open: boolean
  fileName: string | null
  sheetName: string | null
  /** The raw sheet, header rows and all. */
  grid: (string | number | null | undefined)[][]
  override: HeaderOverride
  /** What the columns imply, once the region is settled. */
  suggestion: RegionAxisSuggestion | null
  /** Live-apply a correction, so the preview and the table agree as you type. */
  onApply: (next: HeaderOverride) => void
  onConfirm: (chosen: { xKey?: string; yKeys?: string[]; title?: string }) => void
  /**
   * Dismiss without answering: keep whatever was detected and get out of the
   * way. Distinct from `onConfirm({})` only in intent -- both take the detected
   * reading -- but a modal with no visible way out reads as a trap, and the
   * researcher who wants to look at their sheet before deciding is not doing
   * anything wrong.
   */
  onDismiss: () => void
  /** Hand the region question to the assistant, with the sheet in context. */
  onAskAi?: (prompt: string) => void
}) {
  const reduce = useReducedMotion()
  const plan = useMemo(() => detectHeader(grid, override), [grid, override])
  const [title, setTitle] = useState<string | null>(null)
  /** Null means "whatever is suggested"; an array means the researcher chose. */
  const [xPick, setXPick] = useState<string | null>(null)
  const [yPick, setYPick] = useState<string[] | null>(null)

  // A new sheet is a new question; picks made for the previous one must not
  // survive into it.
  useEffect(() => {
    if (open) {
      setTitle(null)
      setXPick(null)
      setYPick(null)
    }
  }, [open, fileName, sheetName])

  /**
   * A pick stops being valid the moment the region stops containing it.
   *
   * Narrowing the columns can remove the very column the researcher picked as
   * Y; keeping the stale name would confirm an axis that is not in the table
   * and leave the chart empty with no explanation.
   */
  const x = xPick && plan.columns.includes(xPick) ? xPick : (suggestion?.x ?? "")
  const y = (yPick ?? suggestion?.y ?? []).filter((c) => plan.columns.includes(c))
  const chosenTitle = title

  const candidates = useMemo(() => titleCandidates(grid, plan), [grid, plan])
  const dataRange = planDataRange(plan)

  const previewRows = Math.min(Math.max(plan.dataEnd + 2, PREVIEW_ROWS), grid.length)
  const previewCols = Math.min(
    Math.max(plan.endCol + 2, PREVIEW_COLS),
    Math.max(...grid.slice(0, previewRows).map((r) => (r ?? []).length), 1)
  )

  const inRegion = (r: number, c: number) =>
    c >= plan.startCol && c <= plan.endCol && r >= plan.dataStart && r <= plan.dataEnd
  const isHeaderCell = (r: number, c: number) =>
    c >= plan.startCol && c <= plan.endCol && r >= plan.startRow && r < plan.startRow + plan.rowCount
  const isUnitCell = (r: number, c: number) =>
    plan.unitRow === r && c >= plan.startCol && c <= plan.endCol

  return (
    <AnimatePresence>
      {open && (
        <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
        aria-hidden
        onClick={onDismiss}
        className="fixed inset-0 z-50 bg-foreground/25 backdrop-blur-[3px]"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Confirm the data region"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            onDismiss()
          }
        }}
        // Deliberately identical to the data-quality gate's entrance. The two
        // open back to back on every attach, and two different animations for
        // two steps of one flow reads as two unrelated interruptions.
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.99 }}
        transition={reduce ? { duration: 0.12 } : { duration: 0.24, ease: EASE_OUT }}
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(60rem,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-5 py-3.5">
          <TableIcon className="size-4 shrink-0 text-[var(--n9-accent,#965034)]" />
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Step 1 of 2 · Where the data is
            </p>
            <p className="truncate text-[13.5px] font-semibold leading-tight">
              {fileName ?? "This sheet"}
              {sheetName ? ` · ${sheetName}` : ""}
            </p>
          </div>
          {dataRange && (
            <span className="ml-auto shrink-0 rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-[11.5px] font-semibold">
              {dataRange}
            </span>
          )}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close"
            title="Close — keeps the region as detected"
            className={cn(
              "shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              !dataRange && "ml-auto"
            )}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <p className="mb-3 rounded-lg border border-border/70 bg-muted/25 px-3 py-2 text-[12.5px] leading-relaxed text-muted-foreground">
            {plan.rationale}
          </p>

          {/* ── What the figure is made of, FIRST ─────────────────────────
              Title, then X, then Y, at the top of the dialog and above the
              preview. On a sheet with four hundred rows the preview is the
              part you scroll past, and burying the axis pickers under it meant
              the one decision the dialog exists to take was the one you had to
              hunt for. */}
          <section className="mb-4 space-y-3 rounded-xl border border-border p-3.5">
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Chart title
              </p>
              {candidates.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {candidates.map((c) => (
                    <button
                      key={c.a1}
                      type="button"
                      onClick={() => setTitle(chosenTitle === c.text ? null : c.text)}
                      aria-pressed={chosenTitle === c.text}
                      className={cn(
                        "inline-flex items-baseline gap-1.5 rounded-md border px-2 py-1 text-[12px] transition-colors duration-150",
                        chosenTitle === c.text
                          ? "border-foreground/70 bg-foreground text-background"
                          : "border-border bg-background hover:bg-muted"
                      )}
                    >
                      <ChartLine className="size-3 shrink-0" />
                      <span className="max-w-[32ch] truncate">{c.text}</span>
                      <span
                        className={cn(
                          "font-mono text-[10.5px]",
                          chosenTitle === c.text ? "text-background/70" : "text-muted-foreground"
                        )}
                      >
                        {c.a1}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  No text above the table to take a title from — name the figure later.
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* X and Y are deliberately two bordered blocks rather than one
                  list of columns. They are different roles, chosen separately,
                  and running them together is what made the old panel read as
                  an undifferentiated pile of column names. */}
              <div className="rounded-lg border border-border/70 bg-muted/15 p-2.5">
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  <ArrowRight className="size-3" /> X axis
                </p>
                <select
                  className={numberInput}
                  value={x}
                  onChange={(e) => setXPick(e.target.value)}
                >
                  {plan.columns.map((c, i) => (
                    <option key={`${c}-${i}`} value={c}>
                      {c || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
                {x && <div className="mt-2"><AxisRow axis="x" column={x} plan={plan} /></div>}
              </div>

              <div className="rounded-lg border border-border/70 bg-muted/15 p-2.5">
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  <ArrowUp className="size-3" /> Y axis
                  <span className="ml-auto normal-case tracking-normal text-muted-foreground/80">
                    {y.length} selected
                  </span>
                </p>
                <select
                  className={numberInput}
                  value=""
                  onChange={(e) => {
                    const c = e.target.value
                    if (!c) return
                    setYPick(y.includes(c) ? y : [...y, c])
                  }}
                >
                  <option value="">Add a series…</option>
                  {plan.columns
                    .filter((c) => c !== x && !y.includes(c))
                    .map((c, i) => (
                      <option key={`${c}-${i}`} value={c}>
                        {c}
                      </option>
                    ))}
                </select>
                <div className="mt-2 space-y-1.5">
                  {y.length === 0 ? (
                    <p className="text-[11.5px] text-muted-foreground">
                      Nothing plotted yet — add at least one series.
                    </p>
                  ) : (
                    y.map((c) => (
                      <AxisRow
                        key={c}
                        axis="y"
                        column={c}
                        plan={plan}
                        onRemove={() => setYPick(y.filter((k) => k !== c))}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>

            {suggestion && (
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                {suggestion.evidence}
                {!suggestion.fromRoles && " — a guess from sheet order, not from the columns' meaning."}
                {(xPick !== null || yPick !== null) && " You have changed this."}
              </p>
            )}
          </section>

          {/* ── corrections ─────────────────────────────────────────────── */}
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Header row" hint={`Reading row ${plan.startRow + 1}`}>
              <input
                type="number"
                min={1}
                className={numberInput}
                value={plan.startRow + 1}
                onChange={(e) => onApply({ ...override, startRow: Math.max(0, Number(e.target.value) - 1) })}
              />
            </Field>
            <Field label="Header rows" hint={plan.rowCount === 2 ? "Merged group above names" : "One row"}>
              <select
                className={numberInput}
                value={plan.rowCount}
                onChange={(e) => onApply({ ...override, rowCount: Number(e.target.value) })}
              >
                <option value={1}>1</option>
                <option value={2}>2 (merged group)</option>
              </select>
            </Field>
            <Field label="First column" hint={`Data starts at ${columnLetter(plan.startCol)}`}>
              <select
                className={numberInput}
                value={plan.startCol}
                onChange={(e) => onApply({ ...override, startCol: Number(e.target.value) })}
              >
                {Array.from({ length: previewCols }, (_, c) => (
                  <option key={c} value={c}>
                    {columnLetter(c)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Last column" hint={`Data ends at ${columnLetter(plan.endCol)}`}>
              <select
                className={numberInput}
                value={plan.endCol}
                onChange={(e) => onApply({ ...override, endCol: Number(e.target.value) })}
              >
                {Array.from({ length: previewCols }, (_, c) => (
                  <option key={c} value={c}>
                    {columnLetter(c)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Last data row" hint={`${plan.dataEnd - plan.dataStart + 1} rows of data`}>
              <input
                type="number"
                min={1}
                className={numberInput}
                value={plan.dataEnd + 1}
                onChange={(e) => onApply({ ...override, endRow: Math.max(0, Number(e.target.value) - 1) })}
              />
            </Field>
            <Field label="Unit row" hint={plan.unitRow === null ? "None found" : `Row ${plan.unitRow + 1}`}>
              <select
                className={numberInput}
                value={plan.unitRow === null ? "no" : "yes"}
                onChange={(e) => onApply({ ...override, unitRow: e.target.value === "yes" })}
              >
                <option value="yes">Read the row under the header as units</option>
                <option value="no">No unit row</option>
              </select>
            </Field>
            <div className="flex items-end sm:col-span-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => onApply({})}
                title="Discard corrections and use what was detected"
              >
                Reset to detected
              </Button>
              {onAskAi && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-8"
                  onClick={() =>
                    onAskAi(
                      `The sheet is read as header row ${plan.startRow + 1}, data ${dataRange || "(none)"}, columns ${plan.columns.join(", ")}. Is that the right region, and which columns should be the X and Y axes?`
                    )
                  }
                >
                  <Sparkle className="mr-1.5 size-3.5" /> Ask about this region
                </Button>
              )}
            </div>
          </div>


          {/* ── the sheet, with the region shaded, LAST ──────────────────── */}
          <div className="mb-4 overflow-auto rounded-xl border border-border">
            <table className="border-collapse text-[11.5px] tabular-nums">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border-b border-r border-border bg-muted/60 px-1.5 py-1" />
                  {Array.from({ length: previewCols }, (_, c) => (
                    <th
                      key={c}
                      className={cn(
                        "border-b border-r border-border px-2 py-1 font-mono text-[10.5px] font-semibold",
                        c >= plan.startCol && c <= plan.endCol
                          ? "bg-[var(--n9-accent,#965034)]/12 text-foreground"
                          : "bg-muted/40 text-muted-foreground/60"
                      )}
                    >
                      {columnLetter(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: previewRows }, (_, r) => (
                  <tr key={r}>
                    <th
                      className={cn(
                        "sticky left-0 z-10 border-b border-r border-border px-1.5 py-1 font-mono text-[10.5px] font-semibold",
                        r >= plan.dataStart && r <= plan.dataEnd
                          ? "bg-[var(--n9-accent,#965034)]/12 text-foreground"
                          : "bg-muted/40 text-muted-foreground/60"
                      )}
                    >
                      {r + 1}
                    </th>
                    {Array.from({ length: previewCols }, (_, c) => {
                      const raw = (grid[r] ?? [])[c]
                      const text = raw == null ? "" : String(raw)
                      return (
                        <td
                          key={c}
                          title={text}
                          className={cn(
                            "max-w-[10rem] truncate border-b border-r border-border/70 px-2 py-1",
                            isHeaderCell(r, c) && "bg-[var(--n9-accent,#965034)]/18 font-semibold text-foreground",
                            isUnitCell(r, c) && "bg-amber-500/15 italic text-foreground",
                            !isHeaderCell(r, c) && !isUnitCell(r, c) && inRegion(r, c) && "bg-background text-foreground",
                            !isHeaderCell(r, c) && !isUnitCell(r, c) && !inRegion(r, c) && "bg-muted/20 text-muted-foreground/45"
                          )}
                        >
                          {text}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-[var(--n9-accent,#965034)]/18" /> header
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-amber-500/15" /> units
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm border border-border bg-background" /> data
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-muted/40" /> ignored
            </span>
          </div>


          <section className="mt-3 rounded-xl border border-border/70 p-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Columns read ({plan.columns.length})
            </p>
            {plan.columns.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">
                No columns in this region. Widen it above.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {plan.columns.map((c, i) => (
                  <li
                    key={`${c}-${i}`}
                    className="inline-flex items-baseline gap-1.5 rounded-md border border-border bg-muted/25 px-1.5 py-0.5"
                  >
                    <span className="text-[12px] font-medium">{c || `Column ${i + 1}`}</span>
                    <span className="font-mono text-[10.5px] text-muted-foreground">
                      {planColumnRange(plan, i)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3.5">
          <p className="text-[12px] text-muted-foreground">
            {plan.columns.length > 0
              ? `${plan.columns.length} column${plan.columns.length === 1 ? "" : "s"} · ${Math.max(0, plan.dataEnd - plan.dataStart + 1)} rows`
              : "Nothing will be read from this region."}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onConfirm({})}>
              Use as read
            </Button>
            <Button
              size="sm"
              disabled={plan.columns.length === 0}
              onClick={() => onConfirm({ xKey: x || undefined, yKeys: y, title: chosenTitle ?? undefined })}
            >
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
