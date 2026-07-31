"use client"

import type { AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import {
  ENGINE_VERSION,
  computeCacheKey,
  type EngineResult,
} from "./contract"
import {
  resolvePayload,
  type ClarificationNeeded,
  type PreconditionFailure,
  type Table,
} from "./resolver"
import type { WorkerRequest, WorkerResponse } from "./worker"

/**
 * The engine's client-side face.
 *
 * Everything the architecture requires of a result — the engine stamp, the data
 * version it was computed against, the spec hash, and the cache keyed on all
 * three (§6.3) — is applied HERE rather than in the worker, so there is exactly
 * one place that can mint a result identity. A result that reaches the UI
 * without passing through this file has no provenance, and provenance is what
 * the product sells.
 */

export type EngineProgress = { stage: string; detail?: string }

type Pending = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  onProgress?: (p: EngineProgress) => void
}

let worker: Worker | null = null
const pending = new Map<string, Pending>()
let seq = 0

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data
    const entry = pending.get(msg.id)
    if (!entry) return
    if (msg.type === "progress") {
      entry.onProgress?.({ stage: msg.stage, detail: msg.detail })
      return
    }
    if (msg.type === "ready") {
      // Warm-up completion; a compute request resolves on "result" instead.
      if (entry.onProgress) entry.onProgress({ stage: "ready" })
      const isWarmup = (entry as Pending & { warmup?: boolean }).warmup
      if (isWarmup) {
        pending.delete(msg.id)
        entry.resolve(undefined)
      }
      return
    }
    pending.delete(msg.id)
    if (msg.type === "error") entry.reject(new Error(msg.message))
    else entry.resolve(msg.result)
  }
  worker.onerror = (event) => {
    const error = new Error(event.message || "The statistics engine crashed.")
    for (const [id, entry] of pending) {
      pending.delete(id)
      entry.reject(error)
    }
  }
  return worker
}

function send(request: WorkerRequest, onProgress?: (p: EngineProgress) => void, warmup = false) {
  const w = ensureWorker()
  return new Promise<unknown>((resolve, reject) => {
    const entry: Pending & { warmup?: boolean } = { resolve, reject, onProgress, warmup }
    pending.set(request.id, entry)
    w.postMessage(request)
  })
}

/**
 * Start downloading the runtime before the user asks for a number. Called when
 * the analysis workspace mounts, so the first real analysis does not pay the
 * cold start.
 */
export function warmUpEngine(onProgress?: (p: EngineProgress) => void): Promise<void> {
  return send({ id: `warm-${++seq}`, type: "warmup" }, onProgress, true).then(() => undefined)
}

/**
 * In-memory result cache, keyed exactly as §6.3 requires: (spec, data version,
 * engine version). Restyling never evicts an entry because the key is built
 * from the computational slice of the spec only, which is what keeps Law 5's
 * two latency budgets separate — a colour change must not trigger a recompute.
 */
const cache = new Map<string, EngineResult>()

export interface ComputeOptions {
  onProgress?: (p: EngineProgress) => void
  /** Skip the cache — used by an explicit "re-run" (§3A.3 rule 3). */
  force?: boolean
}

/**
 * What a compute attempt produced.
 *
 * Not every spec is runnable, and the two ways it can fail are different in
 * kind: a precondition failure is "this cannot be computed and here is why",
 * while a clarification is "this is ambiguous and only you can settle it". The
 * document is explicit that the engine must never guess its way past either, so
 * they are outcomes rather than exceptions and the UI has to render them.
 */
export type ComputeOutcome =
  | { ok: true; result: EngineResult }
  | { ok: false; blocked: PreconditionFailure[] }
  | { ok: false; question: ClarificationNeeded }

/**
 * Resolve the spec against the data and run it.
 *
 * The resolver (L3→L4) is not optional plumbing: it applies the filters, runs
 * the transform pipeline in order, partitions exclusions, shapes the values for
 * the requested test, and checks that test's preconditions. The Python engine
 * dispatches on the `test` and `shape` it produces, so a payload assembled any
 * other way reaches `run()` with no routine to call.
 */
export async function computeAnalysis(
  spec: AnalysisSpec,
  table: Table,
  options: ComputeOptions = {}
): Promise<ComputeOutcome> {
  const resolved = resolvePayload(spec, table)
  if (!resolved.ok) return resolved

  const { specHash, cacheKey } = await computeCacheKey(spec)
  if (!options.force) {
    const hit = cache.get(cacheKey)
    if (hit) return { ok: true, result: hit }
  }

  const started = performance.now()
  const raw = (await send(
    { id: `run-${++seq}`, type: "compute", payload: resolved.payload },
    options.onProgress
  )) as Omit<
    EngineResult,
    "engineVersion" | "dataVersionHash" | "specHash" | "computedAt" | "plotData" | "exclusionImpact"
  > & { durationMs?: number }

  const result: EngineResult = {
    engineVersion: ENGINE_VERSION,
    dataVersionHash: spec.dataset.versionHash,
    specHash,
    computedAt: new Date().toISOString(),
    durationMs: raw.durationMs ?? Math.round(performance.now() - started),
    descriptives: raw.descriptives ?? [],
    test: raw.test ?? null,
    curveFit: raw.curveFit ?? null,
    survival: raw.survival ?? null,
    exclusionImpact: null,
    // The figure draws what the analysis actually saw: post-filter,
    // post-transform, with excluded points still present and flagged (§8.1).
    // Re-deriving these from the raw columns here would let the chart and the
    // statistics disagree the moment a transform is applied.
    plotData: resolved.payload.plotRows,
    warnings: [...resolved.warnings, ...(raw.warnings ?? [])],
  }

  cache.set(cacheKey, result)
  return { ok: true, result }
}

/** Drop the worker and its cache. Used on sign-out and in tests. */
export function disposeEngine() {
  worker?.terminate()
  worker = null
  pending.clear()
  cache.clear()
}
