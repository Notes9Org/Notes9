"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowRight, WarningCircle } from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"
import type { Exclusion, ExclusionReasonKind } from "@/lib/data-analysis/spec/analysis-spec"
import { EASE_OUT } from "./motion"

/**
 * Excluding a point (§8.1).
 *
 * The document is blunt about what this feature is if built naively: "a
 * frictionless p-hacking machine". The design answer is not to remove the
 * capability but to govern it, and thereby turn the hazard into the single most
 * trust-building screen in the product.
 *
 * So this dialog does three things no competitor's does:
 *
 *   1. it will not submit without a reason;
 *   2. a statistical exclusion must name its method and parameters;
 *   3. it shows the result WITH and WITHOUT the point, side by side, BEFORE the
 *      researcher commits, so the effect of the choice is visible at the moment
 *      it is made rather than discoverable afterwards.
 *
 * Point 3 is the one worth building carefully. A researcher who sees that
 * removing a well flips p from 0.08 to 0.03 is being shown, honestly, exactly
 * what that decision is worth.
 */

const REASONS: { value: ExclusionReasonKind; label: string; hint: string }[] = [
  { value: "technical-failure", label: "Technical failure", hint: "Pipetting error, bubble, edge effect" },
  { value: "contamination", label: "Contamination", hint: "Visible growth or precipitate" },
  { value: "instrument-error", label: "Instrument error", hint: "Read failure, saturation, drift" },
  { value: "pre-registered-criterion", label: "Pre-registered criterion", hint: "Defined before the data were seen" },
  { value: "statistical-outlier", label: "Statistical outlier", hint: "Must name a test and its parameters" },
  { value: "other", label: "Other", hint: "Describe it in your own words" },
]

/**
 * The one outlier test this dialog will record.
 *
 * ROUT used to sit here, and it was the DEFAULT — but nothing in this codebase
 * computes ROUT, so accepting the default filed a statistical exclusion
 * attributed to a test that never ran, in precisely the field §8.1 exists to
 * keep honest. Grubbs is real (`lib/data-analysis/statistics.ts`, surfaced in
 * the stats panel), and its parameter is α, not ROUT's Q — so the recorded
 * params are keyed to the method rather than to whatever the label happened to
 * say. Adding a method here means adding its estimator first, and its param key
 * alongside it.
 */
const OUTLIER_METHOD = "Grubbs"
const OUTLIER_PARAM = "α"
/** Param key for `OUTLIER_METHOD`. Grubbs takes a significance level. */
const OUTLIER_PARAM_KEY = "alpha"

export interface ExclusionPreview {
  /** p-value with the point still included. */
  withPoint: number | null
  /** p-value with the point excluded. */
  withoutPoint: number | null
  alpha: number
}

function formatP(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return "-"
  return p < 0.0001 ? "< 0.0001" : p.toFixed(4)
}

