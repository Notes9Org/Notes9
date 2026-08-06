import { createClient } from "@/lib/supabase/client"
import {
  AnalysisSpec,
  migrateSpec,
} from "@/lib/data-analysis/spec/analysis-spec"
import {
  ENGINE_VERSION,
  checkResultIntegrity,
  computeCacheKey,
  type EngineResult,
} from "@/lib/data-analysis/engine/contract"

/**
 * The saved analysis (§3A), persistence, revisions, and reopening.
 *
 * The document frames this as an architectural test: "if saving turns out to be
 * hard to build, the spec layer has been implemented wrongly." It is not hard,
 * because a saved analysis is just the spec, plus the data snapshot it was
 * computed against, plus the results the engine returned. There is no separate
 * save format here, and there should never be one.
 *
 * The six rules of §3A.3 map onto this file as follows:
 *   1. autosave continuously, revision explicitly  → saveDraft / commitRevision
 *   2. revisions immutable and append-only         → enforced in SQL (105), not here
 *   3. never silently recompute on open            → openRevision returns a verdict
 *   4. snapshot the rows, reference the file       → commitRevision takes both
 *   5. freeze what gets published                  → freezeRevision / forkFrozen
 *   6. the analysis must be able to leave          → buildPortableBundle
 */

export interface SavedAnalysis {
  id: string
  experimentId: string | null
  projectId: string | null
  name: string
  draftSpec: unknown
  sourceDataFileId: string | null
  workspaceState: Record<string, unknown>
  currentRevisionNo: number
  updatedAt: string
}

export interface AnalysisRevision {
  id: string
  analysisId: string
  revisionNo: number
  name: string | null
  changeSummary: string | null
  spec: unknown
  specHash: string
  dataVersionHash: string
  dataSnapshot: unknown
  results: EngineResult | null
  engineVersion: string
  conversationThread: unknown[]
  isFrozen: boolean
  frozenAt: string | null
  forkedFromRevisionId: string | null
  authorId: string
  createdAt: string
}

/* ── Row mapping ───────────────────────────────────────────────────────────*/

type AnalysisRow = Record<string, unknown>

function toAnalysis(row: AnalysisRow): SavedAnalysis {
  return {
    id: String(row.id),
    experimentId: (row.experiment_id as string) ?? null,
    projectId: (row.project_id as string) ?? null,
    name: String(row.name ?? "Untitled analysis"),
    draftSpec: row.draft_spec ?? {},
    sourceDataFileId: (row.source_data_file_id as string) ?? null,
    workspaceState: (row.workspace_state as Record<string, unknown>) ?? {},
    currentRevisionNo: Number(row.current_revision_no ?? 0),
    updatedAt: String(row.updated_at ?? ""),
  }
}

function toRevision(row: AnalysisRow): AnalysisRevision {
  return {
    id: String(row.id),
    analysisId: String(row.analysis_id),
    revisionNo: Number(row.revision_no),
    name: (row.name as string) ?? null,
    changeSummary: (row.change_summary as string) ?? null,
    spec: row.spec,
    specHash: String(row.spec_hash),
    dataVersionHash: String(row.data_version_hash),
    dataSnapshot: row.data_snapshot ?? null,
    results: (row.results as EngineResult) ?? null,
    engineVersion: String(row.engine_version),
    conversationThread: (row.conversation_thread as unknown[]) ?? [],
    isFrozen: Boolean(row.is_frozen),
    frozenAt: (row.frozen_at as string) ?? null,
    forkedFromRevisionId: (row.forked_from_revision_id as string) ?? null,
    authorId: String(row.author_id),
    createdAt: String(row.created_at ?? ""),
  }
}

/* ── Create and autosave ───────────────────────────────────────────────────*/

export async function createAnalysis(input: {
  experimentId: string | null
  name?: string
  spec: AnalysisSpec
  sourceDataFileId?: string | null
}): Promise<SavedAnalysis> {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error("You must be signed in to save an analysis.")

  const { data, error } = await supabase
    .from("analyses")
    .insert({
      experiment_id: input.experimentId,
      user_id: auth.user.id,
      name: input.name ?? "Untitled analysis",
      draft_spec: input.spec,
      draft_updated_at: new Date().toISOString(),
      source_data_file_id: input.sourceDataFileId ?? input.spec.dataset.fileId,
    })
    .select("*")
    .single()

  if (error) throw new Error(`Could not create the analysis: ${error.message}`)
  return toAnalysis(data)
}

/**
 * §3A.3 rule 1: continuous autosave writes to a working draft. It never cuts a
 * revision, so the record is marked only at points the researcher chooses.
 * Deliberately tolerant of failure: losing an autosave must not interrupt work,
 * and the next one is 800ms away.
 */
