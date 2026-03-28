import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type {
  ResearchMapEdge,
  ResearchMapNode,
  ResearchMapNodeKind,
} from "@/lib/research-map-types"

const MAX_NODES = 500
const MAX_EDGES = 1500
const CHUNK = 120

const ALL_KINDS: ResearchMapNodeKind[] = [
  "project",
  "experiment",
  "protocol",
  "literature",
  "lab_note",
  "paper",
]

function parseIncludeTypes(raw: string | null): Set<ResearchMapNodeKind> {
  if (!raw?.trim()) return new Set(ALL_KINDS)
  const parts = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const allowed = new Set<ResearchMapNodeKind>()
  for (const p of parts) {
    if (ALL_KINDS.includes(p as ResearchMapNodeKind)) {
      allowed.add(p as ResearchMapNodeKind)
    }
  }
  return allowed.size > 0 ? allowed : new Set(ALL_KINDS)
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}

function nodeId(kind: ResearchMapNodeKind, uuid: string) {
  return `${kind}:${uuid}`
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const projectId = url.searchParams.get("projectId")
  const includeTypes = parseIncludeTypes(url.searchParams.get("includeTypes"))

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single()

  if (profileError || !profile?.organization_id) {
    return NextResponse.json(
      { error: "Unable to resolve organization context." },
      { status: 400 },
    )
  }

  const orgId = profile.organization_id

  const nodes = new Map<string, ResearchMapNode>()
  const pendingEdges: ResearchMapEdge[] = []
  let truncated = false
  let truncatedReason: string | undefined

  const addNode = (n: ResearchMapNode) => {
    if (!includeTypes.has(n.kind)) return
    nodes.set(n.id, n)
  }

  /** Queue edges before all endpoints exist (e.g. protocol nodes added after junction rows). */
  const queueEdge = (e: ResearchMapEdge) => {
    if (pendingEdges.length >= MAX_EDGES) {
      truncated = true
      truncatedReason = truncatedReason ?? "edge_limit"
      return
    }
    pendingEdges.push(e)
  }

  try {
    if (projectId) {
      const { data: projectRow, error: projErr } = await supabase
        .from("projects")
        .select("id, name, status, description")
        .eq("id", projectId)
        .eq("organization_id", orgId)
        .maybeSingle()

      if (projErr || !projectRow) {
        return NextResponse.json(
          { error: "Project not found or not accessible." },
          { status: 404 },
        )
      }

      if (includeTypes.has("project")) {
        addNode({
          id: nodeId("project", projectRow.id),
          kind: "project",
          label: projectRow.name || "Untitled project",
          href: `/projects/${projectRow.id}`,
          meta: {
            status: projectRow.status ?? null,
            description: projectRow.description
              ? String(projectRow.description).slice(0, 200)
              : null,
          },
        })
      }

      const { data: experiments } = await supabase
        .from("experiments")
        .select("id, name, status, project_id")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false })
        .limit(400)

      const expList = experiments ?? []
      const experimentIds = expList.map((e) => e.id)

      for (const e of expList) {
        if (includeTypes.has("experiment")) {
          addNode({
            id: nodeId("experiment", e.id),
            kind: "experiment",
            label: e.name || "Untitled experiment",
            href: `/experiments/${e.id}`,
            meta: { status: e.status ?? null },
          })
        }
        if (includeTypes.has("project") && includeTypes.has("experiment")) {
          queueEdge({
            id: `project_contains_experiment:${projectRow.id}:${e.id}`,
            source: nodeId("project", projectRow.id),
            target: nodeId("experiment", e.id),
            kind: "project_contains_experiment",
            label: "experiment",
          })
        }
      }

      let notesQuery = supabase
        .from("lab_notes")
        .select("id, title, note_type, experiment_id, project_id")
        .eq("project_id", projectId)
        .limit(400)

      if (experimentIds.length > 0) {
        notesQuery = supabase
          .from("lab_notes")
          .select("id, title, note_type, experiment_id, project_id")
          .or(
            `project_id.eq.${projectId},experiment_id.in.(${experimentIds.join(",")})`,
          )
          .limit(400)
      }

      const { data: notes } = await notesQuery
      const noteList = notes ?? []
      const noteIds = noteList.map((n) => n.id)

      for (const n of noteList) {
        if (includeTypes.has("lab_note")) {
          const expId = n.experiment_id
          addNode({
            id: nodeId("lab_note", n.id),
            kind: "lab_note",
            label: n.title || "Untitled note",
            href: expId
              ? `/experiments/${expId}?tab=notes&noteId=${n.id}`
              : `/lab-notes`,
            meta: { note_type: n.note_type ?? null },
          })
        }
        if (
          includeTypes.has("experiment") &&
          includeTypes.has("lab_note") &&
          n.experiment_id
        ) {
          queueEdge({
            id: `experiment_has_note:${n.experiment_id}:${n.id}`,
            source: nodeId("experiment", n.experiment_id),
            target: nodeId("lab_note", n.id),
            kind: "experiment_has_lab_note",
            label: "Lab note",
          })
        }
        if (
          includeTypes.has("project") &&
          includeTypes.has("lab_note") &&
          n.project_id &&
          !n.experiment_id
        ) {
          queueEdge({
            id: `project_has_note:${n.project_id}:${n.id}`,
            source: nodeId("project", n.project_id),
            target: nodeId("lab_note", n.id),
            kind: "project_has_lab_note",
            label: "Project note",
          })
        }
      }

      let litQuery = supabase
        .from("literature_reviews")
        .select("id, title, status, project_id, experiment_id")
        .eq("project_id", projectId)
        .limit(400)

      if (experimentIds.length > 0) {
        litQuery = supabase
          .from("literature_reviews")
          .select("id, title, status, project_id, experiment_id")
          .or(
            `project_id.eq.${projectId},experiment_id.in.(${experimentIds.join(",")})`,
          )
          .limit(400)
      }

      const { data: literature } = await litQuery
      const litList = literature ?? []

      for (const l of litList) {
        if (includeTypes.has("literature")) {
          addNode({
            id: nodeId("literature", l.id),
            kind: "literature",
            label: l.title || "Untitled source",
            href: `/literature-reviews/${l.id}`,
            meta: { status: l.status ?? null },
          })
        }
        if (
          includeTypes.has("project") &&
          includeTypes.has("literature") &&
          l.project_id &&
          !l.experiment_id
        ) {
          queueEdge({
            id: `project_literature:${l.project_id}:${l.id}`,
            source: nodeId("project", l.project_id),
            target: nodeId("literature", l.id),
            kind: "project_linked_literature",
            label: "Linked literature",
          })
        }
        if (
          includeTypes.has("experiment") &&
          includeTypes.has("literature") &&
          l.experiment_id
        ) {
          queueEdge({
            id: `experiment_literature:${l.experiment_id}:${l.id}`,
            source: nodeId("experiment", l.experiment_id),
            target: nodeId("literature", l.id),
            kind: "experiment_linked_literature",
            label: "Linked literature",
          })
        }
      }

      const protocolIds = new Set<string>()
      for (const chunk of chunkArray(experimentIds, CHUNK)) {
        if (chunk.length === 0) continue
        const { data: epRows } = await supabase
          .from("experiment_protocols")
          .select("experiment_id, protocol_id")
          .in("experiment_id", chunk)
        for (const row of epRows ?? []) {
          protocolIds.add(row.protocol_id)
          if (
            includeTypes.has("experiment") &&
            includeTypes.has("protocol")
          ) {
            queueEdge({
              id: `exp_proto:${row.experiment_id}:${row.protocol_id}`,
              source: nodeId("experiment", row.experiment_id),
              target: nodeId("protocol", row.protocol_id),
              kind: "experiment_uses_protocol",
              label: "Uses protocol",
            })
          }
        }
      }

      for (const chunk of chunkArray(noteIds, CHUNK)) {
        if (chunk.length === 0) continue
        const { data: lnpRows } = await supabase
          .from("lab_note_protocols")
          .select("lab_note_id, protocol_id")
          .in("lab_note_id", chunk)
        for (const row of lnpRows ?? []) {
          protocolIds.add(row.protocol_id)
          if (
            includeTypes.has("lab_note") &&
            includeTypes.has("protocol")
          ) {
            queueEdge({
              id: `note_proto:${row.lab_note_id}:${row.protocol_id}`,
              source: nodeId("lab_note", row.lab_note_id),
              target: nodeId("protocol", row.protocol_id),
              kind: "lab_note_references_protocol",
              label: "References protocol",
            })
          }
        }
      }

      if (protocolIds.size > 0 && includeTypes.has("protocol")) {
        for (const chunk of chunkArray([...protocolIds], CHUNK)) {
          const { data: protos } = await supabase
            .from("protocols")
            .select("id, name, version, category")
            .in("id", chunk)
          for (const p of protos ?? []) {
            addNode({
              id: nodeId("protocol", p.id),
              kind: "protocol",
              label: p.name || "Untitled protocol",
              href: `/protocols/${p.id}`,
              meta: {
                version: p.version ?? null,
                category: p.category ?? null,
              },
            })
          }
        }
      }

      // Papers (writing section) linked to this project
      if (includeTypes.has("paper")) {
        const { data: paperRows } = await supabase
          .from("papers")
          .select("id, title, status, project_id")
          .eq("project_id", projectId)
          .order("updated_at", { ascending: false })
          .limit(200)
        for (const paper of paperRows ?? []) {
          addNode({
            id: nodeId("paper", paper.id),
            kind: "paper",
            label: paper.title || "Untitled paper",
            href: `/papers/${paper.id}`,
            meta: { status: paper.status ?? null },
          })
          if (includeTypes.has("project")) {
            queueEdge({
              id: `project_paper:${projectRow.id}:${paper.id}`,
              source: nodeId("project", projectRow.id),
              target: nodeId("paper", paper.id),
              kind: "project_contains_paper",
              label: "Paper",
            })
          }
        }
      }
    } else {
      // Fetch all org projects first so empty projects always appear in the map
      const { data: allOrgProjects } = await supabase
        .from("projects")
        .select("id, name, status, description")
        .eq("organization_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(300)

      const projectIdSet = new Set<string>()
      for (const p of allOrgProjects ?? []) {
        projectIdSet.add(p.id)
      }

      const { data: experiments } = await supabase
        .from("experiments")
        .select("id, name, status, project_id")
        .order("updated_at", { ascending: false })
        .limit(400)

      const expList = experiments ?? []
      const experimentIdSet = new Set(expList.map((e) => e.id))

      const { data: litOrg } = await supabase
        .from("literature_reviews")
        .select("id, title, status, project_id, experiment_id")
        .eq("organization_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(350)

      for (const l of litOrg ?? []) {
        if (l.experiment_id) experimentIdSet.add(l.experiment_id)
      }

      const { data: notesOrg } = await supabase
        .from("lab_notes")
        .select("id, title, note_type, experiment_id, project_id")
        .order("updated_at", { ascending: false })
        .limit(400)

      for (const n of notesOrg ?? []) {
        if (n.experiment_id) experimentIdSet.add(n.experiment_id)
      }

      const missingExpIds = [...experimentIdSet].filter(
        (id) => !expList.some((e) => e.id === id),
      )

      let extraExps: typeof expList = []
      if (missingExpIds.length > 0) {
        for (const chunk of chunkArray(missingExpIds, CHUNK)) {
          const { data: more } = await supabase
            .from("experiments")
            .select("id, name, status, project_id")
            .in("id", chunk)
          extraExps = extraExps.concat(more ?? [])
        }
      }

      const allExperiments = [...expList, ...extraExps]
      for (const e of allExperiments) {
        if (e.project_id) projectIdSet.add(e.project_id)
      }
      for (const l of litOrg ?? []) {
        if (l.project_id) projectIdSet.add(l.project_id)
      }
      for (const n of notesOrg ?? []) {
        if (n.project_id) projectIdSet.add(n.project_id)
      }

      // Build a lookup of org projects already fetched to avoid re-querying those
      const orgProjectMap = new Map(
        (allOrgProjects ?? []).map((p) => [p.id, p]),
      )

      const projectIds = [...projectIdSet]
      for (const chunk of chunkArray(projectIds, CHUNK)) {
        if (chunk.length === 0) continue
        // Use already-fetched org projects where possible; only query unknowns
        const unknownIds = chunk.filter((id) => !orgProjectMap.has(id))
        if (unknownIds.length > 0) {
          const { data: extra } = await supabase
            .from("projects")
            .select("id, name, status, description")
            .in("id", unknownIds)
            .eq("organization_id", orgId)
          for (const p of extra ?? []) orgProjectMap.set(p.id, p)
        }

        for (const id of chunk) {
          const p = orgProjectMap.get(id)
          if (!p) continue
          if (includeTypes.has("project")) {
            addNode({
              id: nodeId("project", p.id),
              kind: "project",
              label: p.name || "Untitled project",
              href: `/projects/${p.id}`,
              meta: {
                status: p.status ?? null,
                description: p.description
                  ? String(p.description).slice(0, 200)
                  : null,
              },
            })
          }
        }
      }

      for (const e of allExperiments) {
        if (includeTypes.has("experiment")) {
          addNode({
            id: nodeId("experiment", e.id),
            kind: "experiment",
            label: e.name || "Untitled experiment",
            href: `/experiments/${e.id}`,
            meta: { status: e.status ?? null },
          })
        }
        if (
          includeTypes.has("project") &&
          includeTypes.has("experiment") &&
          e.project_id
        ) {
          queueEdge({
            id: `project_contains_experiment:${e.project_id}:${e.id}`,
            source: nodeId("project", e.project_id),
            target: nodeId("experiment", e.id),
            kind: "project_contains_experiment",
            label: "Experiment",
          })
        }
      }

      const allExpIds = [...new Set(allExperiments.map((e) => e.id))]
      const protocolIds = new Set<string>()

      for (const chunk of chunkArray(allExpIds, CHUNK)) {
        if (chunk.length === 0) continue
        const { data: epRows } = await supabase
          .from("experiment_protocols")
          .select("experiment_id, protocol_id")
          .in("experiment_id", chunk)
        for (const row of epRows ?? []) {
          protocolIds.add(row.protocol_id)
          if (
            includeTypes.has("experiment") &&
            includeTypes.has("protocol")
          ) {
            queueEdge({
              id: `exp_proto:${row.experiment_id}:${row.protocol_id}`,
              source: nodeId("experiment", row.experiment_id),
              target: nodeId("protocol", row.protocol_id),
              kind: "experiment_uses_protocol",
              label: "Uses protocol",
            })
          }
        }
      }

      for (const l of litOrg ?? []) {
        if (includeTypes.has("literature")) {
          addNode({
            id: nodeId("literature", l.id),
            kind: "literature",
            label: l.title || "Untitled source",
            href: `/literature-reviews/${l.id}`,
            meta: { status: l.status ?? null },
          })
        }
        if (
          includeTypes.has("project") &&
          includeTypes.has("literature") &&
          l.project_id &&
          !l.experiment_id
        ) {
          queueEdge({
            id: `project_literature:${l.project_id}:${l.id}`,
            source: nodeId("project", l.project_id),
            target: nodeId("literature", l.id),
            kind: "project_linked_literature",
            label: "Linked literature",
          })
        }
        if (
          includeTypes.has("experiment") &&
          includeTypes.has("literature") &&
          l.experiment_id
        ) {
          queueEdge({
            id: `experiment_literature:${l.experiment_id}:${l.id}`,
            source: nodeId("experiment", l.experiment_id),
            target: nodeId("literature", l.id),
            kind: "experiment_linked_literature",
            label: "Linked literature",
          })
        }
      }

      const noteList = notesOrg ?? []
      const noteIds = noteList.map((n) => n.id)

      for (const n of noteList) {
        if (includeTypes.has("lab_note")) {
          const expId = n.experiment_id
          addNode({
            id: nodeId("lab_note", n.id),
            kind: "lab_note",
            label: n.title || "Untitled note",
            href: expId
              ? `/experiments/${expId}?tab=notes&noteId=${n.id}`
              : `/lab-notes`,
            meta: { note_type: n.note_type ?? null },
          })
        }
        if (
          includeTypes.has("experiment") &&
          includeTypes.has("lab_note") &&
          n.experiment_id
        ) {
          queueEdge({
            id: `experiment_has_note:${n.experiment_id}:${n.id}`,
            source: nodeId("experiment", n.experiment_id),
            target: nodeId("lab_note", n.id),
            kind: "experiment_has_lab_note",
            label: "Lab note",
          })
        }
        if (
          includeTypes.has("project") &&
          includeTypes.has("lab_note") &&
          n.project_id &&
          !n.experiment_id
        ) {
          queueEdge({
            id: `project_has_note:${n.project_id}:${n.id}`,
            source: nodeId("project", n.project_id),
            target: nodeId("lab_note", n.id),
            kind: "project_has_lab_note",
            label: "Project note",
          })
        }
      }

      for (const chunk of chunkArray(noteIds, CHUNK)) {
        if (chunk.length === 0) continue
        const { data: lnpRows } = await supabase
          .from("lab_note_protocols")
          .select("lab_note_id, protocol_id")
          .in("lab_note_id", chunk)
        for (const row of lnpRows ?? []) {
          protocolIds.add(row.protocol_id)
          if (
            includeTypes.has("lab_note") &&
            includeTypes.has("protocol")
          ) {
            queueEdge({
              id: `note_proto:${row.lab_note_id}:${row.protocol_id}`,
              source: nodeId("lab_note", row.lab_note_id),
              target: nodeId("protocol", row.protocol_id),
              kind: "lab_note_references_protocol",
              label: "References protocol",
            })
          }
        }
      }

      if (protocolIds.size > 0 && includeTypes.has("protocol")) {
        for (const chunk of chunkArray([...protocolIds], CHUNK)) {
          const { data: protos } = await supabase
            .from("protocols")
            .select("id, name, version, category")
            .in("id", chunk)
          for (const p of protos ?? []) {
            addNode({
              id: nodeId("protocol", p.id),
              kind: "protocol",
              label: p.name || "Untitled protocol",
              href: `/protocols/${p.id}`,
              meta: {
                version: p.version ?? null,
                category: p.category ?? null,
              },
            })
          }
        }
      }

      // Papers (writing section) — RLS ensures only user's own papers are returned
      if (includeTypes.has("paper")) {
        const { data: paperRows } = await supabase
          .from("papers")
          .select("id, title, status, project_id")
          .order("updated_at", { ascending: false })
          .limit(300)
        for (const paper of paperRows ?? []) {
          addNode({
            id: nodeId("paper", paper.id),
            kind: "paper",
            label: paper.title || "Untitled paper",
            href: `/papers/${paper.id}`,
            meta: { status: paper.status ?? null },
          })
          if (includeTypes.has("project") && paper.project_id) {
            queueEdge({
              id: `project_paper:${paper.project_id}:${paper.id}`,
              source: nodeId("project", paper.project_id),
              target: nodeId("paper", paper.id),
              kind: "project_contains_paper",
              label: "Paper",
            })
          }
        }
      }
    }

    let nodeArray = [...nodes.values()]
    let resolvedEdges = pendingEdges.filter(
      (e) => nodes.has(e.source) && nodes.has(e.target),
    )

    if (nodeArray.length > MAX_NODES) {
      truncated = true
      truncatedReason = truncatedReason ?? "node_limit"
      nodeArray = nodeArray.slice(0, MAX_NODES)
      const allowed = new Set(nodeArray.map((n) => n.id))
      resolvedEdges = resolvedEdges
        .filter((e) => allowed.has(e.source) && allowed.has(e.target))
        .slice(0, MAX_EDGES)
    } else if (resolvedEdges.length > MAX_EDGES) {
      truncated = true
      truncatedReason = truncatedReason ?? "edge_limit"
      resolvedEdges = resolvedEdges.slice(0, MAX_EDGES)
    }

    return NextResponse.json({
      nodes: nodeArray,
      edges: resolvedEdges,
      truncated,
      truncatedReason: truncated ? truncatedReason : undefined,
    })
  } catch (e) {
    console.error("research-map error:", e)
    return NextResponse.json(
      { error: "Failed to build research map" },
      { status: 500 },
    )
  }
}
