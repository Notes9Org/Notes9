import {
  Exclusion,
  RowFilter,
  Transform,
  parseSpec,
  type AnalysisSpec,
} from "@/lib/data-analysis/spec/analysis-spec"
import {
  describeMutation,
  type AppliedMutation,
  type SpecMutation,
} from "@/lib/data-analysis/spec/mutations"
import { parseMutation } from "@/lib/data-analysis/spec/mutation-schema"
import type { Table } from "@/lib/data-analysis/engine/resolver"
import type { ComputeOutcome } from "@/lib/data-analysis/engine/client"
import type { EngineResult } from "@/lib/data-analysis/engine/contract"
import type { UniverWorkbookSnapshot } from "@/lib/spreadsheet-workbook"
import {
  chartStateFromSpec,
  recomputeSignature,
  specFromChartState,
  type ChartState,
} from "@/lib/data-analysis/workspace/chart-state-spec"
import { applyOverlay } from "@/lib/data-analysis/workspace/spec-prompt"
import { readDataSnapshot } from "@/lib/data-analysis/workspace/saved-analysis-session"

/**
 * The three boundaries the workspace shell guards, as pure functions.
 *
 * The shell is a React component of some thousands of lines, so a decision made
 * inline there is a decision nothing can test. Each of these was a defect first:
 * a reopened analysis recomputed itself, an exported revision imported as a
 * success that loaded nothing, an exclusion arrived from a file without passing
 * §8.1, and a threshold line offered a drag it then threw away. They are pure
 * because the argument for each is about values, not about React.
 */

/* ── 1. Reopening a stored revision ────────────────────────────────────────*/

export interface Reopen {
  /** The rail this reopen applies, its overlay included. */
  config: Record<string, unknown>
  /** The signature the derivation must settle on: the STORED spec's, always. */
  signature: string
  /**
   * Spec paths the rail and its overlay together could not restore, so a reopen
   * that is not faithful says so instead of quietly showing something else.
   * Empty is the normal case.
   */
  unrestored: string[]
}

/**
 * Reopening a stored revision: the spec is the source of truth, the rail a view.
 *
 * Every defect this function has had came from the other reading. The rail was
 * treated as authoritative, the spec was REBUILT from it, and the difference was
 * then reconciled — first by hand-completing fields, then by teaching the adopt
 * check to agree with the rebuild. The second is worse than the first: the rail
 * cannot hold `secondFactorColumn`, `missingValues` or `nonlinear`, so a two-way
 * ANOVA with pairwise deletion rebuilt as a one-way with listwise, and measuring
 * that rebuild against ITSELF said "no drift". The engine adopted, the stored
 * two-way p-value went on screen beside a one-way spec, and `commitSave` wrote
 * the pair into `analysis_revisions`, which is append-only. A p-value stored
 * beside an analysis that never produced it is retraction-class.
 *
 * So the reopen is made faithful BY CONSTRUCTION. The overlay is the workspace's
 * existing answer to "a spec field the rail has no control for" and it already
 * works when populated; the only reason it worked for some revisions and not
 * others was that it was merely REPLAYED when one happened to be stored. Here it
 * is DERIVED: whatever the stored spec holds that the rail plus the stored
 * overlay cannot reproduce becomes overlay entries of its own. Rail + overlay
 * then reproduces the stored spec exactly, for a legacy revision with no overlay
 * as much as for a new one, and the adopt check has nothing left to reconcile —
 * the parked signature is simply the stored spec's.
 *
 * What that cannot cover surfaces. `unrestored` names every path still differing
 * after the residue, so a field with no mutation to carry it (or one the rail
 * deliberately guards, such as a test this data cannot legally support) is
 * reported rather than dropped; and because the parked signature is the stored
 * one, the derivation's signature will genuinely differ and the engine will run
 * rather than adopt a number the spec on screen did not produce.
 *
 * `undefined` is dropped rather than spread: an explicit `test: undefined` is a
 * configuration that is silent about the test, and spreading it would overwrite
 * the spec's answer with nothing, which is exactly what `applyConfig` refuses to
 * do.
 */
