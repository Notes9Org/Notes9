"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowCounterClockwise, CheckCircle, Crosshair, Warning, X } from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"
import type {
  Finding,
  FindingAction,
  FindingLocation,
  ReceiptLine,
} from "@/lib/data-analysis/workspace/data-quality"
import type { SpecMutation } from "@/lib/data-analysis/spec/mutations"
import { EASE_OUT } from "./motion"

/**
 * The data-quality review (Tier 0, "Data preparation").
 *
 * Two groups, and the split is the product's promise made visible:
 *
 *   APPLIED AUTOMATICALLY — the file was misread as written and has been
 *     repaired. Each line carries Undo. Nothing here changes a result the
 *     researcher could have wanted: `"12.3 ng/mL"` was never a number, and
 *     reading it as one is not a judgement call.
 *
 *   NEEDS YOUR DECISION — everything that moves a number or an n. Every option
 *     is a button, "leave as is" is always among them, and it is never
 *     pre-selected on a statistical choice. §8.1 is explicit that the assistant
 *     will not action outlier removal; it surfaces it and asks.
 *
 * Continue is always available. A researcher who wants to look at their data
 * before deciding is not doing anything wrong, and a gate that cannot be passed
 * is a gate people learn to resent. What Continue does NOT do is pretend the
 * findings were addressed: declining is recorded as declining.
 */

export interface GateFindingState {
  /** Index into the finding's `actions`, or null while undecided. */
  chosen: number | null
}

/** How many located cells are shown before the rest are counted instead. */
const MAX_SHOWN_LOCATIONS = 8

/**
 * One located value, as a cell you can go and look at.
 *
 * This is the difference between "one value in signal is a statistical outlier
 * — Grubbs G=2.913, p=0.0121" and being shown `D14  99.5`. The first is a
 * sentence about the data; the second is the data. A researcher deciding
 * between excluding a point and correcting a mistyped one cannot make that call
 * from the sentence, because the two look identical in it.
 */
function LocationChip({
  location,
  address,
  onReveal,
}: {
  location: FindingLocation
  address: string
  onReveal?: (location: FindingLocation) => void
}) {
  const value =
    location.value === null || location.value === "" ? null : String(location.value)
  const body = (
    <>
      <span className="font-mono text-[11.5px] font-semibold text-foreground">{address}</span>
      {value !== null && (
        <span className="max-w-[14ch] truncate font-mono text-[11.5px] text-muted-foreground" title={value}>
          {value}
        </span>
      )}
    </>
  )
  if (!onReveal) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-1.5 py-0.5">
        {body}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onReveal(location)}
      title={`Select ${address} in the sheet`}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-1.5 py-0.5 transition-colors hover:border-[var(--n9-accent,#965034)]/50 hover:bg-[var(--n9-accent,#965034)]/[0.07]"
    >
      <Crosshair className="size-3 shrink-0 text-muted-foreground" />
      {body}
    </button>
  )
}

