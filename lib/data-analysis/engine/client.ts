"use client"

import type { AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import {
  ENGINE_VERSION,
  computeCacheKey,
  type EngineResult,
  type ExclusionImpact,
  type TestResult,
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
 * Everything the architecture requires of a result, the engine stamp, the data
 * version it was computed against, the spec hash, and the cache keyed on all
 * three (§6.3), is applied HERE rather than in the worker, so there is exactly
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

/**
 * How long a request may go unanswered before it is called dead.
 *
 * A worker that never replies is worse than one that fails: the caller's
 * promise never settles, so the workspace's `finally { setEngineBusy(false) }`
 * never runs, the spec is already marked attempted, and the researcher is left
 * with a spinner and no retry. The deadline converts that into the same kind of
 * `Error` every other engine failure arrives as (see `worker.onerror` below),
 * which the workspace already renders as an engine note.
 *
 * ponytail: one flat ceiling, generous enough for a cold Pyodide boot plus the
 * scipy/statsmodels wheels on a slow link. Make it per-request only if a
 * genuinely long analysis ever trips it.
 */
export const ENGINE_TIMEOUT_MS = 120_000

function send(request: WorkerRequest, onProgress?: (p: EngineProgress) => void, warmup = false) {
  const w = ensureWorker()
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      // Drop it first: a reply that arrives after the deadline must find
      // nothing to settle rather than resolve an already-rejected promise.
      pending.delete(request.id)
      reject(new Error("The statistics engine stopped responding. Try running the analysis again."))
    }, ENGINE_TIMEOUT_MS)
    const entry: Pending & { warmup?: boolean } = {
      resolve: (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      reject: (error) => {
        clearTimeout(timer)
        reject(error)
      },
      onProgress,
      warmup,
    }
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
 * two latency budgets separate, a colour change must not trigger a recompute.
 */
const cache = new Map<string, EngineResult>()

export interface ComputeOptions {
  onProgress?: (p: EngineProgress) => void
  /** Skip the cache, used by an explicit "re-run" (§3A.3 rule 3). */
  force?: boolean
  /**
   * Also answer §6.7's "with vs without excluded points".
   *
   * Off by default because it is a SECOND Pyodide compute, and the workspace's
   * recompute runs on every settled spec edit with `force: true`. Paying twice
   * per keystroke-settled recompute for a field nothing on that screen renders
   * is pure latency. Only the caller that actually shows the comparison, the
   * pre-commit exclusion preview, asks for it.
   */
  withExclusionImpact?: boolean
  /**
   * Right-hand tables for `spec.joins`, keyed by `join.right.fileId` (T0.6).
   *
   * Omitted means a spec carrying joins cannot resolve and says so. That is the
   * deliberate behaviour: running the analysis on the left table alone would
   * silently answer a different question than the one the researcher asked,
   * which is the invisible substitution S3.2 forbids.
   */
  joinTables?: ReadonlyMap<string, Table>
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
 * §6.7's "with vs without the excluded point", computed rather than merely
 * offered.
 *
 * §8.1 has the assistant refuse "remove points until it comes out significant"
 * and hand the user a governed sensitivity analysis instead. That refusal is a
 * dead end unless the alternative actually exists, so the engine can answer the
 * question: the SAME resolve+compute path, run once more against a spec
 * identical but for the ONE exclusion being weighed. Nothing else moves — every
 * other exclusion stays applied on both sides — so the delta is attributable to
 * that point and to nothing else, which is what the preview screen claims it is.
 *
 * The second run is a second Pyodide compute, so it is spent only when someone
 * asked for it (`ComputeOptions.withExclusionImpact`) AND it can say something:
 *
 *   - the exclusion under consideration landed on no row, the overwhelmingly
 *     common case being that there is none, means both runs see byte-identical
 *     data;
 *   - no test means there is no statistic or p-value for this shape to carry,
 *     so the run could only produce nulls on both sides.
 *
 * Either way the answer is null and the cost stays at exactly one compute.
 */
async function computeExclusionImpact(
  spec: AnalysisSpec,
  table: Table,
  plotRows: EngineResult["plotData"],
  withExclusions: TestResult | null,
  warnings: string[],
  /** Same map the outer compute used. The with/without comparison has to run
   *  against the SAME table the analysis did, joins included, or the delta it
   *  reports is a delta between two different datasets. */
  joinTables?: ReadonlyMap<string, Table>
): Promise<ExclusionImpact | null> {
  // The exclusion under consideration is the LAST one: `data.excludeRow`
  // appends (dropping any earlier entry for the same row), so the preview's
  // probe spec always carries the point being weighed at the end.
  const isolated = spec.exclusions.at(-1)
  // What the resolver could APPLY, not what the spec asked for. An exclusion
  // naming a row that a filter dropped or a reshape renamed moves no number, and
  // re-running against it would just compute the same result twice.
  const excludedCount = plotRows.filter((r) => r.excluded).length
  if (!isolated || !withExclusions) return null
  if (!plotRows.some((r) => r.rowId === isolated.rowId && r.excluded)) return null

  // (all exclusions including this one) vs (all exclusions EXCEPT this one).
  // Comparing against no exclusions at all would hand this one point the
  // combined effect of every earlier exclusion, and the preview renders the
  // delta as "Effect of this exclusion" — a wrong attribution on the one
  // screen §8.1 built to be trusted.
  const bare = resolvePayload({ ...spec, exclusions: spec.exclusions.slice(0, -1) }, table, joinTables)
  if (!bare.ok) {
    // Putting points back should not break a precondition that held without
    // them, but if it does, say so rather than quietly showing one side.
    warnings.push("The with/without-exclusions comparison could not be computed.")
    return null
  }

  let withoutExclusions: TestResult | null = null
  try {
    const raw = (await send({
      id: `run-${++seq}`,
      type: "compute",
      payload: bare.payload,
    })) as { test?: TestResult | null }
    withoutExclusions = raw.test ?? null
  } catch (err) {
    // Additive by construction: the primary result is what the user asked for
    // and must survive a failure of the comparison alongside it.
    warnings.push(
      `The with/without-exclusions comparison could not be computed (${
        err instanceof Error ? err.message : String(err)
      }).`
    )
    return null
  }

  const significant = (p: number | null | undefined) =>
    typeof p === "number" ? p < spec.analysis.alpha : null
  const before = significant(withExclusions.pValue)
  const after = significant(withoutExclusions?.pValue)

  return {
    excludedCount,
    withExclusions: {
      pValue: withExclusions.pValue,
      statistic: withExclusions.statistic,
    },
    withoutExclusions: {
      pValue: withoutExclusions?.pValue ?? null,
      statistic: withoutExclusions?.statistic ?? null,
    },
    // Only a real flip counts. A missing p-value on either side is an unknown,
    // and an unknown must not render as a clean bill of health.
    changesSignificance: before !== null && after !== null && before !== after,
  }
}

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
  const resolved = resolvePayload(spec, table, options.joinTables)
  if (!resolved.ok) return resolved

  const { specHash, cacheKey } = await computeCacheKey(spec)
  // The comparison is a variant of the same result, so it gets a variant key.
  // Sharing one key would let a plain recompute cache `exclusionImpact: null`
  // and hand that back to the preview, which cannot tell "no impact" from
  // "nobody computed it".
  const key = options.withExclusionImpact ? `${cacheKey}|impact` : cacheKey
  if (!options.force) {
    const hit = cache.get(key)
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

  // Read before the sensitivity run below, so the primary result keeps
  // reporting its own compute time rather than the pair's (Law 5's budget is
  // about the number the user waited for).
  const durationMs = raw.durationMs ?? Math.round(performance.now() - started)
  const test = raw.test ?? null
  const warnings = [...resolved.warnings, ...(raw.warnings ?? [])]
  const exclusionImpact = options.withExclusionImpact
    ? await computeExclusionImpact(spec, table, resolved.payload.plotRows, test, warnings, options.joinTables)
    : null

  const result: EngineResult = {
    engineVersion: ENGINE_VERSION,
    dataVersionHash: spec.dataset.versionHash,
    specHash,
    computedAt: new Date().toISOString(),
    durationMs,
    descriptives: raw.descriptives ?? [],
    test,
    curveFit: raw.curveFit ?? null,
    survival: raw.survival ?? null,
    testRan: raw.testRan ?? null,
    error: raw.error ?? null,
    exclusionImpact,
    // The figure draws what the analysis actually saw: post-filter,
    // post-transform, with excluded points still present and flagged (§8.1).
    // Re-deriving these from the raw columns here would let the chart and the
    // statistics disagree the moment a transform is applied.
    plotData: resolved.payload.plotRows,
    warnings,
  }

  cache.set(key, result)
  return { ok: true, result }
}

/** Drop the worker and its cache. Used on sign-out and in tests. */
export function disposeEngine() {
  worker?.terminate()
  worker = null
  // Terminating strands anything in flight. Reject rather than drop, or the
  // caller waits out the full deadline for a worker that no longer exists.
  for (const [id, entry] of pending) {
    pending.delete(id)
    entry.reject(new Error("The statistics engine was shut down."))
  }
  cache.clear()
}
