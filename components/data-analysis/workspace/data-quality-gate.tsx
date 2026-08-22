"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowCounterClockwise, CheckCircle, Warning } from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"
import type { Finding, ReceiptLine } from "@/lib/data-analysis/workspace/data-quality"
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

export function DataQualityGate({
  open,
  fileName,
  applied,
  decisions,
  onChoose,
  onUndo,
  onContinue,
}: {
  open: boolean
  fileName: string | null
  /** Receipt lines for repairs already made, newest last. */
  applied: ReceiptLine[]
  decisions: Finding[]
  onChoose: (finding: Finding, actionIndex: number, mutations: SpecMutation[]) => void
  onUndo: (mutation: SpecMutation) => void
  onContinue: (declined: number) => void
}) {
  const reduce = useReducedMotion()
  const [chosen, setChosen] = useState<Record<string, number>>({})

  const undecided = useMemo(
    () => decisions.filter((f) => chosen[f.id] === undefined).length,
    [decisions, chosen],
  )

  const choose = (finding: Finding, index: number) => {
    setChosen((prev) => ({ ...prev, [finding.id]: index }))
    onChoose(finding, index, finding.actions[index].mutations)
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="data-quality-title"
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(44rem,calc(100vh-3rem))] w-[min(38rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.99 }}
            transition={reduce ? { duration: 0.12 } : { duration: 0.24, ease: EASE_OUT }}
          >
            <div className="shrink-0 px-5 pt-5">
              <h2
                id="data-quality-title"
                className="text-[15px] font-semibold text-foreground"
              >
                Data quality{fileName ? ` — ${fileName}` : ""}
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
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
