import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { createServiceRoleClient } from "@/lib/supabase-service-role"
import { generateInvitationToken, buildInvitationUrl } from "@/lib/org/invitation"
import { resend } from "@/lib/resend"

const inviteSchema = z.object({
  emails: z
    .array(z.string().email("Invalid email address"))
    .min(1, "At least one email address is required"),
  roleId: z.string().uuid("Invalid role ID"),
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

    // Use service role client to bypass RLS
    const admin = createServiceRoleClient()

    // Get the user's profile to find their organization_id
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single()

    if (profileError || !profile?.organization_id) {
      return NextResponse.json(
        { error: "You must belong to an organization to send invitations" },
        { status: 403 }
      )
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
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      )
    }

    // Parse and validate request body
    const body = await req.json()
    const parsed = inviteSchema.safeParse(body)

    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Invalid input"
      return NextResponse.json({ error: firstError }, { status: 400 })
    }

    const { emails, roleId } = parsed.data

    // Verify the role belongs to this organization
    const { data: role, error: roleError } = await admin
      .from("org_roles")
      .select("id, name")
      .eq("id", roleId)
      .eq("organization_id", organizationId)
      .single()

    if (roleError || !role) {
      return NextResponse.json(
        { error: "Invalid role for this organization" },
        { status: 400 }
      )
    }

    // Fetch org name for the email
    const { data: org } = await admin
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .single()

    // Fetch inviter name
    const { data: inviterProfile } = await admin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .single()

    const orgName = org?.name || "a lab"
    const roleName = role.name
    const inviterName = inviterProfile
      ? `${inviterProfile.first_name} ${inviterProfile.last_name}`.trim() || "A colleague"
      : "A colleague"

    // Check for duplicate pending invitations
    const { data: existingInvitations } = await admin
      .from("org_invitations")
      .select("email")
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .in("email", emails)

    if (existingInvitations && existingInvitations.length > 0) {
      const duplicateEmails = existingInvitations.map((inv) => inv.email)
      return NextResponse.json(
        {
          error: `A pending invitation already exists for: ${duplicateEmails.join(", ")}`,
        },
        { status: 409 }
      )
    }

    // Create invitation records
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const invitationRows = emails.map((email) => ({
      organization_id: organizationId,
      email,
      role_id: roleId,
      token: generateInvitationToken(),
      status: "pending",
      invited_by: user.id,
      expires_at: expiresAt.toISOString(),
    }))

    const { data: invitations, error: insertError } = await admin
      .from("org_invitations")
      .insert(invitationRows)
      .select("id, email, status, token")

    if (insertError || !invitations) {
      console.error("[api/org/invite] Failed to create invitations:", insertError)
      return NextResponse.json(
        { error: "Failed to create invitations" },
        { status: 500 }
      )
    }

    // Send invitation emails (best-effort, don't fail the request if email fails)
    if (process.env.RESEND_API_KEY) {
      const fromEmail = process.env.RESEND_FROM_EMAIL || "Notes9 <no-reply@notes9.com>"

      for (const inv of invitations) {
        const inviteUrl = buildInvitationUrl(inv.token)
        try {
          await resend.emails.send({
            from: fromEmail,
            to: [inv.email],
            subject: `You're invited to join ${orgName} on Notes9`,
            html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;">
              <h2 style="margin:0 0 8px;">You're invited!</h2>
              <p><strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on Notes9 as a <strong>${roleName}</strong>.</p>
              <p style="margin:24px 0;"><a href="${inviteUrl}" style="display:inline-block;background:#18181b;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;">Accept Invitation</a></p>
              <p style="color:#71717a;font-size:13px;">Or copy this link: ${inviteUrl}</p>
            </div>`,
          })

          // Update status to "sent"
          await admin
            .from("org_invitations")
            .update({ status: "sent" })
            .eq("id", inv.id)
        } catch (emailError) {
          console.error(`[api/org/invite] Failed to send email to ${inv.email}:`, emailError)
          await admin
            .from("org_invitations")
            .update({ status: "failed" })
            .eq("id", inv.id)
        }
      }
    }

    return NextResponse.json({
      invitations: invitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        status: inv.status,
      })),
    })
  } catch (error) {
    console.error("[api/org/invite] Unexpected error:", error)
    return NextResponse.json(
      { error: "Failed to create invitations" },
      { status: 500 }
    )
  }
}
