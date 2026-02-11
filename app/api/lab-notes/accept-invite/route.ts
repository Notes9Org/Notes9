import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin-client"
import { NextRequest, NextResponse } from "next/server"

async function acceptWithAdminFallback(token: string, userId: string, userEmail: string | null) {
  const adminClient = createAdminClient()
  if (!adminClient) {
    return {
      success: false as const,
      status: 500,
      error: "Supabase service role key is not configured",
    }
  }

  const { data: invitation, error: invitationError } = await adminClient
    .from("lab_note_invitations")
    .select("id, lab_note_id, email, permission_level, status, expires_at, invited_by")
    .eq("token", token)
    .maybeSingle()

  if (invitationError) {
    console.error("Fallback invitation lookup failed:", invitationError)
    return {
      success: false as const,
      status: 500,
      error: "Failed to look up invitation",
    }
  }

  if (!invitation) {
    return {
      success: false as const,
      status: 404,
      error: "Invitation not found",
    }
  }

  if (invitation.status !== "pending") {
    return {
      success: false as const,
      status: 400,
      error: `Invitation has already been ${invitation.status}`,
    }
  }

  if (new Date(invitation.expires_at) <= new Date()) {
    return {
      success: false as const,
      status: 400,
      error: "Invitation has expired",
    }
  }

  const normalizedUserEmail = (userEmail || "").toLowerCase().trim()
  const normalizedInvitationEmail = (invitation.email || "").toLowerCase().trim()
  if (!normalizedUserEmail || normalizedUserEmail !== normalizedInvitationEmail) {
    return {
      success: false as const,
      status: 400,
      error: "Invitation email does not match your account",
    }
  }

  const now = new Date().toISOString()

  const { error: accessError } = await adminClient
    .from("lab_note_access")
    .upsert(
      {
        lab_note_id: invitation.lab_note_id,
        user_id: userId,
        permission_level: invitation.permission_level,
        granted_by: invitation.invited_by ?? null,
        updated_at: now,
      },
      { onConflict: "lab_note_id,user_id" }
    )

  if (accessError) {
    console.error("Fallback upsert into lab_note_access failed:", accessError)
    return {
      success: false as const,
      status: 500,
      error: "Failed to grant lab note access",
    }
  }

  const { error: updateInvitationError } = await adminClient
    .from("lab_note_invitations")
    .update({
      status: "accepted",
      accepted_at: now,
      accepted_by: userId,
      updated_at: now,
    })
    .eq("id", invitation.id)

  if (updateInvitationError) {
    console.error("Fallback invitation status update failed:", updateInvitationError)
    return {
      success: false as const,
      status: 500,
      error: "Failed to update invitation status",
    }
  }

  return {
    success: true as const,
    status: 200,
    labNoteId: invitation.lab_note_id,
    permissionLevel: invitation.permission_level,
  }
}

// Accept an invitation to collaborate on a lab note
export async function POST(request: NextRequest) {
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
    const body = await request.json()
    const { token } = body
    
    if (!token) {
      return NextResponse.json(
        { error: "Invitation token is required" },
        { status: 400 }
      )
    }
    
    // Call the database function to accept the invitation
    const { data: result, error: acceptError } = await supabase.rpc(
      "accept_lab_note_invitation",
      { p_token: token }
    )

    if (!acceptError && result?.success) {
      return NextResponse.json({
        success: true,
        labNoteId: result.lab_note_id,
        permissionLevel: result.permission_level,
        message: "Invitation accepted successfully",
      })
    }

    if (acceptError) {
      console.error("Error accepting invitation via RPC, trying fallback:", acceptError)
    } else {
      console.error("RPC accept_invite returned failure, trying fallback:", result)
    }

    const fallback = await acceptWithAdminFallback(token, user.id, user.email ?? null)
    if (!fallback.success) {
      return NextResponse.json(
        { error: fallback.error || "Failed to accept invitation" },
        { status: fallback.status }
      )
    }

    return NextResponse.json({
      success: true,
      labNoteId: fallback.labNoteId,
      permissionLevel: fallback.permissionLevel,
      message: "Invitation accepted successfully",
    })
    
  } catch (error) {
    console.error("Error in accept-invite endpoint:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// GET endpoint to validate an invitation token (for preview page)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get token from query params
    const { searchParams } = new URL(request.url)
    const token = searchParams.get("token")
    
    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      )
    }
    
    // Get invitation details
    const { data: invitation, error: invitationError } = await supabase
      .from("lab_note_invitations")
      .select(`
        id,
        lab_note_id,
        email,
        permission_level,
        status,
        expires_at,
        created_at,
        invited_by,
        lab_note:lab_notes(
          id,
          title,
          created_by
        )
      `)
      .eq("token", token)
      .single()
    
    if (invitationError || !invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      )
    }
    
    // Check if invitation is still pending and not expired
    const now = new Date()
    const expiresAt = new Date(invitation.expires_at)
    
    if (invitation.status !== "pending") {
      return NextResponse.json(
        { 
          valid: false,
          error: `Invitation has already been ${invitation.status}`,
          invitation: {
            status: invitation.status,
            email: invitation.email,
          }
        },
        { status: 400 }
      )
    }
    
    if (expiresAt < now) {
      return NextResponse.json(
        { 
          valid: false,
          error: "Invitation has expired",
          invitation: {
            status: "expired",
            email: invitation.email,
          }
        },
        { status: 400 }
      )
    }
    
    // Get inviter details
    const { data: inviter } = await supabase
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("id", invitation.invited_by)
      .single()
    
    // Handle Supabase returning related data as array
    const labNoteData = Array.isArray(invitation.lab_note) 
      ? invitation.lab_note[0] 
      : invitation.lab_note
    
    return NextResponse.json({
      valid: true,
      invitation: {
        id: invitation.id,
        labNoteId: invitation.lab_note_id,
        labNoteTitle: labNoteData?.title || "Untitled Lab Note",
        email: invitation.email,
        permissionLevel: invitation.permission_level,
        expiresAt: invitation.expires_at,
        inviter: inviter ? {
          name: `${inviter.first_name || ''} ${inviter.last_name || ''}`.trim() || inviter.email,
          email: inviter.email,
        } : null,
      },
    })
    
  } catch (error) {
    console.error("Error validating invitation:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
