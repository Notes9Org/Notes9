import { createClient } from "@supabase/supabase-js"
import { verifyAccessTokenLocally } from "@/lib/auth/verify-token"

/**
 * Verify a Supabase JWT supplied via the `Authorization: Bearer <token>` header
 * and return the authenticated user (or null on failure).
 *
 * Edge-runtime safe. Use this on API routes that accept a bearer token from a
 * client fetch (instead of cookies) and need to verify the caller before
 * forwarding the request upstream.
 *
 * Without this verification a route can be reached by any caller who supplies
 * `Authorization: Bearer anything` — string presence is not authentication.
 *
 * Fast path: verify the JWT LOCALLY against SUPABASE_JWT_SECRET (no auth-server
 * round-trip, no DB connection). This matters because the AI streaming routes
 * that use this run long and concurrently — a getUser() per request was opening
 * a database connection each time and helping exhaust the Nano connection pool.
 * Falls back to the authoritative getUser() only when the secret is missing or
 * local verification fails.
 */
export async function verifyBearerToken(token: string | null | undefined) {
  if (!token) return null

  // Fast path — local signature/expiry check, no network, no DB connection.
  const secret = process.env.SUPABASE_JWT_SECRET
  if (secret) {
    const payload = await verifyAccessTokenLocally(token, secret)
    if (payload?.sub) {
      return {
        id: payload.sub,
        email: payload.email as string | undefined,
        role: payload.role as string | undefined,
        aud: (payload.aud as string) ?? "authenticated",
        app_metadata: (payload.app_metadata as Record<string, unknown>) ?? {},
        user_metadata: (payload.user_metadata as Record<string, unknown>) ?? {},
      }
    }
    // Local verification failed — fall through to the authoritative check.
  }

  // Fallback: secret not configured, or local verification failed.
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
