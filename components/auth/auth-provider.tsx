"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"

// Browser-side mirror of the server-verified user.
//
// The provider is seeded from `initialUser` produced by app/(app)/layout.tsx,
// which already verified the JWT via supabase.auth.getUser() on the server
// (and that call itself is request-deduped by React.cache in
// lib/auth/current-user.ts). After hydration we keep state fresh by
// subscribing to onAuthStateChange — that is an event-driven push from
// supabase-js, NOT a poll, so it does not generate extra /auth/v1/user
// traffic.
//
// Anything sensitive (DB writes, server actions) still verifies independently
// on the server via RLS + getCurrentUser, so this context cannot be used to
// escalate privileges from the client.

type AuthContextValue = {
  user: User | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({
  initialUser,
  children,
}: {
  initialUser: User | null
  children: React.ReactNode
}) {
  const [user, setUser] = useState<User | null>(initialUser)
  // Keep latest user in a ref so we can avoid re-rendering when nothing
  // meaningful changed (e.g. TOKEN_REFRESHED fires every ~hour with the
  // same id but a new exp).
  const lastIdRef = useRef<string | null>(initialUser?.id ?? null)

  useEffect(() => {
    const supabase = createClient()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      const nextId = nextUser?.id ?? null
      if (nextId !== lastIdRef.current) {
        lastIdRef.current = nextId
        setUser(nextUser)
      } else if (nextUser && user && nextUser !== user) {
        // Same id but supabase-js gave us a fresher object (token refresh,
        // user_metadata update). Update silently — no id flip.
        setUser(nextUser)
      }
    })
    return () => {
      sub.subscription.unsubscribe()
    }
    // Intentionally empty deps — we only ever want one subscription per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo<AuthContextValue>(() => ({ user }), [user])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthUser(): User | null {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    // During the server prerender pass the client context provider may not be
    // wired up yet (Next.js / Turbopack render client components on the server
    // before hydration). Tolerate that on the server so we don't crash SSR and
    // force a full client re-render; still guard real misuse on the client.
    if (typeof window === "undefined") return null
    throw new Error("useAuthUser must be used inside <AuthProvider>")
  }
  return ctx.user
}

// Convenience for the common pattern: assume the user is present because the
// component is rendered inside the protected (app) tree. Throws if missing —
// callers don't have to handle null.
export function useRequiredUser(): User {
  const user = useAuthUser()
  if (!user) {
    throw new Error(
      "useRequiredUser called outside an authenticated tree — wrap in <AuthProvider initialUser={...}>",
    )
  }
  return user
}
