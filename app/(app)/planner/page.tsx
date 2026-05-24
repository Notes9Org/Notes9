import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PageHeading, PageSubheading } from "@/components/ui/page-heading"
import { DashboardScheduleTasks } from "./dashboard-schedule-tasks"
import { DashboardWhiteboard } from "./dashboard-whiteboard"
import { DashboardFirstRun } from "./dashboard-first-run"

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  // Bracket "today" generously around the server clock — ±36h covers every
  // user timezone so the client component can filter to the user's local day.
  // (A tight UTC day-window would miss events for users far east/west of UTC.)
  const now = new Date()
  const dayStart = new Date(now.getTime() - 36 * 60 * 60 * 1000)
  const dayEnd = new Date(now.getTime() + 36 * 60 * 60 * 1000)

  // Also fetch a head-count of projects the user has access to so we can branch
  // into the first-run teaching surface when they have none — the schedule /
  // whiteboard panels are empty-and-useless without a project to ground them.
  const [tasksRes, eventsRes, notesRes, projectsHeadRes] = await Promise.all([
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
    // `head: true` returns no rows, just a count — cheap probe.
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .limit(1),
  ])

  const hasProjects = (projectsHeadRes.count ?? 0) > 0

  const greetingName =
    (user.user_metadata?.first_name as string | undefined) ||
    (user.user_metadata?.full_name as string | undefined)?.split(" ")[0] ||
    user.email?.split("@")[0] ||
    "Researcher"

  // `greetingName` is kept for future personalization (e.g. "Hi Sam, your week"),
  // suppress the unused-variable warning while we ship the rename.
  void greetingName

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 md:gap-8 pb-8 min-w-0">
      {/* Planner page heading — distinct destination from Dashboard now. */}
      <div className="flex flex-col gap-1">
        <PageHeading>Planner</PageHeading>
        <PageSubheading>Your week, your tasks, your whiteboard.</PageSubheading>
      </div>

      {/* When the user has no projects yet, the bench panels are empty and the
          user has no path forward — so we replace them with a teaching surface
          that explains the entity hierarchy and routes to Create Project. */}
      {hasProjects ? (
        /* Bench: Schedule+Tasks tabbed panel on the left, Whiteboard on the right.
            Single row at xl (5/7 split); stacks below md.
            Keep these class strings in lock-step with DashboardBenchSkeleton in
            components/loading/page-skeletons.tsx so the skeleton matches the
            real surface 1:1. */
        <div className="grid flex-1 grid-cols-1 gap-4 md:gap-5 xl:grid-cols-12 xl:items-stretch min-h-[min(100%,calc(100dvh-17rem))]">
          <div className="flex min-h-[280px] flex-col xl:col-span-5">
            <DashboardScheduleTasks
              initialEvents={eventsRes.data ?? []}
              initialTasks={tasksRes.data ?? []}
            />
          </div>
          <div className="flex min-h-[280px] flex-col xl:col-span-7">
            <DashboardWhiteboard initialNotes={notesRes.data ?? []} />
          </div>
        </div>
      ) : (
        <DashboardFirstRun />
      )}
    </div>
  )
}