export function reopenFromSpec(
  spec: AnalysisSpec,
  config: Record<string, unknown> | null,
  table: Table,
  fileName: string
): Reopen {
  // Through `railFromConfig`, not spread: the configuration reaches the live
  // rail through `applyConfig`, and a reopen measured against anything looser
  // than what `applyConfig` accepts reports a fidelity it does not have. It did
  // exactly that — a spread carried the numeric axis bounds this rail derives
  // from the spec, `applyConfig`'s string-only guards dropped them, and
  // `unrestored` came back EMPTY while the shell kept the previous analysis's
  // bounds and `commitSave` wrote the degraded spec into append-only storage.
  //
  // BOTH halves go through it, the spec-derived one included. `reopen.config` is
  // the only thing the shell ever sees, so a rail key that reaches this rail by
  // any route `railFromConfig` does not accept is a key the shell will not set —
  // and measuring `unrestored` against it claims a restoration that will not
  // happen. `figure.width`/`height` are the standing case: `chartStateFromSpec`
  // returns them, the rail has no control for them at all (`buildConfig` never
  // writes them), so an AI-set `figure.setDimensions` reopened at 720×520 while
  // this reported []. Filtered here, it is named instead.
  //
  // And the spec-derived half is made TOTAL over the keys `chartStateFromSpec`
  // deliberately omits. It omits `title`/`xLabel`/`yLabel`/`xKey` when the spec
  // holds null for them because it is ALSO the AI-mutation path, where a silent
  // field means "leave the researcher's own value alone" — right for an edit,
  // wrong for a swap. `openRevision` hands this to `swapConfig`, which is
  // `applyConfig`, which writes over the LIVE rail per field: a key absent here
  // does not land on a default, it INHERITS the analysis being left. So a
  // revision stored with no title reopened under the previous figure's title,
  // and `unrestored` said [] — because the residue is computed against
  // `fromRail`, and `fromRail` was reading the omission as a default nobody was
  // going to show. Cleared explicitly, the rail and the residue agree with the
  // shell again, and whatever "" still cannot say (a genuinely null title) the
  // overlay pins, exactly as it does for every other unreachable field.
  const rail = {
    ...railFromConfig({ ...CLEARED_BY_A_SILENT_SPEC, ...chartStateFromSpec(spec, table) }).rail,
    ...railFromConfig(config).rail,
  } as ChartState
  // The one required field `chartStateFromSpec` may omit and `specFromChartState`
  // reads unguarded.
  if (!Array.isArray(rail.yKeys)) rail.yKeys = []

  const stored = governedOverlay((config ?? {}).aiOverlay)
  const signature = recomputeSignature(spec)

  let fromRail: AnalysisSpec
  try {
    fromRail = specFromChartState(rail, table, { fileName })
  } catch {
    // The rail refuses this configuration outright, so `derivedSpec` is null:
    // there is no figure, no engine run and nothing to put a residue on.
    return { config: railWith(rail, stored), signature, unrestored: ["spec"] }
  }

  const overlay = [
    ...stored,
    ...residueMutations(derive(fromRail, stored), spec).map(restated),
  ]
  return {
    config: railWith(rail, overlay),
    signature,
    // `dataset` is a fact about the sheet being opened rather than about the
    // analysis: it is re-derived from the live table on purpose, and its own
    // drift already has a verdict (`openRevision`).
    unrestored: differingPaths(derive(fromRail, overlay), spec).filter(
      (path) => !path.startsWith("dataset")
    ),
  }
}

/**
 * The rail's way of saying "nothing here", for the four keys a spec can be
 * silent about. `chartType` is not among them and needs no entry: it is omitted
 * only for `dose-response` and `grouped-bar`, the two kinds no chart type maps
 * back to, so the kind an absent `chartType` derives can never equal the stored
 * one and the residue always pins it.
 */
