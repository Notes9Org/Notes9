"use client"

import * as React from "react"

import type { FigureSpec } from "@/types/analysis"

/** How many past specs the undo stack holds before the oldest is dropped. */
const UNDO_LIMIT = 50

/**
 * Which of the three writers is currently driving the spec. The workspace uses
 * it to decide what to grey out (a focused JSON editor owns the spec until it
 * blurs) and nothing else — it is UI state, not part of the wire contract.
 */
export type FigureEditSource = "format" | "json" | "canvas" | null

/** The RFC 6902 subset the figure editor actually needs. */
export type FigurePatchOp =
  | { op: "replace"; path: string; value: unknown }
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string }

export type FigureAction =
  /** Immutable set at a JSON pointer, e.g. `/layout/yaxis/type`. */
  | { type: "SET_PATH"; path: string; value: unknown }
  /** Wholesale swap — the JSON panel's commit path. */
  | { type: "REPLACE_SPEC"; spec: FigureSpec }
  | { type: "APPLY_PATCH"; ops: FigurePatchOp[] }
  | { type: "UNDO" }
  | { type: "REDO" }

export type FigureDispatch = React.Dispatch<FigureAction>

export type FigureSpecState = {
  spec: FigureSpec
  past: FigureSpec[]
  future: FigureSpec[]
}

