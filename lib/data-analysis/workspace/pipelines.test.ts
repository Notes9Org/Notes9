import { describe, it, expect } from "vitest"
import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import { ENGINE_VERSION, type EngineResult } from "@/lib/data-analysis/engine/contract"
import type { Table } from "@/lib/data-analysis/engine/resolver"
import {
  EMPTY_PIPELINES,
  activePipeline,
  fromPersisted,
  pipelineReducer,
  toPersisted,
  uniqueName,
  type AnalysisPipeline,
  type PipelineState,
} from "./pipelines"

function spec(): AnalysisSpec {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: null,
      fileName: "d.xlsx",
      sheet: null,
      versionHash: "sha256:a",
      rowCount: 2,
      columnCount: 2,
    },
    design: { source: "inferred" },
    analysis: { test: "none" },
    figure: { kind: "bar-scatter-error", x: {}, y: {}, errorBars: "sd" },
    export: {},
  })
  if (!parsed.ok) throw new Error("fixture invalid")
  return parsed.spec
}

const table: Table = { columns: ["a"], rows: [{ rowId: "r1", values: { a: 1 } }] }

function pipeline(id: string, name: string): AnalysisPipeline {
  return { id, name, spec: spec(), table, result: null, stale: true }
}

const engineResult: EngineResult = {
  engineVersion: ENGINE_VERSION,
  dataVersionHash: "sha256:a",
  specHash: "h",
  computedAt: "2026-07-31T00:00:00Z",
  durationMs: 10,
  descriptives: [],
  test: null,
  curveFit: null,
  survival: null,
  testRan: null,
  error: null,
  exclusionImpact: null,
  plotData: [],
  warnings: [],
}

function withThree(): PipelineState {
  let state = EMPTY_PIPELINES
  for (const [id, name] of [
    ["p1", "Viability"],
    ["p2", "Dose"],
    ["p3", "Survival"],
  ] as const) {
    state = pipelineReducer(state, { kind: "open", pipeline: pipeline(id, name) })
  }
  return state
}

describe("naming", () => {
  it("leaves a free name alone", () => {
    expect(uniqueName(["a", "b"], "c")).toBe("c")
  })

  it("numbers a collision", () => {
    expect(uniqueName(["Plate"], "Plate")).toBe("Plate (2)")
    expect(uniqueName(["Plate", "Plate (2)"], "Plate")).toBe("Plate (3)")
  })

  it("does not stack counters when duplicating a duplicate", () => {
    // "Plate (2)" must become "Plate (3)", not "Plate (2) (2)".
    expect(uniqueName(["Plate", "Plate (2)"], "Plate (2)")).toBe("Plate (3)")
  })

  it("keeps tab names distinct when two analyses share a title", () => {
    const state = pipelineReducer(withThree(), {
      kind: "open",
      pipeline: pipeline("p4", "Viability"),
    })
    expect(state.pipelines.map((p) => p.name)).toEqual([
      "Viability",
      "Dose",
      "Survival",
      "Viability (2)",
    ])
  })
})

describe("opening and activating", () => {
  it("activates whatever was just opened", () => {
    expect(withThree().activeId).toBe("p3")
  })

  it("ignores activating something that is not open", () => {
    const state = withThree()
    expect(pipelineReducer(state, { kind: "activate", id: "nope" })).toBe(state)
  })

  it("resolves the active pipeline", () => {
    expect(activePipeline(withThree())?.name).toBe("Survival")
    expect(activePipeline(EMPTY_PIPELINES)).toBeNull()
  })
})

describe("closing", () => {
  it("selects the neighbour, not the first tab", () => {
    // Closing the middle tab should land on the one that took its place, which
    // is where the user was looking.
    let state = withThree()
    state = pipelineReducer(state, { kind: "activate", id: "p2" })
    state = pipelineReducer(state, { kind: "close", id: "p2" })
    expect(state.activeId).toBe("p3")
  })

  it("falls back to the previous tab when closing the last one", () => {
    let state = withThree()
    state = pipelineReducer(state, { kind: "close", id: "p3" })
    expect(state.activeId).toBe("p2")
  })

  it("leaves the selection alone when closing an inactive tab", () => {
    let state = withThree()
    state = pipelineReducer(state, { kind: "close", id: "p1" })
    expect(state.activeId).toBe("p3")
    expect(state.pipelines.map((p) => p.id)).toEqual(["p2", "p3"])
  })

  it("ends with nothing active when the last tab closes", () => {
    let state = pipelineReducer(EMPTY_PIPELINES, { kind: "open", pipeline: pipeline("p1", "A") })
    state = pipelineReducer(state, { kind: "close", id: "p1" })
    expect(state.pipelines).toHaveLength(0)
    expect(state.activeId).toBeNull()
  })
})