const CLEARED_BY_A_SILENT_SPEC = { title: "", xLabel: "", yLabel: "", xKey: "" }

const railWith = (rail: ChartState, overlay: AppliedMutation[]): Record<string, unknown> => ({
  ...(rail as unknown as Record<string, unknown>),
  aiOverlay: overlay,
})

/**
 * The derivation, exactly as `data-analysis-workspace.tsx` performs it. Measured
 * any other way this would be measuring a spec the workspace cannot produce,
 * which is how the previous adopt check came to park a signature that never
 * matched.
 */
function derive(fromRail: AnalysisSpec, overlay: AppliedMutation[]): AnalysisSpec {
  if (overlay.length === 0) return fromRail
  const overlaid = parseSpec(applyOverlay(fromRail, overlay))
  return overlaid.ok ? overlaid.spec : fromRail
}

/**
 * A restored setting is the stored analysis restated, not an edit someone made,
 * so it carries no time. Nothing reads an overlay entry's `at` — the history and
 * provenance panels read `editHistory`, which `swapConfig` empties on a reopen.
 */
const restated = (mutation: SpecMutation): AppliedMutation => ({
  mutation,
  origin: "user",
  at: "",
  description: describeMutation(mutation),
})

/**
 * The stored spec minus what the rail (plus whatever overlay was stored with it)
 * already reproduces, as mutations.
 *
 * Only fields the rail has no control for at all. A field the rail deliberately
 * GUARDS is left alone: restoring a response column the sheet no longer has, or
 * a test the capability matrix refuses for this data, would use the overlay to
 * overrule a check that exists for a reason. Those differences surface through
 * `unrestored` instead, which is also what happens to a field no mutation can
 * name — `randomSeed` today.
 */
function residueMutations(from: AnalysisSpec, stored: AnalysisSpec): SpecMutation[] {
  const out: SpecMutation[] = []
  const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b)
  const analysis = stored.analysis
  const figure = stored.figure

  if (differs(from.roles, stored.roles)) out.push({ kind: "roles.set", roles: stored.roles })
  if (differs(from.design, stored.design)) out.push({ kind: "design.set", patch: stored.design })
  if (from.analysis.secondFactorColumn !== analysis.secondFactorColumn)
    out.push({ kind: "analysis.setColumns", secondFactor: analysis.secondFactorColumn })
  if (from.analysis.missingValues !== analysis.missingValues)
    out.push({ kind: "analysis.setMissingValues", value: analysis.missingValues })
  if (analysis.nonlinear && differs(from.analysis.nonlinear, analysis.nonlinear))
    out.push({ kind: "analysis.setNonlinear", patch: analysis.nonlinear })

  // The chart-type map is total out of the rail but not back into it, and a
  // title or an axis label the spec holds as null leaves the rail's own
  // standing — which is the previous analysis's, on a reopen.
  if (from.figure.kind !== figure.kind) out.push({ kind: "figure.setKind", value: figure.kind })
  if (from.figure.title !== figure.title)
    out.push({ kind: "figure.setTitle", value: figure.title })
  for (const axis of ["x", "y", "y2"] as const) {
    const want = figure[axis]
    if (want && differs(from.figure[axis], want)) out.push({ kind: "axis.set", axis, patch: want })
  }
  if (from.figure.showExcludedPoints !== figure.showExcludedPoints)
    out.push({ kind: "figure.setShowExcluded", value: figure.showExcludedPoints })
  for (const annotation of figure.annotations)
    if (!from.figure.annotations.some((a) => a.id === annotation.id))
      out.push({ kind: "figure.addAnnotation", annotation })
  for (const bracket of figure.brackets)
    if (!from.figure.brackets.some((b) => b.id === bracket.id))
      out.push({ kind: "figure.moveBracket", id: bracket.id, offsetY: bracket.offsetY })

  return out
}

