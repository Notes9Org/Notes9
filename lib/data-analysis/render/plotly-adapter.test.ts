import { describe, it, expect } from "vitest"
import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import { ENGINE_VERSION, type EngineResult } from "@/lib/data-analysis/engine/contract"
import { buildFigure, significanceStars, PALETTES } from "./plotly-adapter"
import { PALETTE_DEFINITIONS, paletteColours, sampleRamp } from "./palettes"

function spec(overrides: Record<string, unknown> = {}): AnalysisSpec {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: null,
      fileName: "plate.xlsx",
      sheet: null,
      versionHash: "sha256:abcd1234",
      rowCount: 6,
      columnCount: 2,
    },
    design: { source: "inferred" },
    analysis: {
      test: "anova-one-way",
      postHoc: "tukey",
      groupColumn: "treatment",
      responseColumns: ["viability"],
    },
    figure: { kind: "bar-scatter-error", x: {}, y: {}, errorBars: "sd" },
    export: {},
    ...overrides,
  })
  if (!parsed.ok) throw new Error("fixture invalid")
  return parsed.spec
}

function result(overrides: Partial<EngineResult> = {}): EngineResult {
  return {
    engineVersion: ENGINE_VERSION,
    dataVersionHash: "sha256:abcd1234",
    specHash: "hash",
    computedAt: "2026-07-30T10:00:00Z",
    durationMs: 40,
    descriptives: [],
    test: null,
    curveFit: null,
    survival: null,
    exclusionImpact: null,
    plotData: [
      { rowId: "r1", values: { treatment: "Control", viability: 100 }, excluded: false },
      { rowId: "r2", values: { treatment: "Control", viability: 98 }, excluded: false },
      { rowId: "r3", values: { treatment: "Control", viability: 40 }, excluded: true },
      { rowId: "r4", values: { treatment: "Treated", viability: 60 }, excluded: false },
      { rowId: "r5", values: { treatment: "Treated", viability: 62 }, excluded: false },
      { rowId: "r6", values: { treatment: "Treated", viability: 58 }, excluded: false },
    ],
    warnings: [],
    ...overrides,
  }
}

describe("data–figure link (§2 Tier 0)", () => {
  it("attaches the source row id to every drawn point", () => {
    const figure = buildFigure(spec(), result())
    const pointTraces = figure.data.filter((t) => t.type === "scatter")
    expect(pointTraces.length).toBeGreaterThan(0)
    // Without customdata, "open the data behind this point" is impossible.
    for (const trace of pointTraces) {
      expect(Array.isArray(trace.customdata)).toBe(true)
      expect((trace.customdata as string[]).length).toBeGreaterThan(0)
    }
    const allIds = pointTraces.flatMap((t) => t.customdata as string[])
    expect(allIds).toContain("r1")
    expect(allIds).toContain("r6")
  })

  it("keeps row ids aligned with their y values", () => {
    const figure = buildFigure(spec(), result())
    const control = figure.data.find((t) => t.type === "scatter" && t.name === "Control")
    expect(control).toBeTruthy()
    const ys = control!.y as number[]
    const ids = control!.customdata as string[]
    expect(ys.length).toBe(ids.length)
    // r3 is the excluded 40; it must still be present and still paired.
    expect(ids[ys.indexOf(40)]).toBe("r3")
  })
})

describe("exclusions are drawn, not removed (§8.1)", () => {
  it("keeps an excluded point on the figure", () => {
    const figure = buildFigure(spec(), result())
    const control = figure.data.find((t) => t.type === "scatter" && t.name === "Control")
    // Three Control rows, one excluded — all three are drawn.
    expect((control!.y as number[]).length).toBe(3)
  })

  it("marks the excluded point differently from the included ones", () => {
    const figure = buildFigure(spec(), result())
    const control = figure.data.find((t) => t.type === "scatter" && t.name === "Control")
    const marker = control!.marker as { symbol: string[] }
    // The excluded row renders hollow; the others do not.
    expect(marker.symbol).toContain("circle-open")
    expect(marker.symbol.filter((s) => s === "circle-open")).toHaveLength(1)
  })
})

