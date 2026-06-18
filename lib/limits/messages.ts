/**
 * lib/limits/messages.ts
 *
 * Copy library for every limit state in the product.
 *
 * Design principle: "a limit is a fact, not a failure."
 * Every message: neutral situation + reassure work is saved + one next step + when it resets.
 * Never red treatment for a planned event. Escalate by consequence, not percentage.
 *
 * Anti-patterns banned:
 *   - Raw "Error 429" or HTTP status codes
 *   - "exceeded", "quota exhausted", "limit reached" (alarming nouns)
 *   - Red error styling for soft limits
 *   - OK-only dead-ends with no next step
 *   - "Start a new chat" walls (conversation always continues)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LimitSeverity = 'approaching' | 'near' | 'at_limit' | 'soft_overage'

export interface LimitMessage {
  /** Short one-line headline. Shown in compact notices. */
  title: string
  /** One or two sentences. Neutral framing; reassures work is safe. */
  body: string
  /** What the user should do next. Actionable, concrete. */
  action: string
  /** When the limit resets or what changes the state. */
  resetHint: string
  /** Icon name (Lucide) that fits. Never a red X or error icon. */
  icon: 'clock' | 'info' | 'zap' | 'cloud' | 'file' | 'message-circle' | 'calendar'
  /** Tailwind color token for the indicator (never red for planned limits). */
  color: 'blue' | 'amber' | 'slate'
}

export interface CountdownMessage {
  /** Prefix before the countdown timer. e.g. "Ready in " */
  prefix: string
  /** Suffix after the timer. e.g. "..." */
  suffix: string
  /** Label shown while the countdown is running. */
  disabledHint: string
  /** Label shown when the auto-retry fires. */
  retryingLabel: string
}

// ---------------------------------------------------------------------------
// Approaching (75–89 % of quota)
// ---------------------------------------------------------------------------

export const approaching: Record<string, LimitMessage> = {
  rpm: {
    title: 'Getting busy',
    body: "You've sent quite a few requests in the last minute. Everything is still working — heads up that the pace may slow slightly.",
    action: 'Carry on as normal.',
    resetHint: 'Resets in about a minute.',
    icon: 'clock',
    color: 'blue',
  },
  daily_tokens: {
    title: 'Good amount of AI work today',
    body: "You've used a healthy chunk of today's AI budget. Your work is safe and the AI is still fully available.",
    action: 'Keep going — you still have capacity left.',
    resetHint: 'Resets at midnight UTC.',
    icon: 'zap',
    color: 'blue',
  },
  storage: {
    title: 'Storage filling up',
    body: "You're using most of your file storage. Existing files and analysis are not affected.",
    action: 'Review uploaded files and remove any you no longer need.',
    resetHint: 'Storage resets monthly or when files are deleted.',
    icon: 'cloud',
    color: 'blue',
  },
}

// ---------------------------------------------------------------------------
// Near limit (90–99 % of quota)
// ---------------------------------------------------------------------------

export const near: Record<string, LimitMessage> = {
  rpm: {
    title: 'High request rate',
    body: 'The AI is handling a lot of requests right now. A short pause may occur between sends.',
    action: 'Spread requests out slightly and everything will keep moving.',
    resetHint: 'Clears within the next minute.',
    icon: 'clock',
    color: 'amber',
  },
  daily_tokens: {
    title: 'Most of today\'s AI budget used',
    body: "You're close to today's AI capacity. The assistant is still fully available for the rest of your work.",
    action: 'Complete your most important tasks now.',
    resetHint: 'Full capacity returns at midnight UTC.',
    icon: 'zap',
    color: 'amber',
  },
  storage: {
    title: 'Almost out of storage',
    body: 'You have very little file space left. You can still use the AI — only new file uploads are affected.',
    action: 'Delete files you no longer need to free space.',
    resetHint: 'Storage frees up when files are removed.',
    icon: 'cloud',
    color: 'amber',
  },
}

// ---------------------------------------------------------------------------
// At limit (100 %)
// ---------------------------------------------------------------------------

