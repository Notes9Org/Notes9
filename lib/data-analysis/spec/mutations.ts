import type {
  AnalysisSpec,
  Annotation,
  BRACKET_STYLE_FIELDS,
  DatasetJoin,
  Exclusion,
  FigureKind,
  RowFilter,
  SeriesStyle,
  SignificanceBracket,
  TestKind,
  Transform,
} from "./analysis-spec"
import { bracketPair } from "./analysis-spec"

/**
 * L6, the edit layer.
 *
 * "Every control is a typed mutation on the spec. Full undo/redo. Conflict
 * rules for AI vs manual edits: manual edits are sticky, a subsequent AI
 * change must preserve them or explicitly announce the override."
 *
 * Three consequences of taking that literally, all of which this file provides:
 *
 *   - A dragged axis and the sentence "make it log scale" produce the SAME
 *     mutation. There is no second code path for the assistant, which is what
 *     makes Law 3 (one object, bidirectional) true rather than aspirational.
 *   - Undo/redo is a list of mutations, not a stack of cloned specs, so history
 *     is readable: §3A.4 wants a plain-language diff, and a typed mutation
 *     already knows how to describe itself.
 *   - Stickiness is computable, because every mutation names the spec path it
 *     touches. An AI patch that lands on a path the user edited by hand is a
 *     collision we can detect and report instead of silently winning.
 */

/* ── Mutations ─────────────────────────────────────────────────────────────*/

/**
 * What `figure.setBracketStyle` may set, named by the spec's own
 * `BRACKET_STYLE_FIELDS` rather than a second hand-written list, so the
 * mutation, the zod schema and what regeneration copies cannot drift apart.
 */
export type BracketStylePatch = Partial<
  Pick<SignificanceBracket, (typeof BRACKET_STYLE_FIELDS)[number]>
>

export type SpecMutation =
  /* Figure, style. These never trigger a recompute (Law 5). */
  | { kind: "figure.setKind"; value: FigureKind }
  | { kind: "figure.setTitle"; value: string | null }
  | { kind: "figure.setCaption"; value: string | null }
  | { kind: "figure.setSubtitle"; value: string | null }
  | { kind: "figure.setPalette"; value: AnalysisSpec["figure"]["palette"] }
  | { kind: "figure.setLegend"; show: boolean; position?: AnalysisSpec["figure"]["legendPosition"] }
  | { kind: "figure.setGridlines"; value: boolean }
  | { kind: "figure.setDimensions"; width?: number; height?: number }
  | { kind: "figure.setFont"; family?: AnalysisSpec["figure"]["fontFamily"]; titleSize?: number; axisSize?: number }
  | { kind: "figure.setSeriesStyle"; seriesKey: string; patch: Partial<Omit<SeriesStyle, "key">> }
  | { kind: "figure.addAnnotation"; annotation: Annotation }
  | { kind: "figure.updateAnnotation"; id: string; patch: Partial<Annotation> }
  | { kind: "figure.removeAnnotation"; id: string }
  | { kind: "figure.moveBracket"; id: string; offsetY: number }
  | { kind: "figure.setBracketStyle"; id: string; patch: BracketStylePatch }
  | { kind: "figure.setShowExcluded"; value: boolean }
  /* Axes, label/scale/limits. Scale and limits are style; they redraw, not recompute. */
  | { kind: "axis.set"; axis: "x" | "y" | "y2"; patch: Partial<AnalysisSpec["figure"]["x"]> }
  /* Error bars, looks like style, changes what is drawn, so it recomputes. */
  | { kind: "figure.setErrorBars"; value: AnalysisSpec["figure"]["errorBars"] }
  /* Analysis, always recomputes. */
  | { kind: "analysis.setTest"; value: TestKind }
  | { kind: "analysis.setPostHoc"; value: AnalysisSpec["analysis"]["postHoc"] }
  | { kind: "analysis.setTails"; value: AnalysisSpec["analysis"]["tails"] }
  | { kind: "analysis.setAlpha"; value: number }
  | { kind: "analysis.setColumns"; response?: string[]; group?: string | null; secondFactor?: string | null }
  | { kind: "analysis.setReferenceLevel"; value: string | null }
  | { kind: "analysis.setMissingValues"; value: AnalysisSpec["analysis"]["missingValues"] }
  | { kind: "analysis.setNonlinear"; patch: Partial<NonNullable<AnalysisSpec["analysis"]["nonlinear"]>> }
  /* Data, always recomputes. */
  | { kind: "data.addTransform"; transform: Transform }
  | { kind: "data.removeTransform"; index: number }
  | { kind: "data.setFilters"; filters: RowFilter[] }
  | { kind: "data.setJoins"; joins: DatasetJoin[] }
  | { kind: "data.excludeRow"; exclusion: Exclusion }
  | { kind: "data.restoreRow"; rowId: string }
  /* Roles and design, the semantic layer (L2). */
  | { kind: "design.set"; patch: Partial<AnalysisSpec["design"]> }
  | { kind: "roles.set"; roles: AnalysisSpec["roles"] }

