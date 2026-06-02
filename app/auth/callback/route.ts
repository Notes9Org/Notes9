import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { type NextRequest } from "next/server"
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js"
import type { SupabaseClient, User } from "@supabase/supabase-js"

/**
 * Isolated from the main handler so production bundlers (Turbopack) do not merge
 * short-lived locals like `next` with inner `{ data: … }` bindings — that bug
 * produced bad redirects / ReferenceErrors on Vercel for this route.
 */
async function provisionOauthProfileAndOrg(
  supabase: SupabaseClient,
  db: SupabaseClient,
  user: User
): Promise<"signup" | "login"> {
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name")
    .eq("id", user.id)
    .single()

  if (existingProfile && user.email && existingProfile.email !== user.email) {
    console.warn("Profile email mismatch:", {
      profileEmail: existingProfile.email,
      userEmail: user.email,
    })
  }

  if (existingProfile) {
    return "login"
  }

  let firstName =
    user.user_metadata?.given_name ||
    user.user_metadata?.first_name ||
    user.user_metadata?.name?.split(" ")[0] ||
    ""
  let lastName =
    user.user_metadata?.family_name ||
    user.user_metadata?.surname ||
    user.user_metadata?.last_name ||
    user.user_metadata?.name?.split(" ").slice(1).join(" ") ||
    ""

  if (!firstName && !lastName && user.user_metadata?.full_name) {
    const nameParts = user.user_metadata.full_name.split(" ")
    firstName = nameParts[0] || ""
    lastName = nameParts.slice(1).join(" ") || ""
  }

  if (!firstName) {
    firstName = user.email?.split("@")[0] || "User"
  }

  let orgId: string | null = null
  const { data: orgByEmail } = await db
    .from("organizations")
    .select("id")
    .eq("email", user.email || "")
    .single()

  if (orgByEmail) {
    orgId = orgByEmail.id
  } else {
    const userFullName = `${firstName} ${lastName}`.trim() || firstName
    const { data: newOrg, error: orgError } = await db
      .from("organizations")
      .insert({
        name: `${userFullName}'s Lab`,
        email: user.email || "",
      })
      .select()
      .single()

    if (orgError && !orgError.message.includes("duplicate")) {
      console.error("Error creating organization:", orgError)
    } else {
      orgId = newOrg?.id || null
    }
  }

  const { error: insertProfileError } = await db.from("profiles").insert({
    id: user.id,
    email: user.email || "",
    first_name: firstName || "User",
    last_name: lastName || "",
    role: user.user_metadata?.role || "researcher",
    organization_id: orgId || null,
  })

  if (insertProfileError) {
    if (
      insertProfileError.message.includes("duplicate") ||
      insertProfileError.message.includes("violates unique constraint")
    ) {
      return "login"
    }
    console.error("Error creating profile:", insertProfileError)
    return "login"
  }

  return "signup"
}

export async function GET(request: NextRequest) {
  try {
    return await handleAuthCallback(request)
  } catch (err) {
    // Log the full error server-side; return only a generic description to the
    // client so internal details are never leaked into the redirect URL.
    console.error("[auth/callback] unhandled error:", err)
    return NextResponse.redirect(
      new URL(
        `/auth/error?error=server_error&description=${encodeURIComponent("An unexpected error occurred. Please try again.")}`,
        request.url
      )
    )
  }
}

/**
 * Strip absolute URLs / scheme-relative inputs from the `next` query parameter
 * to prevent open-redirect attacks (e.g. `?next=https://evil.com`). Only allow
 * an in-app relative path; anything else falls back to /dashboard.
 */
function safeNextPath(raw: string | null): string {
  if (!raw) return "/dashboard"
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard"
  // Reject paths that try to break out via `\\` or a backslash trick
  if (raw.includes("\\")) return "/dashboard"
  try {
    const probe = new URL(raw, "http://localhost")
    if (probe.origin !== "http://localhost") return "/dashboard"
    return probe.pathname + probe.search + probe.hash
  } catch {
    return "/dashboard"
  }
}

async function handleAuthCallback(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const nextPath = safeNextPath(requestUrl.searchParams.get("next"))
  const errorParam = requestUrl.searchParams.get("error")
  const errorDescription = requestUrl.searchParams.get("error_description")

  if (errorParam) {
    console.error("OAuth error:", errorParam, errorDescription)
    return NextResponse.redirect(
      new URL(
        `/auth/error?error=${encodeURIComponent(errorParam)}&description=${encodeURIComponent(errorDescription || "")}`,
        request.url
      )
    )
  }

  if (code) {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      let authEvent: "signup" | "login" = "login"

      if (user?.email) {
        const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
          ? createSupabaseAdmin(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY,
              {
                auth: {
                  autoRefreshToken: false,
                  persistSession: false,
                },
              }
            )
          : null

        const db = supabaseAdmin || supabase
        authEvent = await provisionOauthProfileAndOrg(supabase, db, user)
      }

      // If an invitation token is present, redirect to the invite acceptance page
      const invitationToken = requestUrl.searchParams.get("token")
      const redirectPath = invitationToken
        ? `/auth/invite?token=${encodeURIComponent(invitationToken)}`
        : nextPath

      const nextUrl = new URL(redirectPath, request.url)
      nextUrl.searchParams.set("auth_event", authEvent)
      return NextResponse.redirect(nextUrl)
    }
  }

  return NextResponse.redirect(new URL("/auth/error?error=oauth_error", request.url))
}
