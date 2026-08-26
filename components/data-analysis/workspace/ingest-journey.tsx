"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { CheckCircle, CircleNotch, Warning } from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"
import { EASE_OUT } from "./motion"

/**
 * What Notes9 does to a file between attaching it and charting it.
 *
 * The work was always there — find the table, read the header, profile the
 * columns, repair what the file got wrong as written, look for outliers and
 * duplicates — and all of it happened between two frames, invisibly, after
 * which a modal appeared asking the researcher to make decisions about findings
 * whose origin they had never been shown. The first thing they saw of the
 * pipeline was a question from it.
 *
 * IMPORTANT, and the reason this is not a fake progress bar: every line here
 * reports a REAL result. The derivations are synchronous memos, so the work is
 * genuinely finished before this renders; what is staged is the reading of it,
 * one step at a time, at a pace a person can follow. A step is never shown as
 * pending while secretly known, and never shows a number it did not get. If
 * that distinction ever blurs, this component has become a lie about the
 * software and should be deleted rather than tuned.
 */

export interface JourneyStep {
  id: string
  label: string
  /** The real outcome, e.g. "Header on row 4 · 3 columns · 396 rows". */
  detail: string
  /** Something needs the researcher: shown in amber rather than green. */
  attention?: boolean
}

/** How long each line holds before the next appears. */
const STEP_MS = 420

export function IngestJourney({
  open,
  fileName,
  steps,
  onDone,
}: {
  open: boolean
  fileName: string | null
  steps: JourneyStep[]
  /** Fired once every step has been shown; the caller opens the next overlay. */
  onDone: () => void
}) {
  const reduce = useReducedMotion()
  const [revealed, setRevealed] = useState(0)

  useEffect(() => {
    if (!open) {
      setRevealed(0)
      return
    }
    // Reduced motion means no staging at all: show the whole summary at once
    // and move on. Someone who has asked the OS to stop animating things has
    // not asked to be walked through them slowly instead.
    if (reduce) {
      setRevealed(steps.length)
      const t = setTimeout(onDone, 200)
      return () => clearTimeout(t)
    }
    if (revealed >= steps.length) {
      const t = setTimeout(onDone, 520)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setRevealed((n) => n + 1), STEP_MS)
    return () => clearTimeout(t)
  }, [open, revealed, steps.length, reduce, onDone])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="fixed inset-0 z-50 bg-background/75 backdrop-blur-sm"
          />
          <motion.div
            role="status"
            aria-live="polite"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.26, ease: EASE_OUT }}
            className="fixed left-1/2 top-1/2 z-50 w-[min(30rem,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-[14px] font-semibold leading-tight">Preparing your data</h2>
              <p className="truncate text-[12px] text-muted-foreground">
                {fileName ?? "Reading the sheet"}
              </p>
            </div>

            <ul className="space-y-0.5 px-3 py-3">
              {steps.map((step, i) => {
                const done = i < revealed
                const active = i === revealed
                if (i > revealed) return null
                return (
                  <motion.li
                    key={step.id}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.24, ease: EASE_OUT }}
                    className="flex items-start gap-2.5 rounded-lg px-2 py-1.5"
                  >
                    <span className="mt-0.5 shrink-0">
                      {done ? (
                        step.attention ? (
                          <Warning className="size-4 text-amber-600 dark:text-amber-400" weight="fill" />
                        ) : (
                          <CheckCircle className="size-4 text-[var(--n9-accent,#965034)]" weight="fill" />
                        )
                      ) : (
                        <CircleNotch className="size-4 animate-spin text-muted-foreground" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-[13px] font-medium leading-snug transition-colors",
                          active ? "text-foreground" : "text-foreground/85"
                        )}
                      >
                        {step.label}
                      </span>
                      {done && (
                        <span className="block text-[11.5px] leading-snug text-muted-foreground">
                          {step.detail}
                        </span>
                      )}
                    </span>
                  </motion.li>
                )
              })}
            </ul>

            <div className="border-t border-border px-5 py-2.5">
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                Next you&rsquo;ll confirm where the data is, then review anything that needs a
                decision. Nothing is charted until you do.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