export type MutationOrigin = "user" | "ai"

export interface AppliedMutation {
  mutation: SpecMutation
  origin: MutationOrigin
  at: string
  /** Human sentence for the history list and the revision diff (§3A.4). */
  description: string
}

/* ── Path and classification ───────────────────────────────────────────────*/

/**
 * The spec path a mutation owns. Stickiness and recompute decisions are both
 * derived from this, so a new mutation only has to declare its path once.
 */
export function mutationPath(m: SpecMutation): string {
  switch (m.kind) {
    case "figure.setSeriesStyle":
      return `figure.series.${m.seriesKey}`
    case "axis.set":
      return `figure.axis.${m.axis}`
    case "figure.updateAnnotation":
    case "figure.removeAnnotation":
      return `figure.annotation.${m.id}`
    case "figure.moveBracket":
    case "figure.setBracketStyle":
      return `figure.bracket.${m.id}`
    case "data.excludeRow":
      return `data.exclusion.${m.exclusion.rowId}`
    case "data.restoreRow":
      return `data.exclusion.${m.rowId}`
    default:
      return m.kind
  }
}

/**
 * Law 5: "style edits never recompute; data and analysis edits always do."
 * Getting this wrong in either direction is a real defect, a false positive
 * costs a 2s round trip on a colour change, a false negative shows numbers that
 * no longer match the figure.
 */
export function requiresRecompute(m: SpecMutation): boolean {
  if (m.kind.startsWith("analysis.")) return true
  if (m.kind.startsWith("data.")) return true
  if (m.kind.startsWith("design.")) return true
  if (m.kind.startsWith("roles.")) return true
  // Error-bar type changes what is drawn from the data, not merely how it looks.
  if (m.kind === "figure.setErrorBars") return true
  // Changing the chart kind can change which aggregation the engine performs.
  if (m.kind === "figure.setKind") return true
  return false
}

