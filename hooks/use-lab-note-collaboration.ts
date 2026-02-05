"use client"

import { useState, useCallback, useEffect } from "react"
import { useToast } from "./use-toast"

export type PermissionLevel = 'owner' | 'editor' | 'viewer'

export interface Collaborator {
  id: string
  userId: string
  permissionLevel: PermissionLevel
  grantedAt: string
  profile: {
    firstName: string | null
    lastName: string | null
    email: string
    avatarUrl: string | null
    name: string
  } | null
}

export interface PendingInvitation {
  id: string
  lab_note_id: string
  email: string
  permission_level: PermissionLevel
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  expires_at: string
  created_at: string
}

export interface UseLabNoteCollaborationReturn {
  collaborators: Collaborator[]
  pendingInvitations: PendingInvitation[]
  isLoading: boolean
  isOwner: boolean
  inviteCollaborator: (email: string, permissionLevel: Exclude<PermissionLevel, 'owner'>) => Promise<boolean>
  removeCollaborator: (userId: string) => Promise<boolean>
  updatePermission: (userId: string, permissionLevel: Exclude<PermissionLevel, 'owner'>) => Promise<boolean>
  revokeInvitation: (invitationId: string) => Promise<boolean>
  refreshCollaborators: () => Promise<void>
}

export function useLabNoteCollaboration(labNoteId: string | null): UseLabNoteCollaborationReturn {
  const { toast } = useToast()
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOwner, setIsOwner] = useState(false)

  const fetchCollaborators = useCallback(async () => {
    if (!labNoteId) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/lab-notes/collaborators?labNoteId=${labNoteId}`)
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to fetch collaborators")
      }

      const data = await response.json()
      console.log("Collaborators API response:", data)
      if (data.debug) {
        console.log("Debug - creatorId:", data.debug.creatorId)
        console.log("Debug - userId:", data.debug.userId)
        console.log("Debug - match:", data.debug.match)
      }
      setCollaborators(data.collaborators || [])
      setPendingInvitations(data.pendingInvitations || [])
      setIsOwner(data.isOwner || false)
    } catch (error: any) {
      console.error("Error fetching collaborators:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to load collaborators",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [labNoteId, toast])

  // Fetch collaborators when labNoteId changes
  useEffect(() => {
    if (labNoteId) {
      fetchCollaborators()
    } else {
      setCollaborators([])
      setPendingInvitations([])
      setIsOwner(false)
    }
  }, [labNoteId, fetchCollaborators])

  const inviteCollaborator = useCallback(async (
    email: string,
    permissionLevel: Exclude<PermissionLevel, 'owner'>
  ): Promise<boolean> => {
    if (!labNoteId) return false

    try {
      const response = await fetch('/api/lab-notes/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          labNoteId,
          email,
          permissionLevel,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to send invitation")
      }

      const data = await response.json()
      
      toast({
        title: "Invitation sent",
        description: `An invitation has been sent to ${email}`,
      })

      // Refresh the list
      await fetchCollaborators()
      return true
    } catch (error: any) {
      console.error("Error inviting collaborator:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation",
        variant: "destructive",
      })
      return false
    }
  }, [labNoteId, fetchCollaborators, toast])

  const removeCollaborator = useCallback(async (userId: string): Promise<boolean> => {
    if (!labNoteId) return false

    try {
      const response = await fetch(`/api/lab-notes/collaborators?labNoteId=${labNoteId}&userId=${userId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to remove collaborator")
      }

      toast({
        title: "Collaborator removed",
        description: "The collaborator has been removed from this lab note",
      })

      // Refresh the list
      await fetchCollaborators()
      return true
    } catch (error: any) {
      console.error("Error removing collaborator:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to remove collaborator",
        variant: "destructive",
      })
      return false
    }
  }, [labNoteId, fetchCollaborators, toast])

  const updatePermission = useCallback(async (
    userId: string,
    permissionLevel: Exclude<PermissionLevel, 'owner'>
  ): Promise<boolean> => {
    if (!labNoteId) return false

    try {
      const response = await fetch('/api/lab-notes/collaborators', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          labNoteId,
          userId,
          permissionLevel,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to update permission")
      }

      toast({
        title: "Permission updated",
        description: `Collaborator permission has been updated to ${permissionLevel}`,
      })

      // Refresh the list
      await fetchCollaborators()
      return true
    } catch (error: any) {
      console.error("Error updating permission:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to update permission",
        variant: "destructive",
      })
      return false
    }
  }, [labNoteId, fetchCollaborators, toast])

  const revokeInvitation = useCallback(async (invitationId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/lab-notes/invite?invitationId=${invitationId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to revoke invitation")
      }

      toast({
        title: "Invitation revoked",
        description: "The invitation has been revoked",
      })

      // Refresh the list
      await fetchCollaborators()
      return true
    } catch (error: any) {
      console.error("Error revoking invitation:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to revoke invitation",
        variant: "destructive",
      })
      return false
    }
  }, [fetchCollaborators, toast])

  return {
    collaborators,
    pendingInvitations,
    isLoading,
    isOwner,
    inviteCollaborator,
    removeCollaborator,
    updatePermission,
    revokeInvitation,
    refreshCollaborators: fetchCollaborators,
  }
}
