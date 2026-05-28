import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/current-user"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  FileText,
  BookOpen,
  FolderOpen,
  ScrollText,
} from "lucide-react"
import { OrgSetupCTA } from "@/components/org/org-setup-cta"
import {
  DashboardMyLab,
  type DashboardLabSummary,
} from "@/components/org/dashboard-my-lab"
import { isOrgAdmin, type OrgMember as OrgMemberPerm } from "@/lib/org/permissions"
import { CatalystSectionHero } from "@/components/catalyst/catalyst-section-hero"
import { DashboardGreeting } from "./dashboard-greeting"
import { DashboardFirstRun } from "./dashboard-first-run"
import { DashboardScheduleTasks } from "./dashboard-schedule-tasks"
import { DashboardWhiteboard } from "./dashboard-whiteboard"
import { DashboardRecentWork } from "./dashboard-recent-work"
import { ActivitySummary } from "./activity-summary"

/**
 * Dashboard = Unified lab workspace.
 *
 * This screen is the user's primary view — schedule, tasks, whiteboard,
 * active experiments, and recently edited content.
 */
export default async function DashboardPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const now = new Date()
  const dayStart = new Date(now.getTime() - 36 * 60 * 60 * 1000)
  const dayEnd = new Date(now.getTime() + 36 * 60 * 60 * 1000)

  // Fan out the lab-signal queries in parallel.
  const [
    projectsHeadRes,
    activeExperimentsRes,
    recentNotesRes,
    recentPapersRes,
    recentProtocolsRes,
    allTasksRes,
    allEventsRes,
    whiteboardNotesRes,
  ] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }).limit(1),
    supabase
      .from("experiments")
      .select("id,name,status,updated_at,project_id")
      .eq("status", "in_progress")
      .order("updated_at", { ascending: false })
      .limit(3),
    supabase
      .from("lab_notes")
      .select("id,title,updated_at,experiment_id")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("papers")
      .select("id,title,updated_at")
      .order("updated_at", { ascending: false })
      .limit(3),
    supabase
      .from("protocols")
      .select("id,name,updated_at")
      .order("updated_at", { ascending: false })
      .limit(3),
    supabase
      .from("dashboard_tasks")
      .select("*")
      .eq("user_id", user.id)
      .order("completed", { ascending: true })
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", user.id)
      .gte("start_at", dayStart.toISOString())
      .lt("start_at", dayEnd.toISOString())
      .order("start_at", { ascending: true }),
    supabase
      .from("whiteboard_notes")
      .select("*")
      .eq("user_id", user.id)
      .is("project_id", null)
      .order("created_at", { ascending: true }),
  ])

  const hasProjects = (projectsHeadRes.count ?? 0) > 0
  if (!hasProjects) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-6 md:gap-8 pb-8 min-w-0">
        <DashboardFirstRun />
      </div>
    )
  }

  const activeExperiments = activeExperimentsRes.data ?? []
  const recentNotes = recentNotesRes.data ?? []
  const recentPapers = recentPapersRes.data ?? []
  const recentProtocols = recentProtocolsRes.data ?? []
  const tasks = allTasksRes.data ?? []
  const events = allEventsRes.data ?? []
  const whiteboardNotes = whiteboardNotesRes.data ?? []
  // Merge cross-entity "recently edited" feed (last 5).
  type RecentItem = { kind: "project" | "note" | "paper" | "protocol"; id: string; title: string; updated_at: string; href: string }
  const recentlyEdited: RecentItem[] = [
    ...recentNotes.map((n) => ({
      kind: "note" as const,
      id: n.id,
      title: n.title || "Untitled note",
      updated_at: n.updated_at,
      href: `/experiments/${n.experiment_id}?note=${n.id}`,
    })),
    ...recentPapers.map((p) => ({
      kind: "paper" as const,
      id: p.id,
      title: p.title || "Untitled",
      updated_at: p.updated_at,
      href: `/papers/${p.id}`,
    })),
    ...recentProtocols.map((p) => ({
      kind: "protocol" as const,
      id: p.id,
      title: p.name || "Untitled protocol",
      updated_at: p.updated_at,
      href: `/protocols/${p.id}`,
    })),
  ]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5)

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single()

  const { data: orgMembership } = await supabase
    .from("org_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle()

  let labSummary: DashboardLabSummary | null = null
  const orgId = profile?.organization_id

  if (orgMembership && orgId) {
    const [orgRes, membersRes, memberCountRes, invitationsRes, rolesRes] =
      await Promise.all([
      supabase
        .from("organizations")
        .select("id, name, type")
        .eq("id", orgId)
        .single(),
      supabase
        .from("org_members")
        .select(
          `id, user_id, role_id, is_active, joined_at,
           profiles:user_id (id, first_name, last_name, email),
           org_roles:role_id (id, name, is_system_role)`,
        )
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("joined_at", { ascending: true })
        .limit(6),
      supabase
        .from("org_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("is_active", true),
      supabase
        .from("org_invitations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "pending"),
      supabase
        .from("org_roles")
        .select("id, name")
        .eq("organization_id", orgId)
        .order("name"),
    ])

    if (orgRes.data) {
      const members = membersRes.data ?? []
      const rawForAdmin: OrgMemberPerm[] = members.map((m) => {
        const row = m as {
          user_id: string
          role_id: string | null
          is_active: boolean
          org_roles: { is_system_role: boolean; name: string } | null
        }
        return {
          user_id: row.user_id,
          role_id: row.role_id,
          is_active: row.is_active,
          role: row.org_roles
            ? {
                is_system_role: row.org_roles.is_system_role,
                name: row.org_roles.name,
              }
            : null,
        }
      })

      labSummary = {
        organization: orgRes.data,
        memberCount: memberCountRes.count ?? members.length,
        pendingInviteCount: invitationsRes.count ?? 0,
        previewMembers: members.map((m) => {
          const row = m as {
            id: string
            profiles: {
              first_name: string | null
              last_name: string | null
              email: string | null
            } | null
            org_roles: { name: string } | null
          }
          const name = row.profiles
            ? `${row.profiles.first_name ?? ""} ${row.profiles.last_name ?? ""}`.trim() ||
              row.profiles.email ||
              "Unknown"
            : "Unknown"
          return {
            id: row.id,
            name,
            roleName: row.org_roles?.name ?? "Member",
          }
        }),
        isAdmin: isOrgAdmin(rawForAdmin, user.id),
        inviteRoles: (rolesRes.data ?? []).map((r) => ({
          id: r.id,
          name: r.name,
        })),
      }
    }
  }

  // First-name lives in user_metadata too; avoid an extra profiles round-trip
  // just for the greeting.
  const greetingName =
    (user.user_metadata?.first_name as string | undefined) ||
    (user.user_metadata?.full_name as string | undefined)?.split(" ")[0] ||
    user.email?.split("@")[0] ||
    "Researcher"

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 md:gap-8 pb-8 min-w-0">
      {/* Wish greeting ("Morning, <name>") */}
      <DashboardGreeting name={greetingName} />
      {/* Catalyst AI composer */}
      <div className="sticky -top-3 sm:-top-4 md:-top-6 z-40 -mx-3 px-3 sm:-mx-4 sm:px-4 md:-mx-6 md:px-6 py-2 md:py-4 bg-background/80 backdrop-blur-md border-b border-border/50 transition-all">
        <CatalystSectionHero size="lg" scope="lab" />
      </div>

      {/* AI-generated one-liner summarising recent lab activity */}
      <div className="mt-2 flex flex-col gap-3">
        <ActivitySummary />
      </div>

      {/* Dashboard 2x2 Grid */}
      <div className="grid grid-cols-1 gap-4 md:gap-5 xl:grid-cols-2 auto-rows-[400px]">
        
        {/* Top Left: Schedule */}
        <div className="flex flex-col min-w-0 h-full">
          <DashboardScheduleTasks
            initialEvents={events}
            initialTasks={tasks}
          />
        </div>

        {/* Top Right: recently opened projects + in-progress experiments */}
        <DashboardRecentWork activeExperiments={activeExperiments} />

        {/* Bottom Left: Whiteboard */}
        <div className="flex flex-col min-w-0 h-full">
          <DashboardWhiteboard initialNotes={whiteboardNotes} />
        </div>

        {/* Bottom Right: Recently Edited */}
        <Card className="flex flex-col min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Recently edited</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto min-h-0 pr-2">
            {recentlyEdited.length > 0 ? (
              <ul className="space-y-2">
                {recentlyEdited.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <Link
                      href={item.href}
                      className="flex items-start gap-2 text-sm hover:text-foreground transition-colors"
                    >
                      <RecentIcon kind={item.kind} />
                      <div className="flex-1 min-w-0">
                        <div className="line-clamp-1">{item.title}</div>
                        <div className="text-2xs text-muted-foreground mt-0.5">
                          {relativeTime(item.updated_at)}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* My Lab — bottom of dashboard, easy to spot for new users */}
      {labSummary ? (
        <DashboardMyLab lab={labSummary} />
      ) : (
        <OrgSetupCTA visible={!orgMembership} />
      )}
    </div>
  )
}

function RecentIcon({ kind }: { kind: "project" | "note" | "paper" | "protocol" }) {
  const cls = "size-3.5 mt-0.5 shrink-0 text-muted-foreground"
  switch (kind) {
    case "project":
      return <FolderOpen className={cls} />
    case "note":
      return <FileText className={cls} />
    case "paper":
      return <BookOpen className={cls} />
    default:
      return <ScrollText className={cls} />
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  return new Date(iso).toLocaleDateString()
}
