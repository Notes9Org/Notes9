import { createClient } from "@supabase/supabase-js"

/**
 * Verify a Supabase JWT supplied via the `Authorization: Bearer <token>` header
 * and return the authenticated user (or null on failure).
 *
 * Edge-runtime safe — uses `@supabase/supabase-js` directly with the user's
 * token, no cookies/middleware required. Use this on API routes that accept
 * a bearer token from a client fetch (instead of cookies) and need to verify
 * the caller before forwarding the request upstream.
 *
 * Without this verification a route can be reached by any caller who supplies
 * `Authorization: Bearer anything` — string presence is not authentication.
 */
export async function verifyBearerToken(token: string | null | undefined) {
  if (!token) return null

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return null

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const { data, error } = await client.auth.getUser(token)
    if (error || !data?.user) return null
    return data.user
  } catch {
    return null
  }
}
