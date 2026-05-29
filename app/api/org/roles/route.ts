import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"
import { createServiceRoleClient } from "@/lib/supabase-service-role"

const createRoleSchema = z.object({
  name: z.string().trim().min(1, "Role name is required"),
  description: z.string().optional(),
  permissionIds: z
    .array(z.string().uuid("Invalid permission ID"))
    .min(1, "At least one permission is required"),
})

const updateRoleSchema = z.object({
  roleId: z.string().uuid("Invalid role ID"),
  name: z.string().trim().min(1, "Role name is required").optional(),
  description: z.string().optional(),
  permissionIds: z
    .array(z.string().uuid("Invalid permission ID"))
    .optional(),
})

const deleteRoleSchema = z.object({
  roleId: z.string().uuid("Invalid role ID"),
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
        { error: "You must belong to an organization to manage roles" },
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
    !(membership.org_roles as any)?.is_system_role
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


// POST - Create a new role
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateAdmin()
    if ("error" in auth && auth.error) return auth.error
    const { organizationId, admin } = auth as {
      organizationId: string
      admin: ReturnType<typeof createServiceRoleClient>
    }

    const body = await req.json()
    const parsed = createRoleSchema.safeParse(body)

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Invalid input"
      return NextResponse.json({ error: firstError }, { status: 400 })
    }

    const { name, description, permissionIds } = parsed.data

    // Check for duplicate role name within the org
    const { data: existingRole } = await admin
      .from("org_roles")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("name", name)
      .single()

    if (existingRole) {
      return NextResponse.json(
        { error: "A role with this name already exists" },
        { status: 409 }
      )
    }

    // Create the role
    const { data: role, error: roleError } = await admin
      .from("org_roles")
      .insert({
        organization_id: organizationId,
        name,
        ...(description && { description }),
      })
      .select("id, name, description")
      .single()

    if (roleError || !role) {
      console.error("[api/org/roles] Failed to create role:", roleError)
      return NextResponse.json(
        { error: "Failed to create role" },
        { status: 500 }
      )
    }

    // Link permissions to the role
    const rolePermissionRows = permissionIds.map((permissionId) => ({
      role_id: role.id,
      permission_id: permissionId,
    }))

    const { error: linkError } = await admin
      .from("org_role_permissions")
      .insert(rolePermissionRows)

    if (linkError) {
      console.error("[api/org/roles] Failed to link permissions:", linkError)
      // Cleanup: delete the role we just created
      await admin.from("org_roles").delete().eq("id", role.id)
      return NextResponse.json(
        { error: "Failed to create role" },
        { status: 500 }
      )
    }

    return NextResponse.json({ role })
  } catch (error) {
    console.error("[api/org/roles] Unexpected error:", error)
    return NextResponse.json(
      { error: "Failed to create role" },
      { status: 500 }
    )
  }
}


