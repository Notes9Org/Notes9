import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { FlaskConical, Calendar, User, FileText, ChevronDown, Plus, X } from 'lucide-react'
import { cn } from "@/lib/utils"
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ExperimentActions } from './experiment-actions'
import { ExperimentTabs } from './experiment-tabs'
import { Badge } from '@/components/ui/badge'
import { resolveInitialProjectIdParam } from "@/lib/url-project-param"


type SearchParams = { tab?: string; noteId?: string; project?: string }

export default async function ExperimentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<SearchParams>
}) {
  const { id } = await params
  const resolvedSearch = searchParams ? await searchParams : {}
  const initialTab = resolvedSearch.tab ?? "notes"
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Fetch experiment data with linked protocols
  const { data: experimentData, error: experimentError } = await supabase
    .from("experiments")
    .select(`
      *,
      project:projects(id, name),
      assigned_to_user:profiles!experiments_assigned_to_fkey(id, first_name, last_name),
      created_by_user:profiles!experiments_created_by_fkey(id, first_name, last_name)
    `)
    .eq("id", id)
    .single()

  if (experimentError || !experimentData) {
    notFound()
  }

  // All remaining queries are independent of each other — fire them in parallel
  // so the page renders ~5 round-trips faster on cold loads.
  const [
    linkedProtocolsRes,
    legacyExperimentSamplesRes,
    linkedSampleRowsRes,
    projectsRes,
    usersRes,
  ] = await Promise.all([
    supabase
      .from("experiment_protocols")
      .select(`
        id,
        added_at,
        protocol:protocols(
          id,
          name,
          description,
          version,
          created_at
        )
      `)
      .eq("experiment_id", id)
      .order("added_at", { ascending: false }),
    supabase
      .from("samples")
      .select("*, sample_files(id, file_kind)")
      .eq("experiment_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("sample_experiments")
      .select(`
        sample:samples(
          *,
          sample_files(id, file_kind)
        )
      `)
      .eq("experiment_id", id)
      .order("linked_at", { ascending: false }),
    supabase.from("projects").select("id, name").order("name"),
    supabase.from("profiles").select("id, first_name, last_name").order("first_name"),
  ])

  const linkedProtocols = linkedProtocolsRes.data
  const legacyExperimentSamples = legacyExperimentSamplesRes.data
  const linkedSampleRows = linkedSampleRowsRes.data
  const projects = projectsRes.data
  const users = usersRes.data

  const sampleMap = new Map<string, any>()
  for (const sample of legacyExperimentSamples ?? []) {
    sampleMap.set(sample.id, sample)
  }
  for (const row of linkedSampleRows ?? []) {
    const sample = Array.isArray(row.sample) ? row.sample[0] : row.sample
    if (sample?.id) sampleMap.set(sample.id, sample)
  }
  const experimentSamples = Array.from(sampleMap.values())

  const allowedProjectIds = (projects ?? []).map((p) => p.id)
  const projectFromUrl = resolveInitialProjectIdParam(
    resolvedSearch.project,
    allowedProjectIds
  )
  const useProjectScopedHeader =
    Boolean(projectFromUrl) && projectFromUrl === experimentData.project_id

  // Use real data with fallback to dummy data for display
  const experiment = {
    id: experimentData.id,
    name: experimentData.name,
    status: experimentData.status,
    description: experimentData.description,
    hypothesis: experimentData.hypothesis,
    project: experimentData.project?.name || "Unknown Project",
    projectId: experimentData.project_id,
    startDate: experimentData.start_date,
    completionDate: experimentData.completion_date,
    researcher: experimentData.assigned_to_user
      ? `${experimentData.assigned_to_user.first_name} ${experimentData.assigned_to_user.last_name}`
      : "Unassigned",
    progress: experimentData.progress || 0,
    protocols: linkedProtocols || [],
    samples: experimentSamples,
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6 min-h-0 flex-1">
      <SetPageBreadcrumb
        segments={
          useProjectScopedHeader
            ? [
                {
                  label: experiment.project,
                  href: `/projects/${experiment.projectId}`,
                },
                { label: experiment.name },
              ]
            : [
                { label: "Projects", href: "/projects" },
                {
                  label: experiment.project,
                  href: `/projects/${experiment.projectId}`,
                },
                { label: experiment.name },
              ]
        }
      />
      {/* Header: stacked on mobile, row on desktop (matches project detail) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {experiment.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                experiment.status === "active"
                  ? "default"
                  : experiment.status === "completed"
                  ? "success"
                  : "outline"
              }
            >
              {experiment.status}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {projectFromUrl ? (
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link href={`/experiments/${experiment.id}`}>
                <X className="h-4 w-4" />
                Remove project filter
              </Link>
            </Button>
          ) : null}
          <ExperimentActions
            experiment={{
              id: experimentData.id,
              name: experimentData.name,
              description: experimentData.description,
              hypothesis: experimentData.hypothesis,
              status: experimentData.status,
              start_date: experimentData.start_date,
              completion_date: experimentData.completion_date,
              project_id: experimentData.project_id,
              assigned_to: experimentData.assigned_to,
            }}
            projects={projects || []}
            users={users || []}
          />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <ExperimentTabs
          experiment={experiment}
          initialTab={initialTab}
          experimentPageHref={
            useProjectScopedHeader && projectFromUrl
              ? `/experiments/${experiment.id}?project=${projectFromUrl}`
              : `/experiments/${experiment.id}`
          }
        />
      </div>
    </div>
  )
}
