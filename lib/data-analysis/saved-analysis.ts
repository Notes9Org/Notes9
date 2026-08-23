import { createClient } from "@/lib/supabase/client"
import type { EditAuditRecord, ProvenanceCard } from "@/lib/data-analysis/provenance"
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
  /**
   * A reversible bookmark (§3A.4), added in 117. Not freezing: pinning makes no
   * claim about publication. Reads false on a database that predates 117.
   */
  isPinned: boolean
  forkedFromRevisionId: string | null
  /**
   * Null when the author's profile has been deleted. 117 changed this FK from
   * ON DELETE CASCADE to ON DELETE SET NULL, because a person leaving the lab
   * used to delete the revisions they had authored on other people's projects.
   * Losing the name is the price of keeping the record, and it is the right way
   * round.
   */
  authorId: string | null
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
    isPinned: Boolean(row.is_pinned),
    forkedFromRevisionId: (row.forked_from_revision_id as string) ?? null,
    // Not String(): a null author_id would become the string "null", which
    // renders as a username and compares unequal to null everywhere downstream.
    authorId: (row.author_id as string) ?? null,
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
  /**
   * The live conversation, when the caller has one. Omitted, the thread is
   * fetched from the revision being re-run — see below.
   */
  conversationThread?: unknown[]
}): Promise<AnalysisRevision> {
  /**
   * Carry Catalyst's thread across the re-run.
   *
   * This omitted the thread entirely, so `commitRevision` defaulted it to `[]`.
   * Reopen r4, hit drift, click "Re-run into a new revision", and r5 — now the
   * current revision — carried none of the reasoning that produced the figure.
   * On the most reproducibility-sensitive path in the product, "a figure
   * without its reasoning is just a picture" (§3A.2) was being made true by the
   * one button whose whole job is to preserve the record.
   *
   * The fallback fetch is the reason this is fixed here rather than at the call
   * site: `previousRevisionId` is already in hand, the previous revision
   * already stores the thread, and doing it here means every caller of re-run
   * is fixed at once instead of the one the bug report named. A caller with a
   * live thread should still pass it — it is fresher than the stored copy, and
   * an explicit value always wins.
   */
  const conversationThread =
    input.conversationThread ?? (await fetchConversationThread(input.previousRevisionId))

  return commitRevision({
    analysisId: input.analysisId,
    spec: input.spec,
    results: input.results,
    dataSnapshot: input.dataSnapshot,
    changeSummary: "Re-run against updated data or engine.",
    conversationThread,
    forkedFromRevisionId: input.previousRevisionId,
  })
}

/**
 * The stored thread of one revision, or `[]`.
 *
 * Deliberately total: a re-run must not fail because the parent's thread could
 * not be read. Losing the thread is bad; refusing to save the re-run because of
 * it would be worse, and the caller already has the numbers in hand.
 */
async function fetchConversationThread(revisionId: string): Promise<unknown[]> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("analysis_revisions")
      .select("conversation_thread")
      .eq("id", revisionId)
      .maybeSingle()
    if (error || !data) return []
    const thread = (data as { conversation_thread?: unknown }).conversation_thread
    return Array.isArray(thread) ? thread : []
  } catch {
    return []
  }
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

/* ── Pin (§3A.4) ───────────────────────────────────────────────────────────*/

/**
 * Pinning is a bookmark, and it is reversible. That is the entire difference
 * from freezing, and the reason they are two verbs rather than one: freezing
 * asserts "this is what was published" and can never be undone, pinning says
 * "this is the one I keep coming back to" and can be undone freely. Conflating
 * them would either make pinning dangerous or make freezing meaningless.
 */
export async function pinRevision(
  revisionId: string,
  pinned: boolean
): Promise<AnalysisRevision> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc("set_analysis_revision_pinned", {
    p_revision_id: revisionId,
    p_pinned: pinned,
  })
  if (error) {
    throw new Error(
      `Could not ${pinned ? "pin" : "unpin"} this revision: ${error.message}`
    )
  }
  return toRevision(Array.isArray(data) ? data[0] : data)
}

/* ── Duplicate as a new analysis (§3A.4) ───────────────────────────────────*/

