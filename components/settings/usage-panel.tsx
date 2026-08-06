"use client"

/**
 * Settings → Usage panel (free plan).
 *
 * Shows the two free-tier meters, literature searches this ISO week and AI
 * usage this calendar month, using the remaining-capacity UsageMeter.
 * Reset moments are rendered as plain facts ("Returns Monday"), never as
 * warnings: a limit is a fact, not a failure.
 */

import { useEffect, useState } from "react"
import { CircleNotch as Loader2, ArrowsClockwise as RefreshCw } from "@phosphor-icons/react/ssr"

import { Button } from "@/components/ui/button"
import { UsageMeter } from "@/components/limits/usage-meter"

interface UsageSummary {
  plan: string
  lit_search: {
    used: number
    limit: number | null
    window: string
    reset_at: string
  }
  ai_budget: {
    used_credits: number
    limit_credits: number | null
    window: string
    reset_at: string
  }
  mode: string
}

function formatResetDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  })
}

const formatCredits = (n: number) =>
  `${Number.isInteger(n) ? n : Math.round(n)}`

export function UsagePanel() {
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  )

  const load = async () => {
    setStatus("loading")
    try {
      const res = await fetch("/api/usage/summary", { cache: "no-store" })
      if (!res.ok) throw new Error(`usage summary ${res.status}`)
      setSummary((await res.json()) as UsageSummary)
      setStatus("ready")
    } catch {
      setSummary(null)
      setStatus("unavailable")
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (status === "unavailable" || !summary) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Usage information isn&apos;t available right now.
        </p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-2 size-4" />
          Try again
        </Button>
      </div>
    )
  }

  const search = summary.lit_search
  const budget = summary.ai_budget

  return (
    <div className="flex flex-1 flex-col justify-center gap-8">
      {search.limit != null && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-medium">Literature searches</h3>
            <span className="text-xs text-muted-foreground">
              Full capacity returns {formatResetDate(search.reset_at)}
            </span>
          </div>
          {search.used == null ? (
            <p className="text-xs text-muted-foreground">
              Usage temporarily unavailable, your searches are still counted.
            </p>
          ) : (
            <UsageMeter
              code="lit_search_weekly"
              used={search.used}
              total={search.limit}
              unit="searches"
            />
          )}
          <p className="text-xs text-muted-foreground">
            AI-powered literature searches this week, on the Free plan.
          </p>
        </section>
      )}

      {budget.limit_credits != null && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-medium">AI credits</h3>
            <span className="text-xs text-muted-foreground">
              Credits refresh {formatResetDate(budget.reset_at)}
            </span>
          </div>
          {budget.used_credits == null ? (
            <p className="text-xs text-muted-foreground">
              Usage temporarily unavailable, your credits are still counted.
            </p>
          ) : (
            <UsageMeter
              code="ai_budget_monthly"
              used={budget.used_credits}
              total={budget.limit_credits}
              unit="credits"
              formatValue={formatCredits}
            />
          )}
          <p className="text-xs text-muted-foreground">
            You get {budget.limit_credits} free credits each month. Credits cover
            Catalyst chat, literature summaries, web search, and other AI
            features.
          </p>
        </section>
      )}
    </div>
  )
}
