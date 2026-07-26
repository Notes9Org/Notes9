import { createClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/current-user"
import { PageHeading } from "@/components/ui/page-heading"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { DataHub } from "@/components/data-analysis/data-hub"
import type { DataFileRow } from "@/components/data-analysis/data-files-list"

/**
 * Unified Data page: an **Analysis** workspace (live spreadsheet → charts,
 * statistics, standard curves, plate maps) and a **Data files** browser, toggled
 * like the Literature page. Retires the standalone /data route (which now
 * redirects here). Files/projects/experiments are fetched here (RLS-scoped) and
 * handed to the client hub.
 */
export default async function DataAnalysisPage() {
  await requireUser()
  const supabase = await createClient()

  const [filesRes, projectsRes, experimentsRes] = await Promise.all([
    supabase
      .from("experiment_data")
      .select(
        `
        id, file_name, file_type, file_size, data_type, created_at,
        experiment_id, project_id,
        experiment:experiments(id, name),
        project:projects(id, name)
      `,
      )
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("projects").select("id, name").order("name"),
    supabase.from("experiments").select("id, name, project_id").order("name"),
  ])

  const files: DataFileRow[] = (filesRes.data ?? []).map((row) => {
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
    }
  })

  const projects = (projectsRes.data ?? []).map((p) => ({ id: p.id, name: p.name }))
  const experiments = (experimentsRes.data ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    project_id: e.project_id as string | null,
  }))

  return (
    <div className="space-y-4 md:space-y-6">
      <SetPageBreadcrumb segments={[{ label: "Data" }]} />
      <div>
        <PageHeading>Data</PageHeading>
        <p className="text-muted-foreground mt-1 text-sm">
          Analyze data in a live spreadsheet — charts, statistics, standard curves and plate maps — or browse every data file across your experiments.
        </p>
      </div>
      <DataHub files={files} projects={projects} experiments={experiments} />
    </div>
  )
}
