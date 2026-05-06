import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { SamplesPageContent, SamplesEmptyState } from './samples-page-content'

export default async function SamplesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  let { data: samples, error: samplesError } = await supabase
    .from("samples")
    .select(`
      *,
      sample_files(id, file_kind),
      sample_projects(
        project:projects(id, name)
      ),
      sample_experiments(
        experiment:experiments(
          id,
          name,
          project_id,
          project:projects(id, name)
        )
      ),
      experiment:experiments(
        id,
        name,
        project_id,
        project:projects(id, name)
      )
    `)
    .order("created_at", { ascending: false })
    .limit(100)

  if (samplesError) {
    const fallback = await supabase
      .from("samples")
      .select(`
        *,
        experiment:experiments(
          id,
          name,
          project_id,
          project:projects(id, name)
        )
      `)
      .order("created_at", { ascending: false })
      .limit(100)
    samples = fallback.data
  }

  const safeSamples = samples ?? []
  const statusCount = {
    available: safeSamples.filter((s) => s.status === "available").length,
    in_use: safeSamples.filter((s) => s.status === "in_use").length,
    depleted: safeSamples.filter((s) => s.status === "depleted").length,
    disposed: safeSamples.filter((s) => s.status === "disposed").length,
  }

  return (
    <div className="space-y-6">
      {safeSamples.length > 0 ? (
        <SamplesPageContent samples={safeSamples} statusCount={statusCount} />
      ) : (
        <SamplesEmptyState />
      )}
    </div>
  )
}
