"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * A full-screen stacked "page". Each section pins to the top (sticky) with a
 * rising z-index and an opaque surface, so the next locks over the previous one
 * and fully covers what's behind it. Motion is a one-shot content reveal (inner
 * wrapper only) fired by an IntersectionObserver, deliberately NOT a
 * scroll-driven transform on the sticky card, which would freeze mid-value and
 * stop the card reaching the top.
 */
export function StackSection({
  children,
  index = 0,
  variant = "light",
  className,
}: {
  children: ReactNode
  index?: number
  /** "highlight" renders a warm-tinted band (still light) to spotlight a section. */
  variant?: "light" | "highlight"
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === "undefined") {
      setShown(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true)
            io.disconnect()
            break
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -12% 0px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      className={cn("n9-stack-card", variant === "highlight" && "n9-highlight", className)}
      style={{ zIndex: 10 + index }}
    >
      <div ref={ref} className={cn("n9-stack-reveal", shown && "is-in")}>
        {children}
      </div>
    </div>
  )
}
