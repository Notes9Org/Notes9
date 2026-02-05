"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "./use-toast"

export interface PendingInvitation {
  id: string
  lab_note_id: string
  email: string
  permission_level: 'editor' | 'viewer'
  status: string
  expires_at: string
  created_at: string
  token: string
  lab_note: {
    title: string
    experiment_id: string
  } | null
  inviter: {
    first_name: string | null
    last_name: string | null
    email: string
  } | null
}

export function usePendingInvitations() {
  const { toast } = useToast()
  const [invitations, setInvitations] = useState<PendingInvitation[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchInvitations = useCallback(async () => {
    setIsLoading(true)
    try {
      const supabase = createClient()
      
      // Get current user's email
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) {
        setInvitations([])
        setIsLoading(false)
        return
      }

      // Fetch pending invitations for this email
      const { data, error } = await supabase
        .from('lab_note_invitations')
        .select(`
          *,
          lab_note:lab_notes(title, experiment_id),
          inviter:profiles!lab_note_invitations_invited_by_fkey(first_name, last_name, email)
        `)
        .eq('email', user.email.toLowerCase())
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })

      if (error) {
        throw error
      }

      setInvitations(data || [])
    } catch (error: any) {
      console.error("Error fetching invitations:", error)
      toast({
        title: "Error",
        description: "Failed to load invitations",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchInvitations()
  }, [fetchInvitations])

  const acceptInvitation = useCallback(async (token: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/lab-notes/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to accept invitation")
      }

      const data = await response.json()
      
      toast({
        title: "Invitation accepted",
        description: "You now have access to this lab note",
      })

      // Remove from local state
      setInvitations(prev => prev.filter(inv => inv.token !== token))
      
      return true
    } catch (error: any) {
      console.error("Error accepting invitation:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to accept invitation",
        variant: "destructive",
      })
      return false
    }
  }, [toast])

  const declineInvitation = useCallback(async (invitationId: string): Promise<boolean> => {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from('lab_note_invitations')
        .update({ status: 'revoked', updated_at: new Date().toISOString() })
        .eq('id', invitationId)

      if (error) {
        throw error
      }

      toast({
        title: "Invitation declined",
        description: "The invitation has been declined",
      })

      // Remove from local state
      setInvitations(prev => prev.filter(inv => inv.id !== invitationId))
      
      return true
    } catch (error: any) {
      console.error("Error declining invitation:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to decline invitation",
        variant: "destructive",
      })
      return false
    }
  }, [toast])

  return {
    invitations,
    isLoading,
    refresh: fetchInvitations,
    acceptInvitation,
    declineInvitation,
  }
}
