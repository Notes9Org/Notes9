"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import {
  applyAiPatch,
  canRedo as canRedoOf,
  canUndo as canUndoOf,
  dispatchMutation,
  initHistory,
  redo as redoHistory,
  requiresRecompute,
  undo as undoHistory,
  type AppliedMutation,
  type MutationOrigin,
  type SpecMutation,
  type SpecHistory,
} from "@/lib/data-analysis/spec/mutations"
import {
  computeAnalysis,
  warmUpEngine,
  type EngineProgress,
} from "@/lib/data-analysis/engine/client"
import type {
  ClarificationNeeded,
  PreconditionFailure,
  Table,
} from "@/lib/data-analysis/engine/resolver"
import type { EngineResult } from "@/lib/data-analysis/engine/contract"
import { saveDraft } from "@/lib/data-analysis/saved-analysis"

/**
 * The React binding for the spec, the engine, and the edit history.
 *
 * This hook is the single place where a UI control becomes a spec mutation, and
 * therefore the place that keeps Law 5 honest: it inspects each mutation and
 * only recomputes when the mutation can move a number. A colour change re-renders
 * from the spec alone; a change of test goes to the engine.
 *
 * It deliberately owns autosave too (§3A.3 rule 1: autosave continuously, create
 * revisions explicitly). Autosave writes the working draft and never cuts a
 * revision — that stays an explicit act the researcher performs.
 */

export interface UseAnalysisSpecOptions {
  initialSpec: AnalysisSpec
  /** Set once the analysis has been persisted; autosave is a no-op before then. */
  analysisId?: string | null
  /**
   * The rows the spec is resolved against. A function rather than a value so an
   * edit to the sheet supplies fresh rows without re-creating the hook.
   */
  getTable: (spec: AnalysisSpec) => Table | null
  /** Warm the runtime as soon as the workspace mounts. */
  warmUp?: boolean
  autosaveDelayMs?: number
}

export interface UseAnalysisSpecValue {
  spec: AnalysisSpec
  result: EngineResult | null
  /** True while the engine is running; style edits never set this. */
  computing: boolean
  /** Engine boot/compute progress, for the first-run loading state. */
  progress: EngineProgress | null
  error: string | null
  /**
   * Why the current spec cannot be computed, when the resolver refused it. Not
   * folded into `error`: these are answerable statements about the analysis
   * ("a paired test needs a subject column"), not engine failures.
   */
  blocked: PreconditionFailure[]
  /** The one thing the resolver cannot decide for the researcher (§6.3). */
  question: ClarificationNeeded | null
  /** Mutations the assistant proposed that collided with a hand edit (L6). */
  pendingOverrides: { mutation: SpecMutation; path: string; description: string }[]

  dispatch: (mutation: SpecMutation, origin?: MutationOrigin) => void
  applyAssistantPatch: (mutations: SpecMutation[], opts?: { force?: boolean }) => void
  clearOverrides: () => void

  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  history: AppliedMutation[]

  /** Force a recompute — the explicit "re-run" from the reopen screen. */
  recompute: () => Promise<void>
  /** Replace the whole spec, e.g. after opening a stored revision. */
  loadSpec: (spec: AnalysisSpec, result?: EngineResult | null) => void

  saveState: "idle" | "saving" | "saved" | "error"
}

