"use client"

/**
 * Free-tier quota notice for AI surfaces (literature search, chat).
 *
 * Rendered when a request returns 429 with a quota limit_code. Presents the
 * limit as a plain fact with the reset date — calm styling, no red, no error
 * iconography ("a limit is a fact, not a failure").
 */

import { CalendarClock } from "lucide-react"

import { UsageMeter } from "@/components/limits/usage-meter"
import { getMessage, type LimitCode } from "@/lib/limits/messages"

interface SearchLimitNoticeProps {
  code: Extract<LimitCode, "lit_search_weekly" | "ai_budget_monthly">
  used: number | null
  limit: number | null
  resetAt: string | null
}

function formatReset(resetAt: string | null): string | null {
  if (!resetAt) return null
  const d = new Date(resetAt)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  })
}

export function SearchLimitNotice({
  code,
  used,
  limit,
  resetAt,
}: SearchLimitNoticeProps) {
  const msg = getMessage(code, "at_limit")
  const resetLabel = formatReset(resetAt)
  const isBudget = code === "ai_budget_monthly"

  return (
    <div className="rounded-lg border border-border/60 bg-muted/40 px-4 py-3 space-y-2">
      <div className="flex items-start gap-2">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {isBudget
              ? "This month's AI capacity is fully used"
              : "This week's literature searches are fully used"}
          </p>
          <p className="text-xs text-muted-foreground">
            {msg?.body ??
              "Everything you've already generated stays available."}{" "}
            {resetLabel
              ? `Full capacity returns ${resetLabel}.`
              : msg?.resetHint ?? ""}
          </p>
        </div>
      </div>
      {used != null && limit != null && limit > 0 && (
        <UsageMeter code={code} used={used} total={limit} />
      )}
    </div>
  )
}
