import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin-client"

const INVITE_EXPIRY_DAYS = 7

type InvitationRole = "editor" | "viewer"

type InviteResponse = {
  success: boolean
  invitation?: {
    id: string
    docId: string
    email: string
    role: string
    expiresAt: string
  }
  emailSent?: boolean
  emailError?: string | null
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

function getInviteRedirectUrl(request: NextRequest): string | undefined {
  const origin = request.headers.get("origin")
  if (!origin) return undefined
  return `${origin}/invite/accept`
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const docId = body?.docId
    const email = body?.email
    const requestedRole = body?.role

    if (!docId || !email) {
      return NextResponse.json(
        { error: "docId and email are required" },
        { status: 400 }
      )
    }

    const normalizedEmail = normalizeEmail(String(email))
    if (!normalizedEmail) {
      return NextResponse.json(
        { error: "A valid email is required" },
        { status: 400 }
      )
    }

    const role: InvitationRole | null =
      requestedRole === "editor" ? "editor" :
      requestedRole === "viewer" ? "viewer" :
      null

    if (!role) {
      return NextResponse.json(
        { error: "Invalid role. Must be 'editor' or 'viewer'" },
        { status: 400 }
      )
    }

    if (user.email && normalizeEmail(user.email) === normalizedEmail) {
      return NextResponse.json(
        { error: "You cannot invite yourself" },
        { status: 400 }
      )
    }

    const { data: ownerRecord, error: ownerError } = await supabase
      .from("collaborators")
      .select("role")
      .eq("doc_id", docId)
      .eq("user_id", user.id)
      .eq("role", "owner")
      .maybeSingle()

    if (ownerError) {
      console.error("Error checking owner permissions:", ownerError)
      return NextResponse.json(
        { error: "Failed to verify ownership" },
        { status: 500 }
      )
    }

    if (!ownerRecord) {
      return NextResponse.json(
        { error: "Only the owner can invite collaborators" },
        { status: 403 }
      )
    }

    const now = new Date()
    const { data: existingInvitation, error: existingInvitationError } = await supabase
      .from("invitations")
      .select("id, expires_at, accepted_at")
      .eq("doc_id", docId)
      .eq("email", normalizedEmail)
      .is("accepted_at", null)
      .maybeSingle()

    if (existingInvitationError) {
      console.error("Error checking existing invitations:", existingInvitationError)
      return NextResponse.json(
        { error: "Failed to validate existing invitations" },
        { status: 500 }
      )
    }

    if (existingInvitation) {
      const expiresAt = new Date(existingInvitation.expires_at)
      if (Number.isFinite(expiresAt.getTime()) && expiresAt > now) {
        return NextResponse.json(
          { error: "An invitation is already pending for this email" },
          { status: 409 }
        )
      }
    }

    const expiresAt = new Date(now)
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS)

    const { data: invitation, error: inviteError } = await supabase
      .from("invitations")
      .insert({
        doc_id: docId,
        email: normalizedEmail,
        role,
        expires_at: expiresAt.toISOString(),
      })
      .select("id, doc_id, email, role, expires_at")
      .single()

    if (inviteError || !invitation) {
      console.error("Error creating invitation:", inviteError)
      return NextResponse.json(
        { error: "Failed to create invitation" },
        { status: 500 }
      )
    }

    const { error: auditError } = await supabase
      .from("audit_log")
      .insert({
        actor_id: user.id,
        action: "invitation.created",
        metadata: {
          invitationId: invitation.id,
          docId: invitation.doc_id,
          role: invitation.role,
          email: invitation.email,
        },
      })

    if (auditError) {
      console.error("Failed to write audit log for invitation:", auditError)
    }

    const adminClient = createAdminClient()
    let emailSent = false
    let emailError: string | null = null

    if (!adminClient) {
      emailError = "Supabase service role key is not configured"
    } else {
      const redirectTo = getInviteRedirectUrl(request)
      const { error: inviteAuthError } = await adminClient.auth.admin.inviteUserByEmail(
        normalizedEmail,
        {
          data: {
            invitationId: invitation.id,
            docId: invitation.doc_id,
            role: invitation.role,
          },
          redirectTo,
        }
      )

      if (inviteAuthError) {
        console.error("Supabase inviteUserByEmail failed:", inviteAuthError)
        emailError = inviteAuthError.message
      } else {
        emailSent = true
      }

      if (!emailSent) {
        const { data: existingProfile, error: existingProfileError } = await adminClient
          .from("profiles")
          .select("id")
          .ilike("email", normalizedEmail)
          .maybeSingle()

        if (existingProfileError) {
          console.error("Failed to lookup existing profile by email:", existingProfileError)
        } else if (existingProfile?.id) {
          const { data: existingUser, error: existingUserError } =
            await adminClient.auth.admin.getUserById(existingProfile.id)

          if (existingUserError || !existingUser?.user) {
            console.error("Failed to lookup existing auth user by id:", existingUserError)
          } else {
          const existingMetadata = existingUser.user.user_metadata || {}
          const { error: updateError } = await adminClient.auth.admin.updateUserById(
            existingUser.user.id,
            {
              user_metadata: {
                ...existingMetadata,
                invitationId: invitation.id,
                docId: invitation.doc_id,
                role: invitation.role,
              },
            }
          )

          if (updateError) {
            console.error("Failed to update user metadata for invite:", updateError)
            emailError = emailError || updateError.message
          }
          }
        }
      }
    }

    const response: InviteResponse = {
      success: true,
      invitation: {
        id: invitation.id,
        docId: invitation.doc_id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expires_at,
      },
      emailSent,
      emailError,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Error in invitations endpoint:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
