'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import type { AwsRum } from 'aws-rum-web'
import { RumContext } from '@/hooks/use-rum'
import {
  RUM_APP_ID,
  RUM_REGION,
  RUM_APP_VERSION,
  buildRumConfig,
  extractSessionMetadata,
  setRumClient,
} from '@/lib/rum'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// RumProvider
// ---------------------------------------------------------------------------

export function RumProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<AwsRum | null>(null)
  const pathname = usePathname()

  // ---- Initialise RUM client on mount ----
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        if (process.env.NODE_ENV === 'development') return

        const config = buildRumConfig()

        const { AwsRum: AwsRumClass } = await import('aws-rum-web')
        const instance = new AwsRumClass(RUM_APP_ID, RUM_APP_VERSION, RUM_REGION, config)

        if (!cancelled) {
          setClient(instance)
          setRumClient(instance)
        }
      } catch (err) {
        console.warn('[RUM] Initialisation failed:', err)
      }
    }

    init()

    return () => {
      cancelled = true
    }
  }, [])

  // ---- Subscribe to Supabase auth state changes ----
  useEffect(() => {
    if (!client) return

    let subscription: { unsubscribe: () => void } | undefined

    try {
      const supabase = createClient()

      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        try {
          if (
            (_event === 'SIGNED_IN' || _event === 'TOKEN_REFRESHED') &&
            session?.user
          ) {
            const metadata = extractSessionMetadata(session.user)
            client.addSessionAttributes(metadata)
          }
        } catch (err) {
          console.warn('[RUM] Failed to update session metadata:', err)
        }
      })

      subscription = data.subscription
    } catch (err) {
      console.warn('[RUM] Failed to subscribe to auth state changes:', err)
    }

    return () => {
      try {
        subscription?.unsubscribe()
      } catch {
        // Ignore cleanup errors
      }
    }
  }, [client])

  // ---- Track client-side route changes ----
  useEffect(() => {
    if (!client) return
    try {
      client.recordPageView({ pageId: pathname })
    } catch (err) {
      console.warn('[RUM] Failed to record page view:', err)
    }
  }, [client, pathname])

  // ---- Context value with safe recordEvent wrapper ----
  const recordEvent = (type: string, data: Record<string, unknown>) => {
    if (!client) return
    try {
      client.recordEvent(type, data)
    } catch (err) {
      console.warn('[RUM] Failed to record event:', err)
    }
  }

  return (
    <RumContext value={{ client, recordEvent }}>
      {children}
    </RumContext>
  )
}