// PUT - Update an existing role
export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateAdmin()
    if ("error" in auth && auth.error) return auth.error
    const { organizationId, admin } = auth as {
      organizationId: string
      admin: ReturnType<typeof createServiceRoleClient>
    }

    const body = await req.json()
    const parsed = updateRoleSchema.safeParse(body)

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Invalid input"
      return NextResponse.json({ error: firstError }, { status: 400 })
    }

    const { roleId, name, description, permissionIds } = parsed.data

    // Fetch the role and verify it belongs to this org
    const { data: role, error: roleError } = await admin
      .from("org_roles")
      .select("id, is_system_role")
      .eq("id", roleId)
      .eq("organization_id", organizationId)
      .single()

    if (roleError || !role) {
      return NextResponse.json(
        { error: "Role not found" },
        { status: 404 }
      )
    }

    // Reject if system role
    if (role.is_system_role) {
      return NextResponse.json(
        { error: "Cannot modify the default Admin role" },
        { status: 403 }
      )
    }

    // Check for duplicate name if name is being changed
    if (name) {
      const { data: existingRole } = await admin
        .from("org_roles")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("name", name)
        .neq("id", roleId)
        .single()

      if (existingRole) {
        return NextResponse.json(
          { error: "A role with this name already exists" },
          { status: 409 }
        )
      }
    }

    // Update role fields
    const updateFields: Record<string, string> = {}
    if (name) updateFields.name = name
    if (description !== undefined) updateFields.description = description

    if (Object.keys(updateFields).length > 0) {
      const { error: updateError } = await admin
        .from("org_roles")
        .update(updateFields)
        .eq("id", roleId)

      if (updateError) {
        console.error("[api/org/roles] Failed to update role:", updateError)
        return NextResponse.json(
          { error: "Failed to update role" },
          { status: 500 }
        )
      }
    }

    // Replace permissions if provided
    if (permissionIds) {
      // Delete existing role_permissions
      const { error: deleteError } = await admin
        .from("org_role_permissions")
        .delete()
        .eq("role_id", roleId)

      if (deleteError) {
        console.error("[api/org/roles] Failed to delete old permissions:", deleteError)
        return NextResponse.json(
          { error: "Failed to update role permissions" },
          { status: 500 }
        )
      }

      // Insert new permissions
      if (permissionIds.length > 0) {
        const rolePermissionRows = permissionIds.map((permissionId) => ({
          role_id: roleId,
          permission_id: permissionId,
        }))

        const { error: insertError } = await admin
          .from("org_role_permissions")
          .insert(rolePermissionRows)

        if (insertError) {
          console.error("[api/org/roles] Failed to insert new permissions:", insertError)
          return NextResponse.json(
            { error: "Failed to update role permissions" },
            { status: 500 }
          )
        }
      }
    }

    // Fetch updated role
    const { data: updatedRole } = await admin
      .from("org_roles")
      .select("id, name, description")
      .eq("id", roleId)
      .single()

    return NextResponse.json({ role: updatedRole })
  } catch (error) {
    console.error("[api/org/roles] Unexpected error:", error)
    return NextResponse.json(
      { error: "Failed to update role" },
      { status: 500 }
    )
  }
}


// DELETE - Delete a role
export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateAdmin()
    if ("error" in auth && auth.error) return auth.error
    const { organizationId, admin } = auth as {
      organizationId: string
      admin: ReturnType<typeof createServiceRoleClient>
    }

    const body = await req.json()
    const parsed = deleteRoleSchema.safeParse(body)

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Invalid input"
      return NextResponse.json({ error: firstError }, { status: 400 })
    }

    const { roleId } = parsed.data

    // Fetch the role and verify it belongs to this org
    const { data: role, error: roleError } = await admin
      .from("org_roles")
      .select("id, name, is_system_role")
      .eq("id", roleId)
      .eq("organization_id", organizationId)
      .single()

    if (roleError || !role) {
      return NextResponse.json(
        { error: "Role not found" },
        { status: 404 }
      )
    }

    // Reject if system role
    if (role.is_system_role) {
      return NextResponse.json(
        { error: "Cannot delete the default Admin role" },
        { status: 403 }
      )
    }

    // Check if role is assigned to any active members
    const { count: memberCount, error: countError } = await admin
      .from("org_members")
      .select("id", { count: "exact", head: true })
      .eq("role_id", roleId)
      .eq("is_active", true)

    if (countError) {
      console.error("[api/org/roles] Failed to count members:", countError)
      return NextResponse.json(
        { error: "Failed to delete role" },
        { status: 500 }
      )
    }

    // Delete role permissions first (cascade should handle this, but be explicit)
    await admin
      .from("org_role_permissions")
      .delete()
      .eq("role_id", roleId)

    // Delete the role
    const { error: deleteError } = await admin
      .from("org_roles")
      .delete()
      .eq("id", roleId)

    if (deleteError) {
      console.error("[api/org/roles] Failed to delete role:", deleteError)
      return NextResponse.json(
        { error: "Failed to delete role" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      ...(memberCount && memberCount > 0 && {
        warning: `This role was assigned to ${memberCount} active member(s). Their role has been unset.`,
        affectedMembers: memberCount,
      }),
    })
  } catch (error) {
    console.error("[api/org/roles] Unexpected error:", error)
    return NextResponse.json(
      { error: "Failed to delete role" },
      { status: 500 }
    )
  }
}
