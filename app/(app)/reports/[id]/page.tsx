import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/current-user"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { ReportDetailClient } from "./report-detail-client"
import type { ReportRow } from "../reports-page-client"

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireUser()
  const supabase = await createClient()
  const { data: report, error } = await supabase
    .from("reports")
    .select(`
      *,
      project:projects(id, name),
      experiment:experiments(id, name),
      generated_by:profiles!reports_generated_by_fkey(first_name, last_name)
    `)
    .eq("id", id)
    .single()

  if (error || !report) {
    notFound()
  }

  const titleShort =
    report.title.length > 50
      ? `${report.title.substring(0, 50)}...`
      : report.title

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <SetPageBreadcrumb
        segments={[
          { label: "Reports", href: "/reports" },
          { label: titleShort },
        ]}
      />
      <ReportDetailClient activeReport={report as ReportRow & { content: string | null }} />
    </div>
  )
}
