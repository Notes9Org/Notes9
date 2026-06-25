"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

/**
 * Lightweight page-transition wrapper. Fades + lifts the content a few pixels
 * when the pathname changes, then settles. Pure CSS — no framer-motion in the
 * bundle. The animation only runs after first paint, so the very first page
 * load is instant (avoids a flash on hydration).
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const firstPaint = useRef(true)
  const [phase, setPhase] = useState<"idle" | "enter">("idle")

  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false
      return
    }
    setPhase("enter")
    const t = window.setTimeout(() => setPhase("idle"), 360)
    return () => window.clearTimeout(t)
  }, [pathname])

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
