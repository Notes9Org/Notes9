import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * PostgREST / schema cache errors when project_id / experiment_id columns are missing.
 */
export function isProtocolContextColumnError(err: { message?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase()
  return (
    m.includes("project_id") ||
    m.includes("experiment_id") ||
    m.includes("schema cache")
  )
}

type ProtocolInsert = Record<string, unknown>

/**
 * Insert a protocol row. If DB has no project_id/experiment_id columns yet, retries without them.
 */
export async function insertProtocolWithOptionalContext(
  supabase: SupabaseClient,
  row: ProtocolInsert
): Promise<{ data: unknown; error: Error | null; contextSaved: boolean }> {
  const { data, error } = await supabase.from("protocols").insert(row).select().single()

  if (!error) {
    return { data, error: null, contextSaved: true }
  }

  if (!isProtocolContextColumnError(error)) {
    return { data: null, error: error as Error, contextSaved: false }
  }

  const { project_id: _p, experiment_id: _e, ...rest } = row
  const retry = await supabase.from("protocols").insert(rest).select().single()

  if (retry.error) {
    return { data: null, error: retry.error as Error, contextSaved: false }
  }

  return { data: retry.data, error: null, contextSaved: false }
}

/**
 * Update a protocol row. Retries without project_id/experiment_id if columns missing.
 */
export async function updateProtocolWithOptionalContext(
  supabase: SupabaseClient,
  id: string,
  patch: ProtocolInsert
): Promise<{ error: Error | null; contextSaved: boolean }> {
  const { error } = await supabase.from("protocols").update(patch).eq("id", id)

  if (!error) {
    return { error: null, contextSaved: true }
  }

  if (!isProtocolContextColumnError(error)) {
    return { error: error as Error, contextSaved: false }
  }

  const { project_id: _p, experiment_id: _e, ...rest } = patch
  const retry = await supabase.from("protocols").update(rest).eq("id", id)

  if (retry.error) {
    return { error: retry.error as Error, contextSaved: false }
  }

  return { error: null, contextSaved: false }
}
