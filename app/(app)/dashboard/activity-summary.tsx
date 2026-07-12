"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Pulse as Activity } from "@phosphor-icons/react/ssr"
import { useAuthUser } from "@/components/auth/auth-provider"

/** Per-user cache keys. Scoping by user id is required so that signing into a
 *  different Notes9 account in the same browser never shows the previous
 *  account's summary. (Mirrors the per-user tour keys in components/tour/app-tour.tsx.) */
const cacheKey = (userId: string) => `n9:activity-summary:${userId}`
const sessionFlagKey = (userId: string) => `n9:activity-summary-fetched:${userId}`
/** Summary is considered stale after 2 days. */
const STALE_MS = 2 * 24 * 60 * 60 * 1000

type CachedSummary = {
  summary: string
  cachedAt: number // epoch ms
}

/**
 * Reads the cached summary for the given user from localStorage.
 * Returns null if missing, corrupted, or stale (>2 days).
 */
function readCache(userId: string): CachedSummary | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { summary?: unknown }).summary !== "string" ||
      typeof (parsed as { cachedAt?: unknown }).cachedAt !== "number"
    ) {
      return null
    }
    const valid = parsed as CachedSummary
    if (!valid.summary || !valid.cachedAt) return null
    if (Date.now() - valid.cachedAt > STALE_MS) return null
    return valid
  } catch (err) {
    console.warn("Activity summary cache read failed:", err)
    return null
  }
}

function writeCache(userId: string, summary: string) {
  try {
    const entry: CachedSummary = { summary, cachedAt: Date.now() }
    localStorage.setItem(cacheKey(userId), JSON.stringify(entry))
  } catch {
    // localStorage full or unavailable — ignore
  }
}

/**
 * Renders an AI-generated one-liner summarising the user's recent lab
 * activity. Placed directly below the dashboard greeting.
 *
 * Refresh strategy:
 * - On first login / mount with no cache → fetch fresh.
 * - If cached summary exists and is < 2 days old → show cached immediately.
 * - Every 2 days the cache expires → next mount triggers a fresh fetch.
 * - `sessionStorage` flag ensures a fresh fetch on each new login session.
 * - Gracefully hidden if the API fails — never blocks the dashboard.
 */
export function ActivitySummary() {
  const user = useAuthUser()
  const userId = user?.id ?? null
  const [summary, setSummary] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isVisible, setIsVisible] = useState(false)
  const fetchRef = useRef(false)

  const fetchSummary = useCallback(async (uid: string) => {
    if (fetchRef.current) return
    fetchRef.current = true
    try {
      const res = await fetch("/api/ai/activity-summary", { cache: "no-store" })
      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = (await res.json()) as { summary?: string }
      if (data.summary) {
        setSummary(data.summary)
        writeCache(uid, data.summary)
        requestAnimationFrame(() => setIsVisible(true))
      }
    } catch (err) {
      console.warn("Activity summary fetch failed:", err)
    } finally {
      setIsLoading(false)
      fetchRef.current = false
    }
  }, [])

  useEffect(() => {
    // The summary is per-user. Without a signed-in user id we have nothing to
    // show and nothing to cache — clear any stale state and wait.
    if (!userId) {
      setSummary(null)
      setIsVisible(false)
      setIsLoading(true)
      return
    }

    // Switching accounts in the same browser: drop the previous user's summary
    // from view immediately, then resolve this user's own cache below.
    setSummary(null)
    setIsVisible(false)
    setIsLoading(true)

    // 1. Check this user's localStorage cache
    const cached = readCache(userId)

    // 2. Check if this is a fresh login session for this user (no flag)
    const sessionFetched = sessionStorage.getItem(sessionFlagKey(userId))

    if (cached && sessionFetched) {
      // Cache is fresh AND we already fetched this session → show cached
      setSummary(cached.summary)
      setIsLoading(false)
      requestAnimationFrame(() => setIsVisible(true))
      return
    }

    if (cached && !sessionFetched) {
      // Cache exists but new session (fresh login) → show cached now, fetch in background
      setSummary(cached.summary)
      setIsLoading(false)
      requestAnimationFrame(() => setIsVisible(true))
      sessionStorage.setItem(sessionFlagKey(userId), "1")
      void fetchSummary(userId)
      return
    }

    // No cache or expired → fetch fresh
    sessionStorage.setItem(sessionFlagKey(userId), "1")
    void fetchSummary(userId)
  }, [userId, fetchSummary])

  // ─── Loading skeleton (matches the chip's footprint) ─────────────
  if (isLoading && !summary) {
    return (
      <div className="relative w-full max-w-xl rounded-xl border border-[color:var(--glass-border)] bg-background/50 px-3.5 py-2.5 md:ml-auto">
        <div className="mb-1.5 h-2.5 w-16 animate-pulse rounded bg-muted" />
        <div className="h-3.5 w-full max-w-[18rem] animate-pulse rounded bg-muted" />
      </div>
    )
  }

  // ─── Empty / error → hide completely ─────────────────────────────
  if (!summary) return null

  // "Lab pulse" chip: a raised glass inset with an accent-tinted hairline and
  // a gradient micro-label — the AI summary reads as a signed insight, not a
  // stray line of body text.
  return (
    <div
      className={`
        relative w-full max-w-xl overflow-hidden rounded-xl border
        border-[color:color-mix(in_oklab,var(--primary)_22%,var(--glass-border))]
        bg-background/55 px-3.5 py-2.5 shadow-sm backdrop-blur-sm md:ml-auto
        transition-all duration-700 ease-out
        ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
      `}
    >
      {/* Accent glow rising from the label corner */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-6 -top-8 size-24 rounded-full bg-[color:var(--n9-accent)]/10 blur-2xl"
      />
      <div className="flex items-center gap-1.5">
        <Activity
          aria-hidden
          className="size-3 shrink-0 text-[color:var(--n9-accent)]"
          weight="bold"
        />
        <span className="bg-gradient-to-r from-[color:var(--n9-accent)] to-[color:color-mix(in_oklab,var(--n9-accent)_45%,#d9a24a)] bg-clip-text text-[9px] font-semibold uppercase tracking-[0.16em] text-transparent">
          Lab pulse
        </span>
      </div>
      <p
        className="mt-1 min-w-0 text-pretty text-[13px] italic leading-snug text-muted-foreground"
        style={{ fontFamily: "var(--font-family-display)" }}
      >
        {summary}
      </p>
    </div>
  )
}