export function describeMutation(m: SpecMutation): string {
  switch (m.kind) {
    case "figure.setKind":
      return `Chart type set to ${m.value}`
    case "figure.setTitle":
      return m.value ? `Title set to "${m.value}"` : "Title cleared"
    case "figure.setCaption":
      return m.value ? "Caption edited" : "Caption reset to the generated wording"
    case "figure.setSubtitle":
      return m.value ? `Subtitle set to "${m.value}"` : "Subtitle cleared"
    case "figure.setPalette":
      return `Palette changed to ${m.value}`
    case "figure.setLegend":
      return m.show ? `Legend shown${m.position ? ` (${m.position})` : ""}` : "Legend hidden"
    case "figure.setGridlines":
      return m.value ? "Gridlines shown" : "Gridlines hidden"
    case "figure.setDimensions":
      return `Panel resized${m.width ? ` to ${m.width}px wide` : ""}${m.height ? ` by ${m.height}px tall` : ""}`
    case "figure.setFont":
      return "Typography changed"
    case "figure.setSeriesStyle":
      return `Series "${m.seriesKey}" restyled`
    case "figure.addAnnotation":
      return `${m.annotation.kind} annotation added`
    case "figure.updateAnnotation":
      return "Annotation edited"
    case "figure.removeAnnotation":
      return "Annotation removed"
    case "figure.moveBracket":
      return "Significance bracket moved"
    case "figure.setBracketStyle":
      // Hiding is not a restyle: it takes a significant comparison off the
      // figure, and the history entry has to say so rather than reading as a
      // colour change (§3A.4 wants the diff to be honest in plain language).
      return m.patch.hidden === true
        ? "Significance bracket hidden"
        : m.patch.hidden === false
          ? "Significance bracket shown"
          : "Significance bracket restyled"
    case "figure.setShowExcluded":
      return m.value ? "Excluded points shown" : "Excluded points hidden"
    case "axis.set": {
      const bits: string[] = []
      if (m.patch.label !== undefined) bits.push(`label "${m.patch.label ?? ""}"`)
      if (m.patch.scale !== undefined) bits.push(m.patch.scale === "log10" ? "log scale" : "linear scale")
      if (m.patch.min !== undefined || m.patch.max !== undefined) bits.push("limits")
      return `${m.axis.toUpperCase()} axis: ${bits.join(", ") || "updated"}`
    }
    case "figure.setErrorBars":
      return `Error bars changed to ${m.value.toUpperCase()}`
    case "analysis.setTest":
      return `Test changed to ${m.value}`
    case "analysis.setPostHoc":
      return `Post-hoc correction set to ${m.value}`
    case "analysis.setTails":
      return `Tails set to ${m.value}`
    case "analysis.setAlpha":
      return `Alpha set to ${m.value}`
    case "analysis.setColumns":
      return "Analysis columns changed"
    case "analysis.setReferenceLevel":
      return m.value ? `Reference level set to "${m.value}"` : "Reference level cleared"
    case "analysis.setMissingValues":
      return `Missing-value strategy set to ${m.value}`
    case "analysis.setNonlinear":
      return "Curve-fit options changed"
    case "data.addTransform":
      return `Transform added: ${m.transform.kind}`
    case "data.removeTransform":
      return "Transform removed"
    case "data.setFilters":
      return `Filters updated (${m.filters.length})`
    case "data.setJoins":
      // Names the file, because "1 join" in the history tells the researcher
      // nothing about which of their files the numbers now depend on.
      return m.joins.length === 0
        ? "Join removed"
        : `Joined ${m.joins.map((j) => j.right.fileName ?? j.right.fileId).join(", ")}`
    case "data.excludeRow":
      // The reason is part of the description on purpose: §8.1 wants the record
      // to carry WHY, everywhere it appears, not only in the provenance card.
      return `Row ${m.exclusion.rowId} excluded (${m.exclusion.reasonKind}${
        m.exclusion.reasonText ? `: ${m.exclusion.reasonText}` : ""
      })`
    case "data.restoreRow":
      return `Row ${m.rowId} restored`
    case "design.set":
      return "Design declaration updated"
    case "roles.set":
      return "Column roles updated"
  }
}

/* ── Apply ─────────────────────────────────────────────────────────────────*/

function axisFor(spec: AnalysisSpec, axis: "x" | "y" | "y2") {
  if (axis === "x") return spec.figure.x
  if (axis === "y") return spec.figure.y
  return spec.figure.y2 ?? spec.figure.y
}

/**
 * Pure. Returns a new spec; never mutates the input. That is what lets history
 * hold references to previous specs without defensive cloning.
 */
