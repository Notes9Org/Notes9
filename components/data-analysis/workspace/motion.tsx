"use client"

/**
 * Motion primitives for the analysis workspace.
 *
 * Deliberately quiet. This surface shows p-values and fitted curves, and motion
 * that draws attention to itself competes with the numbers — so everything here
 * is short, small in amplitude, and never bounces. The rules:
 *
 *   - nothing travels more than 8px;
 *   - nothing exceeds ~260ms;
 *   - no spring overshoot on anything carrying a value, because a number that
 *     wobbles reads as a number that is still changing;
 *   - `prefers-reduced-motion` collapses every primitive to a plain fade.
 *
 * Timings match the house constants already used elsewhere in the product
 * (components/literature-reviews/motion.tsx) so the app feels like one thing.
 */

import { type ReactNode } from "react"
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type HTMLMotionProps,
} from "framer-motion"

import { cn } from "@/lib/utils"

/** Expo-style ease-out: decisive arrival, no overshoot. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const

/**
 * For panels that slide.
 *
 * The platform's own spring (components/literature-reviews/motion.tsx), so a
 * dock here and a panel there move with the same weight. Damped hard enough
 * not to overshoot, because a surface carrying numbers should not wobble.
 */
export const PANEL_SPRING = { type: "spring", stiffness: 320, damping: 30, mass: 0.8 } as const

/** Fade and lift. The workhorse for cards and result blocks. */
export function Reveal({
  children,
  className,
  delay = 0,
  ...props
}: { children: ReactNode; delay?: number } & HTMLMotionProps<"div">) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
      transition={reduce ? { duration: 0.12 } : { duration: 0.26, ease: EASE_OUT, delay }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/**
 * Height-animated disclosure for "show all comparisons" and similar.
 * `height: auto` is measured by framer, so this works for unknown content.
 */
export function Collapse({
  open,
  children,
  className,
}: {
  open: boolean
  children: ReactNode
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className={cn("overflow-hidden", className)}
          initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={reduce ? { duration: 0.12 } : { duration: 0.24, ease: EASE_OUT }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * A value that has just been recomputed.
 *
 * The whole animation is a 160ms opacity dip. It is enough to say "this number
 * is new" without the reader having to wait for it to settle — which is exactly
 * why it is not a slide or a count-up. A statistic must be readable the instant
 * it appears.
 */
export function ValueSwap({
  value,
  className,
}: {
  value: string | number | null
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <span className={cn("relative inline-block tabular-nums", className)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={String(value)}
          initial={reduce ? false : { opacity: 0.35 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduce ? 0 : 0.16, ease: "linear" }}
        >
          {value ?? "—"}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

/** Slide-over panel, from the right. Used by provenance and history. */
export function SlideOver({
  open,
  onClose,
  children,
  labelledBy,
  className,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  labelledBy?: string
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            className={cn(
              "fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-background shadow-2xl",
              className
            )}
            initial={reduce ? { opacity: 0 } : { x: 24, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { x: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { x: 24, opacity: 0 }}
            /* A tween, not a spring. A spring driving `opacity` can settle
               against its rest threshold and stall short of 1, which leaves the
               panel permanently translucent with the page showing through it.
               A duration-based ease is deterministic: it always arrives. */
            transition={reduce ? { duration: 0.12 } : { duration: 0.24, ease: EASE_OUT }}
          >
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

/**
 * The sliding pill behind an active tab. Shared `layoutId` lets framer animate
 * it between tabs rather than cross-fading two pills.
 */
export function TabPill({ layoutId }: { layoutId: string }) {
  const reduce = useReducedMotion()
  if (reduce) {
    return (
      <span className="absolute inset-0 rounded-md bg-background shadow-sm ring-1 ring-inset ring-border/60" />
    )
  }
  return (
    <motion.span
      layoutId={layoutId}
      className="absolute inset-0 rounded-md bg-background shadow-sm ring-1 ring-inset ring-border/60"
      transition={{ type: "spring", stiffness: 500, damping: 40, mass: 0.7 }}
    />
  )
}

/**
 * A quiet activity strip for the recompute path.
 *
 * Indeterminate on purpose: the engine cannot honestly report progress through
 * a fit, and a progress bar that lies is worse than one that just says "working".
 */
export function ComputeBar({ active }: { active: boolean }) {
  const reduce = useReducedMotion()
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="absolute inset-x-0 top-0 h-px overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          aria-hidden
        >
          {reduce ? (
            <div className="h-full w-full bg-[var(--n9-accent)]/40" />
          ) : (
            <motion.div
              className="h-full w-1/3 bg-gradient-to-r from-transparent via-[var(--n9-accent)] to-transparent"
              animate={{ x: ["-100%", "300%"] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
