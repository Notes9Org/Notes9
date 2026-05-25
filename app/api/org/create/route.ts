import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase-service-role"

const createOrgSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters")
    .max(100, "Organization name must be at most 100 characters"),
  type: z
    .enum(["academic", "industry", "government", "independent"])
    .optional(),
  description: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email address").optional(),
})

export async function POST(req: NextRequest) {
  try {
    // Authenticate the user via session cookie
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Parse and validate request body
    const body = await req.json()
    const parsed = createOrgSchema.safeParse(body)

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Invalid input"
      return NextResponse.json({ error: firstError }, { status: 400 })
    }

    const { name, type, description, address, phone, email } = parsed.data

    // Use service role client to bypass RLS for multi-table transaction
    const admin = createServiceRoleClient()

    // Check if user already has an org (auto-provisioned by OAuth)
    const { data: profile } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single()

    // Check if user already completed org setup (has org_members record)
    const { data: existingMembership } = await admin
      .from("org_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle()

    if (existingMembership) {
      return NextResponse.json(
        { error: "You already belong to an organization" },
        { status: 409 }
      )
    }

    let orgId: string
    let orgName: string

    if (profile?.organization_id) {
      // User has an auto-provisioned org — update it with the provided details
      const { data: updatedOrg, error: updateError } = await admin
        .from("organizations")
        .update({
          name,
          ...(type && { type }),
          ...(description && { description }),
          ...(address && { address }),
          ...(phone && { phone }),
          ...(email && { email }),
        })
        .eq("id", profile.organization_id)
        .select("id, name")
        .single()

      if (updateError || !updatedOrg) {
        console.error("[api/org/create] Failed to update organization:", updateError)
        return NextResponse.json(
          { error: "Failed to create organization" },
          { status: 500 }
        )
      }

      orgId = updatedOrg.id
      orgName = updatedOrg.name
    } else {
      // No existing org — create a new one
      const { data: newOrg, error: orgError } = await admin
        .from("organizations")
        .insert({
          name,
          ...(type && { type }),
          ...(description && { description }),
          ...(address && { address }),
          ...(phone && { phone }),
          ...(email && { email }),
        })
        .select("id, name")
        .single()

      if (orgError || !newOrg) {
        console.error("[api/org/create] Failed to create organization:", orgError)
        return NextResponse.json(
          { error: "Failed to create organization" },
          { status: 500 }
        )
      }

      orgId = newOrg.id
      orgName = newOrg.name

      // Link profile to the new org
      const { error: profileError } = await admin
        .from("profiles")
        .update({ organization_id: orgId })
        .eq("id", user.id)

      if (profileError) {
        console.error("[api/org/create] Failed to update profile:", profileError)
        await admin.from("organizations").delete().eq("id", orgId)
        return NextResponse.json(
          { error: "Failed to create organization" },
          { status: 500 }
        )
      }
    }

    // Create the default Admin role with is_system_role = true
    const { data: role, error: roleError } = await admin
      .from("org_roles")
      .insert({
        organization_id: orgId,
        name: "Admin",
        description: "Full access administrator role",
        is_system_role: true,
      })
      .select("id, name")
      .single()

    if (roleError || !role) {
      console.error("[api/org/create] Failed to create Admin role:", roleError)
      return NextResponse.json(
        { error: "Failed to create organization" },
        { status: 500 }
      )
    }

    // Link all 28 permissions to the Admin role
    const { data: permissions, error: permError } = await admin
      .from("org_permissions")
      .select("id")

    if (permError || !permissions || permissions.length === 0) {
      console.error("[api/org/create] Failed to fetch permissions:", permError)
      await admin.from("org_roles").delete().eq("id", role.id)
      return NextResponse.json(
        { error: "Failed to create organization" },
        { status: 500 }
      )
    }

    const rolePermissionRows = permissions.map((p) => ({
      role_id: role.id,
      permission_id: p.id,
    }))

    const { error: linkError } = await admin
      .from("org_role_permissions")
      .insert(rolePermissionRows)

    if (linkError) {
      console.error("[api/org/create] Failed to link permissions:", linkError)
      await admin.from("org_roles").delete().eq("id", role.id)
      return NextResponse.json(
        { error: "Failed to create organization" },
        { status: 500 }
      )
    }

    // Create org_members record linking the creator to the org with Admin role
    const { data: member, error: memberError } = await admin
      .from("org_members")
      .insert({
        organization_id: orgId,
        user_id: user.id,
        role_id: role.id,
      })
      .select("id")
      .single()

    if (memberError || !member) {
      console.error("[api/org/create] Failed to create member:", memberError)
      await admin.from("org_role_permissions").delete().eq("role_id", role.id)
      await admin.from("org_roles").delete().eq("id", role.id)
      return NextResponse.json(
        { error: "Failed to create organization" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      organization: { id: orgId, name: orgName },
      role: { id: role.id, name: role.name },
      member: { id: member.id },
    })
  } catch (error) {
    console.error("[api/org/create] Unexpected error:", error)
    return NextResponse.json(
      { error: "Failed to create organization" },
      { status: 500 }
    )
  }
}
