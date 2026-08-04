import { createClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/current-user"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { NewAnalysisClient } from "./new-analysis-client"

/**
 * Analysis → New: the workspace in its UNRUN state.
 *
 * The design doc flags this as a loose end of making Analysis workspace-level:
 * "an analysis still belongs to an experiment, experiment_id stays not null.
 * Creating one from the workspace list therefore needs an experiment picker,
 * pre-filled from the active project scope when there is one."
 *
 * This is that picker plus the Data setup, ending at the Run gate. Nothing is
 * persisted here: POST /api/analyses runs the analysis BEFORE inserting, so a
 * failed run leaves no dead row. The spec is therefore held client-side until
 * Run succeeds, then we redirect to /analysis/<id>, the same workspace, run.
 *
 * NOTE: a static segment beats the dynamic one, so /analysis/new never hits
 * /analysis/[id].
 */
export default async function NewAnalysisPage({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string; experiment?: string }>
}) {
  await requireUser()
  const supabase = await createClient()
  const params = (await searchParams) ?? {}

  // RLS scopes every query to the caller. Files are capped at the 500 most
  // recent, the picker filters to the chosen experiment client-side.
  const [projectsRes, experimentsRes, filesRes] = await Promise.all([
    supabase.from("projects").select("id, name").order("name"),
    supabase.from("experiments").select("id, name, project_id").order("name"),
    supabase
      .from("experiment_data")
      .select("id, file_name, file_type, tabular_format, experiment_id, project_id")
      .order("created_at", { ascending: false })
      .limit(500),
  ])

  return (
    <>
      <SetPageBreadcrumb segments={[{ label: "Analysis", href: "/analysis" }, { label: "New" }]} />
      <NewAnalysisClient
        projects={projectsRes.data ?? []}
        experiments={experimentsRes.data ?? []}
        files={filesRes.data ?? []}
        initialProjectId={params.project ?? null}
        initialExperimentId={params.experiment ?? null}
      />
    </>
  )
}
