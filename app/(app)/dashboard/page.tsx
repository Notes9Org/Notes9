import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { FlaskConical, TestTube, Wrench, FileText, TrendingUp, Activity } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  // First, let's get simple counts for the stats
  const [
    { data: projects },
    { data: experiments },
    { data: equipment },
    { data: reports }
  ] = await Promise.all([
    supabase.from("projects").select("id, status").in("status", ["active", "planning"]),
    supabase.from("experiments").select("id, status").in("status", ["in_progress", "data_collection"]),
    supabase.from("equipment").select("id, status"),
    supabase.from("reports").select("id, status").eq("status", "draft")
  ])

  // Get recent experiments using the same query as experiments page
  const { data: recentExperiments } = await supabase
    .from("experiments")
    .select(`
      *,
      project:projects(name),
      assigned_to:profiles!experiments_assigned_to_fkey(first_name, last_name)
    `)
    .order("created_at", { ascending: false })
    .limit(3)

  // Get active projects using the same query as projects page
  const { data: activeProjects } = await supabase
    .from("projects")
    .select(`
      *,
      created_by:profiles!projects_created_by_fkey(first_name, last_name),
      project_members(count),
      experiments(count)
    `)
    .order("created_at", { ascending: false })
    .limit(3)

  // Calculate statistics
  const activeProjectsCount = projects?.length || 0
  const runningExperimentsCount = experiments?.length || 0
  const availableEquipmentCount = equipment?.filter(eq => eq.status === "available").length || 0
  const totalEquipmentCount = equipment?.length || 1
  const equipmentAvailabilityPercentage = Math.round((availableEquipmentCount / totalEquipmentCount) * 100)
  const pendingReportsCount = reports?.length || 0

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back, {profile?.first_name || "User"}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here's what's happening in your laboratory today
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
            <div className="text-2xl font-bold">{equipmentAvailabilityPercentage}%</div>
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
      </div>

      {/* Recent Experiments & Projects */}
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
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {exp.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {exp.assigned_to ? `${exp.assigned_to.first_name} ${exp.assigned_to.last_name}` : "Unassigned"}
                      </p>
                    </div>
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
                  </div>
                  <Progress value={exp.progress || 0} className="h-2" />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No recent experiments</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Active Projects
            </CardTitle>
            <CardDescription>
              Your current research initiatives
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeProjects && activeProjects.length > 0 ? (
              activeProjects.map((project) => (
                <div key={project.id} className="space-y-2 pb-4 border-b last:border-0 last:pb-0">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <p className="text-sm font-medium leading-none">
                        {project.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {project.experiments?.[0]?.count || 0} experiments · {project.project_members?.[0]?.count || 0} members
                      </p>
                    </div>
                    <Badge
                      variant={
                        project.priority === "high" ? "destructive" :
                          project.priority === "medium" ? "default" : "secondary"
                      }
                    >
                      {project.priority || "normal"}
                    </Badge>
                  </div>
                  <Progress value={project.progress || 0} className="h-2" />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No active projects</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common tasks to get you started
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button>Create New Project</Button>
          <Button variant="outline">Add Experiment</Button>
          <Button variant="outline">Record Sample</Button>
          <Button variant="outline">Reserve Equipment</Button>
          <Button variant="outline">Generate Report</Button>
        </CardContent>
      </Card>
    </div>
  )
}
