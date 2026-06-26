import type { SupabaseClient } from "@supabase/supabase-js"

export type ProjectWorkspaceProtocol = { id: string; name: string; version: string | null }

/**
 * Protocols relevant to a project workspace: linked via experiment_protocols,
 * referenced from lab notes in this project, or stored on protocols.project_id /
 * protocols.experiment_id (migration 030).
 */
export async function loadProjectWorkspaceProtocols(
  supabase: SupabaseClient,
  projectId: string,
  experimentIds: string[]
): Promise<ProjectWorkspaceProtocol[]> {
  const map = new Map<string, ProjectWorkspaceProtocol>()

  const coerceProtocolRow = (value: unknown): ProjectWorkspaceProtocol | null => {
    if (!value || Array.isArray(value) || typeof value !== "object") return null
    const row = value as Record<string, unknown>
    if (typeof row.id !== "string" || typeof row.name !== "string") return null
    return {
      id: row.id,
      name: row.name,
      version: typeof row.version === "string" ? row.version : null,
    }
  }

  const addFromProtocolRow = (p: { id: string; name: string; version: string | null } | null) => {
    if (p?.id) map.set(p.id, { id: p.id, name: p.name, version: p.version ?? null })
  }

  const notesOr =
    experimentIds.length > 0
      ? `project_id.eq.${projectId},experiment_id.in.(${experimentIds.join(",")})`
      : `project_id.eq.${projectId}`

  const protocolOrParts = [`project_id.eq.${projectId}`]
  if (experimentIds.length > 0) {
    protocolOrParts.push(`experiment_id.in.(${experimentIds.join(",")})`)
  }

  // The three sources (experiment links, lab-note links, direct project/experiment
  // columns) are independent — fan them out concurrently instead of awaiting each
  // in series. The lab-note source is itself a 2-step chain (notes -> note links)
  // wrapped in an IIFE so it overlaps with the other two queries.
  type ProtocolJoinRow = { protocol: unknown }
  const epPromise =
    experimentIds.length > 0
      ? supabase
          .from("experiment_protocols")
          .select("protocol:protocols(id, name, version)")
          .in("experiment_id", experimentIds)
      : Promise.resolve({ data: [] as ProtocolJoinRow[] })

  const notePromise = (async (): Promise<{ data: ProtocolJoinRow[] | null }> => {
    const { data: noteRows } = await supabase.from("lab_notes").select("id").or(notesOr)
    const noteIds = (noteRows ?? []).map((n) => n.id).filter(Boolean)
    if (noteIds.length === 0) return { data: [] }
    const { data } = await supabase
      .from("lab_note_protocols")
      .select("protocol:protocols(id, name, version)")
      .in("lab_note_id", noteIds)
    return { data: (data as ProtocolJoinRow[] | null) ?? [] }
  })()

  const directPromise = supabase
    .from("protocols")
    .select("id, name, version")
    .or(protocolOrParts.join(","))

  const [epRes, lnpRes, directRes] = await Promise.all([epPromise, notePromise, directPromise])

  for (const row of (epRes.data ?? []) as ProtocolJoinRow[]) {
    addFromProtocolRow(coerceProtocolRow(row.protocol))
  }
  for (const row of lnpRes.data ?? []) {
    addFromProtocolRow(coerceProtocolRow(row.protocol))
  }
  for (const p of (directRes.data ?? []) as Array<{ id: string; name: string; version: string | null }>) {
    if (p.id) map.set(p.id, { id: p.id, name: p.name, version: p.version ?? null })
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}