describe("the error-bar choice is stated on the figure (§2)", () => {
  it("writes the error-bar meaning into the title block", () => {
    const figure = buildFigure(spec({ figure: { kind: "bar-scatter-error", x: {}, y: {}, errorBars: "sem", title: "Viability" } }), result())
    const title = (figure.layout.title as { text: string }).text
    expect(title).toContain("Viability")
    expect(title).toContain("mean ± SEM")
  })

  it("omits the note when there are no error bars", () => {
    const figure = buildFigure(
      spec({ figure: { kind: "bar-scatter-error", x: {}, y: {}, errorBars: "none", title: "Viability" } }),
      result()
    )
    const title = (figure.layout.title as { text: string }).text
    expect(title).not.toContain("mean ±")
  })
})

describe("significance brackets are driven by the post-hoc result", () => {
  const withPairwise = result({
    test: {
      test: "One-way ANOVA",
      statistic: 200,
      df: "1, 4",
      pValue: 0.0001,
      effectSizes: [],
      assumptions: [],
      pairwise: [
        {
          groupA: "Control",
          groupB: "Treated",
          meanDifference: 39,
          ciLow: 30,
          ciHigh: 48,
          pValue: 0.00001,
          pAdjusted: 0.00002,
          correctionMethod: "tukey",
          significant: true,
        },
      ],
      terms: [],
      groupSizes: { Control: 3, Treated: 3 },
      reportSentence: "",
    },
  })

  it("draws a bracket and a star for a significant pair", () => {
    const figure = buildFigure(spec(), withPairwise)
    const shapes = figure.layout.shapes as Record<string, unknown>[]
    const annotations = figure.layout.annotations as Record<string, unknown>[]
    expect(shapes.length).toBeGreaterThan(0)
    expect(annotations.some((a) => String(a.text).includes("*"))).toBe(true)
  })

  it("does not draw a bracket for a non-significant pair", () => {
    const notSig = result({
      test: {
        ...withPairwise.test!,
        pairwise: [{ ...withPairwise.test!.pairwise[0], significant: false, pAdjusted: 0.4 }],
      },
    })
    const figure = buildFigure(spec(), notSig)
    expect((figure.layout.shapes as unknown[]).length).toBe(0)
  })

  it("honours a bracket the user dragged", () => {
    const dragged = spec({
      figure: {
        kind: "bar-scatter-error",
        x: {},
        y: {},
        errorBars: "sd",
        brackets: [
          {
            id: "b1",
            fromGroup: "Control",
            toGroup: "Treated",
            offsetY: 25,
            derived: false,
            display: "p-value",
          },
        ],
      },
    })
    const figure = buildFigure(dragged, withPairwise)
    const annotations = figure.layout.annotations as Record<string, unknown>[]
    // Display preference respected: the numeric p rather than stars.
    expect(annotations.some((a) => String(a.text).startsWith("p ="))).toBe(true)
  })

  it("maps p-values to the conventional star count", () => {
    expect(significanceStars(0.00005)).toBe("****")
    expect(significanceStars(0.0005)).toBe("***")
    expect(significanceStars(0.005)).toBe("**")
    expect(significanceStars(0.03)).toBe("*")
    expect(significanceStars(0.2)).toBe("ns")
  })
})

describe("styling comes from the spec", () => {
  it("defaults to a colour-blind-safe palette", () => {
    const figure = buildFigure(spec(), result())
    const bar = figure.data.find((t) => t.type === "bar")
    const colours = (bar!.marker as { color: string[] }).color
    expect(colours[0]).toBe(PALETTES["okabe-ito"][0])
  })

  it("applies a per-series colour override", () => {
    const styled = spec({
      figure: {
        kind: "bar-scatter-error",
        x: {},
        y: {},
        errorBars: "sd",
        series: [{ key: "Control", colour: "#123456" }],
      },
    })
    const figure = buildFigure(styled, result())
    const bar = figure.data.find((t) => t.type === "bar")
    expect((bar!.marker as { color: string[] }).color[0]).toBe("#123456")
  })

  it("converts a log axis range into log units for Plotly", () => {
    const logged = spec({
      figure: {
        kind: "bar-scatter-error",
        x: {},
        y: { scale: "log10", min: 1, max: 1000 },
        errorBars: "sd",
      },
    })
    const figure = buildFigure(logged, result())
    const yaxis = figure.layout.yaxis as { type: string; range: number[] }
    expect(yaxis.type).toBe("log")
    // Passing [1, 1000] raw would render a wildly wrong scale.
    expect(yaxis.range[0]).toBeCloseTo(0, 6)
    expect(yaxis.range[1]).toBeCloseTo(3, 6)
  })

  it("returns an empty figure rather than something misleading when there is no result", () => {
    const figure = buildFigure(spec(), null)
    expect(figure.data).toEqual([])
  })
})

