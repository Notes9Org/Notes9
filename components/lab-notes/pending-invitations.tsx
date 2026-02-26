"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { usePendingInvitations } from "@/hooks/use-pending-invitations"
import { Mail, Check, X, Loader2, FileText, User } from "lucide-react"
import { useState } from "react"
import Link from "next/link"

export function PendingInvitations() {
  const { invitations, isLoading, acceptInvitation, declineInvitation } = usePendingInvitations()
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [action, setAction] = useState<'accept' | 'decline' | null>(null)

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading invitations...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (invitations.length === 0) {
    return null
  }

  const handleAccept = async (token: string, id: string) => {
    setProcessingId(id)
    setAction('accept')
    await acceptInvitation(token)
    setProcessingId(null)
    setAction(null)
  }

  const handleDecline = async (id: string) => {
    setProcessingId(id)
    setAction('decline')
    await declineInvitation(id)
    setProcessingId(null)
    setAction(null)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <CardTitle>Pending Invitations</CardTitle>
        </div>
        <CardDescription>
          You have {invitations.length} pending invitation{invitations.length !== 1 ? 's' : ''} to collaborate on lab notes
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {invitations.map((invitation) => (
            <div
              key={invitation.id}
              className="flex items-start justify-between p-3 rounded-lg border bg-muted/50"
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium">
                    {invitation.lab_note?.title || 'Untitled Lab Note'}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {invitation.permission_level === 'editor' ? 'Can edit' : 'Can view'}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <User className="h-3 w-3" />
                      From {invitation.inviter?.first_name || invitation.inviter?.email}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Expires {new Date(invitation.expires_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => handleDecline(invitation.id)}
                  disabled={processingId === invitation.id}
                >
                  {processingId === invitation.id && action === 'decline' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => handleAccept(invitation.token, invitation.id)}
                  disabled={processingId === invitation.id}
                >
                  {processingId === invitation.id && action === 'accept' ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-1" />
                  )}
                  Accept
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
