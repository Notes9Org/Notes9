import { createBrowserClient } from "@supabase/ssr"

// Detect the auth token-REFRESH request whose response means the refresh token
// is revoked/missing. When that happens the SDK (`@supabase/auth-js` fetch.ts)
// throws "Invalid Refresh Token: Refresh Token Not Found", and because the dead
// token is still in localStorage it recurs on every refresh tick / getSession().
function isRefreshTokenRequest(url: string): boolean {
  return url.includes("/auth/v1/token") && url.includes("grant_type=refresh_token")
}

function clearStaleAuthStorage() {
  if (typeof window === "undefined") return
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("sb-") && key.includes("-auth-token")) {
        window.localStorage.removeItem(key)
      }
    }
  } catch {
    // localStorage can throw in private-mode / restricted contexts — ignore.
  }
}

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Your project's URL and Key are required to create a Supabase client!\n\n" +
      "Check your Supabase project's API settings to find these values:\n" +
      "https://supabase.com/dashboard/project/_/settings/api"
    )
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: {
      // Wrap fetch so a dead refresh token self-heals: when the refresh endpoint
      // rejects the token, purge the stale sb-*-auth-token so the SDK stops
      // retrying (and stops throwing "Invalid Refresh Token" on every tick). The
      // original response is always returned untouched — the SDK still clears its
      // in-memory session and emits SIGNED_OUT as usual.
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const res = await fetch(input as RequestInfo, init)
        try {
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : (input as Request).url
          if (res.status === 400 && isRefreshTokenRequest(url)) {
            const body = await res.clone().json().catch(() => null as unknown)
            const blob = JSON.stringify(body ?? "")
            if (/refresh_token_not_found|invalid_grant|invalid refresh token/i.test(blob)) {
              clearStaleAuthStorage()
            }
          }
        } catch {
          // The guard must never break the response the SDK is waiting on.
        }
        return res
      },
    },
  })
}
