import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { type NextRequest } from "next/server"

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
        // Log user metadata to debug OAuth data
        // console.log("OAuth user metadata:", JSON.stringify(user.user_metadata, null, 2))
        // console.log("OAuth raw app metadata:", JSON.stringify(user.app_metadata, null, 2))
        
        // Supabase automatically links OAuth accounts to existing email/password accounts
        // when the email matches. The user.id will be the original account ID if linked.
        // Check if profile exists for this user (after potential account linking)
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, email, first_name, last_name")
          .eq("id", user.id)
          .single()
        
        // If profile exists with different email, this shouldn't happen but log it
        if (profile && profile.email !== user.email) {
          console.warn("Profile email mismatch:", { profileEmail: profile.email, userEmail: user.email })
        }
        
        // Extract name from OAuth metadata (works for both new and existing profiles)
        // Google provides: given_name, family_name, name
        // Microsoft provides: given_name, surname, name
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
        // This handles both new OAuth sign-ups and account linking scenarios
        if (!profile) {
          // Check if organization already exists for this email (account linking scenario)
          // When OAuth account is linked to existing email/password account,
          // the organization should already exist
          let orgId: string | null = null
          const { data: existingOrg } = await supabase
            .from("organizations")
            .select("id")
            .eq("email", user.email || '')
            .single()
          
          if (existingOrg) {
            // Use existing organization (account was linked)
            orgId = existingOrg.id
            // console.log("Using existing organization for linked account:", orgId)
          } else {
            // Create new organization for new OAuth sign-up
            const userFullName = `${firstName} ${lastName}`.trim() || firstName
            const { data: newOrg, error: orgError } = await supabase
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
          
          // Create profile with organization
          const { error: profileError } = await supabase.from("profiles").insert({
            id: user.id,
            email: user.email || '',
            first_name: firstName || 'User',
            last_name: lastName || '',
            role: user.user_metadata?.role || 'researcher',
            organization_id: orgId || null,
          })
          
          // Ignore error if profile already exists (trigger might have created it or account was linked)
          if (profileError && !profileError.message.includes('duplicate') && !profileError.message.includes('violates unique constraint')) {
            console.error("Error creating profile:", profileError)
          }
        } else {
          // Profile exists - account was successfully linked or user already had profile
          // console.log("Profile exists - account linked or user already registered")
        }
      }
      
      return NextResponse.redirect(new URL(next, request.url))
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(new URL("/auth/error?error=oauth_error", request.url))
}

