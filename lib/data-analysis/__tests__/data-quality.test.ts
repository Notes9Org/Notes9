import { describe, expect, it } from "vitest"
import {
  decisionFindings,
  findFindings,
  structuralFindings,
  type Finding,
} from "@/lib/data-analysis/workspace/data-quality"
import { profilePreparation } from "@/lib/data-analysis/workspace/prep-offers"
import {
  specFromChartState,
  tableFromChartRows,
  type ChartState,
} from "@/lib/data-analysis/workspace/chart-state-spec"
import { resolvePayload } from "@/lib/data-analysis/engine/resolver"
import { applyMutation } from "@/lib/data-analysis/spec/mutations"

/**
 * The clock and the actor are arguments, so every assertion below is on a pure
 * function and the exclusion timestamps are the test's own.
 */
const NOW = "2026-08-21T12:00:00.000Z"
const ACTOR = "test@notes9.com"

const state: ChartState = {
  chartType: "bar",
  xKey: "",
  yKeys: [],
  title: "T",
  xLabel: "",
  yLabel: "",
  paletteName: "okabe-ito",
  errorMode: "sem",
}

function run(columns: string[], rows: Record<string, number | string>[]): Finding[] {
  const table = tableFromChartRows(columns, rows)
  const spec = specFromChartState(state, table)
  return findFindings(spec, table, profilePreparation(table), NOW, ACTOR)
}

function byId(findings: Finding[], prefix: string): Finding | undefined {
  return findings.find((f) => f.id.startsWith(prefix))
}

describe("a clean file produces no gate", () => {
  it("finds nothing in a small tidy table", () => {
    const findings = run(
      ["Group", "Signal"],
      [
        { Group: "A", Signal: 1 },
        { Group: "A", Signal: 2 },
        { Group: "B", Signal: 3 },
        { Group: "B", Signal: 4 },
      ],
    )
    expect(structuralFindings(findings)).toEqual([])
  })

  it("finds nothing in an empty table", () => {
    expect(run(["Signal"], [])).toEqual([])
  })
})

describe("contaminated numeric columns", () => {
  it("flags a column typed numeric that is 20% text, the case the 0.8 threshold hides", () => {
    const findings = run(
      ["OD450"],
      [
        { OD450: 0.11 },
        { OD450: 0.12 },
        { OD450: 0.13 },
        { OD450: 0.14 },
        { OD450: "<LOD" },
      ],
    )
    const f = byId(findings, "coerce:OD450")
    expect(f?.severity).toBe("structural")
    expect(f?.evidence).toContain('"<LOD" x1')
    expect(f?.recommended).toBe(0)
    const action = f!.actions[f!.recommended!]
    expect(action.mutations).toEqual([
      {
        kind: "data.addTransform",
        transform: {
          kind: "coerceNumeric",
          column: "OD450",
          tokensToMissing: ["<LOD"],
          stripSuffix: null,
        },
      },
    ])
  })

  it("flags a unit written into every cell", () => {
    const findings = run(
      ["Conc"],
      [{ Conc: "1.2 ng/mL" }, { Conc: "3.4 ng/mL" }, { Conc: "5.6 ng/mL" }],
    )
    const f = byId(findings, "coerce:Conc")
    expect(f?.severity).toBe("structural")
    const transform = f!.actions[0].mutations[0]
    expect(transform).toMatchObject({
      transform: { kind: "coerceNumeric", column: "Conc", stripSuffix: " ng/mL" },
    })
  })

  it("does NOT offer coercion on a text column that happens to hold a few numbers", () => {
    const findings = run(
      ["Notes"],
      [
        { Notes: "clean run" },
        { Notes: "repeat" },
        { Notes: "contaminated" },
        { Notes: "see log" },
        { Notes: 3 },
      ],
    )
    expect(byId(findings, "coerce:Notes")).toBeUndefined()
  })

  it("does not re-offer a column already carrying a coerceNumeric transform", () => {
    const table = tableFromChartRows(
      ["OD450"],
      [{ OD450: 1 }, { OD450: 2 }, { OD450: 3 }, { OD450: 4 }, { OD450: "N/A" }],
    )
    let spec = specFromChartState(state, table)
    const first = findFindings(spec, table, profilePreparation(table), NOW, ACTOR)
    spec = applyMutation(spec, byId(first, "coerce:")!.actions[0].mutations[0])
    const second = findFindings(spec, table, profilePreparation(table), NOW, ACTOR)
    expect(byId(second, "coerce:")).toBeUndefined()
  })
})