export async function saveDraft(
  analysisId: string,
  spec: AnalysisSpec,
  workspaceState?: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()
  const patch: Record<string, unknown> = {
    draft_spec: spec,
    draft_updated_at: new Date().toISOString(),
  }
  if (workspaceState) patch.workspace_state = workspaceState

  const { error } = await supabase.from("analyses").update(patch).eq("id", analysisId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

/* ── Save: cut an immutable revision ───────────────────────────────────────*/

/**
 * §3A.3 rule 1 and 4. The snapshot and the file reference are BOTH stored: the
 * snapshot guarantees the analysis opens forever, the reference lets us detect
 * and surface drift.
 */
export async function commitRevision(input: {
  analysisId: string
  spec: AnalysisSpec
  results: EngineResult | null
  dataSnapshot: unknown
  name?: string
  changeSummary?: string
  conversationThread?: unknown[]
  forkedFromRevisionId?: string | null
}): Promise<AnalysisRevision> {
  const supabase = createClient()
  const { specHash } = await computeCacheKey(input.spec)

  const { data, error } = await supabase.rpc("commit_analysis_revision", {
    p_analysis_id: input.analysisId,
    p_spec: input.spec,
    p_spec_hash: specHash,
    p_data_version_hash: input.spec.dataset.versionHash,
    p_engine_version: input.results?.engineVersion ?? ENGINE_VERSION,
    p_results: input.results,
    p_data_snapshot: input.dataSnapshot,
    p_name: input.name ?? null,
    p_change_summary: input.changeSummary ?? null,
    p_conversation: input.conversationThread ?? [],
    p_forked_from: input.forkedFromRevisionId ?? null,
  })

  if (error) throw new Error(`Could not save this revision: ${error.message}`)
  return toRevision(Array.isArray(data) ? data[0] : data)
}

export async function listRevisions(analysisId: string): Promise<AnalysisRevision[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("analysis_revisions")
    .select("*")
    .eq("analysis_id", analysisId)
    .order("revision_no", { ascending: false })
  if (error) throw new Error(`Could not load the revision history: ${error.message}`)
  return (data ?? []).map(toRevision)
}

/* ── Reopen ────────────────────────────────────────────────────────────────*/

/**
 * The verdict a reopen produces. §3A.6 requires each of these states to be
 * shown, and never resolved silently.
 */
export type ReopenVerdict =
  | { state: "clean"; revision: AnalysisRevision; spec: AnalysisSpec; results: EngineResult | null }
  | {
      state: "drifted"
      revision: AnalysisRevision
      spec: AnalysisSpec
      results: EngineResult | null
      engineChanged: boolean
      dataChanged: boolean
      /** Ready-made sentence for the integrity screen (§10.8). */
      message: string
      storedEngineVersion: string
      currentEngineVersion: string
    }
  | { state: "detached"; revision: AnalysisRevision; spec: AnalysisSpec; results: EngineResult | null; message: string }
  | { state: "unreadable"; message: string }

/**
 * §3A.3 rule 3, the most consequential rule in the section: never silently
 * recompute on open.
 *
 * This function LOADS the stored result and checks it. It does not recompute,
 * and it cannot be made to: it has no access to the engine. Re-running is a
 * separate, explicit act that creates a NEW revision beside the old one
 * (rerunIntoNewRevision), because a p-value that is already in a submitted
 * paper must never change underneath its author.
 */
export async function openRevision(
  revisionId: string,
  liveDataVersionHash: string | null
): Promise<ReopenVerdict> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("analysis_revisions")
    .select("*")
    .eq("id", revisionId)
    .single()

  if (error || !data) {
    return { state: "unreadable", message: `Could not open this revision: ${error?.message ?? "not found"}` }
  }

  const revision = toRevision(data)

  // §3A.6: a spec on an older schema forward-migrates on open and logs it. It
  // must never fail to open.
  const migrated = migrateSpec(revision.spec)
  if (!migrated.ok) {
    return {
      state: "unreadable",
      message:
        "This analysis was saved in a format this version cannot read. Nothing has been changed or lost.",
    }
  }
  const spec = migrated.spec

  // The source file is gone. The snapshot still opens the analysis, and the
  // detachment is stated rather than hidden (§3A.6).
  if (liveDataVersionHash === null) {
    return {
      state: "detached",
      revision,
      spec,
      results: revision.results,
      message:
        "The source file for this analysis is no longer available. It has opened from its stored data snapshot and is detached from its source.",
    }
  }

  const integrity = checkResultIntegrity(
    {
      engineVersion: revision.engineVersion,
      dataVersionHash: revision.dataVersionHash,
      specHash: revision.specHash,
    },
    {
      engineVersion: ENGINE_VERSION,
      dataVersionHash: liveDataVersionHash,
      specHash: revision.specHash,
    }
  )

  if (integrity.valid) {
    return { state: "clean", revision, spec, results: revision.results }
  }

  // The message the document writes out almost verbatim in §3A.3.
  const when = new Date(revision.createdAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })
  const parts: string[] = [
    `This analysis was computed on ${when} with ${revision.engineVersion} against ${spec.dataset.fileName}.`,
  ]
  if (integrity.engineChanged) parts.push(`The engine is now ${ENGINE_VERSION}.`)
  if (integrity.dataChanged) parts.push("The source file has changed since it was saved.")
  parts.push("Keep the stored result, or re-run against the current data?")

  return {
    state: "drifted",
    revision,
    spec,
    results: revision.results,
    engineChanged: integrity.engineChanged,
    dataChanged: integrity.dataChanged,
    message: parts.join(" "),
    storedEngineVersion: revision.engineVersion,
    currentEngineVersion: ENGINE_VERSION,
  }
}

