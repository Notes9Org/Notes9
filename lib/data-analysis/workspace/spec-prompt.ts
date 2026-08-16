import {
  chartStateFromSpec,
  specFromChartState,
  type ChartState,
} from "@/lib/data-analysis/workspace/chart-state-spec"
import type { SpecPatchOutcome } from "@/lib/data-analysis/ai/spec-author-client"
import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import { applyMutation, type AppliedMutation, type SpecMutation } from "@/lib/data-analysis/spec/mutations"
import { parseMutation } from "@/lib/data-analysis/spec/mutation-schema"
import type { Table } from "@/lib/data-analysis/engine/resolver"

/**
 * The pure pieces behind the workspace's natural-language prompt: what a
 * proposed spec means for the rail's controls, what every reply that is not a
 * patch says to the user, and whether a computed-but-not-yet-approved proposal
 * (P3) may be executed.
 *
 * They live here rather than in the workspace component because neither needs
 * React and all are worth reading, and testing, on their own.
 */

/** Axis limits and the tick count are text in the rail and numbers in the spec. */
const RAIL_NUMERIC_TEXT = new Set<keyof ChartState>(["xMin", "xMax", "yMin", "yMax", "nticks"])
/** Absent is the empty string in the rail, not `undefined`. */
const RAIL_TEXT = new Set<keyof ChartState>(["subtitle", "xUnit", "yUnit"])
/**
 * `ChartState` fields the workspace's config layer has no home for: `applyConfig`
 * reads no `width`/`height`, so an edit naming one is written and then dropped
 * on the merge. Excluded here rather than repaired there, because the exclusion
 * is what makes the question `splitApprovedMutations` asks below an honest one:
 * "the rail produced an edit" has to mean "the rail will actually hold it".
 */
const RAIL_UNSUPPORTED = new Set<keyof ChartState>(["width", "height"])

/**
 * The rail edits a spec change implies, only the fields that actually moved.
 *
 * The round trip is lossy in small ways (the rail's font is a CSS stack where
 * the spec names one of three; limits are text on one side and numbers on the
 * other), so writing the whole derived state back would overwrite settings the
 * patch never touched with a re-derived approximation of themselves. Comparing
 * the spec before against the spec after keeps the write down to what changed.
 */
export function railEditsFromSpec(
  before: AnalysisSpec,
  after: AnalysisSpec,
  table: Table
): Record<string, unknown> {
  const from = chartStateFromSpec(before, table)
  const to = chartStateFromSpec(after, table)
  const edits: Record<string, unknown> = {}
  for (const key of Object.keys(to) as (keyof ChartState)[]) {
    if (RAIL_UNSUPPORTED.has(key)) continue
    const next = to[key]
    // Structural compare, because the fields include objects (`seriesStyles`)
    // and arrays (`yKeys`) as well as scalars.
    if (JSON.stringify(next) === JSON.stringify(from[key])) continue
    edits[key] = RAIL_NUMERIC_TEXT.has(key)
      ? next === null || next === undefined
        ? ""
        : String(next)
      : RAIL_TEXT.has(key)
        ? (next ?? "")
        : next
  }
  return edits
}

