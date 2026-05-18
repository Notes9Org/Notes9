import type { SupabaseClient } from "@supabase/supabase-js"

export type ProtocolExperimentUsageRow = {
  key: string
  source: "experiment_link" | "lab_note" | "direct_protocol"
  experimentName: string
  projectName: string
  projectId: string | null
  status: string
  actionHref: string
}

function experimentHref(experimentId: string, projectId: string | null | undefined) {
  if (projectId) return `/experiments/${experimentId}?project=${projectId}`
  return `/experiments/${experimentId}`
}

/**
 * All places a protocol shows up as "used" for the protocol detail Usage tab:
 * experiment_protocols, lab notes (with experiment or project context), and
 * protocols.experiment_id when set without a junction row.
 */
export async function loadProtocolExperimentUsage(
  supabase: SupabaseClient,
  protocolId: string,
  protocolExperimentId: string | null | undefined
): Promise<ProtocolExperimentUsageRow[]> {
  const rows: ProtocolExperimentUsageRow[] = []
  const seenExperimentIds = new Set<string>()

  const { data: junctionRows } = await supabase
    .from("experiment_protocols")
    .select(
      `
      id,
      experiment:experiments(
        id,
        name,
        status,
        project:projects(id, name)
      )
    `
    )
    .eq("protocol_id", protocolId)

  for (const row of junctionRows ?? []) {
    // PostgREST nested-relation typings come back as an array, but our query
    // joins one-to-one — flatten then cast through `unknown` to the intended shape.
    const exRaw: unknown = Array.isArray(row.experiment) ? row.experiment[0] : row.experiment
    const ex = exRaw as
      | { id: string; name: string; status: string | null; project?: { id: string; name: string } | null }
      | null
    if (!ex?.id) continue
    seenExperimentIds.add(ex.id)
    rows.push({
      key: `ep-${row.id}`,
      source: "experiment_link",
      experimentName: ex.name,
      projectName: ex.project?.name ?? "—",
      projectId: ex.project?.id ?? null,
      status: ex.status ?? "—",
      actionHref: experimentHref(ex.id, ex.project?.id),
    })
  }

  const { data: noteLinkRows } = await supabase
    .from("lab_note_protocols")
    .select(
      `
      id,
      lab_note:lab_notes(
        id,
        title,
        experiment:experiments(
          id,
          name,
          status,
          project:projects(id, name)
        ),
        project:projects(id, name)
      )
    `
    )
    .eq("protocol_id", protocolId)

  for (const row of noteLinkRows ?? []) {
    const noteRaw: unknown = Array.isArray(row.lab_note) ? row.lab_note[0] : row.lab_note
    const noteCast = noteRaw as {
      id: string
      title: string | null
      experiment?:
        | { id: string; name: string; status: string | null; project?: { id: string; name: string } | null }
        | Array<{ id: string; name: string; status: string | null; project?: { id: string; name: string } | null }>
        | null
      project?:
        | { id: string; name: string }
        | Array<{ id: string; name: string }>
        | null
    } | null
    if (!noteCast) continue
    const note = {
      ...noteCast,
      experiment: Array.isArray(noteCast.experiment) ? noteCast.experiment[0] ?? null : noteCast.experiment,
      project: Array.isArray(noteCast.project) ? noteCast.project[0] ?? null : noteCast.project,
    }

    if (note.experiment?.id) {
      if (seenExperimentIds.has(note.experiment.id)) continue
      seenExperimentIds.add(note.experiment.id)
      const ex = note.experiment
      rows.push({
        key: `ln-${row.id}`,
        source: "lab_note",
        experimentName: ex.name,
        projectName: ex.project?.name ?? "—",
        projectId: ex.project?.id ?? null,
        status: ex.status ?? "—",
        actionHref: experimentHref(ex.id, ex.project?.id),
      })
    } else if (note.project?.id) {
      rows.push({
        key: `ln-proj-${row.id}`,
        source: "lab_note",
        experimentName: `Lab note: ${note.title?.trim() || "Untitled"}`,
        projectName: note.project.name,
        projectId: note.project.id,
        status: "—",
        actionHref: `/projects/${note.project.id}`,
      })
    }
  }

  if (protocolExperimentId && !seenExperimentIds.has(protocolExperimentId)) {
    const { data: ex } = await supabase
      .from("experiments")
      .select(
        `
        id,
        name,
        status,
        project:projects(id, name)
      `
      )
      .eq("id", protocolExperimentId)
      .maybeSingle()

    if (ex?.id) {
      const projectRaw: unknown = Array.isArray(ex.project) ? ex.project[0] : ex.project
      const project = projectRaw as { id: string; name: string } | null | undefined
      rows.push({
        key: "direct-protocol-experiment",
        source: "direct_protocol",
        experimentName: ex.name,
        projectName: project?.name ?? "—",
        projectId: project?.id ?? null,
        status: ex.status ?? "—",
        actionHref: experimentHref(ex.id, project?.id),
      })
    }
  }

  return rows
}
