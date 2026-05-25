"use client"

import { useState } from "react"
import { XCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"

export interface OrgInvitation {
  id: string
  email: string
  roleName: string
  status: "pending" | "sent" | "accepted" | "revoked" | "expired" | "failed"
  createdAt: string
}

interface InvitationsTableProps {
  invitations: OrgInvitation[]
  isAdmin: boolean
  onInvitationRevoked: (invitationId: string) => void
}

const statusVariantMap: Record<OrgInvitation["status"], "default" | "secondary" | "success" | "destructive"> = {
  pending: "default",
  sent: "secondary",
  accepted: "success",
  revoked: "destructive",
  expired: "destructive",
  failed: "destructive",
}

function formatSentDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return dateString
  }
}

function isRevocable(status: OrgInvitation["status"]): boolean {
  return status === "pending" || status === "sent"
}

export function InvitationsTable({ invitations, isAdmin, onInvitationRevoked }: InvitationsTableProps) {
  const { toast } = useToast()
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [confirmInvitation, setConfirmInvitation] = useState<OrgInvitation | null>(null)

  async function handleRevoke(invitation: OrgInvitation) {
    setRevokingId(invitation.id)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("org_invitations")
        .update({ status: "revoked" })
        .eq("id", invitation.id)

      if (error) {
        toast({
          title: "Error",
          description: error.message || "Failed to revoke invitation",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Invitation revoked",
        description: `The invitation to ${invitation.email} has been revoked.`,
      })
      onInvitationRevoked(invitation.id)
    } catch {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      })
    } finally {
      setRevokingId(null)
      setConfirmInvitation(null)
    }
  }

  if (invitations.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        No invitations found.
      </p>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Sent</TableHead>
            {isAdmin && <TableHead className="w-[80px]">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((invitation) => (
            <TableRow key={invitation.id}>
              <TableCell className="font-medium">{invitation.email}</TableCell>
              <TableCell>{invitation.roleName}</TableCell>
              <TableCell>
                <Badge variant={statusVariantMap[invitation.status]}>
                  {invitation.status}
                </Badge>
              </TableCell>
              <TableCell>{formatSentDate(invitation.createdAt)}</TableCell>
              {isAdmin && (
                <TableCell>
                  {isRevocable(invitation.status) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="cursor-pointer text-destructive hover:text-destructive"
                      disabled={revokingId === invitation.id}
                      onClick={() => setConfirmInvitation(invitation)}
                      aria-label={`Revoke invitation for ${invitation.email}`}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog
        open={!!confirmInvitation}
        onOpenChange={(open) => {
          if (!open) setConfirmInvitation(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke the invitation for{" "}
              <span className="font-medium">{confirmInvitation?.email}</span>?
              They will no longer be able to join the organization using this
              invitation link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={revokingId !== null}
              onClick={() => {
                if (confirmInvitation) handleRevoke(confirmInvitation)
              }}
            >
              {revokingId ? "Revoking..." : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