describe("group names reach the x axis", () => {
  // Regression: the axis type was hard-coded to "linear", so Plotly plotted
  // nothing for the string categories and left an empty frame behind a numeric
  // axis, which reads as "the analysis produced no data".
  it.each(["box", "violin"] as const)("uses a category axis for %s", (kind) => {
    const figure = buildFigure(spec({ figure: { kind, x: {}, y: {}, errorBars: "sd" } }), result())
    const axis = figure.layout.xaxis as { type: string; categoryorder?: string }
    expect(axis.type).toBe("category")
    // A dose series must not be reordered into "10 uM" before "Vehicle".
    expect(axis.categoryorder).toBe("trace")
  })

  // Bar charts jitter their own overlay, and a category axis reads each numeric
  // offset as a brand-new category — 24 points became 24 ticks. So they sit on
  // a numbered axis and get the group names back as tick labels.
  it.each(["bar-scatter-error", "grouped-bar"] as const)(
    "labels a numbered axis for %s",
    (kind) => {
      const figure = buildFigure(spec({ figure: { kind, x: {}, y: {}, errorBars: "sd" } }), result())
      const axis = figure.layout.xaxis as {
        type: string
        tickvals: number[]
        ticktext: string[]
      }
      expect(axis.type).toBe("linear")
      expect(axis.tickvals).toEqual([0, 1])
      expect(axis.ticktext).toEqual(["Control", "Treated"])
    }
  )

  it("puts the bars on the same integer positions as the tick labels", () => {
    const figure = buildFigure(spec(), result())
    expect(figure.data.find((t) => t.type === "bar")!.x).toEqual([0, 1])
  })

  it("leaves a continuous chart on a plain linear axis", () => {
    const figure = buildFigure(
      spec({ figure: { kind: "xy-scatter-fit", x: {}, y: {}, errorBars: "none" } }),
      result()
    )
    const axis = figure.layout.xaxis as { type: string; ticktext?: string[] }
    expect(axis.type).toBe("linear")
    expect(axis.ticktext).toBeUndefined()
  })
})

describe("replicate points are spread, and spread reproducibly", () => {
  // Regression: `jitter` was set on a scatter trace, where Plotly ignores it
  // (it applies to box and violin only), so every replicate stacked on one
  // vertical line.
  it("gives replicates in a group distinct x positions", () => {
    const figure = buildFigure(spec(), result())
    const control = figure.data.find((t) => t.type === "scatter" && t.name === "Control")
    const xs = control!.x as number[]
    expect(xs).toHaveLength(3)
    expect(new Set(xs).size).toBe(3)
    for (const x of xs) expect(typeof x).toBe("number")
  })

  it("actually spreads them, rather than clustering into a sliver", () => {
    // Distinctness alone is not enough: sequential plate wells ("A1".."A8")
    // hash to adjacent values, and a weakly mixed hash put all eight inside a
    // 0.002-wide band, which looks identical to no jitter at all.
    const wells = Array.from({ length: 8 }, (_, i) => `A${i + 1}`)
    const figure = buildFigure(
      spec(),
      result({
        plotData: wells.map((w) => ({
          rowId: w,
          values: { treatment: "Control", viability: 100 },
          excluded: false,
        })),
      })
    )
    const xs = figure.data.find((t) => t.type === "scatter")!.x as number[]
    const spread = Math.max(...xs) - Math.min(...xs)
    // The band is ±0.12 wide; eight points should cover a real fraction of it.
    expect(spread).toBeGreaterThan(0.1)
  })

  it("straddles the bar rather than drifting to one side", () => {
    // A run of hashes that happen to share a sign put all eight replicates to
    // the right of the bar, which reads as a misaligned overlay.
    const wells = Array.from({ length: 8 }, (_, i) => `A${i + 1}`)
    const figure = buildFigure(
      spec(),
      result({
        plotData: wells.map((w) => ({
          rowId: w,
          values: { treatment: "Control", viability: 100 },
          excluded: false,
        })),
      })
    )
    const xs = figure.data.find((t) => t.type === "scatter")!.x as number[]
    // Group 0 sits at x = 0, so the offsets should average out to it.
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length
    expect(Math.abs(mean)).toBeLessThan(1e-9)
    expect(xs.some((x) => x < 0)).toBe(true)
    expect(xs.some((x) => x > 0)).toBe(true)
  })

  it("keeps every point inside its own category slot", () => {
    const figure = buildFigure(spec(), result())
    for (const [index, name] of ["Control", "Treated"].entries()) {
      const trace = figure.data.find((t) => t.type === "scatter" && t.name === name)
      for (const x of trace!.x as number[]) {
        // Half a category width either side would collide with the neighbour.
        expect(Math.abs(x - index)).toBeLessThan(0.5)
      }
    }
  })

  it("draws the same figure twice from the same data (Law 4)", () => {
    const first = buildFigure(spec(), result())
    const second = buildFigure(spec(), result())
    const xs = (t: Record<string, unknown>[]) =>
      t.filter((x) => x.type === "scatter").map((x) => x.x)
    expect(xs(first.data)).toEqual(xs(second.data))
  })
})