export function applyMutation(spec: AnalysisSpec, m: SpecMutation): AnalysisSpec {
  const figure = spec.figure
  switch (m.kind) {
    case "figure.setKind":
      return { ...spec, figure: { ...figure, kind: m.value } }
    case "figure.setTitle":
      return { ...spec, figure: { ...figure, title: m.value } }
    case "figure.setCaption":
      return { ...spec, figure: { ...figure, caption: m.value } }
    case "figure.setSubtitle":
      return { ...spec, figure: { ...figure, subtitle: m.value } }
    case "figure.setPalette":
      return { ...spec, figure: { ...figure, palette: m.value } }
    case "figure.setLegend":
      return {
        ...spec,
        figure: {
          ...figure,
          showLegend: m.show,
          legendPosition: m.position ?? figure.legendPosition,
        },
      }
    case "figure.setGridlines":
      return { ...spec, figure: { ...figure, showGridlines: m.value } }
    case "figure.setDimensions":
      return {
        ...spec,
        figure: { ...figure, width: m.width ?? figure.width, height: m.height ?? figure.height },
      }
    case "figure.setFont":
      return {
        ...spec,
        figure: {
          ...figure,
          fontFamily: m.family ?? figure.fontFamily,
          titleFontSize: m.titleSize ?? figure.titleFontSize,
          axisFontSize: m.axisSize ?? figure.axisFontSize,
        },
      }
    case "figure.setSeriesStyle": {
      const existing = figure.series.find((s) => s.key === m.seriesKey)
      const next: SeriesStyle = existing
        ? { ...existing, ...m.patch }
        : {
            key: m.seriesKey,
            colour: null,
            pointShape: "circle",
            pointSize: 6,
            opacity: 1,
            jitter: 0,
            lineStyle: "solid",
            lineWidth: 2,
            axis: "left",
            ...m.patch,
          }
      const series = existing
        ? figure.series.map((s) => (s.key === m.seriesKey ? next : s))
        : [...figure.series, next]
      return { ...spec, figure: { ...figure, series } }
    }
    case "figure.addAnnotation":
      return { ...spec, figure: { ...figure, annotations: [...figure.annotations, m.annotation] } }
    case "figure.updateAnnotation":
      return {
        ...spec,
        figure: {
          ...figure,
          annotations: figure.annotations.map((a) =>
            a.id === m.id ? ({ ...a, ...m.patch } as Annotation) : a
          ),
        },
      }
    case "figure.removeAnnotation":
      return {
        ...spec,
        figure: { ...figure, annotations: figure.annotations.filter((a) => a.id !== m.id) },
      }
    case "figure.moveBracket": {
      // A bracket the engine derived has no row in the spec until someone moves
      // it: the significant pairs are recomputed on every result, so storing all
      // of them would churn the spec for no gain. Dragging one is the moment it
      // becomes the researcher's own, and the id names the pair it spans, so the
      // row can be written here rather than needing a second mutation to create
      // it first.
      const pair = figure.brackets.some((b) => b.id === m.id) ? null : bracketPair(m.id)
      return {
        ...spec,
        figure: {
          ...figure,
          brackets: pair
            ? [
                ...figure.brackets,
                { id: m.id, ...pair, offsetY: m.offsetY, derived: false, display: "stars" as const },
              ]
            : figure.brackets.map((b) =>
                // A dragged bracket stops being engine-derived, so a recompute
                // will reposition its siblings but leave this one where the user
                // put it.
                b.id === m.id ? { ...b, offsetY: m.offsetY, derived: false } : b
              ),
        },
      }
    }
    case "figure.setBracketStyle": {
      // The same sparse override layer `figure.moveBracket` writes into, for the
      // same reason: brackets are DERIVED from `result.test.pairwise` on every
      // recompute, so the spec holds a row only for the ones a researcher has
      // actually touched, keyed by the pair the id names. That is what makes a
      // restyle survive the analysis changing — the new post-hoc result
      // regenerates the bracket and the renderer finds this row by the same
      // pair, exactly as it finds a dragged `offsetY`.
      //
      // `derived` is cleared for the same reason a drag clears it: this
      // comparison now looks the way the researcher chose, not the way the
      // engine produced it.
      const pair = figure.brackets.some((b) => b.id === m.id) ? null : bracketPair(m.id)
      return {
        ...spec,
        figure: {
          ...figure,
          brackets: pair
            ? [
                ...figure.brackets,
                {
                  id: m.id,
                  ...pair,
                  offsetY: 0,
                  derived: false,
                  display: "stars" as const,
                  ...m.patch,
                },
              ]
            : figure.brackets.map((b) => (b.id === m.id ? { ...b, ...m.patch, derived: false } : b)),
        },
      }
    }
    case "figure.setShowExcluded":
      return { ...spec, figure: { ...figure, showExcludedPoints: m.value } }
    case "axis.set": {
      const merged = { ...axisFor(spec, m.axis), ...m.patch }
      if (m.axis === "x") return { ...spec, figure: { ...figure, x: merged } }
      if (m.axis === "y") return { ...spec, figure: { ...figure, y: merged } }
      return { ...spec, figure: { ...figure, y2: merged } }
    }
    case "figure.setErrorBars":
      return { ...spec, figure: { ...figure, errorBars: m.value } }

    case "analysis.setTest":
      return { ...spec, analysis: { ...spec.analysis, test: m.value } }
    case "analysis.setPostHoc":
      return { ...spec, analysis: { ...spec.analysis, postHoc: m.value } }
    case "analysis.setTails":
      return { ...spec, analysis: { ...spec.analysis, tails: m.value } }
    case "analysis.setAlpha":
      return { ...spec, analysis: { ...spec.analysis, alpha: m.value } }
    case "analysis.setColumns":
      return {
        ...spec,
        analysis: {
          ...spec.analysis,
          responseColumns: m.response ?? spec.analysis.responseColumns,
          groupColumn: m.group !== undefined ? m.group : spec.analysis.groupColumn,
          secondFactorColumn:
            m.secondFactor !== undefined ? m.secondFactor : spec.analysis.secondFactorColumn,
        },
      }
    case "analysis.setReferenceLevel":
      return { ...spec, analysis: { ...spec.analysis, referenceLevel: m.value } }
    case "analysis.setMissingValues":
      return { ...spec, analysis: { ...spec.analysis, missingValues: m.value } }
    case "analysis.setNonlinear": {
      const base = spec.analysis.nonlinear ?? {
        model: "4pl" as const,
        weighting: "none" as const,
        sharedParameters: [],
        constraints: {},
        confidenceBands: true,
        interpolate: false,
      }
      return { ...spec, analysis: { ...spec.analysis, nonlinear: { ...base, ...m.patch } } }
    }

    case "data.addTransform":
      return { ...spec, transforms: [...spec.transforms, m.transform] }
    case "data.removeTransform":
      return { ...spec, transforms: spec.transforms.filter((_, i) => i !== m.index) }
    case "data.setFilters":
      return { ...spec, filters: m.filters }
    case "data.setJoins":
      return { ...spec, joins: m.joins }
    case "data.excludeRow": {
      // §8.1 records are append-only. An exclusion names a person, a reason, a
      // method and a time, and the spec holds the only copy; replacing it in
      // place destroyed all four silently, with no undo entry naming the loss.
      //
      // So a row that is already excluded is REFUSED, not overwritten. Refused
      // rather than superseded because a supersession needs a second record to
      // point at, and the trail that already exists says the same thing: restore
      // the row, then exclude it again, and history holds both events with both
      // reasons and both authors.
      //
      // Refusing here covers every caller -- the sheet's card, the figure's
      // right-click and an assistant patch alike -- which a guard at one call
      // site cannot. Returning the spec unchanged is also what the commit path
      // reads as "nothing happened" (`splitApprovedMutations` drops mutations
      // that leave the spec identical), so nothing is written and no history
      // entry claims an edit that did not occur.
      if (spec.exclusions.some((e) => e.rowId === m.exclusion.rowId)) return spec
      return { ...spec, exclusions: [...spec.exclusions, m.exclusion] }
    }
    case "data.restoreRow":
      return { ...spec, exclusions: spec.exclusions.filter((e) => e.rowId !== m.rowId) }

    case "design.set":
      return { ...spec, design: { ...spec.design, ...m.patch } }
    case "roles.set":
      return { ...spec, roles: m.roles }
    default:
      // Unreachable for a `SpecMutation`, and the point is what happens when the
      // value is not one: a `.n9a` or a stored overlay can carry a kind this
      // build does not have. Falling off the switch returned `undefined`, the
      // next entry in `applyOverlay`'s reduce read `undefined.figure` and threw,
      // and the workspace lost the whole figure. An unknown edit is a lost edit,
      // never a destroyed spec.
      return spec
  }
}

