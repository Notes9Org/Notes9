"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, CheckCircle, XCircle, FileText, ArrowLeft } from "lucide-react"
import Link from "next/link"

interface InvitationDetails {
  valid: boolean
  invitation: {
    id: string
    labNoteId: string
    labNoteTitle: string
    email: string
    permissionLevel: string
    expiresAt: string
    inviter: {
      name: string
      email: string
    } | null
  }
}

function AcceptInviteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [isLoading, setIsLoading] = useState(true)
  const [isAccepting, setIsAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invitation, setInvitation] = useState<InvitationDetails["invitation"] | null>(null)
  const [isAccepted, setIsAccepted] = useState(false)
  const [user, setUser] = useState<any>(null)

  const supabase = createClient()

  // Check authentication and fetch invitation details
  useEffect(() => {
    const checkAuthAndFetchInvitation = async () => {
      if (!token) {
        setError("No invitation token provided")
        setIsLoading(false)
        return
      }

      try {
        // Check if user is authenticated
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        setUser(currentUser)

        // Fetch invitation details
        const response = await fetch(`/api/lab-notes/accept-invite?token=${token}`)
        const data = await response.json()

        if (!response.ok) {
          setError(data.error || "Invalid invitation")
          setIsLoading(false)
          return
        }

        setInvitation(data.invitation)
        setIsLoading(false)
      } catch (err) {
        console.error("Error checking invitation:", err)
        setError("Failed to load invitation details")
        setIsLoading(false)
      }
    }

    checkAuthAndFetchInvitation()
  }, [token])

  const handleAccept = async () => {
    if (!token) return

    setIsAccepting(true)
    try {
      const response = await fetch('/api/lab-notes/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Failed to accept invitation")
        setIsAccepting(false)
        return
      }

      setIsAccepted(true)
      setIsAccepting(false)

      // Redirect after a short delay
      setTimeout(() => {
        if (data.labNoteId) {
          router.push(`/experiments?noteId=${data.labNoteId}`)
        } else {
          router.push('/lab-notes')
        }
      }, 2000)
    } catch (err) {
      console.error("Error accepting invitation:", err)
      setError("Failed to accept invitation")
      setIsAccepting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading invitation...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <XCircle className="h-6 w-6 text-destructive" />
              <CardTitle>Invalid Invitation</CardTitle>
            </div>
            <CardDescription>
              We couldn&apos;t process your invitation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <div className="mt-6 flex justify-center">
              <Link href="/lab-notes">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Go to Lab Notes
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isAccepted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-6 w-6 text-green-500" />
              <CardTitle>Invitation Accepted!</CardTitle>
            </div>
            <CardDescription>
              You now have access to this lab note
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertTitle>{invitation?.labNoteTitle}</AlertTitle>
              <AlertDescription>
                You have been granted {invitation?.permissionLevel} access to this lab note.
              </AlertDescription>
            </Alert>
            <p className="text-sm text-muted-foreground text-center">
              Redirecting you to the lab note...
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            <CardTitle>Lab Note Invitation</CardTitle>
          </div>
          <CardDescription>
            You&apos;ve been invited to collaborate on a lab note
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {invitation && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-semibold text-lg">{invitation.labNoteTitle}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Invited by {invitation.inviter?.name || invitation.inviter?.email || 'Unknown'}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-sm">Permission level:</span>
                  <span className="text-sm font-medium px-2 py-0.5 bg-primary/10 rounded">
                    {invitation.permissionLevel === 'editor' ? 'Can edit' : 'Can view'}
                  </span>
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {!user ? (
                <div className="space-y-3">
                  <Alert>
                    <AlertDescription>
                      You need to sign in to accept this invitation.
                      Make sure to sign in with the email address: <strong>{invitation.email}</strong>
                    </AlertDescription>
                  </Alert>
                  <div className="flex gap-2">
                    <Link href="/login" className="flex-1">
                      <Button className="w-full">Sign In</Button>
                    </Link>
                    <Link href="/signup" className="flex-1">
                      <Button variant="outline" className="w-full">Sign Up</Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button 
                    onClick={handleAccept} 
                    disabled={isAccepting}
                    className="w-full"
                  >
                    {isAccepting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Accepting...
                      </>
                    ) : (
                      "Accept Invitation"
                    )}
                  </Button>
                  <Link href="/lab-notes" className="block">
                    <Button variant="outline" className="w-full">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Go to Lab Notes
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    }>
      <AcceptInviteContent />
    </Suspense>
  )
}