describe("on-screen figures fill their container; exports keep the spec size", () => {
  it("drops the fixed pixel size when filling", () => {
    const figure = buildFigure(spec(), result(), { fill: true })
    expect(figure.layout.width).toBeUndefined()
    expect(figure.layout.height).toBeUndefined()
    expect(figure.layout.autosize).toBe(true)
  })

  it("honours the spec's export dimensions by default", () => {
    const figure = buildFigure(spec(), result())
    expect(typeof figure.layout.width).toBe("number")
    expect(typeof figure.layout.height).toBe("number")
  })
})

describe("bar labels live on the axis, not on the bars", () => {
  // Regression: the group name was passed as the bar trace's `text`, which
  // Plotly paints onto each bar — so every name appeared twice, once as a tick
  // label and once stamped across the middle of the chart.
  it("does not stamp text onto the bars", () => {
    const figure = buildFigure(spec(), result())
    const bar = figure.data.find((t) => t.type === "bar")!
    expect(bar.text).toBeUndefined()
    expect(bar.customdata).toEqual(["Control", "Treated"])
  })
})

describe("significance brackets land on the groups they compare", () => {
  const withPair = result({
    test: {
      test: "One-way ANOVA",
      statistic: 200,
      df: "1, 4",
      pValue: 0.0001,
      effectSizes: [],
      assumptions: [],
      pairwise: [
        {
          groupA: "Control",
          groupB: "Treated",
          meanDifference: 39,
          ciLow: 30,
          ciHigh: 48,
          pValue: 0.00001,
          pAdjusted: 0.00002,
          correctionMethod: "tukey",
          significant: true,
        },
      ],
      terms: [],
      groupSizes: { Control: 3, Treated: 3 },
      reportSentence: "",
    },
  })

  it("addresses a numbered axis by index, not by group name", () => {
    // A bracket left addressed by name has no position on a linear axis and
    // collapses to the origin.
    const figure = buildFigure(spec(), withPair)
    const line = (figure.layout.shapes as Record<string, unknown>[])[0]
    expect(line.x0).toBe(0)
    expect(line.x1).toBe(1)
  })

  it("centres the star over the bracket rather than over one end", () => {
    const figure = buildFigure(spec(), withPair)
    const star = (figure.layout.annotations as Record<string, unknown>[])[0]
    expect(star.x).toBe(0.5)
    expect(star.text).toBe("****")
  })

  it("keeps group names on a true category axis", () => {
    const figure = buildFigure(
      spec({ figure: { kind: "box", x: {}, y: {}, errorBars: "sd" } }),
      withPair
    )
    const line = (figure.layout.shapes as Record<string, unknown>[])[0]
    expect(line.x0).toBe("Control")
  })
})

