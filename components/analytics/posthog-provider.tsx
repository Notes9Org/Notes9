'use client'

/**
 * components/analytics/posthog-provider.tsx
 *
 * Initialises PostHog in the browser and wires:
 *   - Manual pageview capture on App-Router route changes (autocapture is off).
 *   - User identity: identify() on sign-in, reset() on sign-out, reusing the
 *     Supabase onAuthStateChange pattern previously used by the RUM provider.
 *
 * PII discipline (matches the old telemetry pipeline's stance):
 *   - autocapture disabled — we send explicit, named events only.
 *   - session-recording inputs masked; no free text is ever captured.
 *   - person profiles for identified users only (no anonymous profile sprawl).
 *
 * Fully inert when NEXT_PUBLIC_POSTHOG_KEY is unset — safe for local/preview.
 */

import { Suspense, useEffect, type ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { createClient } from '@/lib/supabase/client'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { POSTHOG_KEY, POSTHOG_HOST, POSTHOG_UI_HOST, isPostHogConfigured } from '@/lib/analytics/posthog'

let _initialised = false

function initPostHog() {
  if (_initialised || typeof window === 'undefined') return
  if (!isPostHogConfigured()) return
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // Required when api_host is a managed reverse proxy: tells PostHog where the
    // app lives so toolbar/links/replay playback resolve correctly.
    ui_host: POSTHOG_UI_HOST,
    // We capture pageviews manually (App Router) and named product events.
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    // Only create person profiles once a user is identified.
    person_profiles: 'identified_only',
    // Never record raw user input — PII discipline.
    session_recording: { maskAllInputs: true },
  })
  _initialised = true
}

/**
 * Manual pageview capture. Isolated in its own component so the
 * useSearchParams() read can sit behind a Suspense boundary — otherwise it
 * deopts the whole app to client-side rendering in the App Router.
 */
function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!isPostHogConfigured() || typeof window === 'undefined') return
    let url = window.origin + pathname
    const qs = searchParams?.toString()
    if (qs) url += `?${qs}`
    posthog.capture('$pageview', { $current_url: url })
  }, [pathname, searchParams])

  return null
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  // ---- Init once on mount ----
  useEffect(() => {
    initPostHog()
  }, [])

  // ---- Identify / reset on Supabase auth state changes ----
  useEffect(() => {
    if (!isPostHogConfigured()) return

    let subscription: { unsubscribe: () => void } | undefined
    try {
      const supabase = createClient()
      const { data } = supabase.auth.onAuthStateChange(
        (event: AuthChangeEvent, session: Session | null) => {
          try {
            if (
              (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') &&
              session?.user
            ) {
              posthog.identify(session.user.id, {
                // Opaque/enum person properties only — never PII.
                plan: (session.user.app_metadata?.plan as string) ?? null,
              })
            } else if (event === 'SIGNED_OUT') {
              posthog.reset()
            }
          } catch (err) {
            console.warn('[posthog] auth-state handler failed', err)
          }
        }
      )
      subscription = data.subscription
    } catch (err) {
      console.warn('[posthog] failed to subscribe to auth state', err)
    }

    return () => {
      try {
        subscription?.unsubscribe()
      } catch {
        // ignore cleanup errors
      }
    }
  }, [])

  // When unconfigured, render children without the provider wrapper.
  if (!isPostHogConfigured()) return <>{children}</>

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  )
}