/**
 * Execute, split into the half the rail can hold and the half only the spec can.
 *
 * Every mutation the user read and approved has to land. Most name a setting
 * with a control on the rail, and those belong on the rail: written back
 * through `railEditsFromSpec` they move the control the user is looking at and
 * stay editable by hand afterwards. The rest have no control to hold them, so
 * `chartStateFromSpec` cannot carry them and the next `derivedSpec` recompute
 * erases them. Annotations, brackets, the second axis, show-excluded, the
 * missing-value policy, the nonlinear fit, the design and the roles all used to
 * disappear exactly here, AFTER the user pressed Execute, while the reply card
 * still listed them as done. Those come back as an OVERLAY the workspace keeps
 * in state and replays over every later derivation, which is what makes them
 * survive a render rather than a single one.
 *
 * Which half a mutation falls in is decided by the rail itself rather than by a
 * list of kinds: a mutation stays off the overlay exactly when writing its rail
 * edits reproduces the WHOLE of it. A mutation kind added later needs no entry
 * here, and a kind the rail grows a control for moves across on its own.
 *
 * The question is asked per EFFECT, not per mutation, and that distinction is
 * the whole point. `analysis.setColumns` writes the response columns, the group
 * column and the second factor in one go; `ChartState` has a home for the first
 * two and none for the third. Asking only "did the rail produce an edit?" says
 * yes, routes the mutation to the rail and erases the second factor on the next
 * derivation, while the card still reports it applied. A two-way ANOVA then
 * runs with one factor and a p-value reaches the user under the description of
 * an analysis that was never run. So a mutation the rail holds only PARTLY goes
 * to both halves: the rail moves the controls it has, and the overlay restates
 * the RESIDUE — and only the residue — on every later derivation.
 *
 * "Only the residue" is the whole of L6 (`mutations.ts`: manual edits are
 * sticky). Overlaying the WHOLE of a partly-held mutation pins the half the rail
 * does hold: the overlay replays after every derivation, so the user's own later
 * pick of an X column or a series colour moved the control and nothing else, on
 * every render, with no way to clear it short of Undo. A later HUMAN edit
 * silently overridden by an earlier AI one is the worst direction for that rule
 * to fail in, so the overlay carries no field the rail can express.
 */
export function splitApprovedMutations(
  spec: AnalysisSpec,
  approved: AppliedMutation[],
  table: Table
): { edits: Record<string, unknown>; overlay: AppliedMutation[] } {
  let current = spec
  const overlay: AppliedMutation[] = []
  for (const entry of approved) {
    const next = applyMutation(current, entry.mutation)
    // A mutation that moved nothing needs no home in either half; replaying it
    // for the rest of the session would be noise standing in for an edit.
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      const residue = overlayResidue(current, next, entry.mutation, table)
      // Identity when nothing was stripped, so an entry that is wholly the
      // rail's problem or wholly the overlay's keeps its own object.
      if (residue) overlay.push(residue === entry.mutation ? entry : { ...entry, mutation: residue })
    }
    current = next
  }
  return { edits: railEditsThatLand(spec, current, table), overlay }
}

/**
 * The rail edits that actually LAND `after`, which is not the same as the ones
 * that changed.
 *
 * `specFromChartState` couples fields: an unset post-hoc is derived from the
 * test, so writing a new test alone silently moves the post-hoc too. Writing
 * only what moved is therefore not enough, because it can move something that
 * did not.
 * One repair pass closes it: derive the spec the first set of edits would
 * produce, diff THAT against the target, and add whatever the rail can still
 * express. Generic, so a coupling added later needs no entry here.
 */
function railEditsThatLand(
  before: AnalysisSpec,
  after: AnalysisSpec,
  table: Table
): Record<string, unknown> {
  const edits = railEditsFromSpec(before, after, table)
  try {
    return { ...edits, ...railEditsFromSpec(railProjection(before, table, edits), after, table) }
  } catch {
    return edits
  }
}

/**
 * The spec the rail on its own would hold, with a set of rail edits written
 * onto it: state out through `chartStateFromSpec`, spec back in through
 * `specFromChartState`, which is the workspace's own `derivedSpec` path minus
 * the overlay. Everything the round trip drops (the second factor, a series'
 * jitter, an annotation, the design) is exactly what the rail has no home for.
 */
