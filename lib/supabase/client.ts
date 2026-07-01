import { createBrowserClient } from "@supabase/ssr"

// Always delegate to the real browser fetch. Binding avoids Turbopack/bundler
// edge cases where an unqualified `fetch` inside the custom wrapper might not
// resolve to the global implementation.
const nativeFetch: typeof fetch = globalThis.fetch.bind(globalThis)

// Detect the auth token-REFRESH request whose response means the refresh token
// is revoked/missing. When that happens the SDK (`@supabase/auth-js` fetch.ts)
// throws "Invalid Refresh Token: Refresh Token Not Found", and because the dead
// token is still persisted it recurs on every refresh tick / getSession().
function isRefreshTokenRequest(url: string): boolean {
  return url.includes("/auth/v1/token") && url.includes("grant_type=refresh_token")
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function clearStaleAuthStorage() {
  if (typeof window === "undefined") return
  try {
    // Legacy plain supabase-js clients store sessions in localStorage.
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("sb-") && key.includes("-auth-token")) {
        window.localStorage.removeItem(key)
      }
    }
  } catch {
    // localStorage can throw in private-mode / restricted contexts — ignore.
  }

  try {
    // @supabase/ssr createBrowserClient persists sessions in document.cookie
    // (including chunked sb-*-auth-token.N entries). If we only clear
    // localStorage the dead refresh token keeps autoRefreshToken retrying and
    // the console fills with network-level "Failed to fetch" TypeErrors.
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.split("=")[0]?.trim()
      if (name && name.startsWith("sb-") && name.includes("-auth-token")) {
        document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`
      }
    }
  } catch {
    // document.cookie can throw in restricted contexts — ignore.
  }
}

// Single shared browser client. `createClient()` is called from 200+ component
// sites, and each createBrowserClient instance installs its own
// autoRefreshToken timer + GoTrue client. Without memoization, one stale token
// or a transient network blip multiplies a single "Failed to fetch" into a
// flood of identical console errors (and N× refresh traffic). We cache the
// instance in the browser only — on the server (no window) we never cache, so
// SSR of client components can't leak a client across requests/users.
let browserClient: ReturnType<typeof createBrowserClient> | undefined

export function createClient() {
  if (browserClient && typeof window !== "undefined") return browserClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Your project's URL and Key are required to create a Supabase client!\n\n" +
      "Check your Supabase project's API settings to find these values:\n" +
      "https://supabase.com/dashboard/project/_/settings/api"
    )
  }

  const client = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: {
      // Wrap fetch so a dead refresh token self-heals: when the refresh endpoint
      // rejects the token, purge the stale sb-*-auth-token so the SDK stops
      // retrying (and stops throwing "Invalid Refresh Token" on every tick). The
      // original response is always returned untouched — the SDK still clears its
      // in-memory session and emits SIGNED_OUT as usual.
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input)
        let res: Response
        try {
          res = await nativeFetch(input as RequestInfo, init)
        } catch (err) {
          // A dead session cookie can leave autoRefreshToken hammering the
          // refresh endpoint; when the browser blocks or drops those requests
          // we still self-heal so the loop stops.
          if (isRefreshTokenRequest(url)) {
            clearStaleAuthStorage()
          }
          throw err
        }
        try {
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

  if (typeof window !== "undefined") browserClient = client
  return client
}
