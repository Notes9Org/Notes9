"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { CaretUp, CheckCircle, Circle, X } from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"
import { EASE_OUT } from "./motion"

/**
 * What to do next — as a pill, not a panel.
 *
 * The first version was a full-width card above the workspace: helpful once,
 * then a permanent tax on vertical space for information that is one word long
 * ("Compute"). It is now a floating pill at bottom-left — mirroring the Ask
 * launcher at bottom-right — that names only the next step and the count.
 * Tapping it opens the full checklist upward; every step still reads live
 * state, ticks itself, and the whole thing disappears when the work is done.
 */

export interface WorkflowStep {
  id: string
  label: string
  /** What this step means, in a researcher's terms. One short line. */
  hint: string
  done: boolean
  action?: { label: string; onClick: () => void }
}

export function WorkflowGuide({
  steps,
  onDismiss,
}: {
  steps: WorkflowStep[]
  onDismiss: () => void
}) {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  const firstOpen = steps.find((s) => !s.done)
  const doneCount = steps.filter((s) => s.done).length

  if (!firstOpen) return null

  return (
    <div className="fixed bottom-6 left-6 z-40">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            className="absolute bottom-full left-0 mb-2 w-72 origin-bottom-left overflow-hidden rounded-2xl border border-border bg-card/95 shadow-[0_18px_50px_-16px_rgba(20,14,8,0.5)] backdrop-blur-xl"
          >
            <ol className="p-2">
              {steps.map((step) => {
                const current = step.id === firstOpen.id
                return (
                  <li
                    key={step.id}
                    className={cn(
                      "flex items-start gap-2 rounded-lg px-2 py-1.5",
                      current && "bg-[var(--n9-accent,#965034)]/[0.07]"
                    )}
                  >
                    {step.done ? (
                      <CheckCircle className="mt-0.5 size-4 shrink-0 text-[var(--n9-accent,#965034)]" weight="fill" />
                    ) : (
                      <Circle className={cn("mt-0.5 size-4 shrink-0", current ? "text-[var(--n9-accent,#965034)]" : "text-muted-foreground/50")} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[12.5px] font-medium leading-snug", step.done && "text-muted-foreground line-through decoration-muted-foreground/40")}>
                        {step.label}
                      </span>
                      {current && (
                        <span className="block text-[11px] leading-snug text-muted-foreground">{step.hint}</span>
                      )}
                    </span>
                    {current && step.action && (
                      <button
                        type="button"
                        onClick={step.action.onClick}
                        className="shrink-0 self-center rounded-md bg-[var(--n9-accent,#965034)] px-2 py-0.5 text-[11px] font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                      >
                        {step.action.label}
                      </button>
                    )}
                  </li>
                )
              })}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 26 }}
        className="flex h-11 items-center overflow-hidden rounded-full border border-border bg-card/95 shadow-[0_10px_30px_-8px_rgba(20,14,8,0.35)] backdrop-blur-xl"
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex h-full items-center gap-2 pl-3.5 pr-2.5 transition-colors hover:bg-muted/50"
        >
          <span className="font-mono text-[11px] font-semibold text-[var(--n9-accent,#965034)]">
            {doneCount}/{steps.length}
          </span>
          <span className="text-[12.5px] font-medium">Next: {firstOpen.label}</span>
          <CaretUp className={cn("size-3 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Hide the guide"
          title="Hide — bring it back from Help"
          className="grid h-full w-8 place-items-center border-l border-border/60 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </motion.div>
    </div>
  )
}
