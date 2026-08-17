import { describe, expect, it } from "vitest"
import { prepOffers, profilePreparation } from "./prep-offers"
import { specFromChartState, tableFromChartRows, type ChartState } from "./chart-state-spec"
import { applyMutation, dispatchMutation, initHistory } from "@/lib/data-analysis/spec/mutations"
import { skewness } from "@/lib/data-analysis/statistics"

const state: ChartState = {
  chartType: "bar",
  xKey: "group",
  yKeys: ["signal"],
  title: "Signal by group",
  xLabel: "Group",
  yLabel: "Signal",
  paletteName: "n9",
  errorMode: "sem",
  fontFamily: "system-ui, -apple-system, sans-serif",
}

/**
 * A right-tailed column and a column with holes in it, which is the pair the
 * brief names: both offers must appear, and both must carry the engine's own
 * number rather than a bare "consider a transform".
 */
const skewGapRows = [
  { group: "A", signal: 1, viability: 90 },
  { group: "A", signal: 1, viability: "" },
  { group: "A", signal: 1, viability: 91 },
  { group: "B", signal: 1, viability: "" },
  { group: "B", signal: 2, viability: 88 },
  { group: "B", signal: 120, viability: 92 },
]
const skewGapTable = tableFromChartRows(["group", "signal", "viability"], skewGapRows)
const skewGapSpec = specFromChartState(state, skewGapTable)

describe("profilePreparation", () => {
  it("measures skew per numeric column and leaves categoricals alone", () => {
    const profiles = profilePreparation(skewGapTable)
    const signal = profiles.find((p) => p.column === "signal")!
    expect(signal.skew).toBeCloseTo(skewness([1, 1, 1, 1, 2, 120]), 10)
    expect(profiles.find((p) => p.column === "group")!.skew).toBeNull()
  })

  it("counts rows per level and gaps per column", () => {
    const profiles = profilePreparation(skewGapTable)
    expect(profiles.find((p) => p.column === "group")!.levelCounts.get("A")).toBe(3)
    expect(profiles.find((p) => p.column === "viability")!.missing).toBe(2)
  })
})

