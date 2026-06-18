'use client'

/**
 * components/limits/rate-limit-countdown.tsx
 *
 * Drop-in wrapper for the chat/agent send button during an RPM cooldown.
 *
 * Behaviour when active (retryAfterSeconds > 0):
 *  - Send button is disabled (pointer-events none + opacity)
 *  - Live countdown label replaces the normal button label
 *  - Auto-retries (calls onRetry) when the countdown reaches zero
 *  - Composer textarea stays fully editable so the user can continue typing
 *
 * Usage:
 *   <RateLimitCountdown
 *     retryAfterSeconds={seconds}        // from Retry-After header; 0 = not rate-limited
 *     onRetry={() => submitMessage()}    // called automatically at zero
 *   >
 *     <SendButton />                     // rendered as-is when not rate-limited
 *   </RateLimitCountdown>
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RateLimitCountdownProps {
  /** Seconds remaining on the cooldown. Pass 0 (or undefined) when not rate-limited. */
  retryAfterSeconds?: number
  /** Called automatically when the countdown expires. */
  onRetry?: () => void
  /** Normal child content (e.g. the Send button). Shown unchanged when not rate-limited. */
  children: React.ReactNode
  className?: string
}

export function RateLimitCountdown({
  retryAfterSeconds = 0,
  onRetry,
  children,
  className,
}: RateLimitCountdownProps) {
  const [remaining, setRemaining] = useState(retryAfterSeconds)
  const [isRetrying, setIsRetrying] = useState(false)
  const firedRef = useRef(false)

  // Sync external seconds prop when it changes (new 429 arrives or resets).
  // Do NOT reset firedRef or isRetrying when a retry is already in-flight —
  // that would let the countdown fire onRetry a second time (double-submit).
  useEffect(() => {
    setRemaining(retryAfterSeconds)
    if (!isRetrying) {
      firedRef.current = false
    }
    // isRetrying is intentionally NOT cleared here; it resets when the caller
    // calls rateLimit.clear() after the request completes (sets retryAfterSeconds=0).
  }, [retryAfterSeconds, isRetrying])

  // Tick
  useEffect(() => {
    if (remaining <= 0) return
    const id = setTimeout(() => setRemaining((r) => Math.max(0, r - 1)), 1000)
    return () => clearTimeout(id)
  }, [remaining])

  // Auto-retry at zero — fire exactly once
  const handleExpiry = useCallback(() => {
    if (firedRef.current) return
    firedRef.current = true
    setIsRetrying(true)
    onRetry?.()
  }, [onRetry])

  useEffect(() => {
    if (remaining === 0 && retryAfterSeconds > 0 && !firedRef.current) {
      handleExpiry()
    }
  }, [remaining, retryAfterSeconds, handleExpiry])

  const isActive = remaining > 0
  const m = Math.floor(remaining / 60)
  const s = remaining % 60
  const label = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`

  if (!isActive && !isRetrying) {
    // Not rate-limited — render children unchanged
    return <>{children}</>
  }

  return (
    <div className={cn('relative inline-flex', className)}>
      {/* Overlay on top of children; children still render for layout stability */}
      <div aria-hidden className="pointer-events-none opacity-0 select-none">
        {children}
      </div>

      {/* The actual visible button (disabled, with countdown) */}
      <button
        disabled
        aria-label={isRetrying ? 'Sending…' : `Send disabled — ready in ${label}`}
        aria-live="polite"
        className={cn(
          'absolute inset-0 flex items-center justify-center gap-1.5',
          'rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-medium',
          'text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
          'cursor-not-allowed select-none',
        )}
      >
        {isRetrying ? (
          <>
            <span className="size-3 animate-spin rounded-full border border-current border-t-transparent" />
            Sending…
          </>
        ) : (
          <>
            <Clock className="size-3 shrink-0" aria-hidden />
            {label}
          </>
        )}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hook — manage rate-limit state from API responses
// ---------------------------------------------------------------------------

interface RateLimitState {
  retryAfterSeconds: number
  setFrom429Response: (headers: Headers) => void
  clear: () => void
}

/**
 * Manages the rate-limit countdown state from API response headers.
 *
 * Usage:
 *   const rateLimit = useRateLimit()
 *
 *   // After a 429:
 *   rateLimit.setFrom429Response(response.headers)
 *
 *   // In JSX:
 *   <RateLimitCountdown retryAfterSeconds={rateLimit.retryAfterSeconds} onRetry={submit} />
 */
export function useRateLimit(): RateLimitState {
  const [seconds, setSeconds] = useState(0)

  const setFrom429Response = useCallback((headers: Headers) => {
    // Fetch Headers.get() is case-insensitive per spec — no fallback needed.
    const raw = headers.get('Retry-After')
    const parsed = raw ? parseInt(raw, 10) : 0
    // Add 1 s buffer so the client doesn't retry exactly at the boundary
    setSeconds(isNaN(parsed) ? 5 : Math.max(1, parsed + 1))
  }, [])

  const clear = useCallback(() => setSeconds(0), [])

  return { retryAfterSeconds: seconds, setFrom429Response, clear }
}
