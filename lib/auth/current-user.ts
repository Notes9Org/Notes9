import { cache } from "react"
import { redirect } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { verifyAccessTokenLocally } from "@/lib/auth/verify-token"

// Request-scoped, LOCAL verification of the session.
//
// Reads the access token from the cookie via getSession() (local; refreshes
// only when expired) and verifies its HS256 signature + expiry locally with
// jose against SUPABASE_JWT_SECRET — no auth-server round-trip and no database
// connection per call, unlike getUser(), which was saturating the Nano
// instance's connection pool. React.cache dedupes repeat calls within one
// render on top of that, and is scoped to a single render pass, so there is no
// cross-user leakage.
//
// The Supabase access token already carries id (sub), email, role,
// app_metadata and user_metadata, so we reconstruct a User-compatible object
// from the verified payload — callers that read user.id / user.email /
// user.user_metadata keep working unchanged.
//
// Safety: if the secret is missing or verification fails, we fall back to the
// authoritative getUser() so a misconfiguration degrades to "slower", never
// "no user".
//
// Use this everywhere a server component / server action / route handler would
// otherwise call `supabase.auth.getUser()` directly.
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient()
  const secret = process.env.SUPABASE_JWT_SECRET

  if (secret) {
    let session = null;
    try {
      const { data } = await supabase.auth.getSession()
      session = data?.session
    } catch (err) {
      // getSession might throw if refresh token is invalid
    }
    
    const token = session?.access_token
    if (token) {
      const payload = await verifyAccessTokenLocally(token, secret)
      if (payload?.sub) {
        return {
          id: payload.sub,
          email: payload.email as string | undefined,
          phone: payload.phone as string | undefined,
          role: payload.role as string | undefined,
          aud: (payload.aud as string) ?? "authenticated",
          app_metadata: (payload.app_metadata as Record<string, unknown>) ?? {},
          user_metadata: (payload.user_metadata as Record<string, unknown>) ?? {},
          created_at: "",
        } as unknown as User
      }
    }
  }

  // Fallback: secret not configured, or local verification failed.
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) return null
    return data.user
  } catch (err) {
    return null
  }
})

// Convenience wrapper for protected pages/actions. Redirects to /auth/login
// when no verified user is present.
export const requireUser = cache(async (): Promise<User> => {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login")
  return user
})