/** RFC 6901: `~1` is `/`, `~0` is `~`. Leading empty segment is dropped. */
function parsePointer(pointer: string): string[] {
  const raw = pointer.startsWith("/") ? pointer.slice(1) : pointer
  if (raw === "") return []
  return raw.split("/").map((seg) => seg.replace(/~1/g, "/").replace(/~0/g, "~"))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Immutable set that PRESERVES KEY ORDER.
 *
 * This is load-bearing: the JSON panel renders `JSON.stringify(spec)`, so if a
 * Format-panel or canvas write reordered or rebuilt any object, the editor text
 * would reflow under the user's cursor. Object spread keeps an existing key in
 * its original slot and only appends genuinely new keys — never rebuild, sort,
 * or round-trip these objects.
 */
function setAtPath<T>(node: T, segs: string[], value: unknown): T {
  if (segs.length === 0) return value as T
  const [head, ...rest] = segs

  if (Array.isArray(node)) {
    const index = Number(head)
    if (!Number.isInteger(index) || index < 0 || index >= node.length) return node
    const next = node.slice()
    next[index] = setAtPath(node[index], rest, value)
    return next as unknown as T
  }

  const src: Record<string, unknown> = isPlainObject(node) ? node : {}
  // ponytail: missing intermediates are always created as objects. Plotly's
  // array containers (`data`, `layout.shapes`) are emitted by figure_builder,
  // so nothing we address has to conjure an array out of nothing.
  return { ...src, [head]: setAtPath(src[head], rest, value) } as unknown as T
}

/**
 * Removals return the SAME reference all the way up when nothing matched, so a
 * patch that hits a missing key doesn't manufacture a spurious undo entry.
 */
function removeAtPath<T>(node: T, segs: string[]): T {
  if (segs.length === 0) return node
  const [head, ...rest] = segs

  if (Array.isArray(node)) {
    const index = Number(head)
    if (!Number.isInteger(index) || index < 0 || index >= node.length) return node
    if (rest.length === 0) return node.filter((_, i) => i !== index) as unknown as T
    const child = removeAtPath(node[index], rest)
    if (child === node[index]) return node
    const next = node.slice()
    next[index] = child
    return next as unknown as T
  }

  if (!isPlainObject(node) || !(head in node)) return node
  if (rest.length === 0) {
    const next: Record<string, unknown> = {}
    for (const key of Object.keys(node)) if (key !== head) next[key] = node[key]
    return next as unknown as T
  }
  const child = removeAtPath(node[head], rest)
  if (child === node[head]) return node
  return { ...node, [head]: child } as unknown as T
}

/**
 * RFC 6902 `add`. Only the LEAF is an insert — the walk down has to recurse
 * structurally, otherwise `/layout/shapes/-` would overwrite `shapes` instead
 * of appending to it.
 */
function addAtPath<T>(node: T, segs: string[], value: unknown): T {
  if (segs.length === 0) return value as T
  const [head, ...rest] = segs

  if (Array.isArray(node)) {
    if (rest.length === 0) {
      const index = head === "-" ? node.length : Number(head)
      if (!Number.isInteger(index) || index < 0 || index > node.length) return node
      const next = node.slice()
      next.splice(index, 0, value)
      return next as unknown as T
    }
    const index = Number(head)
    if (!Number.isInteger(index) || index < 0 || index >= node.length) return node
    const child = addAtPath(node[index], rest, value)
    if (child === node[index]) return node
    const next = node.slice()
    next[index] = child
    return next as unknown as T
  }

  if (rest.length === 0) return setAtPath(node, segs, value)
  const src: Record<string, unknown> = isPlainObject(node) ? node : {}
  const child = addAtPath(src[head], rest, value)
  if (child === src[head]) return node
  return { ...src, [head]: child } as unknown as T
}

function applyOp(spec: FigureSpec, op: FigurePatchOp): FigureSpec {
  const segs = parsePointer(op.path)
  if (segs.length === 0) return spec
  switch (op.op) {
    case "replace":
      return setAtPath(spec, segs, op.value)
    case "add":
      return addAtPath(spec, segs, op.value)
    case "remove":
      return removeAtPath(spec, segs)
  }
}

/** Everything except UNDO/REDO. Returns the SAME reference when it's a no-op. */
export function applyFigureAction(spec: FigureSpec, action: FigureAction): FigureSpec {
  switch (action.type) {
    case "SET_PATH": {
      const segs = parsePointer(action.path)
      return segs.length === 0 ? spec : setAtPath(spec, segs, action.value)
    }
    case "REPLACE_SPEC":
      return action.spec
    case "APPLY_PATCH":
      return action.ops.reduce(applyOp, spec)
    default:
      return spec
  }
}

export function figureSpecReducer(
  state: FigureSpecState,
  action: FigureAction,
): FigureSpecState {
  if (action.type === "UNDO") {
    const previous = state.past.at(-1)
    if (!previous) return state
    return {
      spec: previous,
      past: state.past.slice(0, -1),
      future: [state.spec, ...state.future].slice(0, UNDO_LIMIT),
    }
  }
  if (action.type === "REDO") {
    const [next, ...rest] = state.future
    if (!next) return state
    return {
      spec: next,
      past: [...state.past, state.spec].slice(-UNDO_LIMIT),
      future: rest,
    }
  }

  const spec = applyFigureAction(state.spec, action)
  // No-op writes (a remove of a missing key, a canvas event that changed
  // nothing) must not burn an undo slot.
  if (spec === state.spec) return state
  return { spec, past: [...state.past, state.spec].slice(-UNDO_LIMIT), future: [] }
}

export interface UseFigureSpec {
  spec: FigureSpec
  dispatch: FigureDispatch
  editingSource: FigureEditSource
  setEditingSource: (source: FigureEditSource) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

/**
 * Single store for the figure, shared by three writers: the Format panel, the
 * JSON panel, and canvas (relayout/restyle) events. `useReducer` rather than a
 * store library — this is one screen, and zustand isn't a dependency here.
 */
export function useFigureSpec(initial: FigureSpec): UseFigureSpec {
  const [state, dispatch] = React.useReducer(figureSpecReducer, {
    spec: initial,
    past: [],
    future: [],
  })
  const [editingSource, setEditingSource] = React.useState<FigureEditSource>(null)

  const undo = React.useCallback(() => dispatch({ type: "UNDO" }), [])
  const redo = React.useCallback(() => dispatch({ type: "REDO" }), [])

  return {
    spec: state.spec,
    dispatch,
    editingSource,
    setEditingSource,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}
