import { redirect } from 'next/navigation'
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  FlaskConical,
  TestTube,
  Microscope,
  FileText,
  BookOpen,
  ArrowUpRight,
  Plus,
} from "lucide-react";
import { TodoPanel } from "./todo-panel";
import { OrgSetupCTA } from "@/components/org/org-setup-cta";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login");
  }

  // Dashboard queries — fire in parallel. The previous version also fetched
  // `profiles`, `projects`, `experiments`, `equipment`, `reports`, and the
  // chat-researcher graph snapshot. None of them are rendered after we removed
  // the stats cards and the relation-graph button, so they're dropped here to
  // cut ~5 round-trips and a `chat_researcher_profiles.graph_data` blob from
  // every dashboard hit.
  const [recentExperimentsRes, recentNotesRes, dashboardTasksRes] =
    await Promise.all([
      supabase
        .from("experiments")
        .select(`
          *,
          project:projects(name),
          assigned_to:profiles!experiments_assigned_to_fkey(first_name, last_name)
        `)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("lab_notes")
        .select(`
          id,
          title,
          created_at,
          updated_at,
          note_type,
          experiment_id,
          experiment:experiments (
            name,
            project:projects ( name )
          )
        `)
        .order("updated_at", { ascending: false })
        .limit(3),
      supabase
        .from("dashboard_tasks")
        .select("*")
        .eq("user_id", user.id)
        .order("completed", { ascending: true })
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false }),
    ])

  const recentExperiments = recentExperimentsRes.data
  const recentNotes = recentNotesRes.data
  const dashboardTasks = dashboardTasksRes.data

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
    "User"

  return (
    <div className="min-w-0 space-y-4 md:space-y-6 pb-6">
      {/* Welcome Section — editorial display face (IBM Plex Serif) anchors the
          arrival moment; the Familjen Grotesk body keeps the rest system-y. */}
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight md:text-4xl">
          Hello, {greetingName}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s what&apos;s happening in your laboratory today.
        </p>
      </div>

      {/* Stats Grid - Hidden for now */}
      {/* <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Active Projects
            </CardTitle>
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeProjectsCount}</div>
            <p className="text-xs text-muted-foreground">
              Currently active or planning
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Running Experiments
            </CardTitle>
            <TestTube className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{runningExperimentsCount}</div>
            <p className="text-xs text-muted-foreground">
              In progress or collecting data
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Equipment Status
            </CardTitle>
            <Microscope className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {equipmentAvailabilityPercentage}%
            </div>
            <p className="text-xs text-muted-foreground">
              {availableEquipmentCount} of {totalEquipmentCount} available
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Pending Reports
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingReportsCount}</div>
            <p className="text-xs text-muted-foreground">
              Draft reports to complete
            </p>
          </CardContent>
        </Card>
      </div> */}

      {/* Org Setup CTA */}
      <OrgSetupCTA visible={!orgMembership} />

      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks to get you started.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/projects/new">
            <Button variant="outline">Create New Project</Button>
          </Link>
          <Link href="/experiments/new">
            <Button variant="outline">Add Experiment</Button>
          </Link>
          <Link href="/samples/new">
            <Button variant="outline">Record Sample</Button>
          </Link>
        </CardContent>
      </Card>

      {/* Recent Experiments & Notes */}
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5" />
              Recent Experiments
            </CardTitle>
            <CardDescription>
              Track your ongoing laboratory work
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentExperiments && recentExperiments.length > 0 ? (
              recentExperiments.map((exp) => (
                <div key={exp.id} className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <p className="text-sm font-medium leading-none truncate">
                        {exp.name}
                      </p>
                      <p className="text-xs text-muted-foreground break-words">
                        {exp.project?.name || "No project"}
                      </p>
                      <p className="text-xs text-muted-foreground break-words">
                        {exp.assigned_to
                          ? `${exp.assigned_to.first_name} ${exp.assigned_to.last_name}`
                          : "Unassigned"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={
                          exp.status === "in_progress"
                            ? "default"
                            : exp.status === "data_collection"
                            ? "secondary"
                            : exp.status === "completed"
                            ? "outline"
                            : "outline"
                        }
                      >
                        {exp.status?.replace("_", " ") || "planned"}
                      </Badge>
                      <Link href={`/experiments/${exp.id}`}>
                        <Button variant="ghost" size="icon" aria-label="View experiment">
                          <ArrowUpRight className="size-4" />
                          <span className="sr-only">View experiment</span>
                        </Button>
                      </Link>
                    </div>
                  </div>
                  <Progress value={exp.progress || 0} className="h-2" />
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground space-y-2">
                <p>No recent experiments.</p>
                <Link
                  href="/experiments/new"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Plus className="size-3.5" /> Start your first experiment
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Recent Notes
            </CardTitle>
            <CardDescription>Your latest lab notes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentNotes && recentNotes.length > 0 ? (
              recentNotes.map((note: any) => (
                <div
                  key={note.id}
                  className="pb-4 border-b last:border-0 last:pb-0"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <p className="text-sm font-medium leading-none truncate">
                        {note.title}
                      </p>
                      <p className="text-xs text-muted-foreground break-words">
                        {note.experiment?.name || "No experiment"}
                        {note.experiment?.project?.name &&
                          ` · ${note.experiment.project.name}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Updated {new Date(note.updated_at).toISOString().slice(0, 10)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {note.note_type && (
                        <Badge variant="outline" className="text-xs">
                          {note.note_type}
                        </Badge>
                      )}
                      <Link
                        href={
                          note.experiment_id
                            ? `/experiments/${note.experiment_id}?noteId=${note.id}`
                            : `/lab-notes`
                        }
                      >
                        <Button variant="ghost" size="icon" aria-label="View note">
                          <ArrowUpRight className="size-4" />
                          <span className="sr-only">View note</span>
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground space-y-2">
                <p>No recent notes.</p>
                <Link
                  href="/lab-notes"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Plus className="size-3.5" /> Write your first lab note
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* To-Do Panel */}
      <div className="grid min-w-0 gap-4">
        <TodoPanel initialTasks={dashboardTasks ?? []} />
      </div>
    </div>
  );
}
