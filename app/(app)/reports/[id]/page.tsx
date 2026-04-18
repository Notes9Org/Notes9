import { redirect, notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { SetPageBreadcrumb } from "@/components/layout/breadcrumb-context"
import { ReportDetailView } from "./report-detail-view"
import type { ReportRow } from "../reports-page-client"

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

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
    <div className="space-y-6">
      <SetPageBreadcrumb
        segments={[
          { label: "Reports", href: "/reports" },
          { label: titleShort },
        ]}
      />
      <ReportDetailView report={report as ReportRow & { content: string | null }} />
    </div>
  )
}
