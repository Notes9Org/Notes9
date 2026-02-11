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
  Wrench,
  FileText,
  BookOpen,
  Activity,
  Eye,
} from "lucide-react";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login");
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // First, let's get simple counts for the stats
  const [
    { data: projects },
    { data: experiments },
    { data: equipment },
    { data: reports },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, status")
      .in("status", ["active", "planning"]),
    supabase
      .from("experiments")
      .select("id, status")
      .in("status", ["in_progress", "data_collection"]),
    supabase.from("equipment").select("id, status"),
    supabase.from("reports").select("id, status").eq("status", "draft"),
  ]);

  // Get recent experiments using the same query as experiments page
  const { data: recentExperiments } = await supabase
    .from("experiments")
    .select(
      `
      *,
      project:projects(name),
      assigned_to:profiles!experiments_assigned_to_fkey(first_name, last_name)
    `
    )
    .order("created_at", { ascending: false })
    .limit(3);

  // Get recent lab notes
  const { data: recentNotes } = await supabase
    .from("lab_notes")
    .select(
      `
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
    `
    )
    .order("updated_at", { ascending: false })
    .limit(3);

  // Calculate statistics
  const activeProjectsCount = projects?.length || 0;
  const runningExperimentsCount = experiments?.length || 0;
  const availableEquipmentCount =
    equipment?.filter((eq) => eq.status === "available").length || 0;
  const totalEquipmentCount = equipment?.length || 1;
  const equipmentAvailabilityPercentage = Math.round(
    (availableEquipmentCount / totalEquipmentCount) * 100
  );
  const pendingReportsCount = reports?.length || 0;

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Hello, {profile?.first_name || "User"}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here's what's happening in your laboratory today
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
            <Wrench className="h-4 w-4 text-muted-foreground" />
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

      {/* Recent Experiments & Notes */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
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
                    <div className="space-y-1 flex-1 min-w-0">
                      <p className="text-sm font-medium leading-none truncate">
                        {exp.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {exp.project?.name || "No project"}
                      </p>
                      <p className="text-xs text-muted-foreground">
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
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Eye className="h-4 w-4" />
                          <span className="sr-only">View experiment</span>
                        </Button>
                      </Link>
                    </div>
                  </div>
                  <Progress value={exp.progress || 0} className="h-2" />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No recent experiments
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
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
                    <div className="space-y-1 flex-1 min-w-0">
                      <p className="text-sm font-medium leading-none truncate">
                        {note.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {note.experiment?.name || "No experiment"}
                        {note.experiment?.project?.name &&
                          ` · ${note.experiment.project.name}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Updated {new Date(note.updated_at).toLocaleDateString()}
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
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Eye className="h-4 w-4" />
                          <span className="sr-only">View note</span>
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No recent notes</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks to get you started</CardDescription>
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
    </div>
  );
}
