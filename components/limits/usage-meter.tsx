'use client'

/**
 * components/limits/usage-meter.tsx
 *
 * Ambient usage meter — shows remaining capacity, not % consumed.
 * Framing: "200 left" not "80% used".
 *
 * Surface priority (per plan): inline-at-the-action > settings meter > account banner.
 * This component is the settings/account surface — shown only when the user
 * actively navigates to their usage settings, not in the main product flow.
 *
 * State model:
 *   0–74 %  → nothing shown (normal)           [no UI]
 *   75–89 % → info-blue, dismissible            [approaching]
 *   90–99 % → persistent amber                  [near]
 *   100 %   → graceful block, amber, countdown  [at_limit]
 */

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { severityFromRatio, getMessage } from '@/lib/limits/messages'
import type { LimitCode } from '@/lib/limits/messages'

// ---------------------------------------------------------------------------
// Sub-component: the bar
// ---------------------------------------------------------------------------

interface BarProps {
  ratio: number
  color: 'blue' | 'amber' | 'slate'
}

function Bar({ ratio, color }: BarProps) {
  const pct = Math.min(100, Math.round(isNaN(ratio) ? 0 : ratio * 100))
  const fill: Record<string, string> = {
    blue: 'bg-blue-500',
    amber: 'bg-amber-400',
    slate: 'bg-slate-400',
  }
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn('h-full rounded-full transition-all duration-500', fill[color])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface UsageMeterProps {
  /** Which limit type this meter tracks. */
  code: LimitCode
  /** Current value (e.g. tokens used today). */
  used: number
  /** Total capacity (e.g. daily token cap). */
  total: number
  /** Human-readable label for the used/total display (e.g. "tokens", "requests"). */
  unit?: string
  /**
   * Format the numbers for display. Defaults to toLocaleString().
   * Useful for tokens (e.g. "2.1 M") or bytes (e.g. "12 MB").
   */
  formatValue?: (n: number) => string
  className?: string
}

export function UsageMeter({
  code,
  used,
  total,
  unit = '',
  formatValue = (n) => n.toLocaleString(),
  className,
}: UsageMeterProps) {
  const [dismissed, setDismissed] = useState(false)

  const ratio = total > 0 ? used / total : 0
  const remaining = Math.max(0, total - used)
  const severity = severityFromRatio(ratio)

  // Dismiss is only valid while the severity is still 'approaching'.
  // If usage climbs to 'near' or 'at_limit', the notice must reappear.
  const effectivelyDismissed = dismissed && severity === 'approaching'

  // Below threshold or user dismissed the approaching notice — minimal row
  if (!severity || effectivelyDismissed) {
    return (
      <div className={cn('space-y-1.5', className)}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-foreground">
            {unit ? `${formatValue(remaining)} ${unit} left` : `${formatValue(remaining)} left`}
          </span>
          <span className="text-xs text-muted-foreground">of {formatValue(total)}</span>
        </div>
        <Bar ratio={ratio} color="blue" />
      </div>
    )
  }

  const msg = getMessage(code, severity)

  return (
    <div className={cn('space-y-2', className)}>
      {/* Label row */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {unit
            ? `${formatValue(remaining)} ${unit} left`
            : `${formatValue(remaining)} left`}
        </span>
        <span className="text-xs text-muted-foreground">
          of {formatValue(total)}
        </span>
      </div>

      {/* Bar */}
      <Bar ratio={ratio} color={msg.color} />

      {/* Notice — only for approaching/near/at_limit */}
      <MeterNotice
        message={msg}
        severity={severity}
        isDismissible={severity === 'approaching'}
        onDismiss={() => setDismissed(true)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function MeterRow({
  label,
  value,
  sublabel,
}: {
  label: string
  value: string
  sublabel?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-sm font-medium text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">
        {label} {sublabel}
      </span>
    </div>
  )
}

function MeterNotice({
  message,
  severity,
  isDismissible,
  onDismiss,
}: {
  message: ReturnType<typeof getMessage>
  severity: NonNullable<ReturnType<typeof severityFromRatio>>
  isDismissible: boolean
  onDismiss: () => void
}) {
  const colorText: Record<string, string> = {
    blue: 'text-blue-700 dark:text-blue-300',
    amber: 'text-amber-700 dark:text-amber-300',
    slate: 'text-slate-600 dark:text-slate-400',
  }

  return (
    <div className="flex items-start justify-between gap-2">
      <p className={cn('text-xs leading-relaxed', colorText[message.color])}>
        {severity === 'at_limit' ? message.body : message.action}{' '}
        <span className="opacity-70">{message.resetHint}</span>
      </p>
      {isDismissible && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Dismiss
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Compact variant — for account banners / sidebars
// ---------------------------------------------------------------------------

interface UsageMeterCompactProps extends UsageMeterProps {
  label: string
}

export function UsageMeterCompact({
  code,
  used,
  total,
  unit,
  label,
  formatValue = (n) => n.toLocaleString(),
  className,
}: UsageMeterCompactProps) {
  const ratio = total > 0 ? used / total : 0
  const remaining = Math.max(0, total - used)
  const severity = severityFromRatio(ratio)
  const color = severity ? getMessage(code, severity).color : 'blue'

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>
          {formatValue(remaining)} {unit && `${unit} `}left
        </span>
      </div>
      <Bar ratio={ratio} color={color} />
    </div>
  )
}
