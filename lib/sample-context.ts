import type { SupabaseClient } from "@supabase/supabase-js"

export type SampleContextOptions = {
  sampleId: string
  userId: string
  projectIds?: string[]
  experimentIds?: string[]
  labNoteIds?: string[]
}

async function replaceLinks(
  supabase: SupabaseClient,
  table: "sample_projects" | "sample_experiments" | "sample_lab_notes",
  sampleId: string,
  userId: string,
  targetColumn: "project_id" | "experiment_id" | "lab_note_id",
  targetIds: string[]
) {
  const cleanIds = Array.from(new Set(targetIds.filter(Boolean)))

  const { error: deleteError } = await supabase.from(table).delete().eq("sample_id", sampleId)
  if (deleteError) throw deleteError

  if (cleanIds.length === 0) return

  const { error: insertError } = await supabase.from(table).insert(
    cleanIds.map((id) => ({
      sample_id: sampleId,
      [targetColumn]: id,
      linked_by: userId,
    }))
  )
  if (insertError) throw insertError
}

export async function replaceSampleContextLinks(
  supabase: SupabaseClient,
  options: SampleContextOptions
) {
  await replaceLinks(
    supabase,
    "sample_projects",
    options.sampleId,
    options.userId,
    "project_id",
    options.projectIds ?? []
  )
  await replaceLinks(
    supabase,
    "sample_experiments",
    options.sampleId,
    options.userId,
    "experiment_id",
    options.experimentIds ?? []
  )
  await replaceLinks(
    supabase,
    "sample_lab_notes",
    options.sampleId,
    options.userId,
    "lab_note_id",
    options.labNoteIds ?? []
  )
}