// rpm_concurrency is intentionally binary (at_limit only) — concurrency is either
// in-progress or not; there is no meaningful "approaching" state for it.
// getMessage('rpm_concurrency', 'approaching'|'near') correctly falls through to
// atLimit['rpm_concurrency'] via the second lookup in getMessage(), which returns
// the "One moment" copy — a reasonable conservative framing.
export const atLimit: Record<string, LimitMessage> = {
  rpm: {
    title: 'Taking a short breath',
    body: "You've been moving fast — the AI needs a moment to catch up. Your work is saved and nothing is lost.",
    action: 'The assistant will be ready again shortly.',
    resetHint: 'Automatically ready in a few seconds.',
    icon: 'clock',
    color: 'amber',
  },
  rpm_concurrency: {
    title: 'One moment — finishing a previous request',
    body: 'You have another AI request already in progress. The new one will start as soon as it finishes.',
    action: 'Wait for the current response to complete.',
    resetHint: 'Ready as soon as the in-progress request finishes.',
    icon: 'clock',
    color: 'amber',
  },
  daily_tokens: {
    title: "Today\'s AI capacity is full",
    body: "You've made great use of the AI today. All your notes, experiments, and conversations are fully saved.",
    action: "Come back tomorrow — or reach out if you need more capacity sooner.",
    resetHint: 'Full capacity returns at midnight UTC.',
    icon: 'calendar',
    color: 'amber',
  },
  storage: {
    title: 'File storage is full',
    body: 'New file uploads are paused. Your existing files and all AI analysis are completely safe.',
    action: 'Delete files you no longer need to make room.',
    resetHint: 'Uploads resume once space is freed.',
    icon: 'cloud',
    color: 'slate',
  },
  upload_size: {
    title: 'File is too large to upload',
    body: 'This file exceeds the size limit for uploads. Other uploads and AI features work normally.',
    action: 'Try a smaller file, or compress it before uploading.',
    resetHint: 'No action needed — this applies only to this file.',
    icon: 'file',
    color: 'slate',
  },
  upload_count: {
    title: 'File attachment limit reached',
    body: "You've attached the maximum number of files to this request. Your existing attachments are included.",
    action: 'Remove an attachment to make room, or proceed with what you have.',
    resetHint: 'The limit applies per request, not permanently.',
    icon: 'file',
    color: 'slate',
  },
  body_too_large: {
    title: 'Request is too large',
    body: 'This message or its attachments exceed the size limit. Your work is not lost.',
    action: 'Try shortening the message or sending fewer attachments at once.',
    resetHint: 'No waiting required — try again with a smaller payload.',
    icon: 'file',
    color: 'slate',
  },
}

// ---------------------------------------------------------------------------
// Soft overage (slightly over, grace window)
// ---------------------------------------------------------------------------

export const softOverage: Record<string, LimitMessage> = {
  daily_tokens: {
    title: 'Slightly over today\'s AI capacity',
    body: "You've gone a touch over today's limit. The assistant is still available — we're giving you a little extra room.",
    action: 'Wrap up any open work; full capacity returns tomorrow.',
    resetHint: 'Full capacity returns at midnight UTC.',
    icon: 'info',
    color: 'amber',
  },
}

// ---------------------------------------------------------------------------
// Conversation continuity (never a hard block — just informational)
// ---------------------------------------------------------------------------

export const conversationSummary: LimitMessage = {
  title: 'Older messages summarized',
  body: 'The conversation is getting long, so older messages have been condensed into a summary. Nothing is lost — the AI remembers the full context.',
  action: 'Keep going — the conversation continues normally.',
  resetHint: 'The full history is always available in the chat.',
  icon: 'message-circle',
  color: 'blue',
}

// ---------------------------------------------------------------------------
// Countdown messages (shown while RPM cooldown ticks)
// ---------------------------------------------------------------------------

export const rpmCountdown: CountdownMessage = {
  prefix: 'Ready in ',
  suffix: '',
  disabledHint: 'Sending momentarily…',
  retryingLabel: 'Sending…',
}

// ---------------------------------------------------------------------------
// Helper — pick the right message for a known limit code
// ---------------------------------------------------------------------------

export type LimitCode =
  | 'rpm'
  | 'rpm_concurrency'
  | 'daily_tokens'
  | 'storage'
  | 'upload_size'
  | 'upload_count'
  | 'body_too_large'

/**
 * Resolve the right LimitMessage for a given limit code and severity.
 * Falls back to a safe generic message if the combination is not found.
 */
export function getMessage(
  code: LimitCode,
  severity: LimitSeverity,
): LimitMessage {
  const maps: Record<LimitSeverity, Record<string, LimitMessage>> = {
    approaching,
    near,
    at_limit: atLimit,
    soft_overage: softOverage,
  }
  const map = maps[severity]
  return (
    map[code] ??
    atLimit[code] ?? {
      title: 'Usage limit reached',
      body: 'You have reached a usage limit. Your work is saved.',
      action: 'Try again shortly or contact support if this persists.',
      resetHint: 'Limits reset periodically.',
      icon: 'info',
      color: 'slate',
    }
  )
}

/**
 * Determine the severity tier from a 0–1 ratio.
 * Returns null when below the approaching threshold (no UI shown).
 *
 * soft_overage: ratio slightly above 1.0 (grace window, < 110% cap).
 * at_limit:     ratio exactly at or above 1.0 (outside grace window).
 */
export function severityFromRatio(ratio: number): LimitSeverity | null {
  if (ratio > 1.0 && ratio < 1.1) return 'soft_overage'
  if (ratio >= 1.0) return 'at_limit'
  if (ratio >= 0.9) return 'near'
  if (ratio >= 0.75) return 'approaching'
  return null
}
