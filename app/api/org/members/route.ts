import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"
import { createServiceRoleClient } from "@/lib/supabase-service-role"
import { isSystemAdminRow } from "@/lib/org/require-admin"

const deleteMemberSchema = z.object({
  memberId: z.string().uuid("Invalid member ID"),
})

/**
 * Authenticate user and verify they are an admin of their org.
 * Returns { organizationId, admin } on success, or a NextResponse error.
 */
async function authenticateAdmin() {
  const supabase = await createClient()
  const user = await getCurrentUser()

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const admin = createServiceRoleClient()

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single()

  if (profileError || !profile?.organization_id) {
    return {
      error: NextResponse.json(
        { error: "You must belong to an organization to manage members" },
        { status: 403 }
      ),
    }
  }

  const organizationId = profile.organization_id

  // Verify the user is an admin of their org
  const { data: membership, error: memberError } = await admin
    .from("org_members")
    .select("id, role_id, org_roles(is_system_role)")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single()

  if (
    memberError ||
    !membership ||
    !isSystemAdminRow(membership.org_roles)
  ) {
    return {
      error: NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      ),
    }
  }

  return { organizationId, admin }
}

// DELETE - Deactivate a member
export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateAdmin()
    if ("error" in auth && auth.error) return auth.error
    const { organizationId, admin } = auth as {
      organizationId: string
      admin: ReturnType<typeof createServiceRoleClient>
    }

    const body = await req.json()
    const parsed = deleteMemberSchema.safeParse(body)

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Invalid input"
      return NextResponse.json({ error: firstError }, { status: 400 })
    }

    const { memberId } = parsed.data

    // Fetch the target member and verify they belong to this org
    const { data: member, error: memberError } = await admin
      .from("org_members")
      .select("id, user_id, role_id, is_active, org_roles(is_system_role)")
      .eq("id", memberId)
      .eq("organization_id", organizationId)
      .single()

    if (memberError || !member) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      )
    }

    if (!member.is_active) {
      return NextResponse.json(
        { error: "Member is already inactive" },
        { status: 400 }
      )
    }

    // If the target member is an admin, check they are not the last active admin
    if (isSystemAdminRow(member.org_roles)) {
      const { count: adminCount, error: countError } = await admin
        .from("org_members")
        .select("id, org_roles!inner(is_system_role)", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .eq("org_roles.is_system_role", true)

      if (countError) {
        console.error("[api/org/members] Failed to count admins:", countError)
        return NextResponse.json(
          { error: "Failed to remove member" },
          { status: 500 }
        )
      }

      if ((adminCount ?? 0) <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the last admin of the organization" },
          { status: 403 }
        )
      }
    }

    // Deactivate the member
    const { error: deactivateError } = await admin
      .from("org_members")
      .update({ is_active: false })
      .eq("id", memberId)

    if (deactivateError) {
      console.error("[api/org/members] Failed to deactivate member:", deactivateError)
      return NextResponse.json(
        { error: "Failed to remove member" },
        { status: 500 }
      )
    }

    // Clear the member's organization_id in profiles
    const { error: profileError } = await admin
      .from("profiles")
      .update({ organization_id: null })
      .eq("id", member.user_id)

    if (profileError) {
      console.error("[api/org/members] Failed to clear profile org:", profileError)
      // Attempt to rollback the deactivation
      await admin
        .from("org_members")
        .update({ is_active: true })
        .eq("id", memberId)
      return NextResponse.json(
        { error: "Failed to remove member" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[api/org/members] Unexpected error:", error)
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    )
  }
}
