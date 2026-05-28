import { cache } from "react"
import { redirect } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"

// Request-scoped memoization of supabase.auth.getUser().
//
// The first caller in a given request hits Supabase's auth server and
// verifies the JWT. Subsequent callers within the same request reuse the
// verified result. React.cache is scoped to a single render pass — it does
// not persist across requests, so there is no cross-user leakage.
//
// Use this everywhere a server component / server action / route handler
// would otherwise call `supabase.auth.getUser()` directly.
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) return null
  return data.user
})

// Convenience wrapper for protected pages/actions. Redirects to /auth/login
// when no verified user is present.
export const requireUser = cache(async (): Promise<User> => {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login")
  return user
})
