import { redirect, notFound } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { Plus, FileText } from 'lucide-react'
import { ProjectActions } from './project-actions'
import { ProjectWorkspace } from './project-workspace'
import { HtmlContent } from '@/components/html-content'
import { loadProjectWorkspaceProtocols } from "@/lib/project-workspace-protocols"

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

  const experimentsList = (project.experiments ?? []) as {
    id: string
    name: string
  }[]
  const experimentIds = experimentsList.map((e) => e.id)

  const literatureQuery = supabase
    .from("literature_reviews")
    .select("id, title, status", { count: "exact" })
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(8)

  const protocolsPromise = loadProjectWorkspaceProtocols(supabase, id, experimentIds)

  const [literatureRes, protocolList] = await Promise.all([literatureQuery, protocolsPromise])

  const literatureRows = literatureRes.data ?? []
  const literatureCount = literatureRes.count ?? literatureRows.length

  const protocolCount = protocolList.length
  const protocolsPreview = protocolList.slice(0, 8)

  return (
      <div className="space-y-4 md:space-y-6">
        <SetPageBreadcrumb
          segments={[
            { label: "Projects", href: "/projects" },
            { label: project.name },
          ]}
        />
        {/* Header: stacked on mobile, row on desktop */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{project.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
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
                  <span className="hidden sm:inline">{project.priority} priority</span>
                  <span className="sm:hidden">{project.priority}</span>
                </Badge>
              )}
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
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="team" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold md:text-xl">Team Members</h2>
              <Button className="w-full sm:w-auto">
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold md:text-xl">Project Reports</h2>
              <Button className="w-full sm:w-auto">
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
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Project Description</CardTitle>
              </CardHeader>
              <CardContent>
                <HtmlContent content={project.description} />
              </CardContent>
            </Card>

            <ProjectWorkspace
              projectId={id}
              literature={literatureRows}
              literatureCount={literatureCount}
              protocols={protocolsPreview}
              protocolCount={protocolCount}
              experiments={experimentsList}
              experimentsCount={experimentsList.length}
            />

            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Project Details</CardTitle>
                  <CardDescription>Key information</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 text-sm">
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