/* ── History ───────────────────────────────────────────────────────────────*/

export interface SpecHistory {
  spec: AnalysisSpec
  past: { spec: AnalysisSpec; applied: AppliedMutation }[]
  future: { spec: AnalysisSpec; applied: AppliedMutation }[]
  /**
   * Paths the USER has edited by hand. This is the sticky set: an AI patch
   * touching one of these must preserve it or announce the override.
   */
  userEditedPaths: Set<string>
}

/**
 * `userEditedPaths` is a parameter because the surface that owns the sticky set
 * is not this module. The workspace keeps one history for the whole analysis
 * and derives the set from its audit log (`edit-history.ts`), then hands it in
 * here for the one call that needs it, `applyAiPatch`. Defaulting it to empty
 * was not a placeholder — it was the whole of L6 failing quietly, because every
 * caller took the default and no collision could ever be detected.
 */
export function initHistory(spec: AnalysisSpec, userEditedPaths: Iterable<string> = []): SpecHistory {
  return { spec, past: [], future: [], userEditedPaths: new Set(userEditedPaths) }
}

/**
 * The record form of a mutation.
 *
 * Split out of `dispatchMutation` for the caller that needs the ENTRY but not a
 * new spec — a rail control that has already moved its own state and only wants
 * the edit written to history. Sharing this is what keeps a hand-turned knob and
 * an assistant patch indistinguishable to the undo stack and the provenance
 * card, which is the property the whole of L6 rests on.
 */
