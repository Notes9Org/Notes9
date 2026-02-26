import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin-client"
import { NextRequest, NextResponse } from "next/server"

function splitName(fullName?: string | null): { firstName: string | null; lastName: string | null } {
  const trimmed = (fullName || "").trim()
  if (!trimmed) return { firstName: null, lastName: null }
  const [first, ...rest] = trimmed.split(/\s+/)
  return {
    firstName: first || null,
    lastName: rest.length > 0 ? rest.join(" ") : null,
  }
}

function buildProfile(profile: any, fallbackEmail?: string | null, fallbackName?: string | null) {
  if (!profile && !fallbackEmail && !fallbackName) return null

  const firstName = profile?.first_name ?? null
  const lastName = profile?.last_name ?? null
  const email = profile?.email ?? fallbackEmail ?? null
  const fullName = `${firstName || ""} ${lastName || ""}`.trim()

  return {
    firstName,
    lastName,
    email,
    avatarUrl: profile?.avatar_url ?? null,
    name: fullName || fallbackName || email,
  }
}

async function fetchAuthUserFallbackProfile(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string
) {
  if (!adminClient) return null
  const { data, error } = await adminClient.auth.admin.getUserById(userId)
  if (error || !data?.user) return null

  const metadata = data.user.user_metadata || {}
  const fullName =
    (typeof metadata.full_name === "string" ? metadata.full_name : null) ||
    (typeof metadata.name === "string" ? metadata.name : null)
  const derived = splitName(fullName)

  const firstName =
    (typeof metadata.first_name === "string" ? metadata.first_name : null) ||
    (typeof metadata.given_name === "string" ? metadata.given_name : null) ||
    derived.firstName
  const lastName =
    (typeof metadata.last_name === "string" ? metadata.last_name : null) ||
    (typeof metadata.family_name === "string" ? metadata.family_name : null) ||
    derived.lastName

  const email = data.user.email || null
  if (!email) return null

  return {
    id: userId,
    first_name: firstName,
    last_name: lastName,
    email,
    avatar_url:
      (typeof metadata.avatar_url === "string" ? metadata.avatar_url : null) ||
      (typeof metadata.picture === "string" ? metadata.picture : null),
  }
}

