import type { Table as SpecTable } from "@/lib/data-analysis/engine/resolver"
import type { AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import type { EngineResult } from "@/lib/data-analysis/engine/contract"
import type { UniverWorkbookSnapshot } from "@/lib/spreadsheet-workbook"
import {
  commitRevision,
  forkFrozenRevision,
  freezeRevision,
  rerunIntoNewRevision,
  saveDraft,
  type AnalysisRevision,
} from "@/lib/data-analysis/saved-analysis"

/**
 * The workspace's half of the saved analysis (§3A).
 *
 * `saved-analysis.ts` knows the six rules and the database; it deliberately
 * knows nothing about a spreadsheet, a chart rail or a React tree. This module
 * is the seam between the two: it decides WHAT the workspace snapshots, and it
 * routes each save to the call in `saved-analysis.ts` that keeps the rule the
 * situation demands. Everything here is ordinary async TypeScript, so the two
 * decisions that matter — a frozen revision forks, a re-run appends — are
 * testable without mounting the workspace.
 */

export const ANALYSIS_SNAPSHOT_SCHEMA = "notes9.analysis-snapshot"

/**
 * §3A.3 rule 4: snapshot the rows, reference the file.
 *
 * Three things are stored. `table` is the exact resolved rows the engine
 * computed against, which is what makes the numbers reproducible; `workbook` is
 * the sheet those rows came from, which is what makes the analysis *openable* —
 * without it a detached reopen would show a figure floating above no data. The
 * file itself is referenced from `analyses.source_data_file_id`, never copied
 * here, because a reference is what lets drift be detected at all.
 *
 * `config` is the rail configuration this revision was saved with. It rides
 * here rather than in a column of its own because `analysis_revisions` has no
 * workspace_state and adding one would mean DDL against an applied migration.
 * It has to be revision-scoped and not read from `analyses.workspace_state`:
 * that column is the *working draft*, so reopening revision 2 through it would
 * dress revision 2's numbers in revision 7's figure.
 */
export interface AnalysisDataSnapshot {
  schema: typeof ANALYSIS_SNAPSHOT_SCHEMA
  version: 1
  table: SpecTable
  workbook: UniverWorkbookSnapshot | null
  config: unknown
}

export function buildDataSnapshot(
  table: SpecTable,
  workbook: UniverWorkbookSnapshot | null,
  config: unknown
): AnalysisDataSnapshot {
  return {
    schema: ANALYSIS_SNAPSHOT_SCHEMA,
    version: 1,
    table,
    workbook: workbook ?? null,
    config: config ?? null,
  }
}

/**
 * Read a stored snapshot back, or null.
 *
 * Validated rather than cast: this jsonb column outlives every version of the
 * code that wrote it, and a revision saved by an older build (or a hand-edited
 * row) must degrade to "opened without its sheet" rather than throw inside the
 * reopen path, where a throw would read as "your analysis is gone".
 */
export function readDataSnapshot(raw: unknown): AnalysisDataSnapshot | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Partial<AnalysisDataSnapshot>
  if (value.schema !== ANALYSIS_SNAPSHOT_SCHEMA) return null
  const table = value.table
  if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) return null
  return {
    schema: ANALYSIS_SNAPSHOT_SCHEMA,
    version: 1,
    table,
    workbook: (value.workbook as UniverWorkbookSnapshot | undefined) ?? null,
    config: value.config ?? null,
  }
}

/**
 * §3A.2's "workspace state": the rail configuration, in the same shape
 * `buildConfig`/`applyConfig` already serialise for the analysis tabs and the
 * `.n9a` export. Reusing that object rather than inventing a save format is the
 * whole point of §3A — there is one description of a figure, and this is it.
 */
export function buildWorkspaceState(config: unknown): Record<string, unknown> {
  return { config }
}

export function readWorkspaceConfig(
  state: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  const config = state?.config
  return config && typeof config === "object" ? (config as Record<string, unknown>) : null
}

/* ── Exclusions across an edit (§8.1) ──────────────────────────────────────*/

export type ExclusionStatus = {
  rowId: string
  /** `ok`: same sample. `missing`: the row is gone. `moved`: the id resolves to different values. */
  status: "ok" | "missing" | "moved"
}

/**
 * Does each saved exclusion still name the sample it was recorded against?
 *
 * `rowId` is the spreadsheet row number, which is stable against a cell edit and
 * NOT stable against an insert or delete above it. The resolver's orphan warning
 * only fires when an id VANISHES, so inserting a row above an exclusion is the
 * silent case: every id still resolves, the excluded sample quietly rejoins the
 * analysis, an innocent one quietly leaves, and the provenance line keeps the
 * original author, reason and timestamp against the wrong measurement. §8.1
 * calls a falsified record worse than a lost one, so this reports rather than
 * guesses.
 *
 * The comparison is against `AnalysisDataSnapshot.table` — the exact rows the
 * revision was computed on, already persisted with every revision — so no
 * schema change and no re-minted id is needed to tell "same sample" from "same
 * row number". Only the saved table's own columns are compared: a column added
 * since is not evidence that the sample changed.
 */
