import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { Plus, FileText } from 'lucide-react'
import { ProjectActions } from './project-actions'
import { ProjectWorkspace } from './project-workspace'
import { AddMemberDialog } from './add-member-dialog'
import { HtmlContent } from '@/components/html-content'
import { loadProjectWorkspaceProtocols } from "@/lib/project-workspace-protocols"
import { CatalystSectionHero } from "@/components/catalyst/catalyst-section-hero"
import { ProjectPicker } from "@/components/projects/project-picker"

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
    status: string | null
  }[]
  const experimentIds = experimentsList.map((e) => e.id)

  const literatureQuery = supabase
    .from("literature_reviews")
    .select("id, title, status", { count: "exact" })
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(8)

  const protocolsPromise = loadProjectWorkspaceProtocols(supabase, id, experimentIds)
  const directSamplesPromise = supabase
    .from("sample_projects")
    .select("sample:samples(id, sample_code, sample_type)")
    .eq("project_id", id)
  const experimentSamplesPromise = experimentIds.length
    ? supabase
        .from("sample_experiments")
        .select("sample:samples(id, sample_code, sample_type)")
        .in("experiment_id", experimentIds)
    : Promise.resolve({ data: [] as any[] })
  const legacySamplesPromise = experimentIds.length
    ? supabase
        .from("samples")
        .select("id, sample_code, sample_type")
        .in("experiment_id", experimentIds)
    : Promise.resolve({ data: [] as any[] })

  // Lab notes — include rows tied to this project directly (lab_notes.project_id)
  // and rows tied via an experiment (lab_notes.experiment_id ∈ this project's experiments).
  const labNotesPromise = experimentIds.length
    ? supabase
        .from("lab_notes")
        .select("id, title, experiment_id, project_id", { count: "exact" })
        .or(`project_id.eq.${id},experiment_id.in.(${experimentIds.join(",")})`)
        .order("updated_at", { ascending: false })
        .limit(8)
    : supabase
        .from("lab_notes")
        .select("id, title, experiment_id, project_id", { count: "exact" })
        .eq("project_id", id)
        .order("updated_at", { ascending: false })
        .limit(8)

  const papersPromise = supabase
    .from("papers")
    .select("id, title, updated_at", { count: "exact" })
    .eq("project_id", id)
    .order("updated_at", { ascending: false })
    .limit(8)

  const reportsPromise = supabase
    .from("reports")
    .select("id, title, created_at", { count: "exact" })
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(8)

  const experimentDataPromise = supabase
    .from("experiment_data")
    .select("id, file_name, experiment_id", { count: "exact" })
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(8)

  const orgProjectsPromise = project.organization_id
    ? supabase
        .from("projects")
        .select("id, name, status")
        .eq("organization_id", project.organization_id)
        .order("name", { ascending: true })
    : Promise.resolve({ data: [] as { id: string; name: string; status: string }[] })

  const [
    literatureRes,
    protocolList,
    directSamplesRes,
    experimentSamplesRes,
    legacySamplesRes,
    labNotesRes,
    papersRes,
    reportsRes,
    experimentDataRes,
    orgProjectsRes,
  ] = await Promise.all([
    literatureQuery,
    protocolsPromise,
    directSamplesPromise,
    experimentSamplesPromise,
    legacySamplesPromise,
    labNotesPromise,
    papersPromise,
    reportsPromise,
    experimentDataPromise,
    orgProjectsPromise,
  ])

  const literatureRows = literatureRes.data ?? []
  const literatureCount = literatureRes.count ?? literatureRows.length

  const protocolCount = protocolList.length
  const protocolsPreview = protocolList.slice(0, 8)
  const sampleMap = new Map<string, { id: string; sample_code: string; sample_type: string | null }>()
  for (const row of directSamplesRes.data ?? []) {
    const sample = Array.isArray(row.sample) ? row.sample[0] : row.sample
    if (sample?.id) sampleMap.set(sample.id, sample)
  }
  for (const row of experimentSamplesRes.data ?? []) {
    const sample = Array.isArray(row.sample) ? row.sample[0] : row.sample
    if (sample?.id) sampleMap.set(sample.id, sample)
  }
  for (const sample of legacySamplesRes.data ?? []) {
    if (sample?.id) sampleMap.set(sample.id, sample)
  }
  const samplesPreview = Array.from(sampleMap.values()).slice(0, 8)

  const labNotesRows = labNotesRes.data ?? []
  const labNotesCount = labNotesRes.count ?? labNotesRows.length
  const papersRows = papersRes.data ?? []
  const papersCount = papersRes.count ?? papersRows.length
  const reportsRows = reportsRes.data ?? []
  const reportsCount = reportsRes.count ?? reportsRows.length
  const experimentDataRows = experimentDataRes.data ?? []
  const experimentDataCount =
    experimentDataRes.count ?? experimentDataRows.length
  const orgProjects = orgProjectsRes.data ?? []

  return (
      <div className="space-y-5 md:space-y-6 pb-8">
        <SetPageBreadcrumb
          segments={[
            { label: "Projects", href: "/projects" },
            { label: project.name },
          ]}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ProjectPicker
            currentProject={{ id: project.id, name: project.name }}
            projects={orgProjects}
          />
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
        </div>

        <CatalystSectionHero size="lg" scope="project" />

        <ProjectWorkspace
          projectId={id}
          literature={literatureRows}
          literatureCount={literatureCount}
          protocols={protocolsPreview}
          protocolCount={protocolCount}
          experiments={experimentsList}
          experimentsCount={experimentsList.length}
          dataFiles={experimentDataRows}
          dataFilesCount={experimentDataCount}
          samples={samplesPreview}
          samplesCount={sampleMap.size}
          labNotes={labNotesRows}
          labNotesCount={labNotesCount}
          papers={papersRows}
          papersCount={papersCount}
          reports={reportsRows}
          reportsCount={reportsCount}
        />

        {project.description ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">About this project</CardTitle>
            </CardHeader>
            <CardContent>
              <HtmlContent content={project.description} />
            </CardContent>
          </Card>
        ) : null}

        {/* Secondary surfaces: team + reports */}
        <Tabs defaultValue="team" className="space-y-4">
          <TabsList>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="team" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold md:text-xl">Team Members</h2>
              <AddMemberDialog
                projectId={project.id}
                existingMemberIds={
                  (project.project_members ?? [])
                    .map((m: any) => m.user_id)
                    .filter(Boolean) as string[]
                }
              />
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
              <Button className="w-full sm:w-auto" asChild>
                <Link href={`/reports?project=${id}`}>
                  <Plus className="h-4 w-4 mr-2" />
                  Generate Report
                </Link>
              </Button>
            </div>

            {reportsCount > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {reportsRows.map((r) => (
                  <Card key={r.id}>
                    <CardContent className="flex items-start gap-3 py-4">
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/reports/${r.id}`}
                          className="text-sm font-medium text-foreground hover:underline truncate block"
                        >
                          {r.title || "Untitled report"}
                        </Link>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(r.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">No reports generated yet</p>
                  <Button asChild>
                    <Link href={`/reports?project=${id}`}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create First Report
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

        </Tabs>
      </div>
    )
}
