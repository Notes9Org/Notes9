"use client"

import { useEffect, useRef, useState } from "react"
import { useInView } from "framer-motion"

interface AnimatedCounterProps {
  value: string
  className?: string
}

/**
 * Animates a numeric value counting up when it scrolls into view.
 * Handles formats like "42%", "~5 hrs", "70%+".
 */
export function AnimatedCounter({ value, className }: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-40px" })
  const [display, setDisplay] = useState(value)

  useEffect(() => {
    if (!isInView) return

    // Extract the numeric part
    const match = value.match(/(\d+)/)
    if (!match) {
      setDisplay(value)
      return
    }

    const target = parseInt(match[1], 10)
    const prefix = value.slice(0, match.index)
    const suffix = value.slice((match.index ?? 0) + match[1].length)

    const duration = 1200
    const startTime = performance.now()

    function tick(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(eased * target)
      setDisplay(`${prefix}${current}${suffix}`)

      if (progress < 1) {
        requestAnimationFrame(tick)
      }
    }

    requestAnimationFrame(tick)
  }, [isInView, value])

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  )
}
