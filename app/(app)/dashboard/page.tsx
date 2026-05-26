import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  FlaskConical,
  FileText,
  BookOpen,
  ArrowRight,
  ScrollText,
  Plus,
  FolderOpen,
} from "lucide-react"
import { OrgSetupCTA } from "@/components/org/org-setup-cta"
import { CatalystSectionHero } from "@/components/catalyst/catalyst-section-hero"
import { DashboardGreeting } from "./dashboard-greeting"
import { DashboardFirstRun } from "./dashboard-first-run"
import { DashboardScheduleTasks } from "./dashboard-schedule-tasks"
import { DashboardWhiteboard } from "./dashboard-whiteboard"
import { ActivitySummary } from "./activity-summary"

/**
 * Dashboard = Unified lab workspace.
 *
 * This screen is the user's primary view — schedule, tasks, whiteboard,
 * active experiments, and recently edited content.
 */
export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

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
    recentProjectsRes,
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
    supabase
      .from("projects")
      .select("id,name,updated_at")
      .order("updated_at", { ascending: false })
      .limit(3),
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
  const recentProjects = recentProjectsRes.data ?? []

  // Merge cross-entity "recently edited" feed (last 5).
  type RecentItem = { kind: "project" | "note" | "paper" | "protocol"; id: string; title: string; updated_at: string; href: string }
  const recentlyEdited: RecentItem[] = [
    ...recentProjects.map((p) => ({
      kind: "project" as const,
      id: p.id,
      title: p.name || "Untitled project",
      updated_at: p.updated_at,
      href: `/projects/${p.id}`,
    })),
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

  // Check if user has completed org setup (has an org_members record)
  const { data: orgMembership } = await supabase
    .from("org_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

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
      <CatalystSectionHero size="lg" scope="lab" />

      {/* AI-generated one-liner summarising recent lab activity */}
      <div className="mt-2 flex flex-col gap-3">
        <ActivitySummary />
        
        {/* Compact quick-action buttons — inline, no card chrome */}
        <div className="mx-auto flex w-full max-w-3xl items-center justify-center gap-2 px-4">
          <Link href="/projects/new">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Plus className="size-3.5" />
              Project
            </Button>
          </Link>
          <Link href="/experiments/new">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Plus className="size-3.5" />
              Experiment
            </Button>
          </Link>
          <Link href="/samples/new">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Plus className="size-3.5" />
              Sample
            </Button>
          </Link>
        </div>
      </div>

      {/* Org Setup CTA */}
      <OrgSetupCTA visible={!orgMembership} />

      {/* Middle row: Workspace (Planner features) */}
      <div className="grid grid-cols-1 gap-4 md:gap-5 xl:grid-cols-12 min-h-[380px] xl:items-stretch">
        <div className="flex min-h-[350px] flex-col xl:col-span-6 min-w-0">
          <DashboardScheduleTasks
            initialEvents={events}
            initialTasks={tasks}
          />
        </div>
        <div className="flex min-h-[350px] flex-col xl:col-span-6 min-w-0">
          <DashboardWhiteboard initialNotes={whiteboardNotes} />
        </div>
      </div>

      {/* Bottom row: Lab signals (Status features) */}
      <div className="grid grid-cols-1 gap-4 md:gap-5 xl:grid-cols-12">
        {/* Active experiments — 6 cols */}
        <Card className="xl:col-span-6 flex flex-col">
          <CardHeader>
            <CardTitle className="text-base">Active experiments</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            {activeExperiments.length > 0 ? (
              <ul className="space-y-2 flex-1">
                {activeExperiments.map((exp) => (
                  <li key={exp.id}>
                    <Link
                      href={`/experiments/${exp.id}${exp.project_id ? `?project=${exp.project_id}` : ""}`}
                      className="flex items-start gap-3 rounded-md border border-border bg-card p-3 hover:bg-muted/40 transition-colors"
                    >
                      <FlaskConical className="size-4 mt-0.5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm line-clamp-1">{exp.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Updated {relativeTime(exp.updated_at)}
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-2xs uppercase tracking-wide shrink-0">{exp.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground flex-1">
                No active experiments. <Link href="/experiments/new" className="underline underline-offset-2 hover:text-foreground">Start one →</Link>
              </p>
            )}
            <Button asChild variant="ghost" size="sm" className="w-full justify-between mt-3">
              <Link href="/experiments">
                View all <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Recently edited — 6 cols */}
        <Card className="xl:col-span-6 flex flex-col">
          <CardHeader>
            <CardTitle className="text-base">Recently edited</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
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
