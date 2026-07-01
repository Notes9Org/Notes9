"use client"

/**
 * Shared framer-motion primitives for the literature feature.
 *
 * Every primitive honours `prefers-reduced-motion`: when the user opts out we
 * collapse to an instant opacity change (or no animation at all) so the UI
 * never janks. Centralising the timing/easing here keeps motion consistent
 * across the library, AI search, PDF reader and detail surfaces.
 */

import { type ReactNode } from "react"
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type Variants,
} from "framer-motion"

import { cn } from "@/lib/utils"

const SPRING = { type: "spring", stiffness: 320, damping: 30, mass: 0.8 } as const

/** Expo-style ease-out curve — decisive, no overshoot/bounce. Shared by the
 *  result-card entrance and the hover/press micro-interactions. */
const EASE_OUT = [0.22, 1, 0.36, 1] as const

/** Fade + lift + subtle scale-in. The workhorse for panels, cards and summaries. */
export function MotionReveal({
  children,
  className,
  delay = 0,
  ...props
}: { children: ReactNode; delay?: number } & HTMLMotionProps<"div">) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      transition={reduce ? { duration: 0.15 } : { ...SPRING, delay }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: SPRING },
}

const reducedItemVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.15 } },
}

/** Container that staggers its `MotionItem` children in on mount. */
export function MotionList({
  children,
  className,
  ...props
}: { children: ReactNode } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      className={className}
      variants={listVariants}
      initial="hidden"
      animate="show"
      {...props}
    >
      {children}
    </motion.div>
  )
}

/** One staggered child of a `MotionList`. */
export function MotionItem({
  children,
  className,
  ...props
}: { children: ReactNode } & HTMLMotionProps<"div">) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      variants={reduce ? reducedItemVariants : itemVariants}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/**
 * Crossfade + slide for tab content. Pass a stable `motionKey` (the active tab
 * id) so AnimatePresence transitions between panels.
 */
export function MotionTabPanel({
  motionKey,
  children,
  className,
}: {
  motionKey: string
  children: ReactNode
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={motionKey}
        className={cn("min-h-0", className)}
        initial={reduce ? { opacity: 0 } : { opacity: 0, x: 8 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, x: -8 }}
        transition={{ duration: reduce ? 0.12 : 0.2, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

/** Spring scale-in with hover/tap feedback — for floating action buttons. */
export function MotionFloating({
  children,
  className,
  ...props
}: { children: ReactNode } & HTMLMotionProps<"div">) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 6 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      transition={reduce ? { duration: 0.15 } : SPRING}
      whileHover={reduce ? undefined : { scale: 1.04 }}
      whileTap={reduce ? undefined : { scale: 0.96 }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/**
 * A single result card in a streaming/filterable list. Entrance fades + lifts
 * (transform + opacity only), exit fades + drops, and hover/press give a gentle
 * lift + tactile squeeze. All GPU-friendly; collapses to a plain fade when the
 * user prefers reduced motion. Pass `delay` for a staggered reveal.
 */
export function MotionResultCard({
  children,
  className,
  delay = 0,
  ...props
}: { children: ReactNode; delay?: number } & HTMLMotionProps<"div">) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.985 }}
      transition={reduce ? { duration: 0.15 } : { duration: 0.4, ease: EASE_OUT, delay }}
      whileHover={reduce ? undefined : { y: -2, transition: { duration: 0.18, ease: EASE_OUT } }}
      whileTap={reduce ? undefined : { scale: 0.996, transition: { duration: 0.12, ease: EASE_OUT } }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

/**
 * Hover-lift + press feedback for cards that manage their own mount animation
 * (or none). No entrance/exit — safe to drop into any list. Transform-only.
 */
export function MotionHoverCard({
  children,
  className,
  ...props
}: { children: ReactNode } & HTMLMotionProps<"div">) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      whileHover={reduce ? undefined : { y: -2, transition: { duration: 0.18, ease: EASE_OUT } }}
      whileTap={reduce ? undefined : { scale: 0.996, transition: { duration: 0.12, ease: EASE_OUT } }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export { AnimatePresence, motion, useReducedMotion }