/** Every leaf path at which `actual` differs from `want`. */
function differingPaths(actual: unknown, want: unknown, at = ""): string[] {
  if (JSON.stringify(actual) === JSON.stringify(want)) return []
  if (!isRecord(actual) || !isRecord(want)) return [at || "spec"]
  return [...new Set([...Object.keys(actual), ...Object.keys(want)])].flatMap((key) =>
    differingPaths(actual[key], want[key], at ? `${at}.${key}` : key)
  )
}

/* ── 1b. Adopting a stored result instead of recomputing ───────────────────*/

export interface RecomputeGate {
  /** The one signature that may be adopted rather than run. Spent on first use. */
  adopt: string | null
  /** The signature the engine has already settled at. */
  settled: string | null
}

export const emptyGate = (): RecomputeGate => ({ adopt: null, settled: null })
export const gateForReopen = (signature: string): RecomputeGate => ({
  adopt: signature,
  settled: null,
})

/**
 * Whether the engine must run for this signature, and the gate to keep.
 *
 * The exemption belongs to the reopen, not to the signature. Pinned for the
 * session it kept paying out: reopen a revision, turn alpha from 0.05 to 0.01,
 * let that recompute, then press Undo — the signature returns to the adopted one
 * and the gate returned early, leaving the 0.01 p-value and its CI on screen
 * under a rail reading 0.05. So it is spent on first use, and `gateRun` below
 * spends it too: once the engine has run there is no stored result left to
 * adopt.
 *
 * A run is NOT recorded here. The caller debounces, and a run that is cancelled
 * before it starts must not leave the signature marked as settled.
 */
export function gateStep(
  gate: RecomputeGate,
  signature: string
): { run: boolean; gate: RecomputeGate } {
  if (gate.adopt === signature) return { run: false, gate: { adopt: null, settled: signature } }
  if (gate.settled === signature) return { run: false, gate }
  return { run: true, gate }
}

/** The gate once a run has actually started. */
export const gateRun = (signature: string): RecomputeGate => ({ adopt: null, settled: signature })

/* ── 1c. What a compute attempt leaves on screen ───────────────────────────*/

/** Both fields, always. That totality IS the fix — see below. */
export interface EngineDisplay {
  result: EngineResult | null
  note: string | null
}

/**
 * The result and the note a finished compute attempt leaves behind.
 *
 * The shell used to decide this inline, in four branches, and one of them — the
 * `catch` — set the note and said nothing about the result. So after any engine
 * throw the PREVIOUS spec's numbers stayed on screen indefinitely, rendered by
 * `ResultsCard` at full confidence behind a thin compute bar, and a save taken
 * in that state wrote a spec beside a p-value it never produced into a table
 * that is append-only.
 *
 * Returning both fields for every branch is what removes the defect rather than
 * patching it: there is no longer an arrangement in which the caller keeps a
 * result, because there is no branch that declines to name one. The engine's own
 * `result.error` is deliberately NOT unwrapped here — a run that raised inside
 * Python still returns `ok`, carries its descriptives, and `EngineError` exists
 * so the UI can render that state as a finished analysis with a failed test.
 */
export function engineDisplayAfter(
  attempt: ComputeOutcome | { threw: unknown }
): EngineDisplay {
  if ("threw" in attempt) {
    const e = attempt.threw
    return { result: null, note: e instanceof Error ? e.message : String(e) }
  }
  if (attempt.ok) return { result: attempt.result, note: null }
  if ("blocked" in attempt)
    return { result: null, note: attempt.blocked.map((b) => b.message).join(" ") }
  return { result: null, note: attempt.question.question }
}

/* ── 2. Opening a file ─────────────────────────────────────────────────────*/

