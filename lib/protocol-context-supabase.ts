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

export function isProtocolDocumentTemplateColumnError(err: { message?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase()
  return m.includes("document_template_id") || (m.includes("column") && m.includes("document_template"))
}

type ProtocolInsert = Record<string, unknown>

/**
 * Insert a protocol row. Retries without optional columns when the schema is behind migrations.
 */
export async function insertProtocolWithOptionalContext(
  supabase: SupabaseClient,
  row: ProtocolInsert
): Promise<{ data: unknown; error: Error | null; contextSaved: boolean }> {
  let current: ProtocolInsert = { ...row }
  let contextSaved = true

  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await supabase.from("protocols").insert(current).select().single()

    if (!error) {
      return { data, error: null, contextSaved }
    }

    if (isProtocolContextColumnError(error)) {
      const { project_id: _p, experiment_id: _e, ...rest } = current
      current = rest
      contextSaved = false
      continue
    }

    if (isProtocolDocumentTemplateColumnError(error)) {
      const { document_template_id: _dt, ...rest } = current
      current = rest
      continue
    }

    return { data: null, error: error as Error, contextSaved: false }
  }

  return { data: null, error: new Error("insertProtocolWithOptionalContext: max retries"), contextSaved: false }
}

/**
 * Update a protocol row. Retries without optional columns when the schema is behind migrations.
 */
export async function updateProtocolWithOptionalContext(
  supabase: SupabaseClient,
  id: string,
  patch: ProtocolInsert
): Promise<{ error: Error | null; contextSaved: boolean }> {
  let current: ProtocolInsert = { ...patch }
  let contextSaved = true

  for (let attempt = 0; attempt < 6; attempt++) {
    const { error } = await supabase.from("protocols").update(current).eq("id", id)

    if (!error) {
      return { error: null, contextSaved }
    }

    if (isProtocolContextColumnError(error)) {
      const { project_id: _p, experiment_id: _e, ...rest } = current
      current = rest
      contextSaved = false
      continue
    }

    if (isProtocolDocumentTemplateColumnError(error)) {
      const { document_template_id: _dt, ...rest } = current
      current = rest
      continue
    }

    return { error: error as Error, contextSaved: false }
  }

  return { error: new Error("updateProtocolWithOptionalContext: max retries"), contextSaved: false }
}
