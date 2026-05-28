"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { BrainCircuit } from "lucide-react"

/** Cache key for localStorage. */
const CACHE_KEY = "n9:activity-summary"
/** Summary is considered stale after 2 days. */
const STALE_MS = 2 * 24 * 60 * 60 * 1000

type CachedSummary = {
  summary: string
  cachedAt: number // epoch ms
}

/**
 * Reads the cached summary from localStorage.
 * Returns null if missing, corrupted, or stale (>2 days).
 */
function readCache(): CachedSummary | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedSummary
    if (!parsed.summary || !parsed.cachedAt) return null
    if (Date.now() - parsed.cachedAt > STALE_MS) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(summary: string) {
  try {
    const entry: CachedSummary = { summary, cachedAt: Date.now() }
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
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
  const [summary, setSummary] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isVisible, setIsVisible] = useState(false)
  const fetchRef = useRef(false)

  const fetchSummary = useCallback(async () => {
    if (fetchRef.current) return
    fetchRef.current = true
    try {
      const res = await fetch("/api/ai/activity-summary", { cache: "no-store" })
      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = (await res.json()) as { summary?: string }
      if (data.summary) {
        setSummary(data.summary)
        writeCache(data.summary)
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
    // 1. Check localStorage cache
    const cached = readCache()

    // 2. Check if this is a fresh login session (no sessionStorage flag)
    const sessionFetched = sessionStorage.getItem("n9:activity-summary-fetched")

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
      sessionStorage.setItem("n9:activity-summary-fetched", "1")
      fetchSummary()
      return
    }

    // No cache or expired → fetch fresh
    sessionStorage.setItem("n9:activity-summary-fetched", "1")
    fetchSummary()
  }, [fetchSummary])

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
        mx-auto flex w-full max-w-3xl items-center justify-center gap-2.5 px-4 pt-1
        transition-all duration-700 ease-out
        ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
      `}
    >
      <BrainCircuit
        aria-hidden
        className="size-[22px] shrink-0 text-[color:var(--n9-accent)] opacity-80"
        strokeWidth={1.5}
      />
      <p
        className="text-lg leading-relaxed text-muted-foreground/90 italic tracking-wide"
        style={{ fontFamily: "var(--font-family-display)" }}
      >
        {summary}
      </p>
    </div>
  )
}
