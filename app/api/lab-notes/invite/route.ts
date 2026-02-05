import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"

// Permission level type
 type PermissionLevel = 'owner' | 'editor' | 'viewer'

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
    const body = await request.json()
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
    const token = randomBytes(32).toString("hex")
    
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
    
    // TODO: Send email notification (implement with your email service)
    // For now, we'll just return the invitation data
    // You can integrate with Resend, SendGrid, or any email service here
    
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
      // Include token in response for development/testing
      // In production, you might want to remove this and only send via email
      token: invitation.token,
    })
    
  } catch (error) {
    console.error("Error in invite endpoint:", error)
    return NextResponse.json(
      { error: "Internal server error" },
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
