import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { type NextRequest } from "next/server"
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js"

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  // OAuth authorization code - safe to be in URL (single-use, short-lived, exchanged server-side)
  // This is standard OAuth 2.0 Authorization Code flow with PKCE
  const code = requestUrl.searchParams.get("code")
  const next = requestUrl.searchParams.get("next") ?? "/dashboard"
  const errorParam = requestUrl.searchParams.get("error")
  const errorDescription = requestUrl.searchParams.get("error_description")

  // Handle OAuth errors
  if (errorParam) {
    console.error("OAuth error:", errorParam, errorDescription)
    return NextResponse.redirect(
      new URL(`/auth/error?error=${encodeURIComponent(errorParam)}&description=${encodeURIComponent(errorDescription || '')}`, request.url)
    )
  }

  if (code) {
    const supabase = await createClient()
    // Exchange authorization code for session (server-side only - secure)
    // Code is single-use and expires quickly, so this must happen immediately
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Get the user after session exchange
      const { data: { user } } = await supabase.auth.getUser()

      if (user && user.email) {

        // Use Admin client for privileged operations (Profile/Org creation) to bypass RLS
        const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
          ? createSupabaseAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            {
              auth: {
                autoRefreshToken: false,
                persistSession: false
              }
            }
          )
          : null

        // Use admin client if available, otherwise fallback to user client
        const db = supabaseAdmin || supabase

        // Check if profile exists for this user
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, email, first_name, last_name")
          .eq("id", user.id)
          .single()

        // If profile exists with different email, this shouldn't happen but log it
        if (profile && profile.email !== user.email) {
          console.warn("Profile email mismatch:", { profileEmail: profile.email, userEmail: user.email })
        }

        // Extract name from OAuth metadata
        let firstName = user.user_metadata?.given_name ||
          user.user_metadata?.first_name ||
          user.user_metadata?.name?.split(' ')[0] ||
          ''
        let lastName = user.user_metadata?.family_name ||
          user.user_metadata?.surname ||
          user.user_metadata?.last_name ||
          user.user_metadata?.name?.split(' ').slice(1).join(' ') ||
          ''

        // If name is in full_name format, try to split it
        if (!firstName && !lastName && user.user_metadata?.full_name) {
          const nameParts = user.user_metadata.full_name.split(' ')
          firstName = nameParts[0] || ''
          lastName = nameParts.slice(1).join(' ') || ''
        }

        // Fallback to email username if no name found
        if (!firstName) {
          firstName = user.email?.split('@')[0] || 'User'
        }

        // If profile doesn't exist, create it from OAuth metadata
        if (!profile) {
          // Check if organization already exists for this email
          let orgId: string | null = null
          // Use 'db' (potentially admin) to check/create organization
          /* 
             NOTE: We use 'supabase' (user client) to find existing org via typical queries, 
             but if we need to insert, we prefer 'db'.
             Actually, finding org by email might be restricted too. Let's use 'db' for all setup queries.
          */
          const { data: existingOrg } = await db
            .from("organizations")
            .select("id")
            .eq("email", user.email || '')
            .single()

          if (existingOrg) {
            orgId = existingOrg.id
          } else {
            // Create new organization for new OAuth sign-up
            const userFullName = `${firstName} ${lastName}`.trim() || firstName
            const { data: newOrg, error: orgError } = await db
              .from("organizations")
              .insert({
                name: `${userFullName}'s Lab`,
                email: user.email || ''
              })
              .select()
              .single()

            if (orgError && !orgError.message.includes('duplicate')) {
              console.error("Error creating organization:", orgError)
            } else {
              orgId = newOrg?.id || null
            }
          }

          // Create profile with organization using 'db'
          const { error: profileError } = await db.from("profiles").insert({
            id: user.id,
            email: user.email || '',
            first_name: firstName || 'User',
            last_name: lastName || '',
            role: user.user_metadata?.role || 'researcher',
            organization_id: orgId || null,
          })

          // Ignore error if profile already exists
          if (profileError && !profileError.message.includes('duplicate') && !profileError.message.includes('violates unique constraint')) {
            console.error("Error creating profile:", profileError)
          }
        } else {
          // Profile exists
        }
      }



      const nextUrl = new URL(next, request.url)
      return NextResponse.redirect(nextUrl)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(new URL("/auth/error?error=oauth_error", request.url))
}