async function resolveCollaboratorPermission(
  supabase: Awaited<ReturnType<typeof createClient>>,
  labNoteId: string,
  userId: string
): Promise<"editor" | "viewer" | "owner" | null> {
  const { data, error } = await supabase.rpc("get_lab_note_permission", {
    p_lab_note_id: labNoteId,
    p_user_id: userId,
  })

  if (error) {
    const message = error.message || ""
    const functionMissing =
      message.includes("get_lab_note_permission") &&
      (message.includes("does not exist") || message.includes("Could not find"))
    if (!functionMissing) {
      console.error("Error resolving collaborator permission via RPC:", error)
    }
    return null
  }

  if (data === "editor" || data === "viewer" || data === "owner") {
    return data
  }

  return null
}

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
      .select("created_by, created_at")
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
    
    // Check if user has any access to this lab note
    const hasAccess = String(creatorId) === String(user.id) || await checkUserAccess(supabase, labNoteId, user.id)
    
    if (!hasAccess) {
      return NextResponse.json(
        { error: "You don't have access to this lab note" },
        { status: 403 }
      )
    }
    
    const isOwner = String(creatorId) === String(user.id)
    const adminClient = createAdminClient()
    const reader = adminClient ?? supabase
    const acceptedInvitationEmailByUserId: Record<string, string> = {}

    if (isOwner) {
      let { data: acceptedEmailRows, error: acceptedEmailRowsError } = await reader
        .from("lab_note_invitations")
        .select("accepted_by, email")
        .eq("lab_note_id", labNoteId)
        .eq("status", "accepted")
        .not("accepted_by", "is", null)

      if (acceptedEmailRowsError && adminClient) {
        const fallback = await supabase
          .from("lab_note_invitations")
          .select("accepted_by, email")
          .eq("lab_note_id", labNoteId)
          .eq("status", "accepted")
          .not("accepted_by", "is", null)
        acceptedEmailRows = fallback.data
        acceptedEmailRowsError = fallback.error
      }

      if (acceptedEmailRowsError) {
        console.error("Error fetching accepted invitation emails:", acceptedEmailRowsError)
      } else if (acceptedEmailRows) {
        acceptedEmailRows.forEach((row: any) => {
          const acceptedBy = String(row.accepted_by || "")
          const invitationEmail = (row.email || "").toLowerCase().trim()
          if (acceptedBy && invitationEmail && !acceptedInvitationEmailByUserId[acceptedBy]) {
            acceptedInvitationEmailByUserId[acceptedBy] = invitationEmail
          }
        })
      }
    }

    // Try to get collaborators from explicit access rows.
    // Some older notes may not have an owner row in lab_note_access yet,
    // so we add an owner fallback below to keep the UI consistent.
    let collaborators: any[] = []
    try {
      let { data: accessRecords, error: accessError } = await reader
        .from("lab_note_access")
        .select(`
          id,
          user_id,
          permission_level,
          granted_at
        `)
        .eq("lab_note_id", labNoteId)
        .order("granted_at", { ascending: true })

      if (accessError && adminClient) {
        const fallback = await supabase
          .from("lab_note_access")
          .select(`
            id,
            user_id,
            permission_level,
            granted_at
          `)
          .eq("lab_note_id", labNoteId)
          .order("granted_at", { ascending: true })
        accessRecords = fallback.data
        accessError = fallback.error
      }
      
      if (accessError) {
        console.error("Error fetching lab_note_access collaborators:", accessError)
      } else if (accessRecords) {
        // Get user IDs from access records
        const userIds = Array.from(
          new Set(
            accessRecords
              .map((r: any) => r.user_id)
              .filter(Boolean)
              .concat([creatorId])
          )
        )
        
        // Fetch profiles separately
        let profilesMap: Record<string, any> = {}
        if (userIds.length > 0) {
          let { data: profiles, error: profilesError } = await reader
            .from("profiles")
            .select("id, first_name, last_name, email, avatar_url")
            .in("id", userIds)

          if (profilesError && adminClient) {
            const fallback = await supabase
              .from("profiles")
              .select("id, first_name, last_name, email, avatar_url")
              .in("id", userIds)
            profiles = fallback.data
            profilesError = fallback.error
          }
          
          if (profilesError) {
            console.error("Error fetching collaborator profiles:", profilesError)
          } else if (profiles) {
            profilesMap = profiles.reduce((acc: any, p: any) => {
              acc[p.id] = p
              return acc
            }, {})
          }

          const missingProfileUserIds = userIds.filter((id) => !profilesMap[id])
          if (missingProfileUserIds.length > 0 && adminClient) {
            const fallbackProfiles = await Promise.all(
              missingProfileUserIds.map((id) => fetchAuthUserFallbackProfile(adminClient, id))
            )
            fallbackProfiles
              .filter(Boolean)
              .forEach((profile: any) => {
                profilesMap[profile.id] = profile
              })
          }
        }
        
        // Format collaborators
        collaborators = accessRecords.map((record: any) => {
          const profile = profilesMap[record.user_id]
          const fallbackEmail =
            acceptedInvitationEmailByUserId[String(record.user_id)] ||
            (String(record.user_id) === String(user.id) ? (user.email ?? null) : null)
          const isOwnerRecord = String(record.user_id) === String(creatorId)
          return {
            id: record.id,
            userId: record.user_id,
            permissionLevel: isOwnerRecord ? "owner" : record.permission_level,
            grantedAt: record.granted_at,
            profile: buildProfile(profile, fallbackEmail),
          }
        })
      }
    } catch (err) {
      console.error("Could not fetch collaborators from lab_note_access:", err)
    }

    // Ensure owner always appears even if lab_note_access is missing owner row.
    const hasOwnerInList = collaborators.some(
      (collaborator) => String(collaborator.userId) === String(creatorId)
    )
    if (!hasOwnerInList) {
      let { data: ownerProfile, error: ownerProfileError } = await reader
        .from("profiles")
        .select("id, first_name, last_name, email, avatar_url")
        .eq("id", creatorId)
        .maybeSingle()

      if (ownerProfileError && adminClient) {
        const fallback = await supabase
          .from("profiles")
          .select("id, first_name, last_name, email, avatar_url")
          .eq("id", creatorId)
          .maybeSingle()
        ownerProfile = fallback.data
        ownerProfileError = fallback.error
      }
      if (ownerProfileError) {
        console.error("Error fetching owner profile:", ownerProfileError)
      }

      if (!ownerProfile && adminClient) {
        ownerProfile = await fetchAuthUserFallbackProfile(adminClient, creatorId)
      }

      const ownerNameFromAuth =
        `${user.user_metadata?.first_name || ''} ${user.user_metadata?.last_name || ''}`.trim() ||
        (typeof user.user_metadata?.name === "string" ? user.user_metadata.name : "") ||
        user.email ||
        "Owner"
      const ownerFallbackEmail =
        ownerProfile?.email ??
        (String(creatorId) === String(user.id) ? (user.email ?? null) : null)

      collaborators.unshift({
        id: `owner-${creatorId}`,
        userId: creatorId,
        permissionLevel: "owner",
        grantedAt: labNote.created_at ?? new Date().toISOString(),
        profile:
          buildProfile(ownerProfile, ownerFallbackEmail, ownerNameFromAuth) ??
          (String(creatorId) === String(user.id)
            ? {
                firstName: user.user_metadata?.first_name ?? null,
                lastName: user.user_metadata?.last_name ?? null,
                email: user.email ?? "owner@example.com",
                avatarUrl: null,
                name: ownerNameFromAuth,
              }
            : null),
      })
    }
    
    // Get pending invitations (only for owner)
    let pendingInvitations: any[] = []
    if (isOwner) {
      try {
        let { data: invitations, error: invitationsError } = await reader
          .from("lab_note_invitations")
          .select("*")
          .eq("lab_note_id", labNoteId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })

        if (invitationsError && adminClient) {
          const fallback = await supabase
            .from("lab_note_invitations")
            .select("*")
            .eq("lab_note_id", labNoteId)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
          invitations = fallback.data
          invitationsError = fallback.error
        }
        
        if (invitationsError) {
          console.error("Error fetching pending invitations:", invitationsError)
        } else {
          pendingInvitations = invitations || []
        }
      } catch (err) {
        console.error("Could not fetch pending invitations:", err)
      }
    }

    // Recovery path for already-accepted invitations that do not yet have a
    // corresponding lab_note_access row.
    if (isOwner) {
      try {
        let { data: acceptedInvitations, error: acceptedInvitationsError } = await reader
          .from("lab_note_invitations")
          .select("id, accepted_by, permission_level, accepted_at, invited_by, email")
          .eq("lab_note_id", labNoteId)
          .eq("status", "accepted")
          .not("accepted_by", "is", null)

        if (acceptedInvitationsError && adminClient) {
          const fallback = await supabase
            .from("lab_note_invitations")
            .select("id, accepted_by, permission_level, accepted_at, invited_by, email")
            .eq("lab_note_id", labNoteId)
            .eq("status", "accepted")
            .not("accepted_by", "is", null)
          acceptedInvitations = fallback.data
          acceptedInvitationsError = fallback.error
        }

        if (acceptedInvitationsError) {
          console.error("Error fetching accepted invitations for recovery:", acceptedInvitationsError)
        } else if (acceptedInvitations && acceptedInvitations.length > 0) {
          const collaboratorUserIds = new Set(
            collaborators.map((collaborator) => String(collaborator.userId))
          )

          const missingAccepted = acceptedInvitations.filter(
            (invitation: any) =>
              invitation.accepted_by &&
              !collaboratorUserIds.has(String(invitation.accepted_by))
          )

          if (missingAccepted.length > 0) {
            const missingUserIds = Array.from(
              new Set(missingAccepted.map((invitation: any) => String(invitation.accepted_by)))
            )

            let recoveredProfilesMap: Record<string, any> = {}
            let { data: recoveredProfiles, error: recoveredProfilesError } = await reader
              .from("profiles")
              .select("id, first_name, last_name, email, avatar_url")
              .in("id", missingUserIds)

            if (recoveredProfilesError && adminClient) {
              const fallback = await supabase
                .from("profiles")
                .select("id, first_name, last_name, email, avatar_url")
                .in("id", missingUserIds)
              recoveredProfiles = fallback.data
              recoveredProfilesError = fallback.error
            }

            if (recoveredProfilesError) {
              console.error("Error fetching recovered collaborator profiles:", recoveredProfilesError)
            } else if (recoveredProfiles) {
              recoveredProfilesMap = recoveredProfiles.reduce((acc: any, profile: any) => {
                acc[profile.id] = profile
                return acc
              }, {})
            }

            if (adminClient) {
              const missingFromProfiles = missingUserIds.filter((id) => !recoveredProfilesMap[id])
              if (missingFromProfiles.length > 0) {
                const authFallbackProfiles = await Promise.all(
                  missingFromProfiles.map((id) => fetchAuthUserFallbackProfile(adminClient, id))
                )
                authFallbackProfiles
                  .filter(Boolean)
                  .forEach((profile: any) => {
                    recoveredProfilesMap[profile.id] = profile
                  })
              }
            }

            await Promise.all(missingAccepted.map(async (invitation: any, index: number) => {
              const acceptedBy = String(invitation.accepted_by)

              if (adminClient) {
                const repairResult = await adminClient
                  .from("lab_note_access")
                  .upsert(
                    {
                      lab_note_id: labNoteId,
                      user_id: acceptedBy,
                      permission_level: invitation.permission_level,
                      granted_by: invitation.invited_by ?? creatorId,
                    },
                    { onConflict: "lab_note_id,user_id" }
                  )
                if (repairResult?.error) {
                  console.error("Error repairing missing lab_note_access row:", repairResult.error)
                }
              }

              const profile = recoveredProfilesMap[acceptedBy]
              const fallbackEmail =
                acceptedInvitationEmailByUserId[acceptedBy] ||
                (invitation.email || "").toLowerCase().trim() ||
                null
              collaborators.push({
                id: `accepted-${invitation.id}-${index}`,
                userId: acceptedBy,
                permissionLevel: invitation.permission_level,
                grantedAt: invitation.accepted_at ?? new Date().toISOString(),
                profile: buildProfile(profile, fallbackEmail),
              })
            }))
          }
        }
      } catch (recoveryError) {
        console.error("Error during accepted invitation recovery:", recoveryError)
      }
    }
    
    if (isOwner && collaborators.length > 0) {
      collaborators = await Promise.all(
        collaborators.map(async (collaborator) => {
          if (String(collaborator.userId) === String(creatorId)) {
            return collaborator
          }

          const effectivePermission = await resolveCollaboratorPermission(
            supabase,
            labNoteId,
            collaborator.userId
          )

          if (!effectivePermission || effectivePermission === "owner") {
            return collaborator
          }

          return {
            ...collaborator,
            permissionLevel: effectivePermission,
          }
        })
      )
    }

    return NextResponse.json(
      {
        collaborators,
        pendingInvitations,
        isOwner,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    )
    
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
    const adminClient = createAdminClient()
    
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

    // Preferred path: security-definer RPC to avoid table grant/RLS drift.
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "remove_lab_note_collaborator",
      {
        p_lab_note_id: labNoteId,
        p_user_id: userId,
      }
    )

    if (!rpcError && rpcResult?.success) {
      return NextResponse.json({
        success: true,
        message: "Collaborator removed successfully",
      })
    }

    if (!rpcError && rpcResult?.error) {
      return NextResponse.json(
        { error: rpcResult.error },
        { status: 400 }
      )
    }

    if (rpcError) {
      const rpcMessage = rpcError.message || ""
      const functionMissing =
        rpcMessage.includes("remove_lab_note_collaborator") &&
        (rpcMessage.includes("does not exist") || rpcMessage.includes("Could not find"))
      if (!functionMissing) {
        console.error("remove_lab_note_collaborator RPC failed, using fallback:", rpcError)
      }
    }
    
    // Remove collaborator access row (owner-scoped client first to honor RLS).
    let { error: deleteError } = await supabase
      .from("lab_note_access")
      .delete()
      .eq("lab_note_id", labNoteId)
      .eq("user_id", userId)

    if (deleteError && adminClient) {
      const fallbackDelete = await adminClient
        .from("lab_note_access")
        .delete()
        .eq("lab_note_id", labNoteId)
        .eq("user_id", userId)
      deleteError = fallbackDelete.error
    }
    
    if (deleteError) {
      console.error("Error removing collaborator:", deleteError)
      return NextResponse.json(
        {
          error: "Failed to remove collaborator",
          details:
            deleteError.message?.includes("permission denied")
              ? `${deleteError.message}. Ensure latest collaboration migrations are applied.`
              : deleteError.message,
        },
        { status: 500 }
      )
    }

    // Keep collaborator state consistent:
    // if a previous acceptance exists, revoke it so recovery logic does not re-add.
    const now = new Date().toISOString()
    let targetEmail: string | null = null

    let { data: profileRow, error: profileLookupError } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle()

    if (profileLookupError && adminClient) {
      const fallbackProfile = await adminClient
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .maybeSingle()
      profileRow = fallbackProfile.data
      profileLookupError = fallbackProfile.error
    }
    if (profileLookupError) {
      console.error("Error looking up collaborator profile email:", profileLookupError)
    }
    targetEmail = profileRow?.email ?? null

    if (!targetEmail && adminClient) {
      const { data: authUser } = await adminClient.auth.admin.getUserById(userId)
      targetEmail = authUser?.user?.email ?? null
    }

    let revokeByAcceptedBy = await supabase
      .from("lab_note_invitations")
      .update({ status: "revoked", updated_at: now })
      .eq("lab_note_id", labNoteId)
      .eq("accepted_by", userId)
      .in("status", ["accepted"])

    if (revokeByAcceptedBy.error && adminClient) {
      revokeByAcceptedBy = await adminClient
        .from("lab_note_invitations")
        .update({ status: "revoked", updated_at: now })
        .eq("lab_note_id", labNoteId)
        .eq("accepted_by", userId)
        .in("status", ["accepted"])
    }

    if (revokeByAcceptedBy.error) {
      console.error("Error revoking accepted invitations by accepted_by:", revokeByAcceptedBy.error)
    }

    if (targetEmail) {
      const normalizedEmail = targetEmail.toLowerCase().trim()
      let revokeByEmail = await supabase
        .from("lab_note_invitations")
        .update({ status: "revoked", updated_at: now })
        .eq("lab_note_id", labNoteId)
        .ilike("email", normalizedEmail)
        .in("status", ["pending", "accepted"])

      if (revokeByEmail.error && adminClient) {
        revokeByEmail = await adminClient
          .from("lab_note_invitations")
          .update({ status: "revoked", updated_at: now })
          .eq("lab_note_id", labNoteId)
          .ilike("email", normalizedEmail)
          .in("status", ["pending", "accepted"])
      }

      if (revokeByEmail.error) {
        console.error("Error revoking invitations by collaborator email:", revokeByEmail.error)
      }
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
    const adminClient = createAdminClient()
    
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

    // Preferred path: security-definer RPC to avoid table grant/RLS drift.
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "update_lab_note_collaborator_permission",
      {
        p_lab_note_id: labNoteId,
        p_user_id: userId,
        p_permission_level: permissionLevel,
      }
    )

    if (!rpcError && rpcResult?.success) {
      return NextResponse.json({
        success: true,
        message: "Permission updated successfully",
      })
    }

    if (!rpcError && rpcResult?.error) {
      const status = rpcResult.error === "Collaborator not found" ? 404 : 400
      return NextResponse.json(
        { error: rpcResult.error },
        { status }
      )
    }

    if (rpcError) {
      const rpcMessage = rpcError.message || ""
      const functionMissing =
        rpcMessage.includes("update_lab_note_collaborator_permission") &&
        (rpcMessage.includes("does not exist") || rpcMessage.includes("Could not find"))
      if (!functionMissing) {
        console.error("update_lab_note_collaborator_permission RPC failed, using fallback:", rpcError)
      }
    }

    const now = new Date().toISOString()

    // Update the permission (user-scoped first; fallback to admin client).
    let { data: updatedAccessRow, error: updateError } = await supabase
      .from("lab_note_access")
      .update({
        permission_level: permissionLevel,
        updated_at: now,
      })
      .eq("lab_note_id", labNoteId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle()

    if (updateError && adminClient) {
      const fallback = await adminClient
        .from("lab_note_access")
        .update({
          permission_level: permissionLevel,
          updated_at: now,
        })
        .eq("lab_note_id", labNoteId)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle()
      updatedAccessRow = fallback.data
      updateError = fallback.error
    }

    if (updateError) {
      console.error("Error updating permission:", updateError)
      return NextResponse.json(
        {
          error: "Failed to update permission",
          details: updateError.message,
        },
        { status: 500 }
      )
    }

    // If no access row exists (older acceptance flows), repair from accepted invitation.
    if (!updatedAccessRow) {
      let { data: acceptedInvitation, error: acceptedInvitationError } = await supabase
        .from("lab_note_invitations")
        .select("id")
        .eq("lab_note_id", labNoteId)
        .eq("accepted_by", userId)
        .eq("status", "accepted")
        .order("accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (acceptedInvitationError && adminClient) {
        const fallback = await adminClient
          .from("lab_note_invitations")
          .select("id")
          .eq("lab_note_id", labNoteId)
          .eq("accepted_by", userId)
          .eq("status", "accepted")
          .order("accepted_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        acceptedInvitation = fallback.data
        acceptedInvitationError = fallback.error
      }

      if (acceptedInvitationError) {
        console.error("Error checking accepted invitation for permission repair:", acceptedInvitationError)
      }

      if (!acceptedInvitation) {
        return NextResponse.json(
          { error: "Collaborator not found" },
          { status: 404 }
        )
      }

      let { error: upsertError } = await supabase
        .from("lab_note_access")
        .upsert(
          {
            lab_note_id: labNoteId,
            user_id: userId,
            permission_level: permissionLevel,
            granted_by: creatorId,
            updated_at: now,
          },
          { onConflict: "lab_note_id,user_id" }
        )

      if (upsertError && adminClient) {
        const fallback = await adminClient
          .from("lab_note_access")
          .upsert(
            {
              lab_note_id: labNoteId,
              user_id: userId,
              permission_level: permissionLevel,
              granted_by: creatorId,
              updated_at: now,
            },
            { onConflict: "lab_note_id,user_id" }
          )
        upsertError = fallback.error
      }

      if (upsertError) {
        console.error("Error repairing missing collaborator access during permission update:", upsertError)
        return NextResponse.json(
          {
            error: "Failed to update permission",
            details: upsertError.message,
          },
          { status: 500 }
        )
      }
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
