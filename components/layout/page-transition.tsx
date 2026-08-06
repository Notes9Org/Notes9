"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

/**
 * Lightweight page-transition wrapper. Fades + lifts the content a few pixels
 * when the pathname changes, then settles. Pure CSS, no framer-motion in the
 * bundle. The animation only runs after first paint, so the very first page
 * load is instant (avoids a flash on hydration).
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const firstPaint = useRef(true)
  const [phase, setPhase] = useState<"idle" | "enter">("idle")
  // Detect the pathname change DURING render, not in an effect: the effect
  // ran one paint late, so the new page painted fully visible for a frame,
  // snapped to opacity 0 when the animation class landed, then faded back in
  // reading as a glitch right when the navigation loader hands off.
  // Render-phase state means the new keyed div carries the animation class
  // from its very first frame.
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    if (!firstPaint.current) setPhase("enter")
  }

  useEffect(() => {
    firstPaint.current = false
    if (phase !== "enter") return
    const t = window.setTimeout(() => setPhase("idle"), 360)
    return () => window.clearTimeout(t)
  }, [phase])

  return (
    <div
      key={pathname}
      className={cn(
        "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col",
        phase === "enter" && "animate-page-transition",
      )}
    >
      {children}
    </div>
  )
}