/**
 * A genuinely independent analysis: new id, own revision chain starting at r1.
 *
 * Not to be confused with `forkFrozenRevision`, which appends a revision to the
 * SAME analysis. That is a branch in one object's history; this is a second
 * object. The distinction matters because editing a duplicate must not advance
 * the original's revision numbering or appear in its history, which is exactly
 * what a fork does.
 *
 * LINEAGE: the copy's r1 records `forked_from_revision_id` pointing at the
 * source revision, and its change summary names the source analysis and
 * revision in prose. The pointer crosses analyses and deliberately has no FK
 * (105:120), so it survives the source being deleted — a dangling pointer beats
 * losing the fact that there was a parent. What does NOT travel is frozen
 * status: a copy of a published figure has not itself been published, and must
 * not claim to have been.
 */
export async function duplicateAnalysis(input: {
  /** The revision to copy. The new analysis starts from this state. */
  revisionId: string
  /** Defaults to "<source name> (copy)". */
  name?: string
}): Promise<SavedAnalysis> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc("duplicate_analysis", {
    p_revision_id: input.revisionId,
    p_name: input.name ?? null,
  })
  if (error) throw new Error(`Could not duplicate this analysis: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error("Could not duplicate this analysis: nothing was returned.")
  return toAnalysis(row)
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

export const BUNDLE_SCHEMA = "notes9.analysis-bundle"

/** One revision inside a bundle. Everything needed to reopen that revision. */
export interface PortableRevision {
  id: string
  revisionNo: number
  name: string | null
  changeSummary: string | null
  spec: unknown
  specHash: string
  results: EngineResult | null
  dataSnapshot: unknown
  dataVersionHash: string
  engineVersion: string
  conversationThread: unknown[]
  frozen: boolean
  frozenAt: string | null
  pinned: boolean
  /** Lineage. Travels now; in v1 it did not, so an imported bundle was an orphan. */
  forkedFromRevisionId: string | null
  authorId: string | null
  createdAt: string
}

export interface PortableBundle {
  schema: typeof BUNDLE_SCHEMA
  /**
   * 2 carries history, lineage and the provenance card. 1 carried one revision
   * and no way back in. `importPortableBundle` reads both.
   */
  schemaVersion: 1 | 2
  exportedAt: string
  analysis: {
    id: string
    name: string
    /** The revision the export was taken from. */
    revisionNo: number
    experimentId?: string | null
    projectId?: string | null
  }
  /**
   * Every revision the exporter could read, oldest first — so lineage inside
   * the bundle resolves without a network call, and so "an analysis can leave
   * notes9 intact" means the history and not just the last frame of it.
   */
  revisions: PortableRevision[]
  /**
   * The provenance card as rendered at export, in a form a human can read
   * without notes9. Denormalised on purpose: the whole point of a portable
   * bundle is that it outlives the application that wrote it, and a card
   * reconstructed by a future version of `buildProvenanceCard` is not the card
   * the researcher was looking at.
   */
  provenanceCard: ProvenanceCard | null
  /**
   * The append-only edit audit log for the exported revision. Read out of the
   * revision's data snapshot, where the workspace persists it.
   */
  editAuditLog: EditAuditRecord[]

  /* ── v1 fields, still written ──────────────────────────────────────────────
     A v1 reader must keep working against a v2 file. These mirror the exported
     revision and are the reason schemaVersion could go to 2 without anything
     that already consumes a bundle breaking. */
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
const toPortableRevision = (r: AnalysisRevision): PortableRevision => ({
  id: r.id,
  revisionNo: r.revisionNo,
  name: r.name,
  changeSummary: r.changeSummary,
  spec: r.spec,
  specHash: r.specHash,
  results: r.results,
  dataSnapshot: r.dataSnapshot,
  dataVersionHash: r.dataVersionHash,
  engineVersion: r.engineVersion,
  conversationThread: r.conversationThread,
  frozen: r.isFrozen,
  frozenAt: r.frozenAt,
  pinned: r.isPinned,
  forkedFromRevisionId: r.forkedFromRevisionId,
  authorId: r.authorId,
  createdAt: r.createdAt,
})

/**
 * What v2 adds, and what it deliberately leaves out.
 *
 * ADDED, because without them "the analysis leaves intact" was not true:
 *   - every revision, oldest first, each with its own spec, snapshot, results
 *     and thread. A bundle with one revision is a screenshot, not an analysis.
 *   - lineage. `forked_from_revision_id` did not travel at all in v1, so an
 *     imported bundle could not say what it was forked from — on a feature
 *     whose entire justification is a walkable provenance chain.
 *   - the provenance card, rendered, so the export is legible to someone who
 *     does not have notes9.
 *   - the edit audit log, so the who/what/when of each change survives the trip.
 *
 * LEFT OUT, stated rather than quietly dropped:
 *   - the source file itself. It is referenced, never copied (§3A.3 rule 4);
 *     each revision's row snapshot is what makes the bundle self-sufficient.
 *   - profiles. `authorId` travels as an opaque id and resolves to nothing
 *     outside the origin database. Denormalising names into an export is a
 *     privacy decision, not a durability one, and is not mine to make here.
 *   - anything from the experiment around the analysis.
 *
 * `revisions` is passed in rather than fetched so this stays a pure function —
 * `listRevisions` is one call away and the caller usually has them already.
 * Given none, the bundle degrades to the exported revision alone, which is v1's
 * behaviour and still a valid v2 file.
 */
export function buildPortableBundle(
  analysis: SavedAnalysis,
  revision: AnalysisRevision,
  extras: {
    revisions?: AnalysisRevision[]
    provenanceCard?: ProvenanceCard | null
    editAuditLog?: EditAuditRecord[]
  } = {}
): PortableBundle {
  const all = (extras.revisions?.length ? extras.revisions : [revision])
    .slice()
    .sort((a, b) => a.revisionNo - b.revisionNo)

  return {
    schema: BUNDLE_SCHEMA,
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    analysis: {
      id: analysis.id,
      name: analysis.name,
      revisionNo: revision.revisionNo,
      experimentId: analysis.experimentId,
      projectId: analysis.projectId,
    },
    revisions: all.map(toPortableRevision),
    provenanceCard: extras.provenanceCard ?? null,
    editAuditLog: extras.editAuditLog ?? [],

    // v1 mirror.
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

/* ── Come back in ──────────────────────────────────────────────────────────*/

export type BundleImport =
  | { ok: true; bundle: PortableBundle; notices: string[] }
  | { ok: false; error: string }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

/**
 * Read a bundle back. There was no importer at all, so you could not reopen
 * your own export — "the analysis can leave" was half a promise.
 *
 * Parses and REPORTS; it does not write. That split is the same one
 * `openRevision` makes and for the same reason: the product's rule is detect
 * and offer, never silently repair (see `reopen-banner.tsx`, whose two buttons
 * are the precedent). Anything this function had to assume comes back in
 * `notices` for the UI to show before the user commits to an import, rather
 * than being fixed up quietly on the way in.
 *
 * Accepts v1 and v2. A v1 file has no `revisions` array, so one is synthesised
 * from its flat fields — that is a real inference and it says so in `notices`.
 */
export function importPortableBundle(raw: unknown): BundleImport {
  const parsed = typeof raw === "string" ? safeJson(raw) : raw
  if (!isRecord(parsed)) {
    return { ok: false, error: "This file is not a notes9 analysis bundle: it is not a JSON object." }
  }
  if (parsed.schema !== BUNDLE_SCHEMA) {
    return {
      ok: false,
      error: `This file is not a notes9 analysis bundle (its schema is ${JSON.stringify(parsed.schema) ?? "missing"}). Nothing has been imported.`,
    }
  }

  const version = Number(parsed.schemaVersion)
  if (!Number.isFinite(version) || version < 1) {
    return { ok: false, error: "This bundle does not declare a readable schema version." }
  }

  const notices: string[] = []
  if (version > 2) {
    // Forward-compatible rather than refusing: v2's fields are a subset of any
    // later version's, and refusing to open a newer export would strand a
    // researcher whose colleague is one release ahead. But it is stated.
    notices.push(
      `This bundle was written by a newer version of notes9 (schema v${version}). It has been read as v2; anything newer than that has been ignored rather than guessed at.`
    )
  }

  const analysis = isRecord(parsed.analysis) ? parsed.analysis : {}
  const name = typeof analysis.name === "string" && analysis.name.trim() ? analysis.name : "Imported analysis"

  let revisions = Array.isArray(parsed.revisions)
    ? (parsed.revisions.filter(isRecord) as unknown as PortableRevision[])
    : []

  if (revisions.length === 0) {
    if (parsed.spec === undefined) {
      return {
        ok: false,
        error: "This bundle contains no revisions and no spec, so there is nothing to open.",
      }
    }
    const provenance = isRecord(parsed.provenance) ? parsed.provenance : {}
    revisions = [
      {
        id: typeof analysis.id === "string" ? analysis.id : "imported",
        revisionNo: Number(analysis.revisionNo ?? 1) || 1,
        name: null,
        changeSummary: null,
        spec: parsed.spec,
        specHash: String(provenance.specHash ?? ""),
        results: (parsed.results as EngineResult) ?? null,
        dataSnapshot: parsed.dataSnapshot ?? null,
        dataVersionHash: String(provenance.dataVersionHash ?? ""),
        engineVersion: String(provenance.engineVersion ?? "unknown"),
        conversationThread: Array.isArray(parsed.conversationThread) ? parsed.conversationThread : [],
        frozen: Boolean(provenance.frozen),
        frozenAt: null,
        pinned: false,
        forkedFromRevisionId: (provenance.forkedFromRevisionId as string) ?? null,
        authorId: null,
        createdAt: String(provenance.createdAt ?? ""),
      },
    ]
    notices.push(
      "This is a v1 bundle: it carries a single revision and no history. The revision has been read; the analysis it came from may have had others that are not in this file."
    )
  }

  revisions = revisions.slice().sort((a, b) => a.revisionNo - b.revisionNo)

  /**
   * Lineage that points outside the bundle is kept and flagged, never dropped.
   * A pointer to a revision this file does not contain is still evidence that
   * there was a parent, which is exactly why the column has no FK (105:120).
   */
  const present = new Set(revisions.map((r) => r.id))
  const dangling = revisions.filter(
    (r) => r.forkedFromRevisionId && !present.has(r.forkedFromRevisionId)
  )
  if (dangling.length > 0) {
    notices.push(
      `${dangling.length} revision${dangling.length === 1 ? " was" : "s were"} forked from a revision that is not in this bundle. The lineage pointer has been kept, but the parent cannot be opened from this file.`
    )
  }

  const frozen = revisions.filter((r) => r.frozen).length
  if (frozen > 0) {
    // Freezing is a claim about a specific record in a specific database.
    // An import is a copy, and a copy that arrived pre-frozen would let anyone
    // manufacture a "published" revision by hand-editing a JSON file.
    notices.push(
      `${frozen} revision${frozen === 1 ? " is" : "s are"} marked frozen in this bundle. Importing does not restore frozen status: freeze it here if this copy is the record you intend to cite.`
    )
  }

  if (!isRecord(parsed.provenanceCard)) {
    notices.push("This bundle carries no rendered provenance card.")
  }

  return {
    ok: true,
    notices,
    bundle: {
      schema: BUNDLE_SCHEMA,
      schemaVersion: version >= 2 ? 2 : 1,
      exportedAt: String(parsed.exportedAt ?? ""),
      analysis: {
        id: typeof analysis.id === "string" ? analysis.id : "",
        name,
        revisionNo: Number(analysis.revisionNo ?? revisions[revisions.length - 1]?.revisionNo ?? 1),
        experimentId: (analysis.experimentId as string) ?? null,
        projectId: (analysis.projectId as string) ?? null,
      },
      revisions,
      provenanceCard: isRecord(parsed.provenanceCard)
        ? (parsed.provenanceCard as unknown as ProvenanceCard)
        : null,
      editAuditLog: Array.isArray(parsed.editAuditLog)
        ? (parsed.editAuditLog as EditAuditRecord[])
        : [],
      spec: revisions[revisions.length - 1]?.spec,
      results: revisions[revisions.length - 1]?.results ?? null,
      dataSnapshot: revisions[revisions.length - 1]?.dataSnapshot ?? null,
      provenance: {
        engineVersion: revisions[revisions.length - 1]?.engineVersion ?? "unknown",
        dataVersionHash: revisions[revisions.length - 1]?.dataVersionHash ?? "",
        specHash: revisions[revisions.length - 1]?.specHash ?? "",
        frozen: false,
        createdAt: revisions[revisions.length - 1]?.createdAt ?? "",
        forkedFromRevisionId: revisions[revisions.length - 1]?.forkedFromRevisionId ?? null,
      },
      conversationThread: revisions[revisions.length - 1]?.conversationThread ?? [],
    },
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
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
