"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { CheckCircle, CircleNotch, WarningCircle } from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"
import type { SpecAuthorPhase } from "@/lib/data-analysis/ai/spec-author-client"
import { EASE_OUT } from "./motion"

/**
 * What the assistant is doing, while it does it.
 *
 * A spec-author turn can take 45 seconds across two model calls, and before
 * this the researcher saw one static word for all of it. Five of the seven
 * phases are the route's own work rather than the model's, so this is real
 * reporting and not a progress bar animated on a timer.
 *
 * The repair round is shown, deliberately. "2 of 3 rejected — repairing" reads
 * like a defect and is the opposite: it is the architecture's central guarantee
 * working out loud. The model proposed something invalid, the gate caught it
 * before it touched a figure, and the researcher is watching that happen. A
 * tool that hid this would be asking to be trusted; one that shows it is
 * earning it.
 */

const LABEL: Record<SpecAuthorPhase["phase"], string> = {
  screen: "Checked the request",
  context: "Built the context",
  model: "Asked the model",
  validate: "Validated the changes",
  repair: "Repairing rejected changes",
  apply: "Ready",
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

export function PhaseList({
  phases,
  className,
}: {
  phases: SpecAuthorPhase[]
  className?: string
}) {
  const reduce = useReducedMotion()
  if (phases.length === 0) return null

  return (
    <ul
      className={cn("space-y-1", className)}
      aria-live="polite"
      aria-label="Assistant progress"
    >
      <AnimatePresence initial={false}>
        {phases.map((p) => (
          <motion.li
            key={p.phase}
            layout={!reduce}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0.1 } : { duration: 0.18, ease: EASE_OUT }}
            className="flex items-center gap-2 text-[12px] text-muted-foreground"
          >
            {p.status === "start" ? (
              <CircleNotch className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
            ) : p.status === "warn" ? (
              <WarningCircle
                className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                weight="fill"
              />
            ) : (
              <CheckCircle
                className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                weight="fill"
              />
            )}
            <span className={cn(p.status !== "start" && "text-foreground/80")}>
              {LABEL[p.phase]}
            </span>
            {p.detail && <span className="truncate text-muted-foreground">· {p.detail}</span>}
            <span className="ml-auto shrink-0 tabular-nums text-muted-foreground/70">
              {seconds(p.ms)}
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}
