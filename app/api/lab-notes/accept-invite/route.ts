import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

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
    
    if (acceptError) {
      console.error("Error accepting invitation:", acceptError)
      return NextResponse.json(
        { error: "Failed to accept invitation" },
        { status: 500 }
      )
    }
    
    // Check the result
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to accept invitation" },
        { status: 400 }
      )
    }
    
    return NextResponse.json({
      success: true,
      labNoteId: result.lab_note_id,
      permissionLevel: result.permission_level,
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
