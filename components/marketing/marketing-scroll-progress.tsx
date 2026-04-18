"use client"

import { motion, useReducedMotion, useScroll, useSpring } from "framer-motion"

/**
 * Thin top progress line (similar to high-contrast SaaS landings) — reads scroll depth without clutter.
 */
export function MarketingScrollProgress() {
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 32,
    mass: 0.15,
  })

  if (reduceMotion) return null

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-transparent via-[var(--n9-accent)]/90 to-amber-600/80"
      style={{ scaleX }}
    />
  )
}
