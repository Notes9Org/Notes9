import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin-client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

const DOCUMENT_ROUTE_PREFIX = "/documents"
const LAB_NOTES_ROUTE = "/lab-notes"

type InvitationRole = "owner" | "editor" | "viewer"

function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase()
}

function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div className="max-w-xl mx-auto py-12">
      <Alert variant="destructive">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <p>{message}</p>
          <p>
            <Link href="/" className="underline">Go back home</Link>
          </p>
        </AlertDescription>
      </Alert>
    </div>
  )
}

function InfoState({ title, message, docId }: { title: string; message: string; docId?: string }) {
  return (
    <div className="max-w-xl mx-auto py-12">
      <Alert>
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <p>{message}</p>
          {docId ? (
            <p>
              <Link href={`${DOCUMENT_ROUTE_PREFIX}/${docId}`} className="underline">
                View document
              </Link>
            </p>
          ) : (
            <p>
              <Link href="/" className="underline">Go back home</Link>
            </p>
          )}
        </AlertDescription>
      </Alert>
    </div>
  )
}

export default async function InviteAcceptPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect("/auth/login")
  }

  const metadata = user.user_metadata ?? {}
  const labNoteInvitationId =
    typeof metadata.labNoteInvitationId === "string"
      ? metadata.labNoteInvitationId
      : null
  const invitationId =
    typeof metadata.invitationId === "string"
      ? metadata.invitationId
      : null

  if (!labNoteInvitationId && !invitationId) {
    return (
      <ErrorState
        title="No invitation found"
        message="This account does not have a pending invitation attached. Ask the document owner to resend the invite."
      />
    )
  }

  const adminClient = createAdminClient()
  if (!adminClient) {
    return (
      <ErrorState
        title="Server configuration error"
        message="Supabase service role key is missing. Please contact support."
      />
    )
  }

  if (labNoteInvitationId) {
    const { data: invitation, error: invitationError } = await adminClient
      .from("lab_note_invitations")
      .select(`
        id,
        lab_note_id,
        email,
        permission_level,
        status,
        expires_at,
        invited_by,
        accepted_at,
        lab_note:lab_notes(experiment_id)
      `)
      .eq("id", labNoteInvitationId)
      .maybeSingle()

    if (invitationError || !invitation) {
      return (
        <ErrorState
          title="Invitation not found"
          message="We could not locate this invitation. It may have been revoked."
        />
      )
    }

    if (invitation.accepted_at || invitation.status === "accepted") {
      return (
        <InfoState
          title="Invitation already accepted"
          message="You already accepted this invitation."
        />
      )
    }

    const expiresAt = new Date(invitation.expires_at)
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt < new Date()) {
      return (
        <ErrorState
          title="Invitation expired"
          message="This invitation has expired. Ask the lab note owner to resend it."
        />
      )
    }

    const userEmail = user.email ? normalizeEmail(user.email) : null
    if (!userEmail || userEmail !== normalizeEmail(invitation.email)) {
      return (
        <ErrorState
          title="Email mismatch"
          message="Please sign in with the email address that received this invitation."
        />
      )
    }

    const permissionLevel = invitation.permission_level as InvitationRole
    if (!permissionLevel || !["owner", "editor", "viewer"].includes(permissionLevel)) {
      return (
        <ErrorState
          title="Invalid invitation"
          message="This invitation has an invalid role. Ask the lab note owner to resend it."
        />
      )
    }

    const nowIso = new Date().toISOString()
    const { error: accessError } = await adminClient
      .from("lab_note_access")
      .upsert(
        {
          lab_note_id: invitation.lab_note_id,
          user_id: user.id,
          permission_level: permissionLevel,
          granted_by: invitation.invited_by,
          updated_at: nowIso,
        },
        { onConflict: "lab_note_id,user_id" }
      )

    if (accessError) {
      console.error("Failed to add lab note collaborator:", accessError)
      return (
        <ErrorState
          title="Unable to accept invitation"
          message="We couldn't add you as a collaborator. Please try again."
        />
      )
    }

    const { error: acceptError } = await adminClient
      .from("lab_note_invitations")
      .update({
        status: "accepted",
        accepted_at: nowIso,
        accepted_by: user.id,
        updated_at: nowIso,
      })
      .eq("id", invitation.id)
      .eq("status", "pending")

    if (acceptError) {
      console.error("Failed to mark lab note invitation accepted:", acceptError)
      return (
        <ErrorState
          title="Unable to accept invitation"
          message="We couldn't finalize your invitation. Please try again."
        />
      )
    }

    const labNoteData = Array.isArray(invitation.lab_note)
      ? invitation.lab_note[0]
      : invitation.lab_note

    if (labNoteData?.experiment_id) {
      redirect(`/experiments/${labNoteData.experiment_id}?noteId=${invitation.lab_note_id}`)
    }

    redirect(LAB_NOTES_ROUTE)
  }

  const { data: invitation, error: invitationError } = await adminClient
    .from("invitations")
    .select("id, doc_id, email, role, expires_at, accepted_at")
    .eq("id", invitationId)
    .maybeSingle()

  if (invitationError || !invitation) {
    return (
      <ErrorState
        title="Invitation not found"
        message="We could not locate this invitation. It may have been revoked."
      />
    )
  }

  if (invitation.accepted_at) {
    return (
      <InfoState
        title="Invitation already accepted"
        message="You already accepted this invitation."
        docId={invitation.doc_id}
      />
    )
  }

  const expiresAt = new Date(invitation.expires_at)
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt < new Date()) {
    return (
      <ErrorState
        title="Invitation expired"
        message="This invitation has expired. Ask the document owner to resend it."
      />
    )
  }

  const userEmail = user.email ? normalizeEmail(user.email) : null
  if (!userEmail || userEmail !== normalizeEmail(invitation.email)) {
    return (
      <ErrorState
        title="Email mismatch"
        message="Please sign in with the email address that received this invitation."
      />
    )
  }

  const role = invitation.role as InvitationRole
  if (!role || !["owner", "editor", "viewer"].includes(role)) {
    return (
      <ErrorState
        title="Invalid invitation"
        message="This invitation has an invalid role. Ask the document owner to resend it."
      />
    )
  }

  const { data: existingCollaborator } = await adminClient
    .from("collaborators")
    .select("role")
    .eq("doc_id", invitation.doc_id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!existingCollaborator) {
    const { error: insertError } = await adminClient
      .from("collaborators")
      .insert({
        doc_id: invitation.doc_id,
        user_id: user.id,
        role,
      })

    if (insertError && insertError.code !== "23505") {
      console.error("Failed to add collaborator:", insertError)
      return (
        <ErrorState
          title="Unable to accept invitation"
          message="We couldn't add you as a collaborator. Please try again."
        />
      )
    }
  }

  const { error: acceptError } = await adminClient
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id)
    .is("accepted_at", null)

  if (acceptError) {
    console.error("Failed to mark invitation accepted:", acceptError)
    return (
      <ErrorState
        title="Unable to accept invitation"
        message="We couldn't finalize your invitation. Please try again."
      />
    )
  }

  const { error: auditError } = await adminClient
    .from("audit_log")
    .insert({
      actor_id: user.id,
      action: "invitation.accepted",
      metadata: {
        invitationId: invitation.id,
        docId: invitation.doc_id,
        role,
      },
    })

  if (auditError) {
    console.error("Failed to write audit log for acceptance:", auditError)
  }

  redirect(`${DOCUMENT_ROUTE_PREFIX}/${invitation.doc_id}`)
}
