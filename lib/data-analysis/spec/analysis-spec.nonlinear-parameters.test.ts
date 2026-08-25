import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

import { NONLINEAR_SHARED_PARAMETERS } from "./analysis-spec"

/**
 * `NONLINEAR_SHARED_PARAMETERS` is a hand-written copy of the engine's
 * `_DR_MODELS` table, kept in TypeScript so the global-fit checkboxes (T0.20)
 * can be rendered without asking Pyodide what a 4PL is called.
 *
 * A copy that nothing checks is a copy that drifts. Renaming `asymmetry` in the
 * Python and not here would put a checkbox on screen that shares a parameter
 * the engine has never heard of, and the fit would silently come back unshared
 * — the failure mode §L2 exists to prevent, since the number on screen would no
 * longer be the number the user asked for.
 *
 * So this test parses the real engine file rather than trusting the mirror.
 */
const ENGINE = path.join(process.cwd(), "public/data-analysis-engine/notes9_engine.py")

/** Pull `"key": (_fn, ["a", "b"])` rows out of the _DR_MODELS literal. */
function parseEngineModels(source: string): Record<string, string[]> {
  const block = source.match(/_DR_MODELS\s*=\s*\{([\s\S]*?)\n\}/)
  if (!block) throw new Error("_DR_MODELS not found in notes9_engine.py")

  const models: Record<string, string[]> = {}
  const row = /"([^"]+)":\s*\([^,]+,\s*\[([^\]]*)\]\)/g
  let m: RegExpExecArray | null
  while ((m = row.exec(block[1])) !== null) {
    models[m[1]] = m[2]
      .split(",")
      .map((s) => s.trim().replace(/^"|"$/g, ""))
      .filter(Boolean)
  }
  return models
}

describe("NONLINEAR_SHARED_PARAMETERS mirrors the engine (T0.20)", () => {
  const engineModels = parseEngineModels(readFileSync(ENGINE, "utf8"))

  it("parses a non-empty model table out of the engine", () => {
    // Guards the test itself: a regex that silently matched nothing would make
    // every assertion below vacuously true.
    expect(Object.keys(engineModels).length).toBeGreaterThan(0)
  })

  it("covers exactly the models the engine can fit", () => {
    expect(Object.keys(NONLINEAR_SHARED_PARAMETERS).sort()).toEqual(
      Object.keys(engineModels).sort()
    )
  })

  it("uses the engine's parameter names, in the engine's order", () => {
    for (const [model, params] of Object.entries(engineModels)) {
      expect(NONLINEAR_SHARED_PARAMETERS[model]).toEqual(params)
    }
  })

  it("names no parameter the engine does not have", () => {
    for (const [model, params] of Object.entries(NONLINEAR_SHARED_PARAMETERS)) {
      for (const p of params) {
        expect(engineModels[model]).toContain(p)
      }
    }
  })
})
