import { createClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/current-user"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { CatalystSectionHero } from "@/components/catalyst/catalyst-section-hero"
import { AnalysisListClient, type AnalysisRow } from "./analysis-list-client"

/**
 * Analysis: a workspace-level, filterable list of every statistical analysis,
 * cloned from Data & Files (`app/(app)/data`). Filters (project → experiment)
 * prefill from the sidebar context via `?project=`/`?experiment=` but stay
 * editable, so analyses from OTHER projects stay one filter change away.
 *
 * NOTE the select list is explicit and deliberately omits `analyses.code` —
 * that column is server-side only (see scripts/106_analyses.sql).
 */
export default async function AnalysisPage({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string; experiment?: string }>
}) {
  await requireUser()
  const supabase = await createClient()

  // RLS scopes all three queries to the caller (analyses are owner-only).
  // Capped at the 500 most recent — plenty for browsing.
  const [analysesRes, projectsRes, experimentsRes] = await Promise.all([
    supabase
      .from("analyses")
      .select(
        `
        id,
        title,
        table_type,
        analysis_type,
        status,
        created_at,
        updated_at,
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

  const analyses = (analysesRes.data ?? []).map((row) => {
    const experiment = Array.isArray(row.experiment) ? row.experiment[0] : row.experiment
    const project = Array.isArray(row.project) ? row.project[0] : row.project
    return {
      id: row.id,
      title: row.title,
      table_type: row.table_type,
      analysis_type: row.analysis_type,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      experiment_id: row.experiment_id,
      project_id: row.project_id,
      experiment_name: experiment?.name ?? null,
      project_name: project?.name ?? null,
    } satisfies AnalysisRow
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
      {/* Same layout grammar as Data & Files: AI composer on top, list below.
          "experiments" scope — analyses read an experiment's data. */}
      <CatalystSectionHero size="sm" scope="experiments" shrinkOnScroll />
      <AnalysisListClient
        analyses={analyses}
        projects={projects}
        experiments={experiments}
        loadError={analysesRes.error?.message ?? null}
      />
    </div>
  )
}
