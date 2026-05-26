"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { useToast } from "@/hooks/use-toast"
import { AlertCircle, CheckCircle2, Mail } from "lucide-react"
import { Notes9Brand } from "@/components/brand/notes9-brand"

type InvitationDetails = {
  id: string
  organization_id: string
  email: string
  status: string
  expires_at: string | null
  org_name: string
  role_name: string
}

type PageState =
  | { kind: "loading" }
  | { kind: "error"; title: string; message: string }
  | { kind: "ready"; invitation: InvitationDetails }
  | { kind: "accepting" }
  | { kind: "success"; roleName: string }

function InviteAcceptContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  const token = searchParams.get("token")

  const [state, setState] = useState<PageState>({ kind: "loading" })

  useEffect(() => {
    if (!token) {
      setState({
        kind: "error",
        title: "Missing Invitation",
        message: "No invitation token was provided. Please check your invitation link.",
      })
      return
    }

    async function loadInvitation() {
      const supabase = createClient()

      // Check auth status first
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        // Unauthenticated — redirect to sign-up with token preserved
        router.replace(`/auth/sign-up?token=${encodeURIComponent(token!)}`)
        return
      }

      // Fetch invitation details by token, joining org name and role name
      const { data: invitation, error } = await supabase
        .from("org_invitations")
        .select(
          `
          id,
          organization_id,
          email,
          status,
          expires_at,
          organizations!inner(name),
          org_roles!inner(name)
        `
        )
        .eq("token", token!)
        .single()

      if (error || !invitation) {
        setState({
          kind: "error",
          title: "Invalid Invitation",
          message:
            "This invitation link is invalid. It may have been revoked or does not exist.",
        })
        return
      }

      // Check status
      if (invitation.status !== "pending" && invitation.status !== "sent") {
        const statusMessages: Record<string, { title: string; message: string }> = {
          accepted: {
            title: "Already Accepted",
            message: "This invitation has already been accepted.",
          },
          revoked: {
            title: "Invitation Revoked",
            message:
              "This invitation has been revoked by the organization admin.",
          },
          expired: {
            title: "Invitation Expired",
            message:
              "This invitation has expired. Please ask the admin to send a new one.",
          },
          failed: {
            title: "Invitation Error",
            message:
              "There was an issue with this invitation. Please ask the admin to resend it.",
          },
        }
        const info = statusMessages[invitation.status] ?? {
          title: "Invalid Invitation",
          message: "This invitation is no longer valid.",
        }
        setState({ kind: "error", ...info })
        return
      }

      // Check expiration
      if (
        invitation.expires_at &&
        new Date(invitation.expires_at) < new Date()
      ) {
        setState({
          kind: "error",
          title: "Invitation Expired",
          message:
            "This invitation has expired. Please ask the admin to send a new one.",
        })
        return
      }

      // Extract joined fields
      const orgData = invitation.organizations as unknown as { name: string }
      const roleData = invitation.org_roles as unknown as { name: string }

      setState({
        kind: "ready",
        invitation: {
          id: invitation.id,
          organization_id: invitation.organization_id,
          email: invitation.email,
          status: invitation.status,
          expires_at: invitation.expires_at,
          org_name: orgData.name,
          role_name: roleData.name,
        },
      })
    }

    loadInvitation()
  }, [token, router])

  async function handleAccept() {
    if (state.kind !== "ready") return
    setState({ kind: "accepting" })

    try {
      const res = await fetch("/api/org/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        const errorMessage = data?.error || "Failed to accept invitation"

        // Handle specific conflict: user already in another org
        if (res.status === 409) {
          setState({
            kind: "error",
            title: "Organization Conflict",
            message: errorMessage,
          })
          return
        }

        // Other errors (invalid token, expired, etc.)
        setState({
          kind: "error",
          title: "Could Not Accept",
          message: errorMessage,
        })
        return
      }

      setState({ kind: "success", roleName: data.roleName })

      toast({
        title: "Welcome!",
        description: `You've joined as ${data.roleName}.`,
      })

      // Redirect to dashboard after a brief moment
      setTimeout(() => {
        router.push("/dashboard")
      }, 1500)
    } catch {
      setState({
        kind: "error",
        title: "Something Went Wrong",
        message: "An unexpected error occurred. Please try again.",
      })
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <Notes9Brand
              stacked
              iconClassName="h-[60px] w-[60px]"
              textClassName="h-10 w-auto"
            />
          </div>

          {state.kind === "loading" && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Spinner className="h-8 w-8 mb-4" />
                <p className="text-sm text-muted-foreground">
                  Loading invitation details...
                </p>
              </CardContent>
            </Card>
          )}

          {state.kind === "error" && (
            <Card>
              <CardHeader className="text-center">
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                  <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
                <CardTitle className="text-xl">{state.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-center text-muted-foreground">
                  {state.message}
                </p>
                <Button
                  asChild
                  className="w-full cursor-pointer"
                  variant="outline"
                >
                  <a href="/dashboard">Go to Dashboard</a>
                </Button>
              </CardContent>
            </Card>
          )}

          {state.kind === "ready" && (
            <Card>
              <CardHeader className="text-center">
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Mail className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl">
                  You&apos;re Invited!
                </CardTitle>
                <CardDescription>
                  You&apos;ve been invited to join an organization on Notes9.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Organization
                    </span>
                    <span className="text-sm font-medium">
                      {state.invitation.org_name}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Role</span>
                    <span className="text-sm font-medium">
                      {state.invitation.role_name}
                    </span>
                  </div>
                </div>
                <Button
                  onClick={handleAccept}
                  className="w-full cursor-pointer"
                >
                  Accept Invitation
                </Button>
              </CardContent>
            </Card>
          )}

          {state.kind === "accepting" && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Spinner className="h-8 w-8 mb-4" />
                <p className="text-sm text-muted-foreground">
                  Accepting invitation...
                </p>
              </CardContent>
            </Card>
          )}

          {state.kind === "success" && (
            <Card>
              <CardHeader className="text-center">
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                  <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle className="text-xl">Welcome Aboard!</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-center text-muted-foreground">
                  You&apos;ve successfully joined as{" "}
                  <span className="font-medium text-foreground">
                    {state.roleName}
                  </span>
                  . Redirecting to your dashboard...
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export default function InviteAcceptPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen w-full items-center justify-center p-6 bg-background">
          <Spinner className="h-8 w-8" />
        </div>
      }
    >
      <InviteAcceptContent />
    </Suspense>
  )
}
