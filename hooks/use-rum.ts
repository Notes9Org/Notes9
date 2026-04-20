'use client'

import { createContext, useContext } from 'react'
import type { AwsRum } from 'aws-rum-web'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface RumContextValue {
  client: AwsRum | null
  recordEvent: (type: string, data: Record<string, unknown>) => void
}

/** Default context value — no-ops when no provider is mounted. */
export const RumContext = createContext<RumContextValue>({
  client: null,
  recordEvent: () => {},
})

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the CloudWatch RUM client and a safe `recordEvent` wrapper.
 *
 * - `recordEvent` no-ops silently when the client is null.
 * - `recordEvent` wraps `client.recordEvent()` in try-catch so callers
 *   are never affected by RUM failures.
 * - `client` is exposed for advanced use cases (e.g., custom session attributes).
 */
export function useRum(): RumContextValue {
  return useContext(RumContext)
}
