"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Activity } from "lucide-react"
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

  // ─── Loading skeleton ────────────────────────────────────────────
  if (isLoading && !summary) {
    return (
      <div className="mx-auto flex w-full max-w-3xl items-center justify-center gap-2.5 px-4 pt-1">
        <div className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded-md bg-muted" />
      </div>
    )
  }

  // ─── Empty / error → hide completely ─────────────────────────────
  if (!summary) return null

  return (
    <div
      className={`
        mx-auto flex w-full max-w-3xl items-start justify-center gap-2 px-4 pt-1
        transition-all duration-700 ease-out
        ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
      `}
    >
      <Activity
        aria-hidden
        className="mt-1 size-4 shrink-0 text-[color:var(--n9-accent)] opacity-80"
        strokeWidth={1.5}
      />
      <p
        className="min-w-0 text-pretty text-center text-base leading-snug text-muted-foreground/90 italic"
        style={{ fontFamily: "var(--font-family-display)" }}
      >
        {summary}
      </p>
    </div>
  )
}
