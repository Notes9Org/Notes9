"use client"

import { useEffect, useState } from "react"
import { Sparkles } from "lucide-react"
import { timeOfDayLabel } from "@/lib/greeting"

/**
 * Renders the centered "Morning, <name>" greeting on the dashboard and
 * projects landing page.
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
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center pt-2 md:pt-6">
      {dateStr && (
        <div className="mb-2 md:mb-3 text-xs md:text-sm font-medium tracking-widest text-muted-foreground uppercase">
          {dateStr}
        </div>
      )}
      <div className="flex items-center gap-3 md:gap-4">
        <Sparkles
          aria-hidden
          className="size-7 md:size-9 shrink-0 text-[color:var(--n9-accent)]"
          strokeWidth={1.5}
        />
        <h1 className="font-display text-3xl md:text-5xl font-normal tracking-tight leading-tight text-balance text-foreground">
          {timeOfDay}, {name}
        </h1>
      </div>
    </div>
  )
}