export interface ImportedAnalysis {
  workbook: UniverWorkbookSnapshot
  config: Record<string, unknown> | null
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

/**
 * Read a `.n9a`, in either shape the product writes.
 *
 * The workspace's own export is `{ workbook, config }`. A revision export
 * (`buildPortableBundle`) is `{ schema, spec, results, dataSnapshot, … }` and
 * carries the same two inside its snapshot. The importer knew only the first,
 * so a file the product had just produced loaded nothing and still said
 * "Opened" — the one failure mode a round trip must not have.
 *
 * Null means "not an analysis bundle", and the caller must say so rather than
 * report a success it did not have.
 *
 * The WORKBOOK is what makes it one. A bundle carrying only a configuration —
 * what exporting with no sheet loaded writes — used to import as a success, and
 * a configuration is a set of column bindings and a statistics choice for rows
 * it did not bring: applied to whatever sheet happened to be open, it renamed
 * that sheet's axes, rebound its series and re-tested it under another
 * analysis's settings, then said "Opened". Refusing it is the whole fix; there
 * is no sheet it could correctly be applied to.
 */
export function readAnalysisBundle(parsed: unknown): ImportedAnalysis | null {
  if (!isRecord(parsed)) return null

  if (parsed.workbook !== undefined || parsed.config !== undefined) {
    if (!isRecord(parsed.workbook)) return null
    return {
      workbook: parsed.workbook as UniverWorkbookSnapshot,
      config: isRecord(parsed.config) ? parsed.config : null,
    }
  }

  // Validated by the same reader the reopen path uses, so a hand-edited or
  // older snapshot degrades to "not readable" here exactly as it does there.
  const snapshot = readDataSnapshot(parsed.dataSnapshot)
  if (!snapshot?.workbook) return null
  return {
    workbook: snapshot.workbook,
    config: isRecord(snapshot.config) ? snapshot.config : null,
  }
}

/* ── 3. Letting a configuration reach the spec ─────────────────────────────*/

export interface GovernedPipeline {
  /** Null means the configuration is silent about it; the caller keeps its own. */
  filters: RowFilter[] | null
  transforms: Transform[] | null
  exclusions: Exclusion[] | null
  /** Never null: an overlay belongs to ONE analysis and must not outlive it. */
  overlay: AppliedMutation[]
  /** Entries that failed their schema, so the drop can be reported not hidden. */
  dropped: number
}

/**
 * §8.1's governance, enforced where it is actually crossed.
 *
 * `confirmExclusion` validates what the dialog produces and says in its own
 * comment that a UI guard is not a guarantee — and it was right: the same
 * fields also arrive from `JSON.parse` of an arbitrary `.n9a`, and
 * `specFromChartState` builds the spec by object literal without ever parsing
 * it. A hand-edited file could put a `statistical-outlier` with no method into
 * the live spec, the engine, and the next revision written to Postgres, which
 * is precisely the ad hoc outlier removal §8.1 exists to make impossible.
 *
 * Invalid entries are dropped rather than the whole file refused: an analysis
 * whose figure still opens with one bad row filter removed is more useful than
 * one that will not open at all, and `dropped` makes the removal visible.
 */
interface ParsesInto<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false }
}

export function governedPipeline(config: Record<string, unknown>): GovernedPipeline {
  let dropped = 0
  // Typed by what a parse RETURNS rather than by `z.ZodType<T>`: the schemas
  // here are a plain object, a discriminated union and an effect, and their zod
  // input types differ from their output types, which makes one generic
  // parameter fit none of them.
  const keep = <T>(schema: ParsesInto<T>, raw: unknown): T[] | null => {
    if (!Array.isArray(raw)) return null
    const out: T[] = []
    for (const item of raw) {
      const parsed = schema.safeParse(item)
      if (parsed.success) out.push(parsed.data)
      else dropped += 1
    }
    return out
  }
  const filters = keep<RowFilter>(RowFilter, config.filters)
  const transforms = keep<Transform>(Transform, config.transforms)
  const exclusions = keep<Exclusion>(Exclusion, config.exclusions)
  // Counted with the rest so a rejected overlay entry is reported by the same
  // message: an approved edit this build cannot read is a loss the user has to
  // be told about, not a silent no-op.
  const overlay = governedOverlay(config.aiOverlay)
  if (Array.isArray(config.aiOverlay)) dropped += config.aiOverlay.length - overlay.length
  return { filters, transforms, exclusions, overlay, dropped }
}

