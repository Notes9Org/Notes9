/**
 * Analysis pipelines: several independent analyses open at once.
 *
 * A pipeline is one complete analysis, its own data sheet, its own Analysis
 * Spec, its own engine result. Keeping more than one open is not a convenience
 * feature: a figure panel almost always draws on more than one experiment (the
 * dose-response beside the timecourse beside the plate), and forcing the user
 * to close one analysis to look at another makes assembling that figure a
 * matter of memory rather than of looking.
 *
 * Everything here is pure. The reducer takes state and an action and returns
 * new state, which is what lets the tab behaviour, what happens to the
 * selection when you close the active tab, what a duplicate is named, be
 * tested without mounting a component.
 *
 * Only the SPEC is persisted, never the result. §3A.3 rule 3 is explicit that
 * reopening must not silently present a stored number as current, and a result
 * restored from localStorage alongside a spec that may have been edited in
 * another tab is exactly that failure.
 */

import type { AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import type { EngineResult } from "@/lib/data-analysis/engine/contract"
import type { Table } from "@/lib/data-analysis/engine/resolver"

export interface AnalysisPipeline {
  id: string
  name: string
  spec: AnalysisSpec
  /** The rows this pipeline's spec resolves against. */
  table: Table
  /** Null until the engine has run for the current spec. */
  result: EngineResult | null
  /** Set when the spec has changed since `result` was computed. */
  stale: boolean
}

export interface PipelineState {
  pipelines: AnalysisPipeline[]
  activeId: string | null
}

export type PipelineAction =
  | { kind: "open"; pipeline: AnalysisPipeline }
  | { kind: "close"; id: string }
  | { kind: "activate"; id: string }
  | { kind: "rename"; id: string; name: string }
  | { kind: "duplicate"; id: string; newId: string }
  | { kind: "reorder"; id: string; toIndex: number }
  /**
   * `stale` distinguishes a data/analysis edit from a style one (Law 5). A
   * palette change must not mark the result stale, or the auto-recompute would
   * fire a Pyodide round trip for a colour.
   */
  | { kind: "setSpec"; id: string; spec: AnalysisSpec; stale?: boolean }
  | { kind: "setResult"; id: string; result: EngineResult | null }
  | { kind: "setTable"; id: string; table: Table }

export const EMPTY_PIPELINES: PipelineState = { pipelines: [], activeId: null }

/**
 * A name that does not collide with one already open.
 *
 * Duplicates get "(2)", "(3)" and so on rather than an identical name, because
 * two tabs reading "Viability 48 h" are indistinguishable in the tab strip and
 * in a figure panel's source label.
 */
export function uniqueName(existing: readonly string[], desired: string): string {
  const taken = new Set(existing)
  if (!taken.has(desired)) return desired
  // Strip an existing counter so "Plate (2)" duplicates to "Plate (3)".
  const base = desired.replace(/\s*\((\d+)\)\s*$/, "")
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} (${n})`
    if (!taken.has(candidate)) return candidate
  }
  return `${base} (${Date.now()})`
}

export function pipelineReducer(state: PipelineState, action: PipelineAction): PipelineState {
  switch (action.kind) {
    case "open": {
      const name = uniqueName(state.pipelines.map((p) => p.name), action.pipeline.name)
      return {
        pipelines: [...state.pipelines, { ...action.pipeline, name }],
        activeId: action.pipeline.id,
      }
    }

    case "close": {
      const index = state.pipelines.findIndex((p) => p.id === action.id)
      if (index === -1) return state
      const pipelines = state.pipelines.filter((p) => p.id !== action.id)
      if (state.activeId !== action.id) return { ...state, pipelines }
      // Closing the active tab selects its neighbour rather than jumping to the
      // first: the tab you were next to is where you were looking.
      const next = pipelines[index] ?? pipelines[index - 1] ?? null
      return { pipelines, activeId: next?.id ?? null }
    }

    case "activate":
      return state.pipelines.some((p) => p.id === action.id)
        ? { ...state, activeId: action.id }
        : state

    case "rename": {
      const trimmed = action.name.trim()
      if (!trimmed) return state
      const others = state.pipelines.filter((p) => p.id !== action.id).map((p) => p.name)
      const name = uniqueName(others, trimmed)
      return {
        ...state,
        pipelines: state.pipelines.map((p) => (p.id === action.id ? { ...p, name } : p)),
      }
    }

    case "duplicate": {
      const source = state.pipelines.find((p) => p.id === action.id)
      if (!source) return state
      const index = state.pipelines.findIndex((p) => p.id === action.id)
      const copy: AnalysisPipeline = {
        ...source,
        id: action.newId,
        name: uniqueName(state.pipelines.map((p) => p.name), source.name),
        // The result is dropped, not copied. It carries the ORIGINAL spec hash,
        // and a copy that shows its parent's numbers as its own would break the
        // link between a result and the spec that produced it.
        result: null,
        stale: true,
      }
      const pipelines = [...state.pipelines]
      pipelines.splice(index + 1, 0, copy)
      return { pipelines, activeId: copy.id }
    }

    case "reorder": {
      const from = state.pipelines.findIndex((p) => p.id === action.id)
      if (from === -1) return state
      const to = Math.max(0, Math.min(state.pipelines.length - 1, action.toIndex))
      if (from === to) return state
      const pipelines = [...state.pipelines]
      const [moved] = pipelines.splice(from, 1)
      pipelines.splice(to, 0, moved)
      return { ...state, pipelines }
    }

    case "setSpec":
      return {
        ...state,
        pipelines: state.pipelines.map((p) =>
          // A spec edit invalidates the result until the engine says otherwise;
          // marking it here is what stops a figure being drawn from numbers
          // that describe a different spec. A style-only edit leaves it alone.
          p.id === action.id
            ? { ...p, spec: action.spec, stale: (action.stale ?? true) || p.stale }
            : p
        ),
      }

    case "setResult":
      return {
        ...state,
        pipelines: state.pipelines.map((p) =>
          p.id === action.id ? { ...p, result: action.result, stale: action.result === null } : p
        ),
      }

    case "setTable":
      return {
        ...state,
        pipelines: state.pipelines.map((p) =>
          p.id === action.id ? { ...p, table: action.table, stale: true } : p
        ),
      }
  }
}

export function activePipeline(state: PipelineState): AnalysisPipeline | null {
  return state.pipelines.find((p) => p.id === state.activeId) ?? null
}

/* ── Persistence ───────────────────────────────────────────────────────────*/

/** What survives a reload: the analyses, not their numbers. */
export interface PersistedPipelines {
  version: 1
  activeId: string | null
  pipelines: { id: string; name: string; spec: AnalysisSpec }[]
}

export function toPersisted(state: PipelineState): PersistedPipelines {
  return {
    version: 1,
    activeId: state.activeId,
    pipelines: state.pipelines.map((p) => ({ id: p.id, name: p.name, spec: p.spec })),
  }
}

/**
 * Rebuild from persisted form.
 *
 * Tables are supplied by the caller because they come from the sheet, not from
 * this store; a pipeline whose table cannot be restored is dropped rather than
 * revived pointing at nothing. Results are always null on restore, so the first
 * thing the user sees is a recompute rather than yesterday's p-value.
 */
export function fromPersisted(
  persisted: PersistedPipelines | null,
  tables: Record<string, Table>
): PipelineState {
  if (!persisted || persisted.version !== 1) return EMPTY_PIPELINES
  const pipelines: AnalysisPipeline[] = []
  for (const entry of persisted.pipelines) {
    const table = tables[entry.id]
    if (!table) continue
    pipelines.push({ ...entry, table, result: null, stale: true })
  }
  const activeId = pipelines.some((p) => p.id === persisted.activeId)
    ? persisted.activeId
    : (pipelines[0]?.id ?? null)
  return { pipelines, activeId }
}
