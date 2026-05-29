import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"
import { createServiceRoleClient } from "@/lib/supabase-service-role"

const acceptSchema = z.object({
  token: z.string().min(1, "Invitation token is required"),
})

export async function POST(req: NextRequest) {
  try {
    // Authenticate the user via session cookie
    const supabase = await createClient()
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Parse and validate request body
    const body = await req.json()
    const parsed = acceptSchema.safeParse(body)

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Invalid input"
      return NextResponse.json({ error: firstError }, { status: 400 })
    }

    const { token } = parsed.data

    // Use service role client to bypass RLS for multi-table transaction
    const admin = createServiceRoleClient()

    // 1. Look up invitation by token
    const { data: invitation, error: invError } = await admin
      .from("org_invitations")
      .select("id, organization_id, email, role_id, status, expires_at")
      .eq("token", token)
      .single()

    if (invError || !invitation) {
      return NextResponse.json(
        { error: "Invalid or expired invitation" },
        { status: 400 }
      )
    }

    // 1b. Bind the invitation to the authenticated user's email. Without this,
    // anyone holding/guessing a token could accept an invite addressed to
    // someone else and join that org under their own account. Same generic
    // error to avoid leaking whether a token exists.
    if (
      !user.email ||
      invitation.email.trim().toLowerCase() !== user.email.trim().toLowerCase()
    ) {
      return NextResponse.json(
        { error: "Invalid or expired invitation" },
        { status: 400 }
      )
    }

    // 2. Verify invitation status is "pending" or "sent"
    if (invitation.status !== "pending" && invitation.status !== "sent") {
      return NextResponse.json(
        { error: "Invalid or expired invitation" },
        { status: 400 }
      )
    }

    // 3. Check if invitation has expired
    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Invalid or expired invitation" },
        { status: 400 }
      )
    }

    // 4. Get the user's current profile to check organization_id
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Failed to retrieve user profile" },
        { status: 500 }
      )
    }

    // 5. Reject if user already belongs to a different organization
    if (
      profile.organization_id &&
      profile.organization_id !== invitation.organization_id
    ) {
      return NextResponse.json(
        { error: "You must leave your current organization first" },
        { status: 409 }
      )
    }

    // 6. Get the role name from the invitation's role_id
    const { data: role, error: roleError } = await admin
      .from("org_roles")
      .select("id, name")
      .eq("id", invitation.role_id)
      .single()

    if (roleError || !role) {
      return NextResponse.json(
        { error: "Invalid role assignment" },
        { status: 400 }
      )
    }

    // 7. Transaction: update profile → create org_members → update invitation status
    // Step A: Update profiles.organization_id
    const { error: updateProfileError } = await admin
      .from("profiles")
      .update({ organization_id: invitation.organization_id })
      .eq("id", user.id)

    if (updateProfileError) {
      console.error(
        "[api/org/invite/accept] Failed to update profile:",
        updateProfileError
      )
      return NextResponse.json(
        { error: "Failed to accept invitation" },
        { status: 500 }
      )
    }

    // Step B: Create or update org_members record
    const { error: memberError } = await admin
      .from("org_members")
      .upsert(
        {
          organization_id: invitation.organization_id,
          user_id: user.id,
          role_id: invitation.role_id,
          is_active: true,
        },
        { onConflict: "organization_id,user_id" }
      )

    if (memberError) {
      console.error(
        "[api/org/invite/accept] Failed to create member:",
        memberError
      )
      // Rollback: revert profile organization_id
      await admin
        .from("profiles")
        .update({ organization_id: profile.organization_id })
        .eq("id", user.id)
      return NextResponse.json(
        { error: "Failed to accept invitation" },
        { status: 500 }
      )
    }

    // Step C: Update invitation status to "accepted"
    const { error: statusError } = await admin
      .from("org_invitations")
      .update({ status: "accepted" })
      .eq("id", invitation.id)

    if (statusError) {
      console.error(
        "[api/org/invite/accept] Failed to update invitation status:",
        statusError
      )
      // Non-critical: member was already created, log but don't fail
    }

    return NextResponse.json({
      organizationId: invitation.organization_id,
      roleName: role.name,
    })
  } catch (error) {
    console.error("[api/org/invite/accept] Unexpected error:", error)
    return NextResponse.json(
      { error: "Failed to accept invitation" },
      { status: 500 }
    )
  }
}
