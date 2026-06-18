'use client'

/**
 * components/limits/limit-notice.tsx
 *
 * Inline limit notice banner — shown at the point of action (inline-at-the-action
 * pattern, highest priority surface per the plan).
 *
 * Severity → visual treatment:
 *   approaching  → info-blue, dismissible
 *   near         → amber, persistent (not dismissible)
 *   at_limit     → amber, persistent, shows countdown if retry_after_seconds present
 *   soft_overage → amber, dismissible
 *
 * Never red. Never says "Error 429". Never a dead-end.
 */

import { useState, useEffect, useRef } from 'react'
import { Info, Clock, Zap, Cloud, File, MessageCircle, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LimitMessage, LimitSeverity } from '@/lib/limits/messages'

// ---------------------------------------------------------------------------
// Icon resolver
// ---------------------------------------------------------------------------

const ICONS = {
  clock: Clock,
  info: Info,
  zap: Zap,
  cloud: Cloud,
  file: File,
  'message-circle': MessageCircle,
  calendar: Calendar,
} as const

// ---------------------------------------------------------------------------
// Color tokens — never red for planned limits
// ---------------------------------------------------------------------------

const COLOR_CLASSES: Record<string, {
  container: string
  icon: string
  title: string
  body: string
  dismiss: string
}> = {
  blue: {
    container: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800',
    icon: 'text-blue-500 dark:text-blue-400',
    title: 'text-blue-900 dark:text-blue-100',
    body: 'text-blue-700 dark:text-blue-300',
    dismiss: 'text-blue-400 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-300',
  },
  amber: {
    container: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800',
    icon: 'text-amber-500 dark:text-amber-400',
    title: 'text-amber-900 dark:text-amber-100',
    body: 'text-amber-700 dark:text-amber-300',
    dismiss: 'text-amber-400 hover:text-amber-600 dark:text-amber-500 dark:hover:text-amber-300',
  },
  slate: {
    container: 'bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-700',
    icon: 'text-slate-500 dark:text-slate-400',
    title: 'text-slate-800 dark:text-slate-200',
    body: 'text-slate-600 dark:text-slate-400',
    dismiss: 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300',
  },
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LimitNoticeProps {
  message: LimitMessage
  severity: LimitSeverity
  /** Seconds until the limit resets. When provided and > 0, shows a live countdown. */
  retryAfterSeconds?: number
  /** Called when the user dismisses the notice (only for dismissible severities). */
  onDismiss?: () => void
  className?: string
}

// ---------------------------------------------------------------------------
// Countdown sub-component
// ---------------------------------------------------------------------------

function Countdown({ seconds, onExpired }: { seconds: number; onExpired?: () => void }) {
  const [remaining, setRemaining] = useState(seconds)
  // Guard: onExpired must fire exactly once even if the effect re-runs while remaining===0
  const firedRef = useRef(false)

  useEffect(() => {
    if (remaining <= 0) {
      if (!firedRef.current) {
        firedRef.current = true
        onExpired?.()
      }
      return
    }
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000)
    return () => clearTimeout(id)
  }, [remaining, onExpired])

  if (remaining <= 0) return <span>Ready now</span>

  const m = Math.floor(remaining / 60)
  const s = remaining % 60
  const label = m > 0 ? `${m}m ${s}s` : `${s}s`
  return <span>Ready in {label}</span>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LimitNotice({
  message,
  severity,
  retryAfterSeconds,
  onDismiss,
  className,
}: LimitNoticeProps) {
  const [dismissed, setDismissed] = useState(false)

  const isDismissible = severity === 'approaching' || severity === 'soft_overage'
  const colors = COLOR_CLASSES[message.color]
  const Icon = ICONS[message.icon] ?? Info

  if (dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  return (
    <div
      role="note"
      className={cn(
        'flex gap-3 rounded-lg border px-4 py-3 text-sm',
        colors.container,
        className,
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', colors.icon)} aria-hidden />

      <div className="min-w-0 flex-1">
        <p className={cn('font-medium leading-snug', colors.title)}>
          {message.title}
        </p>
        <p className={cn('mt-0.5 leading-relaxed', colors.body)}>
          {message.body}
        </p>
        <p className={cn('mt-1 text-xs', colors.body)}>
          {retryAfterSeconds && retryAfterSeconds > 0 ? (
            // key= remounts Countdown when retryAfterSeconds changes (e.g. new 429 arrives
            // mid-countdown) so the timer correctly restarts from the new value.
            <Countdown key={retryAfterSeconds} seconds={retryAfterSeconds} />
          ) : (
            message.resetHint
          )}
        </p>
      </div>

      {isDismissible && (
        <button
          onClick={handleDismiss}
          aria-label="Dismiss notice"
          className={cn(
            'ml-auto shrink-0 self-start rounded p-0.5 transition-colors',
            colors.dismiss,
          )}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="size-3.5"
            aria-hidden
          >
            <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
          </svg>
        </button>
      )}
    </div>
  )
}
