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

  const addFromProtocolRow = (p: { id: string; name: string; version: string | null } | null) => {
    if (p?.id) map.set(p.id, { id: p.id, name: p.name, version: p.version ?? null })
  }

  if (experimentIds.length > 0) {
    const { data: epRows } = await supabase
      .from("experiment_protocols")
      .select("protocol:protocols(id, name, version)")
      .in("experiment_id", experimentIds)
    for (const row of epRows ?? []) {
      addFromProtocolRow(row.protocol as ProjectWorkspaceProtocol | null)
    }
  }

  const notesOr =
    experimentIds.length > 0
      ? `project_id.eq.${projectId},experiment_id.in.(${experimentIds.join(",")})`
      : `project_id.eq.${projectId}`

  const { data: noteRows } = await supabase.from("lab_notes").select("id").or(notesOr)
  const noteIds = (noteRows ?? []).map((n) => n.id).filter(Boolean)
  if (noteIds.length > 0) {
    const { data: lnpRows } = await supabase
      .from("lab_note_protocols")
      .select("protocol:protocols(id, name, version)")
      .in("lab_note_id", noteIds)
    for (const row of lnpRows ?? []) {
      addFromProtocolRow(row.protocol as ProjectWorkspaceProtocol | null)
    }
  }

  const protocolOrParts = [`project_id.eq.${projectId}`]
  if (experimentIds.length > 0) {
    protocolOrParts.push(`experiment_id.in.(${experimentIds.join(",")})`)
  }
  const { data: directRows } = await supabase
    .from("protocols")
    .select("id, name, version")
    .eq("is_active", true)
    .or(protocolOrParts.join(","))

  for (const p of directRows ?? []) {
    if (p.id) map.set(p.id, { id: p.id, name: p.name, version: p.version ?? null })
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}
