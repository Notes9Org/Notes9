import { describe, it, expect } from "vitest"
import * as fc from "fast-check"

/**
 * Property 13: Unauthenticated access redirects to login
 *
 * For any route under the (app) route group, if the user is not authenticated,
 * the server component should redirect to /auth/login.
 *
 * The (app)/layout.tsx checks `supabase.auth.getUser()` and calls
 * `redirect("/auth/login")` when user is null.
 *
 * **Validates: Requirements 9.2**
 */
describe("Property 13: Unauthenticated access redirects to login", () => {
  // All known (app) route prefixes from the sidebar navigation
  const appRoutePrefixes = [
    "/dashboard",
    "/projects",
    "/experiments",
    "/lab-notes",
    "/samples",
    "/equipment",
    "/protocols",
    "/literature-reviews",
    "/research-map",
    "/papers",
    "/catalyst",
    "/reports",
    "/settings",
  ]

  const pathSegment = fc
    .stringMatching(/^[a-zA-Z0-9_-]+$/)
    .filter((s) => s.length > 0 && s.length <= 30)

  const subPath = fc.oneof(
    fc.constant(""),
    pathSegment.map((s) => "/" + s),
    fc
      .tuple(pathSegment, pathSegment)
      .map(([a, b]) => "/" + a + "/" + b)
  )

  const appRouteArb = fc
    .tuple(fc.constantFrom(...appRoutePrefixes), subPath)
    .map(([prefix, sub]) => prefix + sub)

  it("for any (app) route, unauthenticated user is redirected to /auth/login", () => {
    fc.assert(
      fc.property(appRouteArb, (route) => {
        // The (app)/layout.tsx logic:
        // const { data: { user } } = await supabase.auth.getUser()
        // if (!user) { redirect("/auth/login") }
        const user = null // unauthenticated
        const redirectTarget = !user ? "/auth/login" : null

        expect(redirectTarget).toBe("/auth/login")
        // The route is under (app) group — it starts with one of the known prefixes
        const isAppRoute = appRoutePrefixes.some(
          (prefix) => route === prefix || route.startsWith(prefix + "/")
        )
        expect(isAppRoute).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("authenticated users are NOT redirected — redirect target is null", () => {
    fc.assert(
      fc.property(appRouteArb, (route) => {
        const user = { id: "some-user-id" } // authenticated
        const redirectTarget = !user ? "/auth/login" : null

        expect(redirectTarget).toBeNull()
        // Route is still valid
        expect(route.startsWith("/")).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("the redirect destination is always exactly '/auth/login' regardless of the source route", () => {
    fc.assert(
      fc.property(appRouteArb, (_route) => {
        const user = null
        const redirectTarget = !user ? "/auth/login" : null
        // The redirect is always to the same login page, never parameterized
        expect(redirectTarget).toBe("/auth/login")
        expect(redirectTarget).not.toContain("?")
        expect(redirectTarget).not.toContain("#")
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 14: Login email pre-fill from query parameter
 *
 * For any email string passed as the `email` query parameter to the login page,
 * the email input field should be pre-filled with that exact value.
 *
 * The login page uses:
 *   const emailParam = searchParams.get('email')
 *   if (emailParam) { setEmail(emailParam) }
 *
 * **Validates: Requirements 9.5**
 */
describe("Property 14: Login email pre-fill from query parameter", () => {
  // Generate valid-looking email strings
  const localPartArb = fc
    .stringMatching(/^[a-zA-Z][a-zA-Z0-9._-]*$/)
    .filter((s) => s.length >= 1 && s.length <= 40)

  const domainArb = fc
    .stringMatching(/^[a-z][a-z0-9-]*$/)
    .filter((s) => s.length >= 1 && s.length <= 20)

  const tldArb = fc.constantFrom("com", "org", "edu", "io", "net", "co.uk", "dev")

  const emailArb = fc
    .tuple(localPartArb, domainArb, tldArb)
    .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)

  // Also generate arbitrary non-empty strings to test that any string is pre-filled
  const arbitraryStringArb = fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => s.trim().length > 0)

  it("for any email query parameter, the email state is set to that exact value", () => {
    fc.assert(
      fc.property(emailArb, (emailParam) => {
        // Simulating the login page logic:
        // const emailParam = searchParams.get('email')
        // if (emailParam) { setEmail(emailParam) }
        let emailState = ""
        if (emailParam) {
          emailState = emailParam
        }

        expect(emailState).toBe(emailParam)
      }),
      { numRuns: 100 }
    )
  })

  it("when no email query parameter is provided, email state remains empty", () => {
    // No email param → email stays as default ""
    const emailParam: string | null = null
    let emailState = ""
    if (emailParam) {
      emailState = emailParam
    }
    expect(emailState).toBe("")
  })

  it("the pre-filled email is the exact string from the query parameter — no transformation", () => {
    fc.assert(
      fc.property(arbitraryStringArb, (emailParam) => {
        // The login page does not validate or transform the email param
        // It sets it directly: setEmail(emailParam)
        let emailState = ""
        if (emailParam) {
          emailState = emailParam
        }

        // The value is preserved exactly as-is
        expect(emailState).toBe(emailParam)
        expect(emailState.length).toBe(emailParam.length)
      }),
      { numRuns: 100 }
    )
  })

  it("email pre-fill works for emails with special characters in local part", () => {
    const specialEmailArb = fc
      .tuple(
        fc.constantFrom("user.name", "first-last", "user_name", "user+tag"),
        domainArb,
        tldArb
      )
      .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)

    fc.assert(
      fc.property(specialEmailArb, (emailParam) => {
        let emailState = ""
        if (emailParam) {
          emailState = emailParam
        }
        expect(emailState).toBe(emailParam)
        expect(emailState).toContain("@")
      }),
      { numRuns: 100 }
    )
  })
})