describe("prepOffers", () => {
  it("offers a log10 and a missing-value strategy, each quoting its own measurement", () => {
    const offers = prepOffers(skewGapSpec, profilePreparation(skewGapTable))

    const log = offers.find((o) => o.apply[0]?.kind === "data.addTransform")
    expect(log).toBeDefined()
    expect(log!.apply).toEqual([
      {
        kind: "data.addTransform",
        transform: { kind: "log10", column: "signal" },
      },
    ])
    // The label names the column and what is wrong with it. It does NOT carry
    // the pre-flight skew, which the engine never produced — see the
    // "no statistic the engine did not produce" case below.
    expect(log!.summary).toContain("signal")
    expect(log!.summary).toContain("right-tailed")

    const gaps = offers.find((o) => o.apply[0]?.kind === "analysis.setMissingValues")
    expect(gaps).toBeDefined()
    expect(gaps!.apply).toEqual([{ kind: "analysis.setMissingValues", value: "median-impute" }])
    // 2 of 6, both numbers the profile measured.
    expect(gaps!.summary).toContain("2 of 6")
    expect(gaps!.summary).toContain("viability")
  })

  /**
   * The one rule that cannot bend: no number reaches the researcher that the
   * engine did not produce. `profilePreparation` runs in TypeScript over the
   * RAW sheet, so anything it derives is measured over a different set of rows
   * than the engine's descriptives and cannot agree with them by construction.
   *
   * The line the offers are held to: a COUNT of the raw sheet (rows, levels,
   * gaps, columns) is a restatement of what was uploaded and is allowed; a
   * DERIVED statistic is not. Counts are whole numbers, so a decimal appearing
   * anywhere in an offer's user-visible text is a statistic that escaped.
   */
  it("quotes no statistic the engine did not produce", () => {
    const rareRows: Record<string, number | string>[] = []
    for (const clone of ["c1", "c2", "c3"]) {
      for (let i = 0; i < 3; i++) rareRows.push({ clone, signal: 10 + i })
    }
    for (let i = 0; i < 10; i++) rareRows.push({ clone: `x${i}`, signal: 20 + i })
    const rareTable = tableFromChartRows(["clone", "signal"], rareRows)

    const offers = [
      ...prepOffers(skewGapSpec, profilePreparation(skewGapTable)),
      ...prepOffers(
        specFromChartState({ ...state, xKey: "clone" }, rareTable),
        profilePreparation(rareTable)
      ),
    ]
    // Guard the guard: an empty sweep would pass vacuously.
    expect(offers.length).toBeGreaterThan(2)
    const shown = offers.flatMap((o) => [o.summary, o.evidence]).join("\n")

    // The skew the pre-flight scan measured, at the precision the chip used to
    // print it, must appear nowhere the researcher can read it.
    const measured = Math.round(skewness([1, 1, 1, 1, 2, 120]) * 100) / 100
    expect(shown).not.toContain(String(measured))
    // And nothing else derived either: every number an offer prints is a count.
    expect(shown.match(/\d+\.\d+/g)).toBeNull()
  })

  it("records an accepted offer as an ordinary mutation with origin user", () => {
    const offers = prepOffers(skewGapSpec, profilePreparation(skewGapTable))
    const offer = offers.find((o) => o.apply[0]?.kind === "data.addTransform")!

    const history = dispatchMutation(initHistory(skewGapSpec), offer.apply[0], "user")
    const applied = history.past[history.past.length - 1].applied
    expect(applied.origin).toBe("user")
    expect(applied.description).toBe("Transform added: log10")
    expect(history.spec.transforms).toEqual([{ kind: "log10", column: "signal" }])
    // Same dispatcher, so the path is sticky against a later AI patch.
    expect(history.userEditedPaths.has("data.addTransform")).toBe(true)
  })

  // An offer that survives its own acceptance is a button that does nothing.
  // Both are checked because they take different routes home: the transform is
  // rail-carried, the missing-value strategy has no control and rides the
  // overlay, and only the second can regress silently.
  it.each(["log10:signal", "missingValues"])("stops offering %s once applied", (id) => {
    const offers = prepOffers(skewGapSpec, profilePreparation(skewGapTable))
    const offer = offers.find((o) => o.id === id)!
    expect(offer).toBeDefined()
    const after = prepOffers(
      offer.apply.reduce((spec, m) => applyMutation(spec, m), skewGapSpec),
      profilePreparation(skewGapTable)
    )
    expect(after.some((o) => o.id === id)).toBe(false)
  })

  it("does not offer a log10 on a column with non-positive values", () => {
    const table = tableFromChartRows(
      ["group", "signal"],
      [
        { group: "A", signal: 0 },
        { group: "A", signal: 0 },
        { group: "A", signal: 0 },
        { group: "B", signal: 0 },
        { group: "B", signal: 1 },
        { group: "B", signal: 120 },
      ]
    )
    const offers = prepOffers(specFromChartState(state, table), profilePreparation(table))
    expect(offers.some((o) => o.id === "log10:signal")).toBe(false)
  })

  it("offers pivotLonger for a plate export's numeric column headers", () => {
    const table = tableFromChartRows(
      ["row", "1", "2", "3"],
      [
        { row: "A", "1": 0.2, "2": 0.4, "3": 0.9 },
        { row: "B", "1": 0.3, "2": 0.5, "3": 1.1 },
        { row: "C", "1": 0.25, "2": 0.45, "3": 1.0 },
      ]
    )
    const offer = prepOffers(
      specFromChartState({ ...state, xKey: "row", yKeys: ["1"] }, table),
      profilePreparation(table)
    ).find((o) => o.id === "pivotLonger")
    expect(offer).toBeDefined()
    expect(offer!.summary).toContain("3 columns")
    expect(offer!.apply).toEqual([
      {
        kind: "data.addTransform",
        transform: { kind: "pivotLonger", columns: ["1", "2", "3"], namesTo: "column", valuesTo: "value" },
      },
    ])
  })

  it("offers normaliseToControl when a grouping column holds a vehicle level", () => {
    const table = tableFromChartRows(
      ["treatment", "signal"],
      [
        { treatment: "Vehicle", signal: 100 },
        { treatment: "Vehicle", signal: 104 },
        { treatment: "Drug", signal: 50 },
        { treatment: "Drug", signal: 54 },
      ]
    )
    const offer = prepOffers(
      specFromChartState({ ...state, xKey: "treatment" }, table),
      profilePreparation(table)
    ).find((o) => o.apply[0]?.kind === "data.addTransform" && o.id.startsWith("normaliseToControl"))
    expect(offer).toBeDefined()
    expect(offer!.summary).toContain("2 rows")
    expect(offer!.apply).toEqual([
      {
        kind: "data.addTransform",
        transform: {
          kind: "normaliseToControl",
          column: "signal",
          groupColumn: "treatment",
          controlLevel: "Vehicle",
          per: [],
          as: "percent",
        },
      },
    ])
  })

  it("offers keeping the replicated levels of a high-cardinality column", () => {
    // 13 clones: three measured in triplicate, ten measured once.
    const rows: Record<string, number | string>[] = []
    for (const clone of ["c1", "c2", "c3"]) {
      for (let i = 0; i < 3; i++) rows.push({ clone, signal: 10 + i })
    }
    for (let i = 0; i < 10; i++) rows.push({ clone: `x${i}`, signal: 20 + i })
    const table = tableFromChartRows(["clone", "signal"], rows)

    const offer = prepOffers(
      specFromChartState({ ...state, xKey: "clone" }, table),
      profilePreparation(table)
    ).find((o) => o.id === "rareLevels:clone")
    expect(offer).toBeDefined()
    expect(offer!.summary).toContain("13 levels")
    expect(offer!.summary).toContain("10 with fewer than 3 rows")
    expect(offer!.apply).toEqual([
      {
        kind: "data.setFilters",
        filters: [{ column: "clone", op: "in", value: ["c1", "c2", "c3"] }],
      },
    ])
  })

  it("offers nothing on a clean, small, symmetric table", () => {
    const table = tableFromChartRows(
      ["group", "signal"],
      [
        { group: "A", signal: 1 },
        { group: "A", signal: 2 },
        { group: "B", signal: 3 },
        { group: "B", signal: 4 },
      ]
    )
    expect(prepOffers(specFromChartState(state, table), profilePreparation(table))).toEqual([])
  })
})