/**
 * The approved-edit overlay, read on the mutation union's own schema.
 *
 * An overlay is one analysis's residue, replayed over every later derivation.
 * A configuration that carries none must therefore yield an EMPTY one, or an
 * older `.n9a` opens with the previous analysis's edits still being restated —
 * the same hole as the pipeline above, one field over.
 *
 * `SpecMutationSchema` knows every kind and every payload, so this is one parse
 * rather than a structural check plus a hand-kept list of the payloads that
 * happen to reach §8.1. The structural version admitted `{kind:"figure.setX"}`
 * for any X: `applyMutation`'s switch returned `undefined` for it, the next
 * entry in the reduce read `undefined.figure` and threw, and the derivation's
 * catch returned null — no figure, no engine, no analysis, no message. The one
 * arrangement that degraded gracefully was the bad entry being the only entry.
 *
 * Invalid entries drop themselves, as one bad row filter does above, rather than
 * the whole overlay being refused: a `data.excludeRow` carrying an ungoverned
 * exclusion used to make `parseSpec` refuse the OVERLAID SPEC, so the derivation
 * fell back to the rail's own and every legitimate approved edit went with it.
 */
export function governedOverlay(raw: unknown): AppliedMutation[] {
  if (!Array.isArray(raw)) return []
  const out: AppliedMutation[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    if (entry.origin !== "user" && entry.origin !== "ai") continue
    const parsed = parseMutation(entry.mutation)
    if (parsed.ok) out.push({ ...(entry as unknown as AppliedMutation), mutation: parsed.mutation })
  }
  return out
}

/* ── 3b. What a configuration does to the rail ─────────────────────────────*/

export interface RailFromConfig {
  /**
   * Only the fields the configuration actually SUPPLIED. The caller keeps its
   * own for everything absent, which is what makes a partial `.n9a` or an AI
   * patch a partial edit rather than a reset.
   */
  rail: Partial<ChartState>
  overlay: AppliedMutation[]
  dropped: number
}

/**
 * The single definition of what a stored configuration does to the rail.
 *
 * This lived inline in `data-analysis-workspace.tsx` as thirty guarded setter
 * calls, which meant nothing could test it and anything that wanted to reason
 * about it had to MODEL it. Both things that did got the model wrong in the same
 * direction, and neither could see it:
 *
 *   - `reopenFromSpec` spread the configuration straight over
 *     `chartStateFromSpec`, so its `unrestored` was computed against a rail the
 *     shell never builds — it reported [] for fields the shell was dropping;
 *   - `workspace-guards.test.ts` cast the configuration straight into a
 *     `ChartState`, so every reopen assertion in it was measured against a model
 *     that shared the guards' blind spot exactly.
 *
 * A mirror cannot catch the thing it reflects. So there is one definition, the
 * shell applies it, and both of the above consume it.
 *
 * The axis bounds are the reason this mattered. `chartStateFromSpec` returns
 * `figure.x.min/max/tickCount` and `figure.y.min/max` as NUMBERS; the rail holds
 * them as strings (`useState("")`, and `buildConfig` writes what it holds). The
 * old guards accepted `typeof === "string"` only, so a reopen from a spec — the
 * null-config path, which has no legacy string-valued configuration to fall back
 * on — kept the PREVIOUS analysis's bounds while reporting full fidelity, and
 * `commitSave` then wrote the degraded spec into append-only storage. Accepting
 * a number and normalising it here is the fix at the single point of contact:
 * every producer of a configuration is covered, including a hand-edited `.n9a`,
 * rather than one producer being taught to stringify.
 */
