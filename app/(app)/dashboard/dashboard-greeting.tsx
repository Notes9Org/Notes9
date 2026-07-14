"use client"

import { useEffect, useState } from "react"
import { timeOfDayLabel } from "@/lib/greeting"

/**
 * Compact "Morning, <name>" greeting for the dashboard masthead: a micro-caps
 * date line with the greeting beneath, left-aligned, no avatar. The name is
 * accent-tinted so the row reads personal without any chrome around it.
 *
 * Lives client-side so the time-of-day reflects the user's local clock — a
 * server-rendered version would say "Morning" to an IST user at 11pm because
 * the Vercel/UTC clock is six hours behind. SSR fallback is "Morning" so the
 * hydration markup matches; the effect overwrites it on mount.
 */
export function DashboardGreeting({ name }: { name: string }) {
  const [timeOfDay, setTimeOfDay] = useState<"Morning" | "Afternoon" | "Evening">("Morning")
  const [dateStr, setDateStr] = useState("")

  useEffect(() => {
    setTimeOfDay(timeOfDayLabel(new Date().getHours()))
    setDateStr(
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      })
    )
  }, [])

  return (
    <div className="relative min-w-0 shrink-0">
      <div className="h-3.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground md:text-[11px]">
        {dateStr}
      </div>
      <h1 className="font-display mt-0.5 text-2xl font-normal leading-tight tracking-tight text-foreground md:text-3xl">
        {timeOfDay}, <span className="text-[color:var(--n9-accent)]">{name}</span>
      </h1>
    </div>
  )
}
