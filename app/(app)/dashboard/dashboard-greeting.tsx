"use client"

import { useEffect, useState } from "react"
import { useAuthUser } from "@/components/auth/auth-provider"
import { timeOfDayLabel } from "@/lib/greeting"

/** Initials (max 2) from a display name, for the avatar fallback. */
function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "R"
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "")
  return letters.join("") || "R"
}

/**
 * Glossy, depth-styled user avatar shown beside the greeting. Uses the user's
 * photo when a public avatar URL is present (e.g. from OAuth), otherwise a
 * gradient sphere with their initials. Deliberately not a sparkles/brain icon.
 */
function GreetingAvatar({ name }: { name: string }) {
  const user = useAuthUser()
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
  const raw =
    (typeof meta.avatar_url === "string" && meta.avatar_url) ||
    (typeof meta.picture === "string" && meta.picture) ||
    ""
  const photo = /^https?:\/\//.test(raw) ? raw : ""
  const initials = initialsFromName(name)

  return (
    <div className="relative size-11 shrink-0 md:size-14" aria-hidden>
      {/* Soft grounded shadow for depth */}
      <div className="absolute inset-x-1 bottom-0 h-2 translate-y-1 rounded-full bg-black/25 blur-md" />
      {/* Sphere */}
      <div className="relative flex size-full items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[color:var(--n9-accent)] to-[color:var(--n9-accent-hover,#7e3a1b)] shadow-[0_6px_16px_-5px_rgba(60,40,25,0.55)] ring-2 ring-white/70 dark:ring-white/10">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="size-full object-cover" />
        ) : (
          <span className="font-display text-base font-semibold text-white drop-shadow-sm md:text-xl">
            {initials}
          </span>
        )}
        {/* Glossy top highlight → 3D sphere feel */}
        <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/40 via-white/5 to-transparent" />
      </div>
    </div>
  )
}

/**
 * Renders the centered "Morning, <name>" greeting on the dashboard and
 * projects landing page, with a 3D-styled user avatar beside it.
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
        <GreetingAvatar name={name} />
        <h1 className="font-display text-3xl md:text-5xl font-normal tracking-tight leading-tight text-balance text-foreground">
          {timeOfDay}, {name}
        </h1>
      </div>
    </div>
  )
}