function railProjection(
  spec: AnalysisSpec,
  table: Table,
  edits: Record<string, unknown> = {}
): AnalysisSpec {
  // `test` and `postHoc` are the two fields `specFromChartState` DERIVES when
  // the rail is silent (the test from the chart type, the post-hoc from the
  // test) rather than copies, and the rail starts silent on both. Reading them
  // back off the spec would therefore credit the rail with holding a choice it
  // may only have inferred, which is what hides the coupling: writing a new
  // test alone moves the post-hoc with it. Everything else the rail copies
  // verbatim, so it stands.
  const { test: _test, postHoc: _postHoc, ...carried } = chartStateFromSpec(spec, table)
  // `yKeys` is the one required field `chartStateFromSpec` may omit and
  // `specFromChartState` reads unguarded; the rest it omits are nullable in the
  // schema. The stand-in is the same on both sides of the comparison below, so
  // it cancels.
  const state = { yKeys: [], ...carried, ...edits } as ChartState
  return specFromChartState(state, table, {
    fileName: spec.dataset.fileName,
    sheet: spec.dataset.sheet,
  })
}

/** Key order is a parse artefact, not a difference; compare through one parse. */
function canonical(spec: AnalysisSpec): string {
  const parsed = parseSpec(spec)
  return JSON.stringify(parsed.ok ? parsed.spec : spec)
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

/**
 * A mutation's payload fields, one level into a `patch`.
 *
 * `patch` is the one nesting convention the mutation union uses for a bag of
 * independent settings (`figure.setSeriesStyle`, `axis.set`, `design.set`,
 * `analysis.setNonlinear`, `figure.updateAnnotation`), and it is where the rail
 * splits a mutation most often: it holds a series' colour and has no field for
 * its jitter. The other object-valued payloads (an `Exclusion`, a `Transform`,
 * an `Annotation`) are single values that happen to have parts, and half of one
 * is not a smaller edit, it is an invalid one — so the recursion stops here.
 */
function payloadFields(mutation: SpecMutation): string[] {
  const record = mutation as unknown as Record<string, unknown>
  return Object.keys(record).flatMap((key) => {
    if (key === "kind") return []
    const value = record[key]
    return key === "patch" && isPlainObject(value)
      ? Object.keys(value).map((inner) => `${key}.${inner}`)
      : [key]
  })
}

function withoutField(mutation: SpecMutation, field: string): SpecMutation {
  const record = { ...(mutation as unknown as Record<string, unknown>) }
  const [outer, inner] = field.split(".")
  if (inner === undefined) delete record[outer]
  else {
    const patch = { ...(record[outer] as Record<string, unknown>) }
    delete patch[inner]
    record[outer] = patch
  }
  return record as unknown as SpecMutation
}

/**
 * The part of this mutation the rail cannot land, or null when it lands all.
 *
 * Both sides start from the same projection of `current`, so the fields the
 * rail cannot hold read as unchanged on both and only the mutation's own effect
 * is under test. The target is that projection with the WHOLE mutation on it;
 * the residue is the smallest sub-mutation that still reaches the target once
 * the rail's own edits have been written.
 *
 * Fields are dropped one at a time and kept only if the target still lands, so
 * this is the round-trip invariant itself doing the deciding rather than a list
 * of which kinds the rail understands. An identity field (`seriesKey`, an
 * annotation `id`) stays for free: without it the mutation reaches nothing.
 *
 * ponytail: a derivation per field probed, each re-inferring roles and design
 * from the table. It runs once, on Execute, over a handful of mutations with a
 * handful of fields each; memoise the projection per `current` if a patch ever
 * gets long enough to feel.
 */
function overlayResidue(
  current: AnalysisSpec,
  next: AnalysisSpec,
  mutation: SpecMutation,
  table: Table
): SpecMutation | null {
  const edits = railEditsThatLand(current, next, table)
  // No rail edit at all means no control moved, so there is nothing on the rail
  // to hold any of it. Checked first because the comparison below cannot see
  // it: a mutation acting on something the projection already dropped (removing
  // an annotation) is a no-op on BOTH sides and would read as carried.
  if (Object.keys(edits).length === 0) return mutation
  let target: string
  let railed: AnalysisSpec
  try {
    target = canonical(applyMutation(railProjection(current, table), mutation))
    railed = railProjection(current, table, edits)
  } catch {
    // A projection that will not derive cannot hold anything. The overlay is
    // the safe half: it is replayed rather than re-derived.
    return mutation
  }
  // The rail reproduces the whole of it on its own, so nothing is replayed and
  // the control stays the user's to move afterwards.
  if (canonical(railed) === target) return null

  const lands = (candidate: SpecMutation) => {
    try {
      return canonical(applyMutation(railed, candidate)) === target
    } catch {
      return false
    }
  }
  // A mutation that does not land on top of its own rail edits is one this
  // reasoning does not cover (an append replayed over a rail that already
  // appended it, say). Replaying it whole is what the code did before residues
  // existed, and it is still the safe answer.
  if (!lands(mutation)) return mutation

  let residue = mutation
  for (const field of payloadFields(mutation)) {
    const reduced = withoutField(residue, field)
    if (lands(reduced)) residue = reduced
  }
  return residue
}

/**
 * The overlay, replayed. Every derivation of the spec from the rail ends here,
 * so a change with no control behind it is re-stated on each render instead of
 * being recomputed away on the next one.
 */
export function applyOverlay(spec: AnalysisSpec, overlay: AppliedMutation[]): AnalysisSpec {
  return overlay.reduce((s, entry) => applyMutation(s, entry.mutation), spec)
}

/**
 * The plain sentence for every reply that is not a patch.
 *
 * All of them in one place, so a variant cannot quietly fall through to
 * silence. `aborted` returns nothing on purpose: a superseded request is not
 * news, and telling the user their own second question cancelled the first
 * would read as a failure.
 */
export function aiNotice(outcome: SpecPatchOutcome): { title: string; body: string } | null {
  switch (outcome.outcome) {
    case "patch":
    case "aborted":
      return null
    case "refused":
      return {
        title: "Not that change",
        body:
          [outcome.reason, outcome.alternative].filter(Boolean).join(" ") ||
          "That request was declined.",
      }
    case "no-table":
      return {
        title: "Nothing to change yet",
        body: outcome.reason || "Import or type some data first, then describe the change.",
      }
    case "bad-request":
      return {
        title: "That request didn't get through",
        body: outcome.reason || "Try describing the change a little differently.",
      }
    case "unauthorized":
      return {
        title: "Sign in again to use the assistant",
        body: outcome.reason || "Your session expired. Nothing in this workspace was affected.",
      }
    case "unavailable":
      // The one message that has to say what still works, because this is the
      // case where the whole deterministic product is intact and unattended.
      return {
        title: "The assistant is off right now",
        body: `${outcome.reason ? `${outcome.reason} ` : ""}Every control here still works, the chart, the engine and the statistics are unaffected.`,
      }
    case "error":
      return { title: "The assistant didn't answer", body: outcome.reason }
  }
}

/**
 * P3, propose then execute. Execute is offered only for a proposal that would
 * actually do something and is not itself a question: a `clarificationNeeded`
 * reply is the assistant asking whether it understood, and a button offering
 * to act on a guess it just admitted might be wrong would undercut the ask.
 */
export function canExecuteProposal(
  proposal: { mutationCount: number; clarificationNeeded: string | null } | null
): boolean {
  if (!proposal) return false
  if (proposal.clarificationNeeded) return false
  return proposal.mutationCount > 0
}

/* ── Preview and post-commit verification (ADR-022) ──────────────────────── */

export type ProposalPreview = {
  /** The spec as it WOULD be if every resolvable mutation were accepted. */
  overlaySpec: AnalysisSpec
  /** What would change, field by field, before the researcher commits to it. */
  settingsDiff: Array<{ field: string; from: string; to: string }>
  /** Left out — malformed, or the spec itself rejected it. Never applied. */
  unresolved: Array<{ mutation: SpecMutation; reason: string }>
}

/** Flattens a spec into `{ "figure.palette": "..." }`-style leaves for diffing. */
function flattenForDiff(value: unknown, prefix: string, out: Record<string, string>): void {
  if (Array.isArray(value) || value === null || typeof value !== "object") {
    out[prefix] = Array.isArray(value) ? JSON.stringify(value) : String(value)
    return
  }
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    flattenForDiff(v, prefix ? `${prefix}.${key}` : key, out)
  }
}

