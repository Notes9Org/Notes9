import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/current-user"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import type { AnalysisSpec, FigureSpec, Results } from "@/types/analysis"
import { AnalysisDetailClient } from "./analysis-detail-client"
import type { DatasetFile } from "@/components/analysis/data/dataset-picker"

/**
 * The analysis workspace. Server side does auth + the row fetch; everything
 * interactive (the Analysis | Data segmented control, role assignment, the
 * drawer) lives in the client shell.
 *
 * The select list is explicit and omits `analyses.code`, that column is
 * server-side only (see scripts/106_analyses.sql).
 */
export default async function AnalysisDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requireUser()
  const supabase = await createClient()

  const { data: analysis, error } = await supabase
    .from("analyses")
    .select(
      `
      id,
      title,
      table_type,
      analysis_type,
      status,
      analysis_spec,
      results,
      figure_spec,
      source_data_id,
      experiment_id,
      project_id,
      experiment:experiments(id, name),
      project:projects(id, name)
    `,
    )
    .eq("id", id)
    .maybeSingle()

  // RLS is owner-only, so "not yours" and "not there" both arrive as no row.
  if (error || !analysis) notFound()

  const experiment = Array.isArray(analysis.experiment)
    ? analysis.experiment[0]
    : analysis.experiment
  const project = Array.isArray(analysis.project) ? analysis.project[0] : analysis.project

  // Source candidates for the Data section's picker, same experiment only.
  const { data: fileRows } = await supabase
    .from("experiment_data")
    .select("id, file_name, file_type, tabular_format")
    .eq("experiment_id", analysis.experiment_id)
    .order("created_at", { ascending: false })

  const files = (fileRows ?? []) as DatasetFile[]

  return (
    <div className="space-y-6">
      <SetPageBreadcrumb
        segments={[
          { label: "Analysis", href: "/analysis" },
          { label: analysis.title },
        ]}
      />
      <AnalysisDetailClient
        analysisId={analysis.id}
        title={analysis.title}
        status={analysis.status}
        experimentId={analysis.experiment_id}
        experimentName={experiment?.name ?? null}
        projectName={project?.name ?? null}
        spec={analysis.analysis_spec as AnalysisSpec}
        results={(analysis.results as Results | null) ?? null}
        figureSpec={(analysis.figure_spec as FigureSpec | null) ?? null}
        files={files}
      />
    </div>
  )
}
