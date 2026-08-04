import type { SupabaseClient } from "@supabase/supabase-js"

export interface CreateProjectInput {
  name: string
  description?: string | null
  status?: string
  priority?: string | null
  startDate?: string | null
  endDate?: string | null
  organizationId: string
  createdBy: string
  /**
   * Insert a `project_members` "lead" row for `createdBy` after the project
   * is created. Every current call site wants this except
   * duplicate-project-dialog.tsx, which copies the SOURCE project's existing
   * members instead (conditionally, only when "Copy team members" is
   * checked), pass `false` there and let the caller keep handling
   * membership itself.
   */
  withLeadMembership?: boolean
}

/**
 * Single writer for creating a project row. Mirrors the shape used by both
 * `projects/new/page.tsx` and the research-folder importer's
 * `ensureProjectId` (now `upsertProjectByName` below), which had drifted
 * import hardcoded status/priority and skipped description/dates. Those are
 * now explicit optional params so each caller's exact prior payload is
 * preserved.
 */
export async function createProject(supabase: SupabaseClient, input: CreateProjectInput) {
  const { withLeadMembership = true, ...fields } = input
  const { data, error } = await supabase
    .from("projects")
    .insert({
      name: fields.name,
      description: fields.description ?? null,
      status: fields.status ?? "planning",
      priority: fields.priority ?? null,
      start_date: fields.startDate ?? null,
      end_date: fields.endDate ?? null,
      organization_id: fields.organizationId,
      created_by: fields.createdBy,
    })
    .select()
    .single()

  if (error || !data) return { data, error }

  if (withLeadMembership) {
    // Fire-and-forget, matching every existing caller (none of them check
    // this insert's error today).
    await supabase.from("project_members").insert({
      project_id: data.id,
      user_id: fields.createdBy,
      role: "lead",
    })
  }

  return { data, error: null }
}

export interface UpdateProjectFields {
  name?: string
  description?: string | null
  status?: string
  priority?: string | null
  startDate?: string | null
  endDate?: string | null
}

/**
 * Partial update, used both for the full edit form (edit-project-dialog.tsx)
 * and the status-only quick action (project-status-update-buttons.tsx).
 * Omitted fields are left untouched, only `updated_at` is always set.
 */
export async function updateProject(
  supabase: SupabaseClient,
  projectId: string,
  fields: UpdateProjectFields,
) {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (fields.name !== undefined) payload.name = fields.name
  if (fields.description !== undefined) payload.description = fields.description
  if (fields.status !== undefined) payload.status = fields.status
  if (fields.priority !== undefined) payload.priority = fields.priority
  if (fields.startDate !== undefined) payload.start_date = fields.startDate
  if (fields.endDate !== undefined) payload.end_date = fields.endDate
  return supabase.from("projects").update(payload).eq("id", projectId)
}

export async function deleteProject(supabase: SupabaseClient, projectId: string) {
  return supabase.from("projects").delete().eq("id", projectId)
}

/**
 * Import-only find-or-create: try `createProject` with the research-folder
 * importer's defaults (status "planning", priority "medium"), and on
 * failure (e.g. a duplicate-name conflict within the org) fall back to the
 * existing row for that org+name, this is `ensureProjectId`'s exact prior
 * control flow, just routed through the shared writer. Normal app create
 * paths always want a fresh row and should call `createProject` directly.
 */
export async function upsertProjectByName(
  supabase: SupabaseClient,
  { name, organizationId, createdBy }: { name: string; organizationId: string; createdBy: string },
): Promise<string | null> {
  const { data } = await createProject(supabase, {
    name,
    organizationId,
    createdBy,
    status: "planning",
    priority: "medium",
  })
  if (data?.id) return data.id as string

  const existing = await supabase
    .from("projects")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", name)
    .maybeSingle()

  return existing.data?.id ?? null
}
