/// <reference lib="webworker" />

/**
 * The compute engine's host process (L4).
 *
 * Pyodide is CPython compiled to WebAssembly, so this worker runs the SAME
 * scipy/statsmodels code the validation corpus is asserted against, the
 * document's L4 stack, without a server to pay for. Three properties of L4 come
 * free from running it here:
 *
 *   sandboxed        - a worker has no DOM and no access to the page;
 *   network-isolated, after the runtime and wheels have loaded, the engine
 *                      makes no further requests; nothing in the Python calls out;
 *   resource-capped  - the browser caps the worker's memory, and a runaway fit
 *                      cannot lock the UI thread because it is not on it.
 *
 * Loading is deliberately lazy: nobody pays the runtime download until they
 * actually run an analysis, and the browser caches it for every session after.
 * Where it loads FROM is a deployment decision, see `resolvePyodideBaseUrl`.
 */

import {
  ENGINE_PACKAGES,
  ENGINE_VERSION,
  resolvePyodideBaseUrl,
} from "./contract"

// Read once, at module scope: the bundler substitutes the literal at build
// time, so a deploy's choice of origin is baked into the worker rather than
// looked up per boot.
const PYODIDE_BASE_URL = resolvePyodideBaseUrl(process.env.NEXT_PUBLIC_PYODIDE_BASE_URL)
const ENGINE_SOURCE_URL = "/data-analysis-engine/notes9_engine.py"

type PyodideApi = {
  loadPackage: (names: string[] | string) => Promise<void>
  runPythonAsync: (code: string) => Promise<unknown>
  globals: { get: (name: string) => unknown; set: (name: string, value: unknown) => void }
  pyimport: (name: string) => { install: (pkgs: string[], opts?: Record<string, unknown>) => Promise<void> }
}

declare const self: DedicatedWorkerGlobalScope & {
  loadPyodide?: (opts: { indexURL: string }) => Promise<PyodideApi>
  importScripts: (...urls: string[]) => void
}

export type WorkerRequest =
  | { id: string; type: "warmup" }
  | { id: string; type: "compute"; payload: unknown }

export type WorkerResponse =
  | { id: string; type: "progress"; stage: string; detail?: string }
  | { id: string; type: "ready"; engineVersion: string }
  | { id: string; type: "result"; result: unknown }
  | { id: string; type: "error"; message: string }

let pyodidePromise: Promise<PyodideApi> | null = null

function post(message: WorkerResponse) {
  self.postMessage(message)
}

/**
 * Boot the runtime once and reuse it. The promise is cached rather than the
 * resolved value so that two analyses fired in the same tick share one boot
 * instead of racing two multi-megabyte downloads.
 */
function bootPyodide(id: string): Promise<PyodideApi> {
  if (pyodidePromise) return pyodidePromise

  pyodidePromise = (async () => {
    post({ id, type: "progress", stage: "runtime", detail: "Starting the statistics engine" })
    // Every failure in here, a blocked CDN, an incomplete self-hosted mirror, a
    // base URL pointing at the wrong version, surfaces to an operator as one
    // error string. Naming the origin is the difference between a diagnosis and
    // a guess, so it is attached once, around all three fetching steps.
    let pyodide: PyodideApi
    try {
      self.importScripts(`${PYODIDE_BASE_URL}pyodide.js`)
      if (!self.loadPyodide) throw new Error("pyodide.js loaded but defined no loadPyodide")
      pyodide = await self.loadPyodide({ indexURL: PYODIDE_BASE_URL })

      post({ id, type: "progress", stage: "packages", detail: "Loading numpy, scipy, statsmodels" })
      // Prebuilt wheels ship with the distribution, so this is a local unpack.
      await pyodide.loadPackage([...ENGINE_PACKAGES.prebuilt])
    } catch (err) {
      throw new Error(
        `Could not load the statistics engine from ${PYODIDE_BASE_URL}, ` +
          `${err instanceof Error ? err.message : String(err)}`
      )
    }

    // Pure-Python packages are pinned in the contract so a resolver cannot
    // silently move a version that could move a p-value.
    if (ENGINE_PACKAGES.micropip.length > 0) {
      post({ id, type: "progress", stage: "packages", detail: "Loading pingouin, lmfit, lifelines" })
      try {
        await pyodide.loadPackage("micropip")
        const micropip = pyodide.pyimport("micropip")
        await micropip.install([...ENGINE_PACKAGES.micropip], { keep_going: true })
      } catch (err) {
        // These back the Tier 1 tests, not the Tier 0 path. Losing them must
        // degrade the feature, never break the analysis the user asked for.
        post({
          id,
          type: "progress",
          stage: "packages",
          detail: `Optional packages unavailable (${(err as Error).message}); core tests still available`,
        })
      }
    }

    post({ id, type: "progress", stage: "engine", detail: "Loading notes9-stats" })
    // Absolute, against the page origin. A bundled module worker's base URL is
    // a blob:, and a root-relative path has nothing to resolve against there
    // `fetch("/…")` fails to parse the URL outright rather than hitting the
    // server.
    const sourceUrl = new URL(ENGINE_SOURCE_URL, self.location.origin).toString()
    const source = await fetch(sourceUrl).then((r) => {
      if (!r.ok) throw new Error(`Could not load the engine source (${r.status}).`)
      return r.text()
    })
    // Define the module once; each compute call then only invokes run().
    await pyodide.runPythonAsync(source)

    post({ id, type: "ready", engineVersion: ENGINE_VERSION })
    return pyodide
  })()

  // A failed boot must not be cached, or the feature stays broken until reload.
  pyodidePromise.catch(() => {
    pyodidePromise = null
  })

  return pyodidePromise
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type } = event.data
  try {
    const pyodide = await bootPyodide(id)
    if (type === "warmup") {
      post({ id, type: "ready", engineVersion: ENGINE_VERSION })
      return
    }

    const { payload } = event.data
    // Hand the payload over as JSON rather than as a proxied JS object: it keeps
    // the boundary a pure value pass, which is what makes the engine a pure
    // function of its inputs.
    pyodide.globals.set("__n9_payload_json", JSON.stringify(payload))
    const raw = await pyodide.runPythonAsync(
      "import json; json.dumps(run(json.loads(__n9_payload_json)))"
    )
    post({ id, type: "result", result: JSON.parse(String(raw)) })
  } catch (err) {
    post({ id, type: "error", message: err instanceof Error ? err.message : String(err) })
  }
}

export {}
