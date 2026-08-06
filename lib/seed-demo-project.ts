import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { DemoPack } from "@/lib/onboarding/demo-packs"

export { DEMO_PROJECT_NAMES, resolveDemoPack } from "@/lib/onboarding/demo-packs"

/**
 * Seeds a ready-made demo project (project → experiments → protocol → lab notes
 * → samples → literature) for a new user, so their first moment in Notes9 has
 * real content to explore and Catalyst can answer from *their* project.
 *
 * The content comes from a `DemoPack` chosen by the user's research field, see
 * lib/onboarding/demo-packs.ts. This function is deliberately field-agnostic:
 * it knows the shape, not the science.
 *
 * Uses a service-role client (bypasses RLS): it sets `organization_id` on
 * org-scoped tables and `created_by = userId` on owner-scoped tables (samples,
 * lab_notes, literature_reviews) so the rows are visible to the new user.
 * Idempotent: `projects` has a UNIQUE (organization_id, name) constraint, so a
 * concurrent or repeated seed hits 23505 on the project insert and returns.
 */
export async function seedDemoProject(
  admin: SupabaseClient,
  userId: string,
  organizationId: string,
  pack: DemoPack
): Promise<void> {
  // Namespace globally-unique sample codes per user.
  const suffix = userId.slice(0, 8)

  // 1) Project (unique org+name → also the idempotency guard)
  const projRes = await admin
    .from("projects")
    .insert({
      organization_id: organizationId,
      created_by: userId,
      name: pack.project.name,
      description: pack.project.description,
      status: "active",
      priority: "high",
    })
    .select("id")
    .single()

  if (projRes.error) {
    // 23505 = already seeded (concurrent run or retry), nothing to do.
    if (projRes.error.code === "23505") return
    throw new Error(`seed project failed: ${projRes.error.message}`)
  }
  const projectId = projRes.data.id as string

  // 2) Experiments, insert in pack order so index refs below stay meaningful.
  const expRes = await admin
    .from("experiments")
    .insert(
      pack.experiments.map((exp) => ({
        project_id: projectId,
        created_by: userId,
        name: exp.name,
        description: exp.description,
        ...(exp.hypothesis ? { hypothesis: exp.hypothesis } : {}),
        status: exp.status,
      }))
    )
    .select("id, name")

  // Postgres does not guarantee insert order in the returned rows, so map back
  // by name rather than trusting position.
  const rows = expRes.data ?? []
  const experimentIds = pack.experiments.map(
    (exp) => (rows.find((r) => r.name === exp.name)?.id as string | undefined) ?? null
  )
  const experimentAt = (ref: 0 | 1 | null): string | null =>
    ref === null ? null : (experimentIds[ref] ?? null)

  // 3) Protocol
  await admin.from("protocols").insert({
    organization_id: organizationId,
    created_by: userId,
    name: pack.protocol.name,
    description: pack.protocol.description,
    version: pack.protocol.version,
    category: pack.protocol.category,
    content: pack.protocol.content,
  })

  // 4) Lab notes
  await admin.from("lab_notes").insert(
    pack.labNotes.map((note) => ({
      title: note.title,
      note_type: note.noteType,
      project_id: projectId,
      experiment_id: experimentAt(note.experiment),
      created_by: userId,
      content: note.content,
    }))
  )

  // 5) Samples (sample_code is globally UNIQUE, namespaced per user)
  await admin.from("samples").insert(
    pack.samples.map((sample) => ({
      created_by: userId,
      experiment_id: experimentAt(sample.experiment),
      sample_code: `${sample.code}-${suffix}`,
      sample_type: sample.sampleType,
      description: sample.description,
      storage_location: sample.storageLocation,
      storage_condition: sample.storageCondition,
      ...(sample.quantity !== undefined ? { quantity: sample.quantity } : {}),
      ...(sample.quantityUnit ? { quantity_unit: sample.quantityUnit } : {}),
      status: sample.status,
    }))
  )

  // 6) Literature attached to the demo project
  await admin.from("literature_reviews").insert(
    pack.literature.map((lit) => ({
      organization_id: organizationId,
      created_by: userId,
      project_id: projectId,
      title: lit.title,
      authors: lit.authors,
      journal: lit.journal,
      publication_year: lit.year,
      doi: lit.doi,
      abstract: lit.abstract,
      keywords: lit.keywords,
      status: "saved",
      catalog_placement: "repository",
      relevance_rating: lit.relevance,
    }))
  )
}
