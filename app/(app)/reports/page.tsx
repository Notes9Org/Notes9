import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import {
  ReportsPageClient,
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

  // Fetch profile to get organization_id (same pattern as literature-reviews page)
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single()

  const organizationId = profile?.organization_id

  const { data: projects = [] } = organizationId
    ? await supabase
        .from("projects")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("name")
    : { data: [] as { id: string; name: string }[] }
  const safeProjects = projects ?? []

  const projectIds = safeProjects.map((p) => p.id)
  const { data: experiments = [] } =
    organizationId && projectIds.length > 0
      ? await supabase
          .from("experiments")
          .select("id, name, project_id")
          .in("project_id", projectIds)
          .order("name")
      : { data: [] as { id: string; name: string; project_id: string }[] }
  const safeExperiments = experiments ?? []

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Reports & Analytics</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            View and generate research reports
          </p>
        </div>
      </div>

      <ReportsPageClient
        reports={(reports ?? []) as ReportRow[]}
        projects={safeProjects}
        experiments={safeExperiments}
        userId={user.id}
      />
    </div>
  )
}
