import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { FlaskConical, Calendar, User, FileText, ChevronDown, Plus } from 'lucide-react'
import { cn } from "@/lib/utils"
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ExperimentActions } from './experiment-actions'
import { ExperimentTabs } from './experiment-tabs'


type SearchParams = { tab?: string; noteId?: string }

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

  // Fetch linked protocols for this experiment
  const { data: linkedProtocols } = await supabase
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
    .order("added_at", { ascending: false })

  // Fetch samples linked to this experiment
  const { data: experimentSamples } = await supabase
    .from("samples")
    .select("*")
    .eq("experiment_id", id)
    .order("created_at", { ascending: false })

  // Fetch all projects for dropdown
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .order("name")

  // Fetch all users for assignment dropdown
  const { data: users } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .order("first_name")

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
    samples: experimentSamples || [],
  }

  return (
    <div className="flex flex-col gap-6 min-h-0 flex-1">
      <SetPageBreadcrumb
        segments={[
          { label: experiment.project, href: `/projects/${experiment.projectId}` },
          { label: experiment.name },
        ]}
      />
      {/* Header */}
      <div className="flex items-start justify-between shrink-0">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {experiment.name}
          </h1>
        </div>
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





      <ExperimentTabs
        experiment={experiment}
        initialTab={initialTab}
      />
    </div>
  )
}
