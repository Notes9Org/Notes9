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

  /**
   * The bind. A revision may only carry the result its OWN spec produced.
   *
   * The workspace hands these two in from separate places: `derivedSpec` is
   * recomputed on every render, `engineResult` trails it by a 700ms debounce and
   * a Pyodide round trip, and nothing between them holds them together. Save
   * during that window — or after a compute that threw, which used to leave the
   * previous spec's numbers on screen — and the row written is a spec beside a
   * p-value it never produced, in a table that is append-only. That is the
   * retraction-class pair `openRevision`'s own doc comment says the reopen path
   * exists to prevent; it was arriving through the save door instead.
   *
   * `EngineResult.specHash` is stamped by `computeAnalysis` from this same
   * `computeCacheKey`, so the comparison is exact and costs one string compare.
   *
   * The result is dropped rather than the save refused: the spec, the snapshot
   * and the conversation are the researcher's work and must not be lost because
   * the engine was mid-flight. `results: null` is a state the reopen already
   * models ("nothing stored, re-run to get numbers"), whereas a wrong number
   * stored at full confidence is not recoverable. Callers compare
   * `revision.results` against what they passed to tell the user.
   */
  const results = input.results?.specHash === specHash ? input.results : null

  const { data, error } = await supabase.rpc("commit_analysis_revision", {
    p_analysis_id: input.analysisId,
    p_spec: input.spec,
    p_spec_hash: specHash,
    p_data_version_hash: input.spec.dataset.versionHash,
    p_engine_version: results?.engineVersion ?? ENGINE_VERSION,
    p_results: results,
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

  /**
   * Which spec the stored RESULT actually answers.
   *
   * `commitRevision` now refuses to write a mismatched pair, but this table is
   * append-only and rows written before that guard existed are still here, so
   * the check has to hold on the way out too. Falling back to `revision.specHash`
   * for a row with no result keeps `checkResultIntegrity` reading "unchanged"
   * for the ordinary case of a revision that simply stored no numbers.
   *
   * Branching on the RESULT, not on `results?.specHash`, is the difference
   * between "no result to check" and "a result that carries no hash". The second
   * is a row whose numbers cannot prove which spec produced them, and on a
   * retraction-class path an unprovable claim is drift, not clean.
   */
  const resultSpecHash = revision.results ? revision.results.specHash : revision.specHash
  /**
   * The result is withheld, not shown with a caveat. Every branch below returns
   * this instead of `revision.results`, including `detached`, which has no
   * integrity check of its own and would otherwise be the one door left open.
   */
  const results = resultSpecHash === revision.specHash ? revision.results : null

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
      results,
      message:
        "The source file for this analysis is no longer available. It has opened from its stored data snapshot and is detached from its source.",
    }
  }

  const integrity = checkResultIntegrity(
    {
      engineVersion: revision.engineVersion,
      dataVersionHash: revision.dataVersionHash,
      // The STORED RESULT's own spec hash, not the row's. Passing
      // `revision.specHash` on both sides made `specChanged` a no-op by
      // construction: the one comparison that catches a result stored beside a
      // spec that never produced it was comparing a value against itself.
      specHash: resultSpecHash,
    },
    {
      engineVersion: ENGINE_VERSION,
      dataVersionHash: liveDataVersionHash,
      specHash: revision.specHash,
    }
  )

  if (integrity.valid) {
    return { state: "clean", revision, spec, results }
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
  // "Keep the stored result" is not on offer when the stored result belongs to a
  // different spec: keeping it is precisely the retraction. So it is stated, and
  // `results` above is already null.
  if (integrity.specChanged)
    parts.push(
      "The stored result was produced by a different version of this analysis, so it has not been loaded."
    )
  parts.push(
    integrity.specChanged
      ? "Re-run against the current data to get numbers for the analysis as saved."
      : "Keep the stored result, or re-run against the current data?"
  )

  return {
    state: "drifted",
    revision,
    spec,
    results,
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
  /** Carried across the fork: the reasoning belongs with the figure. */
  conversationThread?: unknown[]
}): Promise<AnalysisRevision> {
  return commitRevision({
    analysisId: input.analysisId,
    spec: input.spec,
    results: input.results,
    dataSnapshot: input.dataSnapshot,
    conversationThread: input.conversationThread,
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

/** One analysis, by id. Returns null rather than throwing when RLS hides it. */
export async function getAnalysis(analysisId: string): Promise<SavedAnalysis | null> {
  const supabase = createClient()
  const { data, error } = await supabase.from("analyses").select("*").eq("id", analysisId).maybeSingle()
  if (error) throw new Error(`Could not open this analysis: ${error.message}`)
  return data ? toAnalysis(data) : null
}

/**
 * The reachable set, newest first. No scope filter and none needed: the
 * `analyses_select` policy already limits this to the caller's own analyses
 * plus those in projects they are a member of, so adding a user_id filter here
 * would narrow the collaborative case without making anything safer.
 */
export async function listRecentAnalyses(limit = 20): Promise<SavedAnalysis[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("analyses")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Could not load analyses: ${error.message}`)
  return (data ?? []).map(toAnalysis)
}

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
