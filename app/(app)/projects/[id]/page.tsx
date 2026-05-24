import { redirect, notFound } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { ProjectActions } from './project-actions'
import { ProjectWorkspace } from './project-workspace'
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

  // ── About-card metadata ──────────────────────────────────────────────
  const ownerName =
    [project.created_by?.first_name, project.created_by?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "—"
  const startedLabel = project.start_date || project.created_at
    ? new Date(project.start_date || project.created_at).toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      })
    : "—"
  const membersCount = project.project_members?.length ?? 0
  const lastActivityLabel = (() => {
    const iso = project.updated_at || project.created_at
    if (!iso) return "—"
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return "just now"
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.floor(h / 24)
    if (d < 7) return `${d}d ago`
    return new Date(iso).toLocaleDateString()
  })()

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
          {/* Status / priority badges relocated to the "About this project"
              card below — the header keeps only the action icons. */}
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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

        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">About this project</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-[1fr_auto] md:gap-10">
            <div className="min-w-0 space-y-3 text-sm leading-relaxed text-muted-foreground">
              {project.description ? (
                <HtmlContent content={project.description} />
              ) : (
                <p>No description yet.</p>
              )}
            </div>

            <div className="space-y-4 md:min-w-[260px]">
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
                    {project.priority} priority
                  </Badge>
                )}
              </div>

              <dl className="space-y-0 text-sm">
                <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2">
                  <dt className="text-muted-foreground">Owner</dt>
                  <dd className="font-medium text-foreground">{ownerName}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2">
                  <dt className="text-muted-foreground">Started</dt>
                  <dd className="font-medium text-foreground">{startedLabel}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2">
                  <dt className="text-muted-foreground">Members</dt>
                  <dd className="font-medium text-foreground tabular-nums">{membersCount}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-muted-foreground">Last activity</dt>
                  <dd className="font-medium text-foreground">{lastActivityLabel}</dd>
                </div>
              </dl>
            </div>
          </CardContent>
        </Card>

      </div>
    )
}
