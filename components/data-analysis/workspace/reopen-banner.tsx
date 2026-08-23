"use client"

import { ArrowClockwise, Lock, ShieldCheck, WarningCircle } from "@phosphor-icons/react/ssr"
import { motion, useReducedMotion } from "framer-motion"

import { cn } from "@/lib/utils"
import type { ReopenVerdict } from "@/lib/data-analysis/saved-analysis"
import { EASE_OUT } from "./motion"

/**
 * The reopen moment (§10.8).
 *
 * "The integrity check is a first-class screen, not a toast: what was stored,
 * what has changed since, and two clear choices, keep the stored result, or
 * re-run into a new revision."
 *
 * A toast would be wrong here for a specific reason: toasts are dismissible and
 * time out, and this decision has consequences for a number that may already be
 * in a submitted paper. So the banner sits above the figure, does not
 * auto-dismiss, and does not let the analysis be edited until the researcher
 * has chosen, which is why there is no close button.
 *
 * Motion is a single 6px settle. Nothing about this should feel like an alert
 * that can be swiped away.
 */
export function ReopenBanner({
  verdict,
  onKeepStored,
  onRerun,
  rerunning,
  className,
}: {
  verdict: ReopenVerdict
  onKeepStored: () => void
  onRerun: () => void
  rerunning?: boolean
  className?: string
}) {
  const reduce = useReducedMotion()

  // A clean reopen says nothing. Confirming that nothing changed is noise.
  if (verdict.state === "clean") return null

  const tone =
    verdict.state === "unreadable"
      ? "destructive"
      : verdict.state === "detached"
        ? "muted"
        : "amber"

  const Icon =
    verdict.state === "detached" ? Lock : verdict.state === "unreadable" ? WarningCircle : ShieldCheck

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0.12 } : { duration: 0.28, ease: EASE_OUT }}
      className={cn(
        "rounded-xl border px-4 py-3.5",
        tone === "amber" && "border-amber-500/30 bg-amber-500/[0.07]",
        tone === "muted" && "border-border/70 bg-muted/40",
        tone === "destructive" && "border-destructive/30 bg-destructive/[0.06]",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={cn(
            "mt-0.5 size-4 shrink-0",
            tone === "amber" && "text-amber-600 dark:text-amber-400",
            tone === "muted" && "text-muted-foreground",
            tone === "destructive" && "text-destructive"
          )}
          weight="fill"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">
            {verdict.state === "drifted" && "This analysis was computed against different inputs"}
            {verdict.state === "detached" && "Opened from its stored snapshot"}
            {verdict.state === "unreadable" && "This revision could not be opened"}
          </p>
          <p className="mt-1 max-w-3xl text-[13px] leading-[1.65] text-foreground/80">
            {verdict.message}
          </p>

          {verdict.state === "drifted" && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {/* Keeping the stored result is the primary action on purpose: it
                  is the choice that preserves what was published. */}
              <button
                type="button"
                onClick={onKeepStored}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--n9-accent)] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[var(--n9-accent-hover)]"
              >
                Keep the stored result
              </button>
              <button
                type="button"
                onClick={onRerun}
                disabled={rerunning}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                <ArrowClockwise
                  className={cn("size-3.5", rerunning && "animate-spin")}
                  weight="bold"
                />
                {rerunning ? "Re-running…" : "Re-run into a new revision"}
              </button>
              <span className="text-[12px] text-muted-foreground">
                Re-running never changes the stored revision.
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/**
 * Saved exclusions that no longer name the sample they were written for (§8.1).
 *
 * Row ids are sheet-anchored. Insert a row above an exclusion and every id
 * below it shifts: the excluded sample rejoins the analysis, an innocent one
 * leaves, and the recorded author, reason and timestamp stay attached to the
 * wrong measurement. Nothing errors, nothing is missing, and the figure still
 * draws — which is exactly why this needs a screen rather than a log line.
 *
 * It reports; it does not repair. Re-anchoring automatically would mean this
 * code deciding which sample a researcher meant to exclude, and a wrong guess
 * is indistinguishable from a right one afterwards. Same two choices as the
 * integrity banner above it, for the same reason.
 */
export function MovedExclusionsBanner({
  moved,
  rerunning,
  onKeepStored,
  onRerun,
  className,
}: {
  moved: readonly { rowId: string; status: "missing" | "moved" | "ok" }[]
  rerunning?: boolean
  onKeepStored: () => void
  onRerun: () => void
  className?: string
}) {
  const reduce = useReducedMotion()
  const shifted = moved.filter((m) => m.status === "moved")
  const gone = moved.filter((m) => m.status === "missing")
  if (shifted.length === 0 && gone.length === 0) return null

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0.12 } : { duration: 0.28, ease: EASE_OUT }}
      className={cn("rounded-xl border border-destructive/30 bg-destructive/[0.06] px-4 py-3.5", className)}
    >
      <div className="flex items-start gap-3">
        <WarningCircle className="mt-0.5 size-4 shrink-0 text-destructive" weight="fill" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">
            {shifted.length > 0
              ? "Excluded rows no longer hold the data they were excluded for"
              : "Excluded rows are no longer in this dataset"}
          </p>
          <p className="mt-1 max-w-3xl text-[13px] leading-[1.65] text-foreground/80">
            {shifted.length > 0 && (
              <>
                {shifted.length === 1 ? "One exclusion" : `${shifted.length} exclusions`} point at a
                row whose values have changed since this revision was saved — rows were most likely
                inserted or reordered above{" "}
                {shifted.length === 1 ? "it" : "them"} ({shifted.map((m) => m.rowId).join(", ")}).
                The reason and author recorded against{" "}
                {shifted.length === 1 ? "it" : "them"} now describe a different measurement.{" "}
              </>
            )}
            {gone.length > 0 && (
              <>
                {gone.length === 1 ? "One excluded row" : `${gone.length} excluded rows`} ({gone
                .map((m) => m.rowId)
                .join(", ")}) {gone.length === 1 ? "is" : "are"} no longer present.{" "}
              </>
            )}
            Nothing has been changed for you: re-anchoring an exclusion is a judgement about which
            sample was meant, and it is yours to make.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onKeepStored}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--n9-accent)] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[var(--n9-accent-hover)]"
            >
              Keep the stored result
            </button>
            <button
              type="button"
              onClick={onRerun}
              disabled={rerunning}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              <ArrowClockwise className={cn("size-3.5", rerunning && "animate-spin")} weight="bold" />
              {rerunning ? "Re-running…" : "Re-run into a new revision"}
            </button>
            <span className="text-[12px] text-muted-foreground">
              Re-running never changes the stored revision.
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
