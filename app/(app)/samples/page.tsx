import { createClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/current-user"
import { SamplesPageContent, SamplesEmptyState, type Sample } from './samples-page-content'
import { CatalystSectionHero } from "@/components/catalyst/catalyst-section-hero"

export default async function SamplesPage() {
  const user = await requireUser()
  const supabase = await createClient()
  let { data: samples, error: samplesError } = await supabase
    .from("samples")
    .select(`
      id, sample_code, sample_type, status, quantity, quantity_unit,
      storage_location, storage_condition, concentration, concentration_unit,
      created_at, updated_at, experiment_id,
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

  // Supabase models the embedded relations as arrays, which conflicts with the
  // object-shaped `Sample` rows the UI consumes; bridge with an unknown cast.
  const safeSamples = (samples ?? []) as unknown as Sample[]
  const statusCount = {
    available: safeSamples.filter((s) => s.status === "available").length,
    in_use: safeSamples.filter((s) => s.status === "in_use").length,
    depleted: safeSamples.filter((s) => s.status === "depleted").length,
    disposed: safeSamples.filter((s) => s.status === "disposed").length,
  }

  return (
    <div className="space-y-6">
      <CatalystSectionHero size="sm" scope="samples" shrinkOnScroll />
      {safeSamples.length > 0 ? (
        <SamplesPageContent samples={safeSamples} statusCount={statusCount} />
      ) : (
        <SamplesEmptyState />
      )}
    </div>
  )
}
