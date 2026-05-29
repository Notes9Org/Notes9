"use client"

import { useState } from "react"
import Link from "next/link"
import { Building2, Mail, Settings2, UserPlus, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { InviteDialog, type InviteRole } from "@/components/org/invite-dialog"
import { DashboardLabSection } from "@/components/org/dashboard-lab-section"

export type DashboardLabMemberPreview = {
  id: string
  name: string
  roleName: string
}

export type DashboardLabSummary = {
  organization: {
    id: string
    name: string
    type: string | null
  }
  memberCount: number
  pendingInviteCount: number
  previewMembers: DashboardLabMemberPreview[]
  isAdmin: boolean
  inviteRoles: InviteRole[]
}

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
}

export function DashboardMyLab({ lab }: { lab: DashboardLabSummary }) {
  const [inviteOpen, setInviteOpen] = useState(false)
  const { organization, memberCount, pendingInviteCount, previewMembers, isAdmin, inviteRoles } =
    lab

  return (
    <DashboardLabSection
      eyebrow="Collaborate"
      title="My Lab"
      description="Your research group lives here — invite teammates, assign roles, and manage lab settings without leaving the dashboard."
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Building2 className="size-5 shrink-0 text-primary" aria-hidden />
            <span className="text-base font-semibold md:text-lg">{organization.name}</span>
            {organization.type ? (
              <Badge variant="secondary" className="capitalize">
                {organization.type}
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4 shrink-0" aria-hidden />
              {memberCount} member{memberCount !== 1 ? "s" : ""}
            </span>
            {isAdmin && pendingInviteCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <Mail className="size-4 shrink-0" aria-hidden />
                {pendingInviteCount} pending invite
                {pendingInviteCount !== 1 ? "s" : ""}
              </span>
            ) : null}
          </div>

          {previewMembers.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex -space-x-2">
                {previewMembers.slice(0, 6).map((member) => (
                  <Avatar
                    key={member.id}
                    className="size-9 border-2 border-background ring-0"
                    title={`${member.name} · ${member.roleName}`}
                  >
                    <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                      {memberInitials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              {memberCount > previewMembers.length ? (
                <span className="text-sm text-muted-foreground">
                  +{memberCount - previewMembers.length} more
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          {isAdmin ? (
            <Button type="button" onClick={() => setInviteOpen(true)} className="gap-2">
              <UserPlus className="size-4" aria-hidden />
              Invite member
            </Button>
          ) : null}
          <Button variant="outline" asChild className="gap-2">
            <Link href="/settings/organization">
              <Settings2 className="size-4" aria-hidden />
              Manage lab
            </Link>
          </Button>
        </div>
      </div>

      {isAdmin ? (
        <InviteDialog
          roles={inviteRoles}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          onInvitesSent={() => setInviteOpen(false)}
        />
      ) : null}
    </DashboardLabSection>
  )
}
