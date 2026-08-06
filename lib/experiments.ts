import type { SupabaseClient } from "@supabase/supabase-js"

export interface CreateExperimentInput {
  name: string
  projectId: string
  description?: string | null
  hypothesis?: string | null
  status?: string
  startDate?: string | null
  completionDate?: string | null
  assignedTo: string | null
  createdBy: string
}

/**
 * Single writer for creating an experiment row. Call sites disagree on which
 * optional fields they populate (new-experiment form omits hypothesis;
 * duplicate copies hypothesis + assigned_to from the source; import supplies
 * neither), every field but name/projectId/assignedTo/createdBy is
 * optional and omitted keys are dropped from the insert (Supabase serializes
 * `undefined` away), so each caller's exact prior payload is preserved.
 */
export async function createExperiment(supabase: SupabaseClient, input: CreateExperimentInput) {
  return supabase
    .from("experiments")
    .insert({
      name: input.name,
      project_id: input.projectId,
      description: input.description,
      hypothesis: input.hypothesis,
      status: input.status ?? "planned",
      start_date: input.startDate ?? null,
      completion_date: input.completionDate ?? null,
      assigned_to: input.assignedTo,
      created_by: input.createdBy,
    })
    .select()
    .single()
}

export interface UpdateExperimentFields {
  name?: string
  description?: string | null
  hypothesis?: string | null
  status?: string
  startDate?: string | null
  completionDate?: string | null
  projectId?: string
  assignedTo?: string | null
}

/**
 * Partial update, used both for the full edit form
 * (edit-experiment-dialog.tsx) and the status-only quick action
 * (status-update-buttons.tsx). Omitted fields are left untouched, only
 * `updated_at` is always set.
 */
export async function updateExperiment(
  supabase: SupabaseClient,
  experimentId: string,
  fields: UpdateExperimentFields,
) {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (fields.name !== undefined) payload.name = fields.name
  if (fields.description !== undefined) payload.description = fields.description
  if (fields.hypothesis !== undefined) payload.hypothesis = fields.hypothesis
  if (fields.status !== undefined) payload.status = fields.status
  if (fields.startDate !== undefined) payload.start_date = fields.startDate
  if (fields.completionDate !== undefined) payload.completion_date = fields.completionDate
  if (fields.projectId !== undefined) payload.project_id = fields.projectId
  if (fields.assignedTo !== undefined) payload.assigned_to = fields.assignedTo
  return supabase.from("experiments").update(payload).eq("id", experimentId)
}

export async function deleteExperiment(supabase: SupabaseClient, experimentId: string) {
  return supabase.from("experiments").delete().eq("id", experimentId)
}

/**
 * Import-only: locate an existing experiment by name (optionally scoped to
 * a project). Matching by name is only valid in an import context where
 * names come from a backup/source system, not a general-purpose lookup.
 * Shared by `upsertExperimentByName` below (research-folder importer) and
 * the full-backup restorer's `resolveExistingId`, so "what counts as the
 * same experiment" can't drift between the two import paths again.
 */
export async function findExperimentByName(
  supabase: SupabaseClient,
  name: string,
  projectId?: string | null,
): Promise<string | null> {
  let query = supabase.from("experiments").select("id").eq("name", name)
  if (projectId) query = query.eq("project_id", projectId)
  const { data } = await query.maybeSingle()
  return data?.id ?? null
}

/**
 * Import-only find-or-create: try `createExperiment` with the
 * research-folder importer's defaults (status "planned"), and on failure
 * fall back to `findExperimentByName` scoped to the project, this is
 * `ensureExperimentId`'s exact prior control flow, just routed through the
 * shared writer/lookup. Normal app create paths always want a fresh row and
 * should call `createExperiment` directly.
 */
export async function upsertExperimentByName(
  supabase: SupabaseClient,
  { name, projectId, userId }: { name: string; projectId: string; userId: string },
): Promise<string | null> {
  const { data } = await createExperiment(supabase, {
    name,
    projectId,
    status: "planned",
    assignedTo: userId,
    createdBy: userId,
  })
  if (data?.id) return data.id as string
  return findExperimentByName(supabase, name, projectId)
}