describe("error bars mean what the label says", () => {
  // Reference values computed with numpy/scipy over the same six numbers.
  const VALUES = [12.1, 13.4, 11.8, 14.2, 12.9, 13.1]

  function barError(errorBars: string): number {
    const figure = buildFigure(
      spec({ figure: { kind: "bar-scatter-error", x: {}, y: {}, errorBars } }),
      result({
        plotData: VALUES.map((v, i) => ({
          rowId: `r${i}`,
          values: { treatment: "Control", viability: v },
          excluded: false,
        })),
      })
    )
    const bar = figure.data.find((t) => t.type === "bar") as {
      error_y: { array: number[] }
    }
    return bar.error_y.array[0]
  }

  it.each([
    ["sd", 0.8750238091998789],
    ["sem", 0.35722697422102806],
    ["ci90", 0.7198296333147602],
    ["ci95", 0.9182811711318968],
    ["ci99", 1.4403902376419822],
    ["range", 1.2833333333333332],
    ["iqr", 1.0249999999999986],
    ["mad", 0.9636900000000005],
  ])("matches the reference value for %s", (kind, expected) => {
    expect(barError(kind)).toBeCloseTo(expected, 10)
  })

  it("uses the t distribution for confidence intervals, not 1.96", () => {
    // At n = 6 the t multiplier is 2.571, so a normal approximation would draw
    // a "95% CI" about a quarter narrower than the interval it claims.
    const sem = 0.35722697422102806
    expect(barError("ci95")).toBeGreaterThan(sem * 2.2)
    expect(barError("ci95")).not.toBeCloseTo(sem * 1.96, 4)
  })

  it("widens the interval as the confidence level rises", () => {
    expect(barError("ci90")).toBeLessThan(barError("ci95"))
    expect(barError("ci95")).toBeLessThan(barError("ci99"))
  })

  it("draws no bars when the choice is none", () => {
    const figure = buildFigure(
      spec({ figure: { kind: "bar-scatter-error", x: {}, y: {}, errorBars: "none" } }),
      result()
    )
    const bar = figure.data.find((t) => t.type === "bar") as { error_y?: unknown }
    expect(bar.error_y).toBeUndefined()
  })
})

