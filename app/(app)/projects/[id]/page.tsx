import { redirect, notFound } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { Plus, Users, Calendar, FlaskConical, FileText } from 'lucide-react'
import Link from 'next/link'
import { ProjectActions } from './project-actions'
import { HtmlContentTruncated } from '@/components/html-content'

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  // Fetch project details
  const { data: project, error } = await supabase
    .from("projects")
    .select(`
      *,
      created_by:profiles!projects_created_by_fkey(first_name, last_name),
      project_members(
        *,
        user:profiles(first_name, last_name, email, role)
      ),
      experiments(
        *,
        assigned_to:profiles!experiments_assigned_to_fkey(first_name, last_name)
      )
    `)
    .eq("id", id)
    .single()

  if (error || !project) {
    notFound()
  }

  return (
      <div className="space-y-6">
        <SetPageBreadcrumb
          segments={[
            { label: "Projects", href: "/projects" },
            { label: project.name },
          ]}
        />
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
              <Badge
                variant={
                  project.status === "active"
                    ? "default"
                    : project.status === "completed"
                    ? "secondary"
                    : "outline"
                }
              >
                {project.status}
              </Badge>
              {project.priority && (
                <Badge
                  variant={
                    project.priority === "critical" || project.priority === "high"
                      ? "destructive"
                      : "outline"
                  }
                >
                  {project.priority} priority
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">{project.description}</p>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              {project.start_date && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>Started: {new Date(project.start_date).toLocaleDateString()}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                <span>
                  {Math.max(1, project.project_members?.length || 0)} {Math.max(1, project.project_members?.length || 0) === 1 ? 'team member' : 'team members'}
                </span>
              </div>
            </div>
          </div>
          <ProjectActions
            project={{
              id: project.id,
              name: project.name,
              description: project.description,
              status: project.status,
              priority: project.priority,
              start_date: project.start_date,
              end_date: project.end_date,
            }}
            experimentCount={project.experiments?.length || 0}
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="experiments" className="space-y-4">
          <TabsList>
            <TabsTrigger value="experiments">Experiments</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
          </TabsList>

          <TabsContent value="experiments" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Experiments</h2>
              <Button asChild>
                <Link href={`/experiments/new?project=${id}`}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Experiment
                </Link>
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {project.experiments && project.experiments.length > 0 ? (
                project.experiments.map((experiment: any) => (
                  <Link
                    key={experiment.id}
                    href={`/experiments/${experiment.id}`}
                    className="block min-w-0"
                  >
                    <Card className="hover:border-primary transition-colors cursor-pointer h-full flex flex-col min-h-0 overflow-hidden">
                      <CardHeader className="min-w-0 flex flex-col gap-2">
                        <CardTitle className="text-base line-clamp-2 min-w-0 pr-0">
                          {experiment.name}
                        </CardTitle>
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <Badge variant="outline" className="shrink-0">
                            {experiment.status}
                          </Badge>
                        </div>
                        <CardDescription className="line-clamp-2 min-w-0">
                          <HtmlContentTruncated content={experiment.description} />
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2 min-w-0 pt-0">
                        {experiment.assigned_to && (
                          <p className="text-xs text-muted-foreground truncate">
                            Assigned to: {experiment.assigned_to.first_name}{" "}
                            {experiment.assigned_to.last_name}
                          </p>
                        )}
                        {experiment.start_date && (
                          <p className="text-xs text-muted-foreground">
                            Started: {new Date(experiment.start_date).toLocaleDateString()}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))
              ) : (
                <Card className="col-span-full">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <FlaskConical className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">No experiments yet</p>
                    <Button asChild>
                      <Link href={`/experiments/new?project=${id}`}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create First Experiment
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="team" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Team Members</h2>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Member
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {project.project_members?.map((member: any) => (
                <Card key={member.id}>
                  <CardContent className="flex items-center gap-4 pt-6">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback>
                        {member.user?.first_name?.[0]}
                        {member.user?.last_name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium">
                        {member.user?.first_name} {member.user?.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {member.user?.email}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {member.role}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {member.user?.role}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Project Reports</h2>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Generate Report
              </Button>
            </div>

            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No reports generated yet</p>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Report
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Project Progress</CardTitle>
                  <CardDescription>Overall completion status</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Total Progress</span>
                      <span className="font-medium">75%</span>
                    </div>
                    <Progress value={75} />
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Total Experiments</p>
                      <p className="text-2xl font-bold">{project.experiments?.length || 0}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Completed</p>
                      <p className="text-2xl font-bold">
                        {project.experiments?.filter((e: any) => e.status === "completed").length || 0}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Project Details</CardTitle>
                  <CardDescription>Key information</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Status</p>
                      <Badge className="mt-1">{project.status}</Badge>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Priority</p>
                      <Badge variant="outline" className="mt-1">
                        {project.priority}
                      </Badge>
                    </div>
                    {project.start_date && (
                      <div>
                        <p className="text-muted-foreground">Start Date</p>
                        <p className="mt-1">{new Date(project.start_date).toLocaleDateString()}</p>
                      </div>
                    )}
                    {project.end_date && (
                      <div>
                        <p className="text-muted-foreground">Target End</p>
                        <p className="mt-1">{new Date(project.end_date).toLocaleDateString()}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    )
}
