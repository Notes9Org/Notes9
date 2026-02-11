import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin-client"
import { NextRequest, NextResponse } from "next/server"

// Permission level type
 type PermissionLevel = 'owner' | 'editor' | 'viewer'

function generateToken(): string {
  const cryptoRef = globalThis.crypto
  if (cryptoRef?.randomUUID) {
    return cryptoRef.randomUUID()
  }
  if (cryptoRef?.getRandomValues) {
    const bytes = new Uint8Array(32)
    cryptoRef.getRandomValues(bytes)
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
}

function getInviteRedirectUrl(request: NextRequest): string | undefined {
  const origin = request.headers.get("origin")
  if (!origin) return undefined
  return `${origin}/invite/accept`
}

// Invite collaborator to a lab note
export async function POST(
  request: NextRequest,
) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }
    
    // Parse request body
    const body = await request.json().catch(() => null)
    const { labNoteId, email, permissionLevel = 'viewer' } = body
    
    if (!labNoteId || !email) {
      return NextResponse.json(
        { error: "Lab note ID and email are required" },
        { status: 400 }
      )
    }
    
    // Validate permission level
    const validPermissions: PermissionLevel[] = ['editor', 'viewer']
    if (!validPermissions.includes(permissionLevel)) {
      return NextResponse.json(
        { error: "Invalid permission level. Must be 'editor' or 'viewer'" },
        { status: 400 }
      )
    }
    
    // Check if user owns the lab note
    const { data: labNote, error: labNoteError } = await supabase
      .from("lab_notes")
      .select("created_by, title")
      .eq("id", labNoteId)
      .single()
    
    if (labNoteError || !labNote) {
      return NextResponse.json(
        { error: "Lab note not found" },
        { status: 404 }
      )
    }
    
    const creatorId = labNote.created_by
    
    if (String(creatorId) !== String(user.id)) {
      return NextResponse.json(
        { error: "Only the owner can invite collaborators" },
        { status: 403 }
      )
    }
    
    // Normalize email
    const normalizedEmail = email.toLowerCase().trim()
    
    // Check if user is trying to invite themselves
    const { data: currentUserProfile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single()
    
    if (currentUserProfile?.email?.toLowerCase() === normalizedEmail) {
      return NextResponse.json(
        { error: "You cannot invite yourself" },
        { status: 400 }
      )
    }
    
    // Check if there's already a pending invitation for this email
    const { data: existingInvitation, error: existingInviteError } = await supabase
      .from("lab_note_invitations")
      .select("id, status")
      .eq("lab_note_id", labNoteId)
      .eq("email", normalizedEmail)
      .eq("status", "pending")
      .maybeSingle()

    if (existingInviteError) {
      console.error("Error checking existing invitations:", existingInviteError)
      return NextResponse.json(
        { error: "Failed to validate existing invitations" },
        { status: 500 }
      )
    }
    
    if (existingInvitation) {
      return NextResponse.json(
        { error: "An invitation is already pending for this email" },
        { status: 409 }
      )
    }
    
    // Check if user already has access
    const { data: existingUser } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle()
    
    if (existingUser) {
      const { data: existingAccess } = await supabase
        .from("lab_note_access")
        .select("id")
        .eq("lab_note_id", labNoteId)
        .eq("user_id", existingUser.id)
        .maybeSingle()
      
      if (existingAccess) {
        return NextResponse.json(
          { error: "User already has access to this lab note" },
          { status: 409 }
        )
      }
    }
    
    // Generate invitation token
    const token = generateToken()
    
    // Calculate expiration (7 days)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)
    
    // Create invitation
    const { data: invitation, error: inviteError } = await supabase
      .from("lab_note_invitations")
      .insert({
        lab_note_id: labNoteId,
        email: normalizedEmail,
        invited_by: user.id,
        permission_level: permissionLevel,
        token,
        status: "pending",
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()
    
    if (inviteError) {
      console.error("Error creating invitation:", inviteError)
      return NextResponse.json(
        { error: "Failed to create invitation" },
        { status: 500 }
      )
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
            labNoteInvitationId: invitation.id,
            labNoteId: invitation.lab_note_id,
            permissionLevel: invitation.permission_level,
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
        const { data: existingUser, error: existingUserError } =
          await adminClient.auth.admin.getUserByEmail(normalizedEmail)

        if (existingUserError) {
          console.error("Failed to lookup existing user by email:", existingUserError)
        } else if (existingUser?.user) {
          const existingMetadata = existingUser.user.user_metadata || {}
          const { error: updateError } = await adminClient.auth.admin.updateUserById(
            existingUser.user.id,
            {
              user_metadata: {
                ...existingMetadata,
                labNoteInvitationId: invitation.id,
                labNoteId: invitation.lab_note_id,
                permissionLevel: invitation.permission_level,
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
    
    return NextResponse.json({
      success: true,
      invitation: {
        id: invitation.id,
        labNoteId: invitation.lab_note_id,
        email: invitation.email,
        permissionLevel: invitation.permission_level,
        status: invitation.status,
        expiresAt: invitation.expires_at,
        createdAt: invitation.created_at,
      },
      emailSent,
      emailError,
      ...(process.env.NODE_ENV !== "production"
        ? { token: invitation.token }
        : {}),
    })
    
  } catch (error) {
    console.error("Error in invite endpoint:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Internal server error" : message },
      { status: 500 }
    )
  }
}

// Get pending invitations for a lab note
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }
    
    // Get lab note ID from query params
    const { searchParams } = new URL(request.url)
    const labNoteId = searchParams.get("labNoteId")
    
    if (!labNoteId) {
      return NextResponse.json(
        { error: "Lab note ID is required" },
        { status: 400 }
      )
    }
    
    // Check if user owns the lab note or has access
    const { data: labNote, error: labNoteError } = await supabase
      .from("lab_notes")
      .select("created_by")
      .eq("id", labNoteId)
      .single()
    
    if (labNoteError || !labNote) {
      return NextResponse.json(
        { error: "Lab note not found" },
        { status: 404 }
      )
    }
    
    const creatorId = labNote.created_by
    
    // Only owner can view all invitations
    if (String(creatorId) !== String(user.id)) {
      return NextResponse.json(
        { error: "Only the owner can view invitations" },
        { status: 403 }
      )
    }
    
    // Get pending invitations
    const { data: invitations, error: invitationsError } = await supabase
      .from("lab_note_invitations")
      .select("*")
      .eq("lab_note_id", labNoteId)
      .order("created_at", { ascending: false })
    
    if (invitationsError) {
      console.error("Error fetching invitations:", invitationsError)
      return NextResponse.json(
        { error: "Failed to fetch invitations" },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      invitations: invitations || [],
    })
    
  } catch (error) {
    console.error("Error in GET invite endpoint:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// Revoke an invitation
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }
    
    // Parse request body
    const { searchParams } = new URL(request.url)
    const invitationId = searchParams.get("invitationId")
    
    if (!invitationId) {
      return NextResponse.json(
        { error: "Invitation ID is required" },
        { status: 400 }
      )
    }
    
    // Get the invitation
    const { data: invitation, error: invitationError } = await supabase
      .from("lab_note_invitations")
      .select("lab_note_id")
      .eq("id", invitationId)
      .single()
    
    if (invitationError || !invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      )
    }
    
    // Check if user owns the lab note
    const { data: labNote, error: labNoteError } = await supabase
      .from("lab_notes")
      .select("created_by")
      .eq("id", invitation.lab_note_id)
      .single()
    
    if (labNoteError || !labNote) {
      return NextResponse.json(
        { error: "Lab note not found" },
        { status: 404 }
      )
    }
    
    const creatorId = labNote.created_by
    
    if (String(creatorId) !== String(user.id)) {
      return NextResponse.json(
        { error: "Only the owner can revoke invitations" },
        { status: 403 }
      )
    }
    
    // Delete or update the invitation
    const { error: deleteError } = await supabase
      .from("lab_note_invitations")
      .delete()
      .eq("id", invitationId)
    
    if (deleteError) {
      console.error("Error revoking invitation:", deleteError)
      return NextResponse.json(
        { error: "Failed to revoke invitation" },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: "Invitation revoked successfully",
    })
    
  } catch (error) {
    console.error("Error in DELETE invite endpoint:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