export function useAnalysisSpec(options: UseAnalysisSpecOptions): UseAnalysisSpecValue {
  const {
    initialSpec,
    analysisId = null,
    getTable,
    warmUp = true,
    autosaveDelayMs = 800,
  } = options

  const [history, setHistory] = useState<SpecHistory>(() => initHistory(initialSpec))
  const [result, setResult] = useState<EngineResult | null>(null)
  const [computing, setComputing] = useState(false)
  const [progress, setProgress] = useState<EngineProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<PreconditionFailure[]>([])
  const [question, setQuestion] = useState<ClarificationNeeded | null>(null)
  const [pendingOverrides, setPendingOverrides] = useState<UseAnalysisSpecValue["pendingOverrides"]>([])
  const [saveState, setSaveState] = useState<UseAnalysisSpecValue["saveState"]>("idle")

  // Latest-wins guard: a fast sequence of analysis edits must not let an early,
  // slower result overwrite a later one.
  const runSeq = useRef(0)
  const getTableRef = useRef(getTable)
  getTableRef.current = getTable

  const spec = history.spec

  /* ── Engine ────────────────────────────────────────────────────────────── */

  const run = useCallback(
    async (target: AnalysisSpec, opts: { force?: boolean } = {}) => {
      const table = getTableRef.current(target)
      if (!table) return

      const seq = ++runSeq.current
      setComputing(true)
      setError(null)
      try {
        const outcome = await computeAnalysis(target, table, {
          force: opts.force,
          onProgress: (p) => {
            if (seq === runSeq.current) setProgress(p)
          },
        })
        if (seq !== runSeq.current) return // superseded
        if (outcome.ok) {
          setResult(outcome.result)
          setBlocked([])
          setQuestion(null)
        } else if ("blocked" in outcome) {
          // The previous result is cleared deliberately. Leaving it on screen
          // beside a spec that can no longer produce it is how a stale p-value
          // gets read as the current one.
          setResult(null)
          setBlocked(outcome.blocked)
          setQuestion(null)
        } else {
          setResult(null)
          setBlocked([])
          setQuestion(outcome.question)
        }
      } catch (err) {
        if (seq !== runSeq.current) return
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (seq === runSeq.current) {
          setComputing(false)
          setProgress(null)
        }
      }
    },
    []
  )

  // Warm the runtime up front so the first real analysis does not pay the cold
  // start. Failure here is not surfaced: it only means the first compute is slow.
  useEffect(() => {
    if (!warmUp) return
    warmUpEngine((p) => setProgress(p)).catch(() => undefined)
  }, [warmUp])

  // Compute once on mount for the initial spec.
  const didInitialRun = useRef(false)
  useEffect(() => {
    if (didInitialRun.current) return
    didInitialRun.current = true
    void run(spec)
    // Intentionally one-shot: later runs are driven by mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Mutations ─────────────────────────────────────────────────────────── */

  const dispatch = useCallback(
    (mutation: SpecMutation, origin: MutationOrigin = "user") => {
      setHistory((current) => {
        const next = dispatchMutation(current, mutation, origin)
        // Law 5: only data/analysis edits reach the engine. Style edits fall
        // through to a re-render from the spec, with no round trip.
        if (requiresRecompute(mutation)) void run(next.spec)
        return next
      })
    },
    [run]
  )

  const applyAssistantPatch = useCallback(
    (mutations: SpecMutation[], opts: { force?: boolean } = {}) => {
      setHistory((current) => {
        const outcome = applyAiPatch(current, mutations, opts)
        setPendingOverrides(outcome.overrides)
        if (outcome.applied.some(requiresRecompute)) void run(outcome.history.spec)
        return outcome.history
      })
    },
    [run]
  )

  const clearOverrides = useCallback(() => setPendingOverrides([]), [])

  const undo = useCallback(() => {
    setHistory((current) => {
      const next = undoHistory(current)
      const undone = current.past[current.past.length - 1]
      if (undone && requiresRecompute(undone.applied.mutation)) void run(next.spec)
      return next
    })
  }, [run])

  const redo = useCallback(() => {
    setHistory((current) => {
      const next = redoHistory(current)
      const redone = current.future[0]
      if (redone && requiresRecompute(redone.applied.mutation)) void run(next.spec)
      return next
    })
  }, [run])

  const recompute = useCallback(async () => {
    await run(history.spec, { force: true })
  }, [history.spec, run])

  const loadSpec = useCallback((next: AnalysisSpec, storedResult: EngineResult | null = null) => {
    // Opening a stored revision resets history: the loaded spec is the new
    // baseline, and its stored result is displayed as-is. §3A.3 rule 3 means we
    // must NOT recompute here.
    setHistory(initHistory(next))
    setResult(storedResult)
    setPendingOverrides([])
    setError(null)
    setBlocked([])
    setQuestion(null)
  }, [])

  /* ── Autosave (§3A.3 rule 1) ───────────────────────────────────────────── */

  const specJson = useMemo(() => JSON.stringify(spec), [spec])
  const firstAutosave = useRef(true)

  useEffect(() => {
    if (!analysisId) return
    // Skip the save that would fire immediately on mount for unchanged state.
    if (firstAutosave.current) {
      firstAutosave.current = false
      return
    }
    let cancelled = false
    setSaveState("saving")
    const timer = setTimeout(async () => {
      const outcome = await saveDraft(analysisId, JSON.parse(specJson) as AnalysisSpec)
      if (cancelled) return
      setSaveState(outcome.ok ? "saved" : "error")
    }, autosaveDelayMs)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [analysisId, specJson, autosaveDelayMs])

  const historyList = useMemo(() => history.past.map((entry) => entry.applied), [history.past])

  return {
    spec,
    result,
    computing,
    progress,
    error,
    blocked,
    question,
    pendingOverrides,
    dispatch,
    applyAssistantPatch,
    clearOverrides,
    undo,
    redo,
    canUndo: canUndoOf(history),
    canRedo: canRedoOf(history),
    history: historyList,
    recompute,
    loadSpec,
    saveState,
  }
}