describe("duplicating", () => {
  it("inserts the copy next to its source and selects it", () => {
    let state = withThree()
    state = pipelineReducer(state, { kind: "duplicate", id: "p1", newId: "copy" })
    expect(state.pipelines.map((p) => p.id)).toEqual(["p1", "copy", "p2", "p3"])
    expect(state.activeId).toBe("copy")
  })

  it("does not carry the source's result into the copy", () => {
    // The stored result carries the ORIGINAL spec hash; presenting it as the
    // copy's own would break the link between a number and its spec.
    let state = pipelineReducer(EMPTY_PIPELINES, { kind: "open", pipeline: pipeline("p1", "A") })
    state = pipelineReducer(state, { kind: "setResult", id: "p1", result: engineResult })
    state = pipelineReducer(state, { kind: "duplicate", id: "p1", newId: "copy" })
    const copy = state.pipelines.find((p) => p.id === "copy")!
    expect(copy.result).toBeNull()
    expect(copy.stale).toBe(true)
    expect(state.pipelines.find((p) => p.id === "p1")!.result).not.toBeNull()
  })
})

describe("staleness", () => {
  it("marks a pipeline stale when its spec changes", () => {
    let state = pipelineReducer(EMPTY_PIPELINES, { kind: "open", pipeline: pipeline("p1", "A") })
    state = pipelineReducer(state, { kind: "setResult", id: "p1", result: engineResult })
    expect(state.pipelines[0].stale).toBe(false)
    state = pipelineReducer(state, { kind: "setSpec", id: "p1", spec: spec() })
    expect(state.pipelines[0].stale).toBe(true)
  })

  it("marks a pipeline stale when its data changes", () => {
    let state = pipelineReducer(EMPTY_PIPELINES, { kind: "open", pipeline: pipeline("p1", "A") })
    state = pipelineReducer(state, { kind: "setResult", id: "p1", result: engineResult })
    state = pipelineReducer(state, {
      kind: "setTable",
      id: "p1",
      table: { columns: ["a"], rows: [] },
    })
    expect(state.pipelines[0].stale).toBe(true)
  })

  it("clears staleness only when a result arrives", () => {
    let state = pipelineReducer(EMPTY_PIPELINES, { kind: "open", pipeline: pipeline("p1", "A") })
    expect(state.pipelines[0].stale).toBe(true)
    state = pipelineReducer(state, { kind: "setResult", id: "p1", result: engineResult })
    expect(state.pipelines[0].stale).toBe(false)
    state = pipelineReducer(state, { kind: "setResult", id: "p1", result: null })
    expect(state.pipelines[0].stale).toBe(true)
  })
})

describe("renaming and reordering", () => {
  it("rejects an empty name", () => {
    const state = withThree()
    expect(pipelineReducer(state, { kind: "rename", id: "p1", name: "   " })).toBe(state)
  })

  it("keeps a rename from colliding with another tab", () => {
    const state = pipelineReducer(withThree(), { kind: "rename", id: "p1", name: "Dose" })
    expect(state.pipelines.find((p) => p.id === "p1")!.name).toBe("Dose (2)")
  })

  it("lets a tab keep its own name on rename", () => {
    const state = pipelineReducer(withThree(), { kind: "rename", id: "p1", name: "Viability" })
    expect(state.pipelines.find((p) => p.id === "p1")!.name).toBe("Viability")
  })

  it("moves a tab and clamps to the ends", () => {
    expect(pipelineReducer(withThree(), { kind: "reorder", id: "p3", toIndex: 0 }).pipelines.map((p) => p.id)).toEqual(["p3", "p1", "p2"])
    expect(pipelineReducer(withThree(), { kind: "reorder", id: "p1", toIndex: 99 }).pipelines.map((p) => p.id)).toEqual(["p2", "p3", "p1"])
  })
})

describe("persistence", () => {
  it("stores the analyses but never their results", () => {
    // §3A.3 rule 3: reopening must not present a stored number as current.
    let state = withThree()
    state = pipelineReducer(state, { kind: "setResult", id: "p1", result: engineResult })
    const persisted = toPersisted(state)
    expect(JSON.stringify(persisted)).not.toContain("engineVersion")
    expect(persisted.pipelines.map((p) => p.id)).toEqual(["p1", "p2", "p3"])
  })

  it("restores with every result cleared and every pipeline stale", () => {
    const restored = fromPersisted(toPersisted(withThree()), { p1: table, p2: table, p3: table })
    expect(restored.pipelines).toHaveLength(3)
    for (const p of restored.pipelines) {
      expect(p.result).toBeNull()
      expect(p.stale).toBe(true)
    }
  })

  it("drops a pipeline whose data is gone rather than reviving an empty one", () => {
    const restored = fromPersisted(toPersisted(withThree()), { p1: table })
    expect(restored.pipelines.map((p) => p.id)).toEqual(["p1"])
    expect(restored.activeId).toBe("p1")
  })

  it("falls back to the first tab when the stored active one is missing", () => {
    const persisted = { ...toPersisted(withThree()), activeId: "gone" }
    expect(fromPersisted(persisted, { p1: table, p2: table }).activeId).toBe("p1")
  })

  it("ignores a payload from a future version", () => {
    const bad = { ...toPersisted(withThree()), version: 2 as unknown as 1 }
    expect(fromPersisted(bad, { p1: table })).toEqual(EMPTY_PIPELINES)
  })
})
