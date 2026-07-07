import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'

/**
 * Free-tier usage summary — proxies the catalyst backend `GET /usage/summary`.
 *
 * Backs the Settings → Usage panel: literature searches used this ISO week
 * (of 20) and AI credits used this calendar month (of 100 free credits, each
 * worth $0.10 retail / $0.05 real AI cost). The backend reads two durable
 * single-row counters (short in-process cache) — cheap by design.
 */

export const dynamic = 'force-dynamic'

function catalystBaseUrl(): string | null {
  const raw = (process.env.CATALYST_URL?.trim() || process.env.CHAT_API_URL?.trim()) ?? ''
  return raw ? raw.replace(/\/+$/, '') : null
}

export async function GET() {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accessToken = (await supabase.auth.getSession()).data.session?.access_token
  if (!accessToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const base = catalystBaseUrl()
  if (!base) {
    return Response.json({ error: 'usage backend unavailable' }, { status: 503 })
  }

  try {
    const res = await fetch(`${base}/usage/summary`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      return Response.json({ error: 'usage backend unavailable' }, { status: 503 })
    }
    const data = await res.json()
    return Response.json(data)
  } catch {
    return Response.json({ error: 'usage backend unavailable' }, { status: 503 })
  }
}