export function DataQualityGate({
  open,
  fileName,
  applied,
  decisions,
  onChoose,
  onUndo,
  onContinue,
  onOpenProvenance,
  locate,
  onReveal,
}: {
  open: boolean
  fileName: string | null
  /** Receipt lines for repairs already made, newest last. */
  applied: ReceiptLine[]
  decisions: Finding[]
  onChoose: (
    finding: Finding,
    actionIndex: number,
    mutations: SpecMutation[],
    /** The action being replaced, so the caller can undo it. Null on first answer. */
    previousAction: FindingAction | null,
  ) => void
  /** Opens the provenance panel. Shown only alongside automatic repairs. */
  onOpenProvenance?: () => void
  onUndo: (mutation: SpecMutation) => void
  onContinue: (declined: number) => void
  /**
   * Turn a location into an A1 address, using the header plan currently in
   * force. Supplied by the caller because the plan lives with the sheet, and it
   * can change under a finding when the data region is corrected -- so the
   * address is resolved at render, never stored on the finding.
   */
  locate?: (location: FindingLocation) => string | null
  /** Select the cell in the spreadsheet, so the researcher can look at it. */
  onReveal?: (location: FindingLocation) => void
}) {
  const reduce = useReducedMotion()
  const [chosen, setChosen] = useState<Record<string, number>>({})

  const undecided = useMemo(
    () => decisions.filter((f) => chosen[f.id] === undefined).length,
    [decisions, chosen],
  )

  // This gate blocks the whole AI surface, so it has to behave like a modal for
  // the keyboard too: focus moves in when it opens, Tab cycles inside it, and
  // focus returns to whatever was focused before on close. There is
  // deliberately no Escape-to-dismiss — answering the findings IS the exit, and
  // the Continue button lives inside the trap, so this is not a keyboard trap.
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    // Focus the dialog itself rather than the first action: the findings text
    // above it is the point, and jumping to a button skips it for SR users.
    dialogRef.current?.focus()
    return () => previouslyFocused?.focus?.()
  }, [open])

  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Escape closes, and this is a reversal of the original decision.
    //
    // It used to be deliberately absent, on the reasoning that "answering the
    // findings IS the exit". That reasoning does not survive contact with a
    // researcher who wants to look at their sheet before answering: the gate
    // sits over the data it is asking about, so the one thing it prevents is
    // the thing it asks you to do. Dismissing is not the same as addressing --
    // it is recorded as declining, exactly as Continue with undecided findings
    // is -- and the findings stay reachable.
    if (event.key === "Escape") {
      event.preventDefault()
      onContinue(undecided)
      return
    }
    if (event.key !== "Tab" || !dialogRef.current) return
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const choose = (finding: Finding, index: number) => {
    // Changing your mind has to undo the previous answer. Reporting the
    // previously chosen action lets the workspace invert it against the live
    // spec and commit the revert and the new choice as one batch — otherwise
    // "Exclude it" → "Keep it" left the row excluded under a "Keep it" label.
    const previous = chosen[finding.id]
    setChosen((prev) => ({ ...prev, [finding.id]: index }))
    onChoose(
      finding,
      index,
      finding.actions[index].mutations,
      previous === undefined || previous === index ? null : finding.actions[previous],
    )
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-foreground/25 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            aria-hidden
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="data-quality-title"
            tabIndex={-1}
            onKeyDown={onDialogKeyDown}
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(44rem,calc(100vh-3rem))] w-[min(38rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.99 }}
            transition={reduce ? { duration: 0.12 } : { duration: 0.24, ease: EASE_OUT }}
          >
            <div className="shrink-0 px-5 pt-5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  {/* Where this sits in the run of overlays an attach opens.
                      Two modals in a row with no sense of progression reads as
                      being interrogated; naming the position makes it a
                      sequence with an end. */}
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Step 2 of 2 · Data quality
                  </p>
                  <h2
                    id="data-quality-title"
                    className="truncate text-[15px] font-semibold text-foreground"
                  >
                    {fileName ?? "This sheet"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onContinue(undecided)}
                  aria-label="Close data quality review"
                  title="Close — undecided findings are recorded as reviewed and left alone"
                  className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Everything below is arithmetic on your columns, not a suggestion from the
                assistant. Nothing that changes a number or a sample size happens without
                you choosing it.
              </p>
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-5 pb-2">
              {applied.length > 0 && (
                <section className="mb-5">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Applied automatically
                  </p>
                  <ul className="overflow-hidden rounded-xl border border-border/70 bg-muted/25">
                    {applied.map((line, i) => (
                      <li
                        key={`${line.text}-${i}`}
                        className={cn(
                          "flex items-start gap-2.5 px-3.5 py-2.5",
                          i > 0 && "border-t border-border/50",
                        )}
                      >
                        <CheckCircle
                          className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                          weight="fill"
                        />
                        <span className="flex-1 text-[13px] leading-relaxed text-foreground">
                          {line.text}
                        </span>
                        {line.undo && (
                          <button
                            type="button"
                            onClick={() => onUndo(line.undo as SpecMutation)}
                            className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <ArrowCounterClockwise className="size-3.5" />
                            Undo
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {onOpenProvenance && (
                    // The panel that justifies these automatic edits was
                    // previously unreachable — nothing ever opened it. This is
                    // the one place the researcher is told their data changed,
                    // so it is where "show me exactly what changed" belongs.
                    <button
                      type="button"
                      onClick={onOpenProvenance}
                      className="mt-2 rounded-md px-1.5 py-0.5 text-[12px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                    >
                      See how this was derived
                    </button>
                  )}
                </section>
              )}

              {decisions.length > 0 && (
                <section>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Needs your decision
                  </p>
                  <ul className="space-y-2.5">
                    {decisions.map((f) => {
                      const pick = chosen[f.id]
                      return (
                        <li
                          key={f.id}
                          className="overflow-hidden rounded-xl border border-border/70"
                        >
                          <div className="flex items-start gap-2.5 px-3.5 pt-3">
                            <Warning
                              className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                              weight="fill"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-[13.5px] font-medium leading-snug text-foreground">
                                {f.summary}
                              </p>
                              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                                {f.evidence}
                              </p>
                              {f.locations.length > 0 && (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  {f.locations.slice(0, MAX_SHOWN_LOCATIONS).map((loc) => {
                                    const address = locate?.(loc) ?? null
                                    if (!address) return null
                                    return (
                                      <LocationChip
                                        key={`${loc.rowId}:${loc.column ?? ""}`}
                                        location={loc}
                                        address={address}
                                        onReveal={onReveal}
                                      />
                                    )
                                  })}
                                  {f.locations.length > MAX_SHOWN_LOCATIONS && (
                                    <span className="text-[11.5px] text-muted-foreground">
                                      +{f.locations.length - MAX_SHOWN_LOCATIONS} more
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 px-3.5 pb-3 pt-2.5">
                            {f.actions.map((action, i) => (
                              <button
                                key={action.label}
                                type="button"
                                onClick={() => choose(f, i)}
                                aria-pressed={pick === i}
                                className={cn(
                                  "rounded-lg border px-2.5 py-1 text-[12.5px] transition-colors",
                                  pick === i
                                    ? "border-foreground/70 bg-foreground text-background"
                                    : "border-border bg-background text-foreground hover:bg-muted",
                                )}
                              >
                                {action.label}
                                {/* A recommendation is shown only where the tool is
                                    entitled to one. Statistical findings carry
                                    `recommended: null` and get no star. */}
                                {f.recommended === i && pick === undefined && (
                                  <span className="ml-1 text-muted-foreground">
                                    · suggested
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )}

              {applied.length === 0 && decisions.length === 0 && (
                <p className="rounded-xl border border-border/70 bg-muted/25 px-3.5 py-6 text-center text-[13px] text-muted-foreground">
                  Nothing to repair and nothing to decide — this file reads cleanly.
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 px-5 py-3.5">
              <p className="text-[12px] text-muted-foreground">
                {undecided > 0
                  ? `${undecided} left undecided will be recorded as reviewed and left alone.`
                  : "All findings addressed."}
              </p>
              <button
                type="button"
                onClick={() => onContinue(undecided)}
                className="rounded-lg bg-foreground px-3.5 py-1.5 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
              >
                Continue
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
