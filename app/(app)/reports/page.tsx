import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Plus } from 'lucide-react'
import {
  ReportsPageClient,
  ReportsAnalyticsSection,
  type ReportRow,
} from './reports-page-client'

export default async function ReportsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  const { data: reports } = await supabase
    .from("reports")
    .select(`
      *,
      project:projects(id, name),
      experiment:experiments(id, name),
      generated_by:profiles!reports_generated_by_fkey(first_name, last_name)
    `)
    .order("created_at", { ascending: false })

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Reports & Analytics</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            View and generate research reports
          </p>
        </div>
        <Button className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Generate Report
        </Button>
      </div>

      <ReportsPageClient reports={(reports ?? []) as ReportRow[]} />

      <ReportsAnalyticsSection />
    </div>
  )
}
