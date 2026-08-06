import { redirect } from "next/navigation"

/**
 * Retired.
 *
 * The spec-driven workspace this route previewed is now the Data page's own
 * Workspace section, reading the same sheet as the chart workspace beside it.
 * The redirect stays so an old link or bookmark lands somewhere useful rather
 * than on a 404.
 */
export default function AnalysisWorkspacePreviewPage() {
  redirect("/data-analysis")
}
