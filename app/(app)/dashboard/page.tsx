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
              <div className="text-2xl font-bold">3</div>
              <p className="text-xs text-muted-foreground">
                +1 from last month
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
              <div className="text-2xl font-bold">12</div>
              <p className="text-xs text-muted-foreground">
                4 completed this week
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
              <div className="text-2xl font-bold">85%</div>
              <p className="text-xs text-muted-foreground">
                Available for use
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
              <div className="text-2xl font-bold">5</div>
              <p className="text-xs text-muted-foreground">
                2 due this week
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
              {[
                {
                  name: "Protein Crystallization - Batch #47",
                  status: "in_progress",
                  progress: 75,
                  researcher: "Dr. Sarah Chen",
                },
                {
                  name: "Compound Screening - Set A",
                  status: "data_ready",
                  progress: 90,
                  researcher: "Mike Rodriguez",
                },
                {
                  name: "Gene Expression Analysis",
                  status: "planned",
                  progress: 15,
                  researcher: "Dr. Emily Watson",
                },
              ].map((exp, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {exp.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {exp.researcher}
                      </p>
                    </div>
                    <Badge
                      variant={
                        exp.status === "in_progress"
                          ? "default"
                          : exp.status === "data_ready"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {exp.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <Progress value={exp.progress} className="h-2" />
                </div>
              ))}
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
              {[
                {
                  name: "Cancer Drug Discovery Initiative",
                  experiments: 8,
                  progress: 75,
                  priority: "high",
                  members: 3,
                },
                {
                  name: "Protein Structure Elucidation",
                  experiments: 4,
                  progress: 45,
                  priority: "high",
                  members: 2,
                },
                {
                  name: "Gene Expression Analysis",
                  experiments: 6,
                  progress: 20,
                  priority: "medium",
                  members: 4,
                },
              ].map((project, i) => (
                <div key={i} className="space-y-2 pb-4 border-b last:border-0 last:pb-0">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <p className="text-sm font-medium leading-none">
                        {project.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {project.experiments} experiments · {project.members} members
                      </p>
                    </div>
                    <Badge
                      variant={
                        project.priority === "high" ? "destructive" : "default"
                      }
                    >
                      {project.priority}
                    </Badge>
                  </div>
                  <Progress value={project.progress} className="h-2" />
                </div>
              ))}
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