/**
 * "Re-run against the current data" from the reopen screen. Creates a NEW
 * revision beside the old one; the old one is never mutated. §3A.3 rule 3 is
 * explicit that Law 4 of the architecture is only real if this holds.
 */
export async function rerunIntoNewRevision(input: {
  analysisId: string
  spec: AnalysisSpec
  results: EngineResult
  dataSnapshot: unknown
  previousRevisionId: string
}): Promise<AnalysisRevision> {
  return commitRevision({
    analysisId: input.analysisId,
    spec: input.spec,
    results: input.results,
    dataSnapshot: input.dataSnapshot,
    changeSummary: "Re-run against updated data or engine.",
    forkedFromRevisionId: input.previousRevisionId,
  })
}

/* ── Freeze ────────────────────────────────────────────────────────────────*/

/** §3A.3 rule 5: mark a revision as published. One-way, by design. */
export async function freezeRevision(revisionId: string): Promise<AnalysisRevision> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc("freeze_analysis_revision", {
    p_revision_id: revisionId,
  })
  if (error) throw new Error(`Could not freeze this revision: ${error.message}`)
  return toRevision(Array.isArray(data) ? data[0] : data)
}

/**
 * Editing a frozen revision does not modify it, it forks a new working
 * revision that records what it came from. Callers should route every edit
 * attempt on a frozen revision through this rather than blocking the edit.
 */
export async function forkFrozenRevision(input: {
  analysisId: string
  frozenRevision: AnalysisRevision
  spec: AnalysisSpec
  results: EngineResult | null
  dataSnapshot: unknown
}): Promise<AnalysisRevision> {
  return commitRevision({
    analysisId: input.analysisId,
    spec: input.spec,
    results: input.results,
    dataSnapshot: input.dataSnapshot,
    changeSummary: `Forked from frozen revision ${input.frozenRevision.revisionNo}.`,
    forkedFromRevisionId: input.frozenRevision.id,
  })
}

/* ── Leave ─────────────────────────────────────────────────────────────────*/

export interface PortableBundle {
  schema: "notes9.analysis-bundle"
  schemaVersion: 1
  exportedAt: string
  analysis: { id: string; name: string; revisionNo: number }
  spec: unknown
  results: EngineResult | null
  dataSnapshot: unknown
  provenance: {
    engineVersion: string
    dataVersionHash: string
    specHash: string
    frozen: boolean
    createdAt: string
    forkedFromRevisionId: string | null
  }
  conversationThread: unknown[]
}

/**
 * §3A.3 rule 6: the analysis must be able to leave. Spec, snapshot, results and
 * provenance under a documented open schema.
 *
 * The document's reasoning is worth keeping next to the code: we import Prism
 * projects on the way in, so we should be equally willing to let people out. It
 * removes a real objection during evaluation and costs almost nothing given the
 * architecture. Prism itself moved to an open format; we should not be less open
 * than the incumbent we are displacing.
 */
export function buildPortableBundle(
  analysis: SavedAnalysis,
  revision: AnalysisRevision
): PortableBundle {
  return {
    schema: "notes9.analysis-bundle",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    analysis: { id: analysis.id, name: analysis.name, revisionNo: revision.revisionNo },
    spec: revision.spec,
    results: revision.results,
    dataSnapshot: revision.dataSnapshot,
    provenance: {
      engineVersion: revision.engineVersion,
      dataVersionHash: revision.dataVersionHash,
      specHash: revision.specHash,
      frozen: revision.isFrozen,
      createdAt: revision.createdAt,
      forkedFromRevisionId: revision.forkedFromRevisionId,
    },
    conversationThread: revision.conversationThread,
  }
}

/* ── The library view (§3A.5) ──────────────────────────────────────────────*/

export async function listAnalysesForExperiment(experimentId: string): Promise<SavedAnalysis[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("analyses")
    .select("*")
    .eq("experiment_id", experimentId)
    .order("updated_at", { ascending: false })
  if (error) throw new Error(`Could not load analyses: ${error.message}`)
  return (data ?? []).map(toAnalysis)
}

export async function listAnalysesForProject(projectId: string): Promise<SavedAnalysis[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("analyses")
    .select("*")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
  if (error) throw new Error(`Could not load analyses: ${error.message}`)
  return (data ?? []).map(toAnalysis)
}