export function ExclusionDialog({
  open,
  rowId,
  rowSummary,
  preview,
  previewLoading,
  currentUserId,
  onCancel,
  onConfirm,
}: {
  open: boolean
  rowId: string
  /** Short description of the point, e.g. "Well A7 · 0.42 OD450". */
  rowSummary?: string
  preview?: ExclusionPreview | null
  previewLoading?: boolean
  currentUserId: string
  onCancel: () => void
  onConfirm: (exclusion: Exclusion) => void
}) {
  const reduce = useReducedMotion()
  const [reasonKind, setReasonKind] = useState<ExclusionReasonKind | null>(null)
  const [note, setNote] = useState("")
  const [q, setQ] = useState("1")

  const needsNote = reasonKind === "other"
  const needsMethod = reasonKind === "statistical-outlier"
  const canSubmit =
    reasonKind !== null && (!needsNote || note.trim().length > 0) && (!needsMethod || q.trim() !== "")

  /**
   * Does excluding this point change the answer? Shown plainly, because a
   * researcher deserves to know that before they decide, not after.
   */
  const flips = useMemo(() => {
    if (!preview || preview.withPoint === null || preview.withoutPoint === null) return false
    const before = preview.withPoint < preview.alpha
    const after = preview.withoutPoint < preview.alpha
    return before !== after
  }, [preview])

  const submit = () => {
    if (!reasonKind || !canSubmit) return
    onConfirm({
      rowId,
      reasonKind,
      reasonText: note.trim() || null,
      method: needsMethod
        ? { name: OUTLIER_METHOD, params: { [OUTLIER_PARAM_KEY]: Number(q) / 100 } }
        : null,
      excludedBy: currentUserId,
      excludedAt: new Date().toISOString(),
    })
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
            onClick={onCancel}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="exclusion-title"
            className="fixed left-1/2 top-1/2 z-50 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.99 }}
            transition={reduce ? { duration: 0.12 } : { duration: 0.24, ease: EASE_OUT }}
          >
            <div className="px-5 pt-5">
              <h2 id="exclusion-title" className="text-[15px] font-semibold text-foreground">
                Exclude this data point
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {rowSummary ? `${rowSummary}. ` : ""}The point stays in the dataset and on the
                figure, greyed. Your name and reason are recorded with it.
              </p>
            </div>

            {/* The honest bit: what this choice does to the answer. */}
            <div className="mx-5 mt-4 overflow-hidden rounded-xl border border-border/70 bg-muted/30">
              <p className="border-b border-border/60 px-3.5 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Effect of this exclusion
              </p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3.5 py-3">
                <div>
                  <p className="text-[11px] text-muted-foreground">With the point</p>
                  <p className="mt-0.5 text-[17px] font-medium tabular-nums text-foreground">
                    {previewLoading ? "…" : formatP(preview?.withPoint ?? null)}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground/60" />
                <div>
                  <p className="text-[11px] text-muted-foreground">Without it</p>
                  <p className="mt-0.5 text-[17px] font-medium tabular-nums text-foreground">
                    {previewLoading ? "…" : formatP(preview?.withoutPoint ?? null)}
                  </p>
                </div>
              </div>
              <AnimatePresence>
                {flips && (
                  <motion.div
                    initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                    animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: EASE_OUT }}
                    className="overflow-hidden border-t border-amber-500/25 bg-amber-500/[0.08]"
                  >
                    <p className="flex items-start gap-2 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-800 dark:text-amber-300">
                      <WarningCircle className="mt-0.5 size-3.5 shrink-0" weight="fill" />
                      Removing this point changes whether the result is significant at α ={" "}
                      {preview?.alpha}. That is worth stating in your methods, and the exported
                      legend will disclose it.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Reason, required. */}
            <fieldset className="px-5 pt-4">
              <legend className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Reason (required)
              </legend>
              <div className="mt-2 grid gap-1">
                {REASONS.map((r) => (
                  <label
                    key={r.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors",
                      reasonKind === r.value
                        ? "border-[var(--n9-accent)]/40 bg-[var(--n9-accent)]/[0.06]"
                        : "border-transparent hover:bg-muted/60"
                    )}
                  >
                    <input
                      type="radio"
                      name="exclusion-reason"
                      value={r.value}
                      checked={reasonKind === r.value}
                      onChange={() => setReasonKind(r.value)}
                      className="mt-0.5 accent-[var(--n9-accent)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-foreground">{r.label}</span>
                      <span className="block text-[12px] text-muted-foreground">{r.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* A statistical exclusion must name its method, the schema rejects it otherwise. */}
            <AnimatePresence initial={false}>
              {needsMethod && (
                <motion.div
                  initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: EASE_OUT }}
                  className="overflow-hidden"
                >
                  <div className="mx-5 mt-3 flex items-end gap-2 rounded-lg border border-border/70 bg-muted/30 p-3">
                    <div className="flex-1">
                      <span className="block text-[11px] text-muted-foreground">Method</span>
                      <p className="mt-1 flex h-8 items-center rounded-md border border-border bg-background px-2 text-[13px]">
                        {OUTLIER_METHOD}
                      </p>
                    </div>
                    <label className="w-24">
                      <span className="block text-[11px] text-muted-foreground">
                        {OUTLIER_PARAM} (%)
                      </span>
                      <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        inputMode="decimal"
                        className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-[13px] tabular-nums"
                      />
                    </label>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="px-5 pt-3">
              <label className="block">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Note {needsNote ? "(required)" : "(optional)"}
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="e.g. plate edge effect, confirmed on the run sheet"
                  className="mt-1.5 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none transition-colors focus:border-[var(--n9-accent)]/50"
                />
              </label>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 bg-muted/25 px-5 py-3">
              <p className="text-[12px] text-muted-foreground">
                Recorded against your account and shown on the provenance card.
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-[13px] font-medium transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                  className="inline-flex h-8 items-center rounded-md bg-[var(--n9-accent)] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[var(--n9-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Exclude point
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