describe("palettes", () => {
  it("resolves every catalogued palette to real colours", () => {
    for (const definition of PALETTE_DEFINITIONS) {
      expect(definition.colours.length).toBeGreaterThan(2)
      for (const colour of definition.colours) {
        expect(colour).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })

  it("falls back to the safe default rather than failing on an unknown name", () => {
    // Saved analyses must keep opening after a palette is renamed or removed.
    expect(paletteColours("no-such-palette")).toEqual(paletteColours("okabe-ito"))
  })

  it("still understands the legacy display names", () => {
    expect(paletteColours("Okabe–Ito")).toEqual(paletteColours("okabe-ito"))
  })

  it("samples a ramp across its whole range", () => {
    const sampled = sampleRamp("viridis", 5)
    expect(sampled).toHaveLength(5)
    expect(sampled[0]).toBe(paletteColours("viridis")[0].toLowerCase())
    expect(new Set(sampled).size).toBe(5)
  })

  it("offers a colour-blind-safe option in every palette kind", () => {
    const kinds = ["qualitative", "sequential", "diverging"] as const
    for (const kind of kinds) {
      const safe = PALETTE_DEFINITIONS.filter((p) => p.kind === kind && p.cvdSafe)
      expect(safe.length, `no CVD-safe ${kind} palette`).toBeGreaterThan(0)
    }
  })
})

describe("Kaplan-Meier curves", () => {
  // Freireich 1963, the canonical KM dataset; values verified against the
  // engine, which computes the estimator.
  const survivalResult = result({
    survival: {
      groups: [
        {
          label: "6-MP",
          time: [0, 6, 7, 10],
          survival: [1, 0.8571, 0.8067, 0.7529],
          lower: [1, 0.7101, 0.6395, 0.5674],
          upper: [1, 1, 0.9739, 0.9384],
          atRisk: [21, 21, 17, 15],
          censoredTimes: [6, 9],
          median: 23,
          n: 21,
          events: 9,
        },
        {
          label: "placebo",
          time: [0, 1, 2],
          survival: [1, 0.9048, 0.8095],
          lower: [1, 0.7791, 0.6414],
          upper: [1, 1, 0.9776],
          atRisk: [21, 21, 19],
          censoredTimes: [],
          median: 8,
          n: 21,
          events: 21,
        },
      ],
    },
  })
  const kmSpec = spec({ figure: { kind: "kaplan-meier", x: {}, y: {}, errorBars: "none" } })

  it("draws survival as a step function, not a slope", () => {
    // Survival is constant between events; a straight interpolation would claim
    // a gradual decline the estimator does not assert.
    const figure = buildFigure(kmSpec, survivalResult)
    const curves = figure.data.filter((t) => String(t.name).includes("n ="))
    expect(curves).toHaveLength(2)
    for (const c of curves) {
      expect((c.line as { shape: string }).shape).toBe("hv")
    }
  })

  it("states each group's n in the legend", () => {
    const figure = buildFigure(kmSpec, survivalResult)
    expect(figure.data.some((t) => t.name === "6-MP (n = 21)")).toBe(true)
    expect(figure.data.some((t) => t.name === "placebo (n = 21)")).toBe(true)
  })

  it("marks censoring on the curve it belongs to", () => {
    const figure = buildFigure(kmSpec, survivalResult)
    const ticks = figure.data.find((t) => String(t.name).includes("censored"))
    expect(ticks).toBeTruthy()
    expect(ticks!.x).toEqual([6, 9])
    // The tick sits at the survival in force at that time, not at zero.
    expect((ticks!.y as number[])[0]).toBeCloseTo(0.8571, 4)
  })

  it("draws the confidence band only when asked", () => {
    const withBand = buildFigure(kmSpec, survivalResult)
    expect(withBand.data.some((t) => t.fill === "toself")).toBe(true)
    const without = buildFigure(
      spec({
        figure: { kind: "kaplan-meier", x: {}, y: {}, errorBars: "none", showConfidenceBands: false },
      }),
      survivalResult
    )
    expect(without.data.some((t) => t.fill === "toself")).toBe(false)
  })

  it("renders nothing rather than guessing when the engine returned no curves", () => {
    expect(buildFigure(kmSpec, result()).data).toHaveLength(0)
  })
})

describe("heatmap", () => {
  const twoFactor = result({
    plotData: [
      { rowId: "a", values: { treatment: "Ctrl", time: "0h", viability: 100 }, excluded: false },
      { rowId: "b", values: { treatment: "Ctrl", time: "0h", viability: 90 }, excluded: false },
      { rowId: "c", values: { treatment: "Ctrl", time: "24h", viability: 80 }, excluded: false },
      { rowId: "d", values: { treatment: "Drug", time: "0h", viability: 60 }, excluded: false },
      { rowId: "e", values: { treatment: "Drug", time: "24h", viability: 40 }, excluded: false },
    ],
  })
  const hmSpec = spec({
    analysis: {
      test: "none",
      groupColumn: "treatment",
      secondFactorColumn: "time",
      responseColumns: ["viability"],
    },
    figure: { kind: "heatmap", x: {}, y: {}, errorBars: "none" },
  })

  it("averages the rows that share a cell and reports the count", () => {
    const figure = buildFigure(hmSpec, twoFactor)
    const trace = figure.data[0]
    expect(trace.type).toBe("heatmap")
    const z = trace.z as (number | null)[][]
    // Ctrl/0h holds 100 and 90.
    expect(z[0][0]).toBe(95)
    expect((trace.customdata as number[][])[0][0]).toBe(2)
  })

  it("leaves an empty cell empty instead of drawing a zero", () => {
    const sparse = result({
      plotData: [
        { rowId: "a", values: { treatment: "Ctrl", time: "0h", viability: 100 }, excluded: false },
        { rowId: "b", values: { treatment: "Drug", time: "24h", viability: 40 }, excluded: false },
      ],
    })
    const z = buildFigure(hmSpec, sparse).data[0].z as (number | null)[][]
    expect(z[0][1]).toBeNull()
  })

  it("substitutes a sequential ramp when the palette is qualitative", () => {
    // A qualitative palette has no order, so using it for magnitude would encode
    // "bigger" as an arbitrary hue change.
    const figure = buildFigure(hmSpec, twoFactor)
    const scale = figure.data[0].colorscale as [number, string][]
    expect(scale[0][1].toLowerCase()).toBe(paletteColours("viridis")[0].toLowerCase())
  })

  it("needs both factors before it draws anything", () => {
    const oneFactor = spec({
      analysis: { test: "none", groupColumn: "treatment", responseColumns: ["viability"] },
      figure: { kind: "heatmap", x: {}, y: {}, errorBars: "none" },
    })
    expect(buildFigure(oneFactor, twoFactor).data).toHaveLength(0)
  })
})

describe("volcano", () => {
  const features = result({
    plotData: [
      { rowId: "g1", values: { gene: "TP53", lfc: 2.4, p: 0.0001 }, excluded: false },
      { rowId: "g2", values: { gene: "MYC", lfc: -1.8, p: 0.002 }, excluded: false },
      { rowId: "g3", values: { gene: "ACTB", lfc: 0.1, p: 0.9 }, excluded: false },
      // p = 0 would be -log10(0) = Infinity, which cannot be plotted.
      { rowId: "g4", values: { gene: "BAD", lfc: 5, p: 0 }, excluded: false },
    ],
  })
  const vSpec = spec({
    analysis: { test: "none", alpha: 0.05, groupColumn: "gene", responseColumns: ["lfc", "p"] },
    figure: { kind: "volcano", x: {}, y: {}, errorBars: "none", volcanoFoldChange: 1 },
  })

  it("plots significance as -log10(p)", () => {
    const trace = buildFigure(vSpec, features).data[0]
    const y = trace.y as number[]
    expect(y[0]).toBeCloseTo(4, 10)
    expect(y[1]).toBeCloseTo(2.69897, 4)
  })

  it("drops a p of zero rather than plotting infinity", () => {
    const trace = buildFigure(vSpec, features).data[0]
    expect((trace.y as number[]).every((v) => Number.isFinite(v))).toBe(true)
    expect(trace.x).toHaveLength(3)
  })

  it("colours only the points past both cut-offs", () => {
    const trace = buildFigure(vSpec, features).data[0]
    const colours = (trace.marker as { color: string[] }).color
    // TP53 and MYC clear both; ACTB clears neither.
    expect(colours[0]).not.toBe("#9aa0a6")
    expect(colours[1]).not.toBe("#9aa0a6")
    expect(colours[2]).toBe("#9aa0a6")
  })

  it("draws the cut-offs it used", () => {
    const figure = buildFigure(vSpec, features)
    const shapes = figure.layout.shapes as Record<string, unknown>[]
    // alpha 0.05 → y = 1.301, and ±1 on the effect axis.
    expect(shapes.some((s) => typeof s.y0 === "number" && Math.abs((s.y0 as number) - 1.30103) < 1e-4)).toBe(true)
    expect(shapes.some((s) => s.x0 === 1)).toBe(true)
    expect(shapes.some((s) => s.x0 === -1)).toBe(true)
  })

  it("keeps the feature name for the hover", () => {
    const trace = buildFigure(vSpec, features).data[0]
    expect(trace.text).toEqual(["TP53", "MYC", "ACTB"])
  })
})

describe("pie composition", () => {
  const counts = result({
    plotData: [
      { rowId: "1", values: { treatment: "Ctrl", viability: 10 }, excluded: false },
      { rowId: "2", values: { treatment: "Ctrl", viability: 20 }, excluded: false },
      { rowId: "3", values: { treatment: "Drug", viability: 30 }, excluded: false },
    ],
  })
  const pieSpec = spec({
    analysis: { test: "none", groupColumn: "treatment", responseColumns: ["viability"] },
    figure: { kind: "pie-composition", x: {}, y: {}, errorBars: "none" },
  })

  it("sums the response per category", () => {
    const trace = buildFigure(pieSpec, counts).data[0]
    expect(trace.labels).toEqual(["Ctrl", "Drug"])
    expect(trace.values).toEqual([30, 30])
  })

  it("counts rows when no response is mapped", () => {
    const noResponse = spec({
      analysis: { test: "none", groupColumn: "treatment", responseColumns: [] },
      figure: { kind: "pie-composition", x: {}, y: {}, errorBars: "none" },
    })
    expect(buildFigure(noResponse, counts).data[0].values).toEqual([2, 1])
  })

  it("keeps the data's own category order", () => {
    // Plotly re-sorts by value unless told not to, which would scramble a dose
    // series into a ranking.
    expect(buildFigure(pieSpec, counts).data[0].sort).toBe(false)
  })
})

describe("every chart kind the spec names can be drawn", () => {
  // A kind the adapter cannot build is a kind that can be chosen, saved and
  // reopened as an empty figure — worse than not offering it.
  const xy = result({
    plotData: Array.from({ length: 8 }, (_, i) => ({
      rowId: `r${i}`,
      values: {
        treatment: i % 2 ? "Drug" : "Ctrl",
        viability: 50 + i * 5,
        a: i,
        b: i * 2 + 1,
        c: 10 - i,
      },
      excluded: false,
    })),
  })

  const KINDS = [
    "bar-scatter-error", "grouped-bar", "stacked-bar", "horizontal-bar", "box", "violin",
    "xy-scatter-fit", "bubble", "line-timecourse", "area", "histogram", "ecdf", "qq",
    "heatmap", "correlation-matrix", "volcano", "roc", "bland-altman", "forest",
    "pie-composition", "scatter-3d", "surface-3d",
  ] as const

  it.each(KINDS)("builds traces for %s", (kind) => {
    const figure = buildFigure(
      spec({
        analysis: {
          test: "none",
          groupColumn: "treatment",
          secondFactorColumn: "treatment",
          responseColumns: ["a", "b", "c"],
        },
        figure: { kind, x: {}, y: {}, errorBars: "sd" },
      }),
      xy
    )
    expect(figure.data.length, `${kind} produced no traces`).toBeGreaterThan(0)
    expect(figure.layout).toBeTruthy()
  })

  it("puts categories on the y axis for horizontal kinds", () => {
    for (const kind of ["horizontal-bar", "forest"] as const) {
      const figure = buildFigure(
        spec({
          analysis: { test: "none", groupColumn: "treatment", responseColumns: ["a", "b", "c"] },
          figure: { kind, x: {}, y: {}, errorBars: "sd" },
        }),
        xy
      )
      expect((figure.layout.yaxis as { type: string }).type, kind).toBe("category")
    }
  })

  it("encodes bubble size as area, not radius", () => {
    // Encoding the value as radius exaggerates it by the square.
    const figure = buildFigure(
      spec({
        analysis: { test: "none", responseColumns: ["a", "b", "c"] },
        figure: { kind: "bubble", x: {}, y: {}, errorBars: "none" },
      }),
      xy
    )
    const sizes = (figure.data[0].marker as { size: number[] }).size
    expect(Array.isArray(sizes)).toBe(true)
    // c runs 10 down to 3; the largest bubble must not be 10/3 times the smallest.
    const ratio = Math.max(...sizes) / Math.min(...sizes)
    expect(ratio).toBeLessThan(10 / 3)
  })

  it("draws the ECDF as a step, not a slope", () => {
    const figure = buildFigure(
      spec({
        analysis: { test: "none", responseColumns: ["a"] },
        figure: { kind: "ecdf", x: {}, y: {}, errorBars: "none" },
      }),
      xy
    )
    expect((figure.data[0].line as { shape: string }).shape).toBe("hv")
    const ys = figure.data[0].y as number[]
    expect(ys[ys.length - 1]).toBeCloseTo(1, 10)
  })

  it("gives the correlation matrix a diverging scale centred on zero", () => {
    // A correlation is signed; a sequential ramp would read -1 and +1 as ends
    // of a magnitude rather than opposites.
    const figure = buildFigure(
      spec({
        analysis: { test: "none", responseColumns: ["a", "b", "c"] },
        figure: { kind: "correlation-matrix", x: {}, y: {}, errorBars: "none" },
      }),
      xy
    )
    expect(figure.data[0].zmin).toBe(-1)
    expect(figure.data[0].zmax).toBe(1)
    // a and b are perfectly correlated; a and c perfectly anti-correlated.
    const z = figure.data[0].z as number[][]
    expect(z[0][1]).toBeCloseTo(1, 10)
    expect(z[0][2]).toBeCloseTo(-1, 10)
  })

  it("draws the chance diagonal on a ROC", () => {
    const figure = buildFigure(
      spec({
        analysis: { test: "none", responseColumns: ["a", "b"] },
        figure: { kind: "roc", x: {}, y: {}, errorBars: "none" },
      }),
      xy
    )
    expect(figure.data[0].x).toEqual([0, 1])
    expect(figure.data.some((t) => String(t.name).includes("AUC"))).toBe(true)
  })

  it("keeps forest intervals asymmetric about the estimate", () => {
    const figure = buildFigure(
      spec({
        analysis: { test: "none", groupColumn: "treatment", responseColumns: ["b", "a", "c"] },
        figure: { kind: "forest", x: {}, y: {}, errorBars: "none" },
      }),
      xy
    )
    expect((figure.data[0].error_x as { symmetric: boolean }).symmetric).toBe(false)
  })
})
