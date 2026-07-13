import { createClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/current-user"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { CatalystSectionHero } from "@/components/catalyst/catalyst-section-hero"
import { DataFilesListClient, type DataFileRow } from "./data-list-client"

/**
 * Data & Files: an org-wide, filterable list of every experiment data file.
 * Filters (project → experiment) prefill from the sidebar context via
 * `?project=`/`?experiment=` but stay editable, so files from OTHER projects
 * and experiments remain one filter change away. Row clicks open the file's
 * experiment Data tab, where preview/spreadsheet tooling lives.
 */
export default async function DataFilesPage({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string; experiment?: string }>
}) {
  await requireUser()
  const supabase = await createClient()

  // RLS scopes all three queries to the caller's organization. The list is
  // capped at the 500 most recent files — plenty for browsing; the per-
  // experiment Data tab remains the canonical full view.
  const [filesRes, projectsRes, experimentsRes] = await Promise.all([
    supabase
      .from("experiment_data")
      .select(
        `
        id,
        file_name,
        file_type,
        file_size,
        data_type,
        created_at,
        experiment_id,
        project_id,
        experiment:experiments(id, name),
        project:projects(id, name)
      `,
      )
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("projects").select("id, name").order("name"),
    supabase.from("experiments").select("id, name, project_id").order("name"),
  ])

  const files = (filesRes.data ?? []).map((row) => {
    const experiment = Array.isArray(row.experiment) ? row.experiment[0] : row.experiment
    const project = Array.isArray(row.project) ? row.project[0] : row.project
    return {
      id: row.id,
      file_name: row.file_name,
      file_type: row.file_type,
      file_size: row.file_size,
      data_type: row.data_type,
      created_at: row.created_at,
      experiment_id: row.experiment_id,
      project_id: row.project_id,
      experiment_name: experiment?.name ?? null,
      project_name: project?.name ?? null,
    } satisfies DataFileRow
  })

  const projects = (projectsRes.data ?? []).map((p) => ({ id: p.id, name: p.name }))
  const experiments = (experimentsRes.data ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    project_id: e.project_id as string | null,
  }))

  return (
    <div className="space-y-6">
      <SetPageBreadcrumb segments={[]} />
      {/* Same layout grammar as Lab notes: AI composer on top, list below.
          "experiments" scope — data files live inside experiments. */}
      <CatalystSectionHero size="sm" scope="experiments" shrinkOnScroll />
      <DataFilesListClient files={files} projects={projects} experiments={experiments} />
    </div>
  )
}
