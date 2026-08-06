import { redirect } from "next/navigation"

/**
 * Retired.
 *
 * The spec-driven workspace this route previewed became the Data hub's own
 * Workspace section, which is itself shelved for now. The redirect stays so an
 * old link or bookmark lands on Data files rather than on a 404.
 */
export default function AnalysisWorkspacePreviewPage() {
  redirect("/data")
}