describe("duplicate rows", () => {
  it("excludes rather than deletes, and keeps the first occurrence", () => {
    const findings = run(
      ["Group", "Signal"],
      [
        { Group: "A", Signal: 1 },
        { Group: "A", Signal: 1 },
        { Group: "B", Signal: 2 },
        { Group: "C", Signal: 3 },
      ],
    )
    const f = byId(findings, "duplicateRows")
    expect(f?.severity).toBe("decision")
    expect(f?.recommended).toBeNull()
    const mutations = f!.actions[0].mutations
    expect(mutations).toHaveLength(1)
    expect(mutations[0]).toMatchObject({
      kind: "data.excludeRow",
      exclusion: { reasonKind: "other", excludedBy: ACTOR, excludedAt: NOW },
    })
  })

  it("stays quiet when values repeat because the design repeats, not the rows", () => {
    // Same Group/Time on every row pair, different Signal: long-format data,
    // not a duplication defect.
    const findings = run(
      ["Group", "Signal"],
      [
        { Group: "A", Signal: 1 },
        { Group: "A", Signal: 2 },
        { Group: "B", Signal: 3 },
        { Group: "B", Signal: 4 },
      ],
    )
    expect(byId(findings, "duplicateRows")).toBeUndefined()
  })
})

describe("Grubbs outliers", () => {
  it("never recommends removal, per 8.1", () => {
    const rows = [1, 1.1, 0.9, 1.05, 0.95, 1.02, 0.98, 40].map((Signal, i) => ({
      Group: i < 4 ? "A" : "B",
      Signal,
    }))
    const table = tableFromChartRows(["Group", "Signal"], rows)
    const spec = specFromChartState(
      { ...state, xKey: "Group", yKeys: ["Signal"] },
      table,
    )
    const f = byId(
      findFindings(spec, table, profilePreparation(table), NOW, ACTOR),
      "grubbs:Signal",
    )
    expect(f?.recommended).toBeNull()
    expect(f?.evidence).toContain("Grubbs")
    expect(f!.actions[0].mutations[0]).toMatchObject({
      kind: "data.excludeRow",
      exclusion: {
        reasonKind: "statistical-outlier",
        method: { name: "Grubbs", params: { alpha: 0.05 } },
      },
    })
  })

  it("stays silent below n=7, where the test says nothing", () => {
    const rows = [1, 1.1, 0.9, 40].map((Signal) => ({ Group: "A", Signal }))
    const table = tableFromChartRows(["Group", "Signal"], rows)
    const spec = specFromChartState({ ...state, xKey: "Group", yKeys: ["Signal"] }, table)
    const findings = findFindings(spec, table, profilePreparation(table), NOW, ACTOR)
    expect(byId(findings, "grubbs:")).toBeUndefined()
  })
})

describe("coerceNumeric reaches the engine payload", () => {
  it("routes coerced tokens into the declared missing-value strategy, not a second path", () => {
    const table = tableFromChartRows(
      ["Group", "OD450"],
      [
        { Group: "A", OD450: 1 },
        { Group: "A", OD450: 2 },
        { Group: "B", OD450: 3 },
        { Group: "B", OD450: "<LOD" },
      ],
    )
    let spec = specFromChartState({ ...state, xKey: "Group", yKeys: ["OD450"] }, table)
    const f = byId(findFindings(spec, table, profilePreparation(table), NOW, ACTOR), "coerce:")
    spec = applyMutation(spec, f!.actions[0].mutations[0])

    const outcome = resolvePayload(spec, table)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    // Listwise is the default: the "<LOD" row is dropped as missing, and it is
    // dropped ONCE — a value counted by both the coercion and the strategy
    // would show up here as a short table with no warning to match.
    expect(outcome.warnings.join(" ")).toMatch(/missing/i)
  })
})

describe("severity partition", () => {
  it("puts every finding in exactly one bucket", () => {
    const findings = run(
      ["Conc"],
      [{ Conc: "1.2 ng/mL" }, { Conc: "3.4 ng/mL" }, { Conc: "5.6 ng/mL" }],
    )
    expect(structuralFindings(findings).length + decisionFindings(findings).length).toBe(
      findings.length,
    )
  })
})