function diffSpecs(before: AnalysisSpec, after: AnalysisSpec): Array<{ field: string; from: string; to: string }> {
  const a: Record<string, string> = {}
  const b: Record<string, string> = {}
  flattenForDiff(before, "", a)
  flattenForDiff(after, "", b)
  const fields = new Set([...Object.keys(a), ...Object.keys(b)])
  const diff: Array<{ field: string; from: string; to: string }> = []
  for (const field of fields) {
    if (a[field] !== b[field]) diff.push({ field, from: a[field] ?? "", to: b[field] ?? "" })
  }
  return diff
}

/**
 * The preview path — the proposed chart plus a settings diff — made real.
 *
 * `mutations` is typed as already-parsed `SpecMutation[]`, but it originates
 * from the model, which does not honour TypeScript at runtime: every entry is
 * re-validated through `parseMutation` (P5 §Edge cases — "Shape: malformed
 * mutation from the model"). A malformed entry, or one `applyMutation` itself
 * rejects, lands in `unresolved` with a reason and contributes nothing to
 * `overlaySpec`; it is never silently dropped.
 */
export function buildProposalPreview(
  currentSpec: AnalysisSpec,
  mutations: SpecMutation[],
  table: Table
): ProposalPreview {
  let overlaySpec = currentSpec
  const unresolved: ProposalPreview["unresolved"] = []
  for (const raw of mutations) {
    const parsed = parseMutation(raw)
    if (!parsed.ok) {
      unresolved.push({ mutation: raw, reason: parsed.reason })
      continue
    }
    try {
      overlaySpec = applyMutation(overlaySpec, parsed.mutation)
    } catch (err) {
      unresolved.push({ mutation: parsed.mutation, reason: err instanceof Error ? err.message : "Could not apply." })
    }
  }
  void table // reserved for a future resolver-backed legality check; unused today
  return { overlaySpec, settingsDiff: diffSpecs(currentSpec, overlaySpec), unresolved }
}