export function checkExclusions(
  saved: SpecTable,
  live: SpecTable,
  exclusions: readonly { rowId: string }[]
): ExclusionStatus[] {
  const liveRows = new Map(live.rows.map((r) => [r.rowId, r]))
  // The same `?? ""` normalisation `hashTable` uses, so "" and null are one
  // thing here too and a converged reader does not read as a moved sample.
  const same = (a: SpecTable["rows"][number], b: SpecTable["rows"][number]) =>
    saved.columns.every((c) => String(a.values[c] ?? "") === String(b.values[c] ?? ""))

  return exclusions.map(({ rowId }) => {
    const before = saved.rows.find((r) => r.rowId === rowId)
    const after = liveRows.get(rowId)
    if (!after) return { rowId, status: "missing" as const }
    if (!before) return { rowId, status: "ok" as const }
    return { rowId, status: same(before, after) ? ("ok" as const) : ("moved" as const) }
  })
}

/* ── Writes ────────────────────────────────────────────────────────────────*/

interface RevisionInput {
  analysisId: string
  spec: AnalysisSpec
  table: SpecTable
  workbook: UniverWorkbookSnapshot | null
  /** The rail configuration, i.e. `buildConfig()` in the workspace. */
  config: unknown
}

/**
 * §3A.3 rule 1 (revision explicitly) and rule 5 (freeze what gets published).
 *
 * The frozen branch is the rule 5 guarantee made operational: a save on top of
 * a frozen revision is not blocked and is not applied to it either, it forks a
 * new revision that records where it came from. Blocking would push the
 * researcher into copying the figure out by hand, which loses the lineage that
 * the freeze existed to protect.
 */
export function saveRevision(
  input: RevisionInput & {
    results: EngineResult | null
    name?: string
    changeSummary?: string
    /** The revision currently on screen, if this analysis was reopened. */
    openRevision?: AnalysisRevision | null
    /**
     * The analysis conversation, snapshotted into the revision. Catalyst's
     * reasoning is part of the scientific record (§3A.2) — a figure without the
     * reasoning that produced it is just a picture. The column has existed since
     * 105 and was written as `[]` by every caller until now.
     */
    conversationThread?: unknown[]
  }
): Promise<AnalysisRevision> {
  const dataSnapshot = buildDataSnapshot(input.table, input.workbook, input.config)
  const open = input.openRevision

  if (open?.isFrozen) {
    return forkFrozenRevision({
      analysisId: input.analysisId,
      frozenRevision: open,
      spec: input.spec,
      results: input.results,
      dataSnapshot,
      conversationThread: input.conversationThread,
    })
  }

  // A sequential save is not a fork: `revision_no` already carries that
  // lineage, and claiming a parent here would make an ordinary edit look like
  // a branch on the provenance card.
  return commitRevision({
    analysisId: input.analysisId,
    spec: input.spec,
    results: input.results,
    dataSnapshot,
    name: input.name,
    changeSummary: input.changeSummary,
    conversationThread: input.conversationThread,
  })
}

/**
 * §3A.3 rule 3, the re-run half: "re-run against the current data" from the
 * reopen banner. It appends; the revision it came from is never touched, which
 * is the only reason a p-value already in a submitted paper is safe.
 */
export function rerunRevision(
  input: RevisionInput & { results: EngineResult; previousRevisionId: string }
): Promise<AnalysisRevision> {
  return rerunIntoNewRevision({
    analysisId: input.analysisId,
    spec: input.spec,
    results: input.results,
    dataSnapshot: buildDataSnapshot(input.table, input.workbook, input.config),
    previousRevisionId: input.previousRevisionId,
  })
}

/**
 * §3A.3 rule 5. The SQL treats a second freeze as a no-op and hands the row
 * back; that is right for the database and wrong for a person, who would see a
 * success message for something that did not happen. Refused here instead, and
 * said out loud.
 */
export async function freezeOnce(revision: AnalysisRevision): Promise<AnalysisRevision> {
  if (revision.isFrozen) {
    throw new Error(
      `Revision ${revision.revisionNo} is already frozen. Freezing is one-way — editing it forks a new revision instead.`
    )
  }
  return freezeRevision(revision.id)
}

/**
 * §3A.3 rule 1, the autosave half. Writes the working draft and nothing else:
 * no revision is cut, so the record is only marked at the points the researcher
 * chooses. Returns the failure rather than throwing, because losing one
 * autosave must not interrupt work.
 */
export function autosaveDraft(
  analysisId: string,
  spec: AnalysisSpec,
  config: unknown
): Promise<{ ok: boolean; error?: string }> {
  return saveDraft(analysisId, spec, buildWorkspaceState(config))
}
