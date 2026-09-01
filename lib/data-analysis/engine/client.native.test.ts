import { afterEach, describe, expect, it, vi } from "vitest"
import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import { computeAnalysis, disposeEngine } from "./client"
import type { EnginePayload, Table } from "./resolver"

/**
 * Desktop routing (lib/desktop/bridge.ts): inside the Tauri shell a compute
 * goes to the native CPython sidecar's `run_analysis`, whose request/response
 * JSON contract is identical to the Pyodide worker's. What is pinned here:
 *
 *   - the native path is used when `window.__TAURI__` is present, and the
 *     request JSON it receives is the same resolver payload the worker gets;
 *   - the result envelope (`EngineResult`) is identical in shape and content
 *     whichever runtime computed the raw result — contract equivalence;
 *   - ANY native failure falls back to the Pyodide worker with the identical
 *     request, so the web path stays the invariant.
 *
 * Kept out of client.test.ts on purpose: the engine client is a module
 * singleton, and this file's shell stubbing must not leak into the web-path
 * cases that assert Pyodide is the ONLY runtime.
 */

/** What both fake runtimes return: the raw, pre-identity-stamping engine result. */
const RAW_RESULT = {
  descriptives: [],
  test: {
    test: "Welch's t test",
    statistic: 4.2,
    df: 6,
    pValue: 0.012,
    effectSizes: [],
    assumptions: [],
    pairwise: [],
    terms: [],
    groupSizes: {},
    reportSentence: "",
  },
  testRan: "t-welch",
  warnings: [],
  durationMs: 7,
}

const workerComputed: EnginePayload[] = []

/** Stands in for the Pyodide worker — the fallback runtime under test. */
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  postMessage(request: { id: string; type: string; payload?: EnginePayload }) {
    if (request.type !== "compute" || !request.payload) return
    workerComputed.push(request.payload)
    queueMicrotask(() => {
      this.onmessage?.({
        data: { id: request.id, type: "result", result: RAW_RESULT },
      } as MessageEvent)
    })
  }

  terminate() {}
}

Reflect.set(globalThis, "Worker", FakeWorker)

type AnyWindow = Window & { __TAURI__?: unknown }

/** Install a fake shell whose `run_analysis` behaves as `impl` says. */
function installShell(impl: (json: string) => Promise<unknown>) {
  const invoke = vi.fn((command: string, args?: Record<string, unknown>) => {
    if (command !== "run_analysis") return Promise.reject(new Error(`unexpected ${command}`))
    return impl(String((args as { requestJson: string }).requestJson))
  })
  ;(window as AnyWindow).__TAURI__ = { core: { invoke } }
  return invoke
}

afterEach(() => {
  workerComputed.length = 0
  delete (window as AnyWindow).__TAURI__
  disposeEngine()
})

function spec(): AnalysisSpec {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: null,
      fileName: "viability.xlsx",
      sheet: null,
      versionHash: "sha256:aaaa1111",
      rowCount: 8,
      columnCount: 2,
    },
    design: { source: "inferred" },
    analysis: { test: "t-welch", groupColumn: "arm", responseColumns: ["value"] },
    figure: { kind: "bar-scatter-error", x: {}, y: {} },
    export: {},
  })
  if (!parsed.ok) throw new Error("fixture invalid: " + JSON.stringify(parsed.issues.slice(0, 2)))
  return parsed.spec
}

const table: Table = {
  columns: ["arm", "value"],
  rows: [
    { rowId: "r1", values: { arm: "Ctrl", value: 10 } },
    { rowId: "r2", values: { arm: "Ctrl", value: 11 } },
    { rowId: "r3", values: { arm: "Ctrl", value: 12 } },
    { rowId: "r4", values: { arm: "Ctrl", value: 13 } },
    { rowId: "r5", values: { arm: "Drug", value: 20 } },
    { rowId: "r6", values: { arm: "Drug", value: 21 } },
    { rowId: "r7", values: { arm: "Drug", value: 22 } },
    { rowId: "r8", values: { arm: "Drug", value: 23 } },
  ],
}

describe("native engine routing (desktop shell)", () => {
  it("sends the identical request JSON to run_analysis and never boots the worker", async () => {
    const requests: unknown[] = []
    installShell((json) => {
      requests.push(JSON.parse(json))
      return Promise.resolve(JSON.stringify(RAW_RESULT))
    })

    const outcome = await computeAnalysis(spec(), table)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(workerComputed).toHaveLength(0)
    expect(requests).toHaveLength(1)
    // The native sidecar sees exactly what the Pyodide worker would: the
    // resolver's payload, groups shaped for the requested test.
    expect(requests[0]).toMatchObject({
      test: "t-welch",
      shape: "groups",
      groups: { Ctrl: [10, 11, 12, 13], Drug: [20, 21, 22, 23] },
    })
    expect(outcome.result.test?.pValue).toBe(0.012)
  })

  it("produces an EngineResult identical to the Pyodide path for the same raw result", async () => {
    installShell(() => Promise.resolve(JSON.stringify(RAW_RESULT)))
    const native = await computeAnalysis(spec(), table)

    // Fresh module state, shell gone: the same compute now runs through the worker.
    disposeEngine()
    delete (window as AnyWindow).__TAURI__
    const web = await computeAnalysis(spec(), table)

    expect(native.ok && web.ok).toBe(true)
    if (!native.ok || !web.ok) return
    expect(workerComputed).toHaveLength(1)

    // Contract equivalence: everything but the wall-clock stamp is identical —
    // provenance (engineVersion, specHash, dataVersionHash), the test result,
    // plot data, warnings. Which runtime answered must be unobservable.
    const strip = ({ computedAt: _computedAt, ...rest }: typeof native.result) => rest
    expect(strip(native.result)).toEqual(strip(web.result))
  })

  it("falls back to the Pyodide worker with the identical request on any native failure", async () => {
    const invoke = installShell(() => Promise.reject(new Error("sidecar not running")))

    const outcome = await computeAnalysis(spec(), table)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(workerComputed).toHaveLength(1)
    expect(workerComputed[0]).toMatchObject({ test: "t-welch", shape: "groups" })
    // The fallback result is the web result, provenance and all.
    expect(outcome.result.test?.pValue).toBe(0.012)
    expect(outcome.result.error).toBeNull()
  })

  it("falls back on a native reply that is not valid engine JSON", async () => {
    installShell(() => Promise.resolve("not json {"))
    const outcome = await computeAnalysis(spec(), table)
    expect(outcome.ok).toBe(true)
    expect(workerComputed).toHaveLength(1)
  })
})