export function appliedMutation(
  mutation: SpecMutation,
  origin: MutationOrigin = "user"
): AppliedMutation {
  return {
    mutation,
    origin,
    at: new Date().toISOString(),
    description: describeMutation(mutation),
  }
}

export function dispatchMutation(
  history: SpecHistory,
  mutation: SpecMutation,
  origin: MutationOrigin = "user"
): SpecHistory {
  const applied = appliedMutation(mutation, origin)
  const nextSpec = applyMutation(history.spec, mutation)
  const userEditedPaths = new Set(history.userEditedPaths)
  if (origin === "user") userEditedPaths.add(mutationPath(mutation))

  return {
    spec: nextSpec,
    past: [...history.past, { spec: history.spec, applied }],
    // Any new edit invalidates the redo branch, as in every editor.
    future: [],
    userEditedPaths,
  }
}

export function undo(history: SpecHistory): SpecHistory {
  const previous = history.past[history.past.length - 1]
  if (!previous) return history
  return {
    spec: previous.spec,
    past: history.past.slice(0, -1),
    future: [{ spec: history.spec, applied: previous.applied }, ...history.future],
    userEditedPaths: history.userEditedPaths,
  }
}

export function redo(history: SpecHistory): SpecHistory {
  const next = history.future[0]
  if (!next) return history
  return {
    spec: next.spec,
    past: [...history.past, { spec: history.spec, applied: next.applied }],
    future: history.future.slice(1),
    userEditedPaths: history.userEditedPaths,
  }
}

export const canUndo = (h: SpecHistory) => h.past.length > 0
export const canRedo = (h: SpecHistory) => h.future.length > 0

/* ── AI patches, and the sticky rule ───────────────────────────────────────*/

export interface AiPatchResult {
  history: SpecHistory
  /** Mutations that were applied. */
  applied: SpecMutation[]
  /**
   * Mutations that collided with a hand edit. Per L6 the assistant must either
   * preserve the manual edit or ANNOUNCE the override, so these are surfaced
   * rather than dropped silently, and the UI turns them into a sentence like
   * "I also changed the Y axis label you set by hand."
   */
  overrides: { mutation: SpecMutation; path: string; description: string }[]
}

/**
 * Apply a patch proposed by the assistant.
 *
 * `force` distinguishes the two legal behaviours: by default a collision with a
 * hand edit is REFUSED and reported, so the user's edit survives; when the user
 * has explicitly asked for the change ("no, really, make the axis log"), the
 * caller re-applies with force and the override is still recorded in history.
 */
export function applyAiPatch(
  history: SpecHistory,
  mutations: SpecMutation[],
  options: { force?: boolean } = {}
): AiPatchResult {
  let next = history
  const applied: SpecMutation[] = []
  const overrides: AiPatchResult["overrides"] = []

  for (const mutation of mutations) {
    const path = mutationPath(mutation)
    const collides = history.userEditedPaths.has(path)
    if (collides && !options.force) {
      overrides.push({ mutation, path, description: describeMutation(mutation) })
      continue
    }
    next = dispatchMutation(next, mutation, "ai")
    applied.push(mutation)
  }

  return { history: next, applied, overrides }
}

/**
 * A plain-language diff between two points in history (§3A.4: "error bars SEM →
 * SD; one exclusion added (well A7, plate edge effect); palette changed to
 * colour-blind-safe"). Diffing specs is straightforward; diffing images is not.
 */
export function describeHistorySince(history: SpecHistory, sinceIndex: number): string[] {
  return history.past.slice(sinceIndex).map((entry) => entry.applied.description)
}