/**
 * The entity a mutation targets, when accepting it can be reported "applied
 * but not visible" (ADR-022) — everything else has no rendered target to lose,
 * so it is trivially visible.
 */
function targetEntityKey(mutation: SpecMutation): string | null {
  switch (mutation.kind) {
    case "figure.setSeriesStyle":
      return mutation.seriesKey
    case "figure.addAnnotation":
      return mutation.annotation.id
    case "figure.updateAnnotation":
    case "figure.removeAnnotation":
    case "figure.moveBracket":
      return mutation.id
    default:
      return null
  }
}

/**
 * ADR-022: "applied" is a claim about the FIGURE, not the spec object. Call
 * after a commit (or on reopen, against a stored overlay) with the entity
 * keys the render actually drew. A mutation whose target is not among them
 * comes back `visible: false` with a reason — "applied to the spec, but not
 * visible on this chart" — so the caller can report it and prune the stale
 * overlay entry instead of replaying it silently next time.
 */
export function verifyApplied(
  mutations: SpecMutation[],
  renderedEntityKeys: Set<string>
): Array<{ mutation: SpecMutation; visible: boolean; reason: string | null }> {
  return mutations.map((mutation) => {
    const key = targetEntityKey(mutation)
    if (key === null || renderedEntityKeys.has(key)) {
      return { mutation, visible: true, reason: null }
    }
    return {
      mutation,
      visible: false,
      reason: `Applied to the spec, but not visible on this chart: "${key}" is not currently drawn.`,
    }
  })
}
