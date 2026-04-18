'use client'

import { useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { recordRumEvent } from '@/lib/rum'

/**
 * Reads `auth_event` query parameter set by the auth callback route
 * and fires the corresponding RUM event (`user_logged_in` or `user_signed_up`).
 * Cleans up the query parameter afterwards so it doesn't persist in the URL.
 */
export function AuthEventTracker() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const authEvent = searchParams.get('auth_event')
    if (!authEvent) return

    if (authEvent === 'login') {
      recordRumEvent('user_logged_in', {})
    } else if (authEvent === 'signup') {
      recordRumEvent('user_signed_up', {})
    }

    // Remove the auth_event param from the URL to keep it clean
    const params = new URLSearchParams(searchParams.toString())
    params.delete('auth_event')
    const remaining = params.toString()
    const cleanUrl = remaining ? `${pathname}?${remaining}` : pathname
    router.replace(cleanUrl)
  }, [searchParams, router, pathname])

  return null
}