export function railFromConfig(config: unknown): RailFromConfig {
  if (!isRecord(config)) return { rail: {}, overlay: [], dropped: 0 }

  const rail: Record<string, unknown> = {}
  const take = (key: string, accept: (v: unknown) => boolean, coerce?: (v: unknown) => unknown) => {
    const value = config[key]
    if (accept(value)) rail[key] = coerce ? coerce(value) : value
  }
  const str = (v: unknown) => typeof v === "string"
  const bool = (v: unknown) => typeof v === "boolean"
  const numeric = (v: unknown) => typeof v === "number"

  // A bound is a string in the rail, a number in a spec-derived configuration,
  // and null for "no bound". `specFromChartState`'s own `num` already reads all
  // three, so normalising to the rail's representation loses nothing.
  const bound = (v: unknown) => str(v) || (numeric(v) && Number.isFinite(v)) || v === null
  const asBoundString = (v: unknown) => (typeof v === "number" ? String(v) : v === null ? "" : v)

  take("chartType", (v) => str(v) && v !== "")
  take("xKey", str)
  take("yKeys", Array.isArray)
  take("zKey", str)
  take("sizeKey", str)
  take("title", str)
  take("subtitle", str)
  take("xLabel", str)
  take("xUnit", str)
  take("yLabel", str)
  take("yUnit", str)
  take("yLog", bool)
  take("xLog", bool)
  take("showGrid", bool)
  take("showLegend", bool)
  take("legendPos", str)
  take("paletteName", str)
  take("errorMode", str)
  take("fontFamily", str)
  take("titleSize", numeric)
  take("axisTitleSize", numeric)
  take("seriesStyles", isRecord)
  for (const key of ["xMin", "xMax", "yMin", "yMax", "nticks"])
    take(key, bound, asBoundString)
  // Total, not conditional: a caption belongs to ONE figure, so a configuration
  // silent about it must CLEAR the previous one rather than leave it standing.
  rail.caption = str(config.caption) ? config.caption : null
  // The statistics slice. Null on the reference level is a value ("compare
  // against no baseline"), so it is accepted alongside a column name.
  take("test", str)
  take("postHoc", str)
  take("alpha", numeric)
  take("tails", str)
  take("referenceLevel", (v) => v === null || str(v))

  // §8.1's governance, on the same three lists the shell reads back. Absent
  // means silent, so those keys stay off `rail` and the caller keeps its own.
  const governed = governedPipeline(config)
  if (governed.filters) rail.filters = governed.filters
  if (governed.transforms) rail.transforms = governed.transforms
  if (governed.exclusions) rail.exclusions = governed.exclusions

  return { rail: rail as Partial<ChartState>, overlay: governed.overlay, dropped: governed.dropped }
}

/* ── 4. Letting Plotly edit a shape ────────────────────────────────────────*/

const SHAPE_EDIT_KEY = /^shapes\[(\d+)\]\./

/**
 * The shape index a relayout event moved, or null if it moved no shape.
 *
 * `edits.shapePosition` is a single global switch, so turning it on for the
 * significance brackets turns it on for every shape in the figure — a volcano's
 * threshold lines and any drawn annotation included. `bracketMoveFromRelayout`
 * maps `shapes[i]` to `brackets[i]` and returns null past the bracket run, so
 * dragging one of those moved it on screen, dispatched nothing, and let the
 * next `Plotly.react` put it back: an affordance that looks like it works and
 * throws the edit away. Knowing WHICH shape moved is what lets the canvas put
 * it back at once instead.
 */
export function movedShapeIndex(relayout: Record<string, unknown>): number | null {
  for (const key of Object.keys(relayout)) {
    const match = SHAPE_EDIT_KEY.exec(key)
    if (match) return Number(match[1])
  }
  return null
}
