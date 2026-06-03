import { createClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/current-user"
import {
  ReportsPageClient,
  type ReportRow,
} from './reports-page-client'
import { CatalystSectionHero } from "@/components/catalyst/catalyst-section-hero"

export default async function ReportsPage() {
  const user = await requireUser()
  const supabase = await createClient()
  // `reports` and `profile` don't depend on each other — fan them out in
  // parallel to cut one roundtrip off every reports-page load.
  const [reportsRes, profileRes] = await Promise.all([
    supabase
      .from("reports")
      .select(`
        *,
        project:projects(id, name),
        experiment:experiments(id, name),
        generated_by:profiles!reports_generated_by_fkey(first_name, last_name)
      `)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single(),
  ])
  const reports = reportsRes.data
  const profile = profileRes.data

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
      <CatalystSectionHero size="sm" scope="reports" shrinkOnScroll />
      <ReportsPageClient
        reports={(reports ?? []) as ReportRow[]}
        projects={safeProjects}
        experiments={safeExperiments}
        userId={user.id}
      />
    </div>
  )
}
