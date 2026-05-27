import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase environment variables!")
    console.error("Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file")
    throw new Error(
      "Your project's URL and Key are required to create a Supabase client!\n\n" +
      "Check your Supabase project's API settings to find these values:\n" +
      "https://supabase.com/dashboard/project/_/settings/api"
    )
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
      global: {
        fetch: (url, options) => {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 10000)
          return fetch(url, {
            ...options,
            signal: controller.signal,
          })
            .catch((err) => {
              if (err.name === "AbortError") {
                return new Response(JSON.stringify({ error: "Request Timeout" }), {
                  status: 408,
                  statusText: "Request Timeout",
                  headers: { "Content-Type": "application/json" },
                })
              }
              throw err
            })
            .finally(() => clearTimeout(timeoutId))
        },
      },
    }
  )

  // Define public routes that don't require authentication
  const publicRoutes = ["/", "/about", "/pricing", "/docs", "/platform", "/resources", "/terms", "/privacy", "/survey", "/auth/invite"]
  const isPublicRoute = publicRoutes.some(route => request.nextUrl.pathname === route)
  const isAuthRoute = request.nextUrl.pathname.startsWith("/auth")

  // If it's a public or auth route, we don't need to verify the user session in middleware.
  // This avoids slow database roundtrips and connection timeouts on non-protected pages.
  if (isAuthRoute || isPublicRoute) {
    return supabaseResponse
  }

  let user = null
  try {
    const {
      data: { user: fetchedUser },
    } = await supabase.auth.getUser()
    user = fetchedUser
  } catch (error) {
    console.error("Middleware failed to fetch user from Supabase (connection timeout or offline):", error)
  }

  if (!user) {
    const loginUrl = new URL("/auth/login", request.url)
    const returnPath =
      request.nextUrl.pathname +
      request.nextUrl.search +
      request.nextUrl.hash
    if (
      returnPath &&
      returnPath !== "/auth/login" &&
      !returnPath.startsWith("/auth/login?")
    ) {
      loginUrl.searchParams.set("next", returnPath)
    }
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}
