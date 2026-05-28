"use client"

import { useState, useEffect, useCallback } from "react"
import { Building2, Users, Shield, Mail, Settings, UserPlus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MembersTable, type OrgMember } from "@/components/org/members-table"
import {
  RolesManager,
  type OrgRole,
  type OrgPermission,
} from "@/components/org/roles-manager"
import {
  InvitationsTable,
  type OrgInvitation,
} from "@/components/org/invitations-table"
import { InviteDialog, type InviteRole } from "@/components/org/invite-dialog"
import { OrgSettingsForm } from "@/components/org/org-settings-form"
import { isOrgAdmin, type OrgMember as OrgMemberPerm } from "@/lib/org/permissions"
import { createClient } from "@/lib/supabase/client"
import { useAuthUser } from "@/components/auth/auth-provider"

interface Organization {
  id: string
  name: string
  type: string | null
  description: string | null
  address: string | null
  phone: string | null
  email: string | null
}

export default function OrganizationSettingsPage() {
  const user = useAuthUser();
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [members, setMembers] = useState<OrgMember[]>([])
  const [rawMembers, setRawMembers] = useState<OrgMemberPerm[]>([])
  const [roles, setRoles] = useState<OrgRole[]>([])
  const [permissions, setPermissions] = useState<OrgPermission[]>([])
  const [invitations, setInvitations] = useState<OrgInvitation[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)

  const fetchData = useCallback(async () => {
    const supabase = createClient()

    if (!user) return
    setUserId(user.id)

    // Fetch profile to get organization_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single()

    if (!profile?.organization_id) {
      setLoading(false)
      return
    }

    const orgId = profile.organization_id

    // Fetch org, members, roles, permissions, invitations in parallel
    const [orgRes, membersRes, rolesRes, permissionsRes, invitationsRes] =
      await Promise.all([
        supabase
          .from("organizations")
          .select("id, name, type, description, address, phone, email")
          .eq("id", orgId)
          .single(),
        supabase
          .from("org_members")
          .select(
            `id, user_id, role_id, is_active, joined_at,
             profiles:user_id (id, first_name, last_name, email),
             org_roles:role_id (id, name, is_system_role)`
          )
          .eq("organization_id", orgId)
          .eq("is_active", true),
        supabase
          .from("org_roles")
          .select(
            `id, name, description, is_system_role,
             org_role_permissions (id),
             org_members (id)`
          )
          .eq("organization_id", orgId),
        supabase.from("org_permissions").select("id, resource, action, description"),
        supabase
          .from("org_invitations")
          .select(
            `id, email, status, created_at,
             org_roles:role_id (name)`
          )
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false }),
      ])

    if (orgRes.data) {
      setOrganization(orgRes.data)
    }

    if (membersRes.data) {
      // Build raw members for isOrgAdmin check
      const raw: OrgMemberPerm[] = membersRes.data.map((m: any) => ({
        user_id: m.user_id,
        role_id: m.role_id,
        is_active: m.is_active,
        role: m.org_roles
          ? { is_system_role: m.org_roles.is_system_role, name: m.org_roles.name }
          : null,
      }))
      setRawMembers(raw)
      setIsAdmin(isOrgAdmin(raw, user.id))

      // Build display members
      const displayMembers: OrgMember[] = membersRes.data.map((m: any) => ({
        id: m.id,
        name: m.profiles
          ? `${m.profiles.first_name ?? ""} ${m.profiles.last_name ?? ""}`.trim() ||
            m.profiles.email
          : "Unknown",
        email: m.profiles?.email ?? "",
        roleName: m.org_roles?.name ?? "No role",
        joinedAt: m.joined_at,
      }))
      setMembers(displayMembers)
    }

    if (rolesRes.data) {
      const displayRoles: OrgRole[] = rolesRes.data.map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        is_system_role: r.is_system_role,
        permissionCount: r.org_role_permissions?.length ?? 0,
        memberCount: r.org_members?.length ?? 0,
      }))
      setRoles(displayRoles)
    }

    if (permissionsRes.data) {
      setPermissions(
        permissionsRes.data.map((p: any) => ({
          id: p.id,
          resource: p.resource,
          action: p.action,
          description: p.description,
        }))
      )
    }

    if (invitationsRes.data) {
      const displayInvitations: OrgInvitation[] = invitationsRes.data.map(
        (inv: any) => ({
          id: inv.id,
          email: inv.email,
          roleName: inv.org_roles?.name ?? "Unknown",
          status: inv.status,
          createdAt: inv.created_at,
        })
      )
      setInvitations(displayInvitations)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function handleMemberRemoved(memberId: string) {
    setMembers((prev) => prev.filter((m) => m.id !== memberId))
  }

  function handleInvitationRevoked(invitationId: string) {
    setInvitations((prev) =>
      prev.map((inv) =>
        inv.id === invitationId ? { ...inv, status: "revoked" as const } : inv
      )
    )
  }

  function handleRolesChanged() {
    fetchData()
  }

  function handleInvitesSent() {
    fetchData()
  }

  // Derive invite roles from roles state
  const inviteRoles: InviteRole[] = roles.map((r) => ({
    id: r.id,
    name: r.name,
  }))

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4 md:space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!organization) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4 md:space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Organization
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            You are not part of an organization yet.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
            <Building2 className="h-6 w-6" />
            {organization.name}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            {organization.type && (
              <Badge variant="secondary" className="capitalize">
                {organization.type}
              </Badge>
            )}
            <span className="text-muted-foreground text-sm">
              <Users className="mr-1 inline h-3.5 w-3.5" />
              {members.length} member{members.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        {isAdmin && (
          <Button
            className="cursor-pointer"
            onClick={() => setInviteDialogOpen(true)}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Invite Member
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="members" className="w-full space-y-4">
        <TabsList>
          <TabsTrigger value="members">
            <Users className="mr-1.5 h-4 w-4" />
            Members
          </TabsTrigger>
          <TabsTrigger value="roles">
            <Shield className="mr-1.5 h-4 w-4" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="invitations">
            <Mail className="mr-1.5 h-4 w-4" />
            Invitations
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="mr-1.5 h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" forceMount className="data-[state=inactive]:hidden">
          <MembersTable
            members={members}
            isAdmin={isAdmin}
            onMemberRemoved={handleMemberRemoved}
          />
        </TabsContent>

        <TabsContent value="roles" forceMount className="data-[state=inactive]:hidden">
          <RolesManager
            roles={roles}
            permissions={permissions}
            isAdmin={isAdmin}
            onRolesChanged={handleRolesChanged}
          />
        </TabsContent>

        <TabsContent value="invitations" forceMount className="data-[state=inactive]:hidden">
          <InvitationsTable
            invitations={invitations}
            isAdmin={isAdmin}
            onInvitationRevoked={handleInvitationRevoked}
          />
        </TabsContent>

        <TabsContent value="settings" forceMount className="data-[state=inactive]:hidden">
          {isAdmin ? (
            <OrgSettingsForm organization={organization} />
          ) : (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Only organization admins can edit settings.
            </p>
          )}
        </TabsContent>
      </Tabs>

      {/* Invite Dialog */}
      <InviteDialog
        roles={inviteRoles}
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        onInvitesSent={handleInvitesSent}
      />
    </div>
  )
}
