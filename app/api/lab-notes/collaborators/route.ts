import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// Get collaborators for a lab note
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
    
    // Check if user has access to the lab note
    const { data: labNote, error: labNoteError } = await supabase
      .from("lab_notes")
      .select("created_by")
      .eq("id", labNoteId)
      .single()
    
    if (labNoteError || !labNote) {
      console.error("Lab note fetch error:", labNoteError)
      return NextResponse.json(
        { error: "Lab note not found", details: labNoteError?.message },
        { status: 404 }
      )
    }
    
    // Check if user is the creator
    const creatorId = labNote.created_by
    console.log("API - Lab note created_by:", creatorId)
    console.log("API - Current user id:", user.id)
    console.log("API - Match:", String(creatorId) === String(user.id))
    
    // Check if user has any access to this lab note
    const hasAccess = String(creatorId) === String(user.id) || await checkUserAccess(supabase, labNoteId, user.id)
    
    if (!hasAccess) {
      return NextResponse.json(
        { error: "You don't have access to this lab note" },
        { status: 403 }
      )
    }
    
    // Try to get collaborators (including owner)
    let collaborators: any[] = []
    try {
      const { data: accessRecords, error: accessError } = await supabase
        .from("lab_note_access")
        .select(`
          id,
          user_id,
          permission_level,
          granted_at
        `)
        .eq("lab_note_id", labNoteId)
        .order("granted_at", { ascending: true })
      
      if (!accessError && accessRecords) {
        // Get user IDs from access records
        const userIds = accessRecords.map((r: any) => r.user_id).filter(Boolean)
        
        // Fetch profiles separately
        let profilesMap: Record<string, any> = {}
        if (userIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from("profiles")
            .select("id, first_name, last_name, email, avatar_url")
            .in("id", userIds)
          
          if (!profilesError && profiles) {
            profilesMap = profiles.reduce((acc: any, p: any) => {
              acc[p.id] = p
              return acc
            }, {})
          }
        }
        
        // Format collaborators
        collaborators = accessRecords.map((record: any) => {
          const profile = profilesMap[record.user_id]
          return {
            id: record.id,
            userId: record.user_id,
            permissionLevel: record.permission_level,
            grantedAt: record.granted_at,
            profile: profile ? {
              firstName: profile.first_name,
              lastName: profile.last_name,
              email: profile.email,
              avatarUrl: profile.avatar_url,
              name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email,
            } : null,
          }
        })
      }
    } catch (err) {
      console.log("Could not fetch collaborators from lab_note_access:", err)
    }
    
    // Get pending invitations (only for owner)
    let pendingInvitations: any[] = []
    if (String(creatorId) === String(user.id)) {
      try {
        const { data: invitations, error: invitationsError } = await supabase
          .from("lab_note_invitations")
          .select("*")
          .eq("lab_note_id", labNoteId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
        
        if (!invitationsError) {
          pendingInvitations = invitations || []
        }
      } catch (err) {
        console.log("Could not fetch pending invitations:", err)
      }
    }
    
    const isOwner = String(creatorId) === String(user.id)
    console.log("API - Returning isOwner:", isOwner)
    
    return NextResponse.json({
      collaborators,
      pendingInvitations,
      isOwner,
      debug: {
        creatorId,
        userId: user.id,
        match: isOwner,
      }
    })
    
  } catch (error) {
    console.error("Error in GET collaborators endpoint:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// Remove a collaborator
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
    const labNoteId = searchParams.get("labNoteId")
    const userId = searchParams.get("userId")
    
    if (!labNoteId || !userId) {
      return NextResponse.json(
        { error: "Lab note ID and user ID are required" },
        { status: 400 }
      )
    }
    
    // Check if user owns the lab note
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
    
    if (String(creatorId) !== String(user.id)) {
      return NextResponse.json(
        { error: "Only the owner can remove collaborators" },
        { status: 403 }
      )
    }
    
    // Cannot remove the owner
    if (String(userId) === String(creatorId)) {
      return NextResponse.json(
        { error: "Cannot remove the owner from the lab note" },
        { status: 400 }
      )
    }
    
    // Remove the collaborator
    const { error: deleteError } = await supabase
      .from("lab_note_access")
      .delete()
      .eq("lab_note_id", labNoteId)
      .eq("user_id", userId)
    
    if (deleteError) {
      console.error("Error removing collaborator:", deleteError)
      return NextResponse.json(
        { error: "Failed to remove collaborator" },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: "Collaborator removed successfully",
    })
    
  } catch (error) {
    console.error("Error in DELETE collaborator endpoint:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// Update collaborator permission
export async function PATCH(request: NextRequest) {
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
    const { labNoteId, userId, permissionLevel } = body
    
    if (!labNoteId || !userId || !permissionLevel) {
      return NextResponse.json(
        { error: "Lab note ID, user ID, and permission level are required" },
        { status: 400 }
      )
    }
    
    // Validate permission level
    const validPermissions = ['editor', 'viewer']
    if (!validPermissions.includes(permissionLevel)) {
      return NextResponse.json(
        { error: "Invalid permission level" },
        { status: 400 }
      )
    }
    
    // Check if user owns the lab note
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
    
    if (String(creatorId) !== String(user.id)) {
      return NextResponse.json(
        { error: "Only the owner can update collaborator permissions" },
        { status: 403 }
      )
    }
    
    // Cannot modify the owner's permission
    if (String(userId) === String(creatorId)) {
      return NextResponse.json(
        { error: "Cannot modify the owner's permissions" },
        { status: 400 }
      )
    }
    
    // Update the permission
    const { error: updateError } = await supabase
      .from("lab_note_access")
      .update({
        permission_level: permissionLevel,
        updated_at: new Date().toISOString(),
      })
      .eq("lab_note_id", labNoteId)
      .eq("user_id", userId)
    
    if (updateError) {
      console.error("Error updating permission:", updateError)
      return NextResponse.json(
        { error: "Failed to update permission" },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: "Permission updated successfully",
    })
    
  } catch (error) {
    console.error("Error in PATCH collaborator endpoint:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// Helper function to check if user has access to a lab note
async function checkUserAccess(supabase: any, labNoteId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("lab_note_access")
    .select("id")
    .eq("lab_note_id", labNoteId)
    .eq("user_id", userId)
    .maybeSingle()
  
  return !!data && !error
}
