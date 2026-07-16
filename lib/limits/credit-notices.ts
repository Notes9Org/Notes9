/**
 * Proactive in-chat credit notices.
 *
 * After a Catalyst turn completes, check the user's monthly AI-credit usage and,
 * when they first cross 50% or 90%, push a calm notice bubble into the chat via
 * the existing `notifyCatalyst` mechanism. Fires at most once per threshold per
 * calendar month (deduped in localStorage), and only the highest newly-crossed
 * tier — so a fast crosser sees one message, not two.
 *
 * Data source: GET /api/usage/summary (ai_budget.used_credits / limit_credits).
 * Copy: getMessage('ai_budget_monthly', 'approaching' | 'near').
 */

import { getMessage, type LimitMessage, type LimitSeverity } from "@/lib/limits/messages"

type Tier = 50 | 90 | 100

const THRESHOLDS: { tier: Tier; ratio: number; severity: LimitSeverity }[] = [
  { tier: 100, ratio: 1, severity: "at_limit" },
  { tier: 90, ratio: 0.9, severity: "near" },
  { tier: 50, ratio: 0.5, severity: "approaching" },
]

/** A crossed-threshold notice for the composer card (not a chat bubble). */
export type CreditNotice = { message: LimitMessage; severity: LimitSeverity }

/** Stable per-month key so the dedup resets when credits refresh. */
function monthKeyFromResetAt(resetAt: string | null | undefined): string {
  // reset_at is the 1st of NEXT month; the current window is the month before.
  const d = resetAt ? new Date(resetAt) : new Date()
  if (Number.isNaN(d.getTime())) return "unknown"
  // Step back one day to land inside the current window, then take YYYY-MM.
  const inWindow = new Date(d.getTime() - 24 * 60 * 60 * 1000)
  return `${inWindow.getUTCFullYear()}-${String(inWindow.getUTCMonth() + 1).padStart(2, "0")}`
}

function alreadyNotified(monthKey: string, tier: Tier): boolean {
  try {
    return localStorage.getItem(`credits-notice:${monthKey}:${tier}`) === "1"
  } catch {
    return false // private mode / no storage → best-effort, may re-notify
  }
}

function markNotified(monthKey: string, tier: Tier): void {
  try {
    localStorage.setItem(`credits-notice:${monthKey}:${tier}`, "1")
  } catch {
    /* ignore */
  }
}

/**
 * Check credit usage and return a threshold notice if a new tier was crossed —
 * the caller renders it as a dismissible card above the composer (not a chat
 * bubble). Safe to call on every turn completion: self-throttles via
 * localStorage (once per tier per month) and never throws.
 */
export async function maybeNotifyCreditThreshold(): Promise<CreditNotice | null> {
  try {
    const res = await fetch("/api/usage/summary", { cache: "no-store" })
    if (!res.ok) return null
    const data = await res.json()
    if (data?.mode === "off") return null

    const budget = data?.ai_budget
    const used = Number(budget?.used_credits)
    const limit = Number(budget?.limit_credits)
    if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return null

    const ratio = used / limit
    const crossed = THRESHOLDS.find((t) => ratio >= t.ratio)
    if (!crossed) return null

    const monthKey = monthKeyFromResetAt(budget?.reset_at)
    if (alreadyNotified(monthKey, crossed.tier)) return null

    // Mark this tier and every lower tier as seen, so a jump straight to 90%
    // doesn't also queue the 50% message next turn.
    for (const t of THRESHOLDS) {
      if (t.ratio <= crossed.ratio) markNotified(monthKey, t.tier)
    }

    return { message: getMessage("ai_budget_monthly", crossed.severity), severity: crossed.severity }
  } catch {
    /* metering is advisory — never disrupt the chat */
    return null
  }
}
