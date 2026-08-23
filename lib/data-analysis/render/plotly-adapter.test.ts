import { describe, it, expect } from "vitest"
import { bracketId, parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import { ENGINE_VERSION, type EngineResult } from "@/lib/data-analysis/engine/contract"
import {
  buildFigure,
  bracketMoveFromRelayout,
  rowIdAtPoint,
  significanceStars,
  PALETTES,
} from "./plotly-adapter"
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
    testRan: null,
    error: null,
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
    // Three Control rows, one excluded, all three are drawn.
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

  it("keeps the note subordinate on an untitled figure rather than promoting it", () => {
    const figure = buildFigure(
      spec({ figure: { kind: "bar-scatter-error", x: {}, y: {}, errorBars: "sd", title: null } }),
      result()
    )
    const title = (figure.layout.title as { text: string }).text
    expect(title).toContain("mean ± SD")
    // Wrapped in the small, dimmed span, not sitting bare at title weight.
    expect(title).toMatch(/^<span style="font-size:\d+px;opacity:0\.65">/)
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

  it("names each drawn bracket by the comparison it spans", () => {
    const figure = buildFigure(spec(), withPairwise)
    // Index-aligned with the leading shapes, so a drag reported as
    // `shapes[0].y0` can be turned back into a mutation.
    expect(figure.brackets).toHaveLength(1)
    expect(figure.brackets![0].id).toBe(bracketId("Control", "Treated"))
    const shapes = figure.layout.shapes as Record<string, number>[]
    // baseY is the auto-placed position, i.e. the offset's origin.
    expect(shapes[0].y0).toBeCloseTo(figure.brackets![0].baseY, 6)
  })

  it("keeps a dragged bracket's stored offset off its own base", () => {
    const dragged = spec({
      figure: {
        kind: "bar-scatter-error",
        x: {},
        y: {},
        errorBars: "sd",
        brackets: [
          {
            id: bracketId("Control", "Treated"),
            fromGroup: "Control",
            toGroup: "Treated",
            offsetY: 25,
            derived: false,
            display: "stars",
          },
        ],
      },
    })
    const figure = buildFigure(dragged, withPairwise)
    const shapes = figure.layout.shapes as Record<string, number>[]
    // Drawn 25 above the auto position, and the base reported for the next drag
    // is still the auto position, so offsets do not compound.
    expect(shapes[0].y0 - figure.brackets![0].baseY).toBeCloseTo(25, 6)
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
  // offset as a brand-new category, 24 points became 24 ticks. So they sit on
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
  // Plotly paints onto each bar, so every name appeared twice, once as a tick
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

  /** The bar's centre and the two distances the whiskers actually reach. */
  function barGeometry(errorBars: string): { centre: number; minus: number; plus: number } {
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
      y: number[]
      error_y?: { symmetric: boolean; array: number[]; arrayminus: number[] }
    }
    return {
      centre: bar.y[0],
      minus: bar.error_y?.arrayminus[0] ?? 0,
      plus: bar.error_y?.array[0] ?? 0,
    }
  }

  function barError(errorBars: string): number {
    return barGeometry(errorBars).plus
  }

  const MEAN = 12.916666666666666
  // Sorted: 11.8 12.1 12.9 13.1 13.4 14.2 → median 13.0, Q1 12.3, Q3 13.325.
  const MEDIAN = 13
  it.each([
    ["sd", MEAN, 0.8750238091998789, 0.8750238091998789],
    ["sem", MEAN, 0.35722697422102806, 0.35722697422102806],
    ["ci90", MEAN, 0.7198296333147602, 0.7198296333147602],
    ["ci95", MEAN, 0.9182811711318968, 0.9182811711318968],
    ["ci99", MEAN, 1.4403902376419822, 1.4403902376419822],
    // Asymmetric: the lower whisker is the true minimum, not a mirror of the max.
    ["range", MEAN, MEAN - 11.8, 14.2 - MEAN],
    // Centred on the MEDIAN, spanning Q1..Q3 exactly once — the label says
    // "median, IQR", so mean ± (Q3−Q1) was both the wrong centre and twice the
    // stated span.
    ["iqr", MEDIAN, MEDIAN - 12.3, 13.325 - MEDIAN],
    // "median ± MAD": symmetric, but about the median.
    ["mad", MEDIAN, 0.9636900000000005, 0.9636900000000005],
  ])("draws %s where its label says it is", (kind, centre, minus, plus) => {
    const g = barGeometry(kind as string)
    expect(g.centre).toBeCloseTo(centre as number, 10)
    expect(g.minus).toBeCloseTo(minus as number, 10)
    expect(g.plus).toBeCloseTo(plus as number, 10)
  })

  it("spans exactly the interquartile range, once", () => {
    const g = barGeometry("iqr")
    expect(g.minus + g.plus).toBeCloseTo(1.0249999999999986, 10)
  })

  it("reaches the true minimum and maximum for range", () => {
    const g = barGeometry("range")
    expect(g.centre - g.minus).toBeCloseTo(Math.min(...VALUES), 10)
    expect(g.centre + g.plus).toBeCloseTo(Math.max(...VALUES), 10)
  })

  it("marks every bar's error object asymmetric so arrayminus is honoured", () => {
    for (const kind of ["sd", "range", "iqr", "mad"]) {
      const figure = buildFigure(
        spec({ figure: { kind: "bar-scatter-error", x: {}, y: {}, errorBars: kind } }),
        result()
      )
      const bar = figure.data.find((t) => t.type === "bar") as {
        error_y: { symmetric: boolean }
      }
      expect(bar.error_y.symmetric).toBe(false)
    }
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
      // p = 0 is an underflow, not a missing value: the strongest hit in the
      // set. It must stay on the figure, clamped, not silently vanish.
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

  it("clamps an underflowed p rather than dropping the strongest hit", () => {
    const trace = buildFigure(vSpec, features).data[0]
    expect((trace.y as number[]).every((v) => Number.isFinite(v))).toBe(true)
    // All four features present, including BAD at p = 0.
    expect(trace.x).toHaveLength(4)
    const y = trace.y as number[]
    // Clamped to the smallest positive p in the set (0.0001), so it lands at
    // the top of the figure instead of off it.
    expect(y[3]).toBeCloseTo(4, 10)
    expect(y[3]).toBeGreaterThanOrEqual(Math.max(...y.slice(0, 3)))
  })

  it("falls back to the float floor when every p underflowed", () => {
    const allZero = result({
      plotData: [
        { rowId: "z1", values: { gene: "A", lfc: 3, p: 0 }, excluded: false },
        { rowId: "z2", values: { gene: "B", lfc: -3, p: 0 }, excluded: false },
      ],
    })
    const y = buildFigure(vSpec, allZero).data[0].y as number[]
    expect(y).toHaveLength(2)
    expect(y.every(Number.isFinite)).toBe(true)
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
    expect(trace.text).toEqual(["TP53", "MYC", "ACTB", "BAD"])
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
  // reopened as an empty figure, worse than not offering it.
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

  function everyKind(kind: (typeof KINDS)[number], engine = xy) {
    return buildFigure(
      spec({
        analysis: {
          test: "none",
          groupColumn: "treatment",
          secondFactorColumn: "treatment",
          responseColumns: ["a", "b", "c"],
        },
        figure: { kind, x: {}, y: {}, errorBars: "sd" },
      }),
      engine
    )
  }

  /**
   * What each kind must actually PUT ON THE PAGE.
   *
   * "the trace array is non-empty" was the whole of this assertion, which is
   * why a bar chart that drew no points, a line chart with no error bars and a
   * pie captioned "mean ± SD" all passed it. Each entry below names the idiom
   * that makes the kind that kind.
   */
  const IDIOM: Partial<Record<(typeof KINDS)[number], (f: ReturnType<typeof buildFigure>) => void>> = {
    "bar-scatter-error": (f) => {
      expect(f.data.some((t) => t.type === "bar")).toBe(true)
      // The individual replicates over the bars, not the bars alone.
      expect(f.data.some((t) => t.type === "scatter" && t.mode === "markers")).toBe(true)
    },
    "grouped-bar": (f) => expect(f.data.some((t) => t.type === "bar")).toBe(true),
    "stacked-bar": (f) => expect(f.data.some((t) => t.type === "bar")).toBe(true),
    "horizontal-bar": (f) =>
      expect(f.data.some((t) => t.type === "bar" && t.orientation === "h")).toBe(true),
    box: (f) => expect(f.data.some((t) => t.type === "box")).toBe(true),
    violin: (f) => expect(f.data.some((t) => t.type === "violin")).toBe(true),
    "line-timecourse": (f) => {
      expect(f.data.some((t) => String(t.mode).includes("lines"))).toBe(true)
      // "line/time-course WITH ERROR BARS" is the requirement verbatim.
      expect(f.data.some((t) => t.error_y !== undefined)).toBe(true)
    },
    histogram: (f) => expect(f.data.some((t) => t.type === "histogram")).toBe(true),
    heatmap: (f) => expect(f.data.some((t) => t.type === "heatmap")).toBe(true),
    "correlation-matrix": (f) => expect(f.data.some((t) => t.type === "heatmap")).toBe(true),
    "pie-composition": (f) => expect(f.data.some((t) => t.type === "pie")).toBe(true),
    "scatter-3d": (f) => expect(f.data.some((t) => t.type === "scatter3d")).toBe(true),
    "surface-3d": (f) => expect(f.data.some((t) => t.type === "surface")).toBe(true),
    forest: (f) => expect(f.data.some((t) => t.error_x !== undefined)).toBe(true),
    ecdf: (f) => expect(f.data.some((t) => (t.line as { shape?: string })?.shape === "hv")).toBe(true),
    roc: (f) => expect(f.data.some((t) => String(t.name).startsWith("ROC"))).toBe(true),
    area: (f) => expect(f.data.some((t) => t.fill !== undefined)).toBe(true),
  }

  it.each(KINDS)("draws the idiom that makes it a %s", (kind) => {
    const figure = everyKind(kind)
    expect(figure.data.length, `${kind} produced no traces`).toBeGreaterThan(0)
    expect(figure.layout).toBeTruthy()
    IDIOM[kind]?.(figure)
  })

  it.each(KINDS)("carries a row id back to the spreadsheet from %s", (kind) => {
    // §2's data↔figure link. Aggregate kinds (a heatmap cell, a pie slice, an
    // ECDF step) have no single source row, so they are exempt by nature.
    const aggregate = new Set([
      "heatmap", "correlation-matrix", "pie-composition", "histogram", "ecdf", "qq",
      "roc", "surface-3d", "stacked-bar", "horizontal-bar", "area",
    ])
    if (aggregate.has(kind)) return
    const figure = everyKind(kind)
    expect(figure.data.some((t) => t.customdata !== undefined), kind).toBe(true)
  })

  it.each(KINDS)("only claims error bars in the %s subtitle when it draws them", (kind) => {
    const figure = everyKind(kind)
    const title = (figure.layout.title as { text: string }).text
    const claims = title.includes("mean ± SD")
    const draws = figure.data.some((t) => t.error_y !== undefined || t.error_x !== undefined)
    // errorBars defaults to "sd", so the subtitle used to read "mean ± SD" on a
    // pie chart, a heatmap and a volcano alike.
    expect(claims, `${kind}: subtitle says "mean ± SD"`).toBe(claims && draws)
  })

  it.each(KINDS)("never lets showExcludedPoints move a number on a %s", (kind) => {
    // §8.1: the flag is a display filter. Whatever it is set to, every value
    // the figure computes has to come out identical.
    const withExcluded = result({
      plotData: xy.plotData.map((r, i) => ({ ...r, excluded: i === 1 })),
    })
    const shown = buildFigure(
      spec({
        analysis: {
          test: "none", groupColumn: "treatment", secondFactorColumn: "treatment",
          responseColumns: ["a", "b", "c"],
        },
        figure: { kind, x: {}, y: {}, errorBars: "sd", showExcludedPoints: true },
      }),
      withExcluded
    )
    const hidden = buildFigure(
      spec({
        analysis: {
          test: "none", groupColumn: "treatment", secondFactorColumn: "treatment",
          responseColumns: ["a", "b", "c"],
        },
        figure: { kind, x: {}, y: {}, errorBars: "sd", showExcludedPoints: false },
      }),
      withExcluded
    )
    // Every aggregate the figure states: bar heights, whiskers, cell means,
    // slice totals, curve vertices. Marker-only traces differ by design.
    const stats = (f: ReturnType<typeof buildFigure>) =>
      f.data
        .filter((t) => t.mode !== "markers" && t.type !== "scatter3d")
        .map((t) => JSON.stringify([t.type, t.z, t.values, t.error_y, t.error_x]))
    expect(stats(hidden), kind).toEqual(stats(shown))
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

describe("reading pointer events back (§2 Tier 0)", () => {
  it("names the source row of a per-row mark, and only of a per-row mark", () => {
    const r = result()
    expect(rowIdAtPoint([{ customdata: "r4" }], r)).toBe("r4")
    // A bar carries its GROUP in customdata, not a row. Treating that as a row
    // id would open the exclusion dialog for a row called "Control".
    expect(rowIdAtPoint([{ customdata: "Control" }], r)).toBeNull()
    expect(rowIdAtPoint([{ customdata: 3 }], r)).toBeNull()
    expect(rowIdAtPoint(undefined, r)).toBeNull()
    expect(rowIdAtPoint([{ customdata: "r4" }], null)).toBeNull()
  })

  it("turns a dragged shape into the bracket it belongs to", () => {
    const brackets = [
      { id: "a", baseY: 100, y: 100 },
      { id: "b", baseY: 120, y: 120 },
    ]
    expect(bracketMoveFromRelayout({ "shapes[1].y0": 133, "shapes[1].y1": 133 }, brackets)).toEqual({
      id: "b",
      offsetY: 13,
    })
    // A relayout that is not a shape drag (a zoom, an autorange) must not be
    // recorded as an edit to the figure.
    expect(bracketMoveFromRelayout({ "xaxis.range[0]": 2 }, brackets)).toBeNull()
    // A shape that is not a bracket -- a volcano threshold line, drawn after
    // them -- has no identity to move.
    expect(bracketMoveFromRelayout({ "shapes[7].y0": 5 }, brackets)).toBeNull()
    expect(bracketMoveFromRelayout({ "shapes[0].y0": 5 }, undefined)).toBeNull()
    // A sideways drag leaves y0 alone: nothing moved, so nothing is recorded.
    expect(bracketMoveFromRelayout({ "shapes[1].x0": 3, "shapes[1].y0": 120 }, brackets)).toBeNull()
  })
})

/**
 * The defects in this block all share one shape: the figure asserted something
 * the numbers beside it did not support. Each test names the contradiction.
 */
describe("the figure agrees with the statistics beside it", () => {
  /** Three replicates per group, one of them excluded in Control. */
  const withOutlier = result({
    plotData: [
      { rowId: "r1", values: { treatment: "Control", viability: 10 }, excluded: false },
      { rowId: "r2", values: { treatment: "Control", viability: 12 }, excluded: false },
      { rowId: "r3", values: { treatment: "Control", viability: 200 }, excluded: true },
      { rowId: "r4", values: { treatment: "Drug", viability: 50 }, excluded: false },
      { rowId: "r5", values: { treatment: "Drug", viability: 54 }, excluded: false },
    ],
  })

  function bars(engine: EngineResult, overrides: Record<string, unknown> = {}) {
    const figure = buildFigure(
      spec({
        analysis: { test: "none", groupColumn: "treatment", responseColumns: ["viability"] },
        figure: { kind: "bar-scatter-error", x: {}, y: {}, errorBars: "sd", ...overrides },
      }),
      engine
    )
    return figure.data.find((t) => t.type === "bar") as { y: number[] }
  }

  it("leaves an excluded replicate out of the bar it is excluded from", () => {
    // 11, not 74: averaging the excluded 200 in is how the results table's mean
    // moved while the bar beside it did not.
    expect(bars(withOutlier).y[0]).toBeCloseTo(11, 10)
    expect(bars(withOutlier).y[1]).toBeCloseTo(52, 10)
  })

  it("still draws the excluded replicate, greyed", () => {
    const figure = buildFigure(
      spec({
        analysis: { test: "none", groupColumn: "treatment", responseColumns: ["viability"] },
        figure: { kind: "bar-scatter-error", x: {}, y: {}, errorBars: "sd" },
      }),
      withOutlier
    )
    const points = figure.data.filter((t) => t.mode === "markers")
    const ys = points.flatMap((t) => t.y as number[])
    expect(ys).toContain(200)
    const symbols = points.flatMap((t) => (t.marker as { symbol: string[] }).symbol)
    expect(symbols).toContain("circle-open")
  })

  it("hides the excluded mark when asked, without moving the bar", () => {
    const hidden = bars(withOutlier, { showExcludedPoints: false })
    expect(hidden.y[0]).toBeCloseTo(11, 10)
    const figure = buildFigure(
      spec({
        analysis: { test: "none", groupColumn: "treatment", responseColumns: ["viability"] },
        figure: {
          kind: "bar-scatter-error", x: {}, y: {}, errorBars: "sd", showExcludedPoints: false,
        },
      }),
      withOutlier
    )
    expect(figure.data.filter((t) => t.mode === "markers").flatMap((t) => t.y as number[]))
      .not.toContain(200)
  })

  it("prefers the engine's descriptives over re-deriving them", () => {
    // A mean the renderer could not possibly compute from plotData, so a bar
    // drawn at it proves the descriptive row is what was read.
    const withDescriptives = result({
      ...withOutlier,
      descriptives: [
        { column: "Control", group: null, n: 2, mean: 999, sd: 1, sem: 1, median: 999,
          q1: 998, q3: 1000, iqr: 2, min: 997, max: 1001, cv: 0, geometricMean: null,
          skewness: null, kurtosis: null, ci95Low: 990, ci95High: 1008 },
      ] as EngineResult["descriptives"],
    })
    expect(bars(withDescriptives).y[0]).toBe(999)
    // ...and the interval the engine reported, not one recomputed beside it.
    const ci = buildFigure(
      spec({
        analysis: { test: "none", groupColumn: "treatment", responseColumns: ["viability"] },
        figure: { kind: "bar-scatter-error", x: {}, y: {}, errorBars: "ci95" },
      }),
      withDescriptives
    ).data.find((t) => t.type === "bar") as { error_y: { array: number[]; arrayminus: number[] } }
    expect(ci.error_y.arrayminus[0]).toBeCloseTo(9, 10)
    expect(ci.error_y.array[0]).toBeCloseTo(9, 10)
  })

  it("keeps an excluded replicate out of the box's quartiles", () => {
    const figure = buildFigure(
      spec({
        analysis: { test: "none", groupColumn: "treatment", responseColumns: ["viability"] },
        figure: { kind: "box", x: {}, y: {}, errorBars: "none" },
      }),
      withOutlier
    )
    const box = figure.data.find((t) => t.type === "box" && t.name === "Control") as {
      y: number[]
    }
    expect(box.y).toEqual([10, 12])
    // Present, but visually distinct and outside the distribution.
    const grey = figure.data.find((t) => t.name === "Control excluded") as {
      y: number[]
      marker: { color: string; symbol: string }
    }
    expect(grey.y).toEqual([200])
    expect(grey.marker.symbol).toBe("circle-open")
    expect(grey.marker.color).not.toBe(
      (box as unknown as { marker: { color: string } }).marker.color
    )
  })

  it("keeps an excluded replicate out of a violin too", () => {
    const figure = buildFigure(
      spec({
        analysis: { test: "none", groupColumn: "treatment", responseColumns: ["viability"] },
        figure: { kind: "violin", x: {}, y: {}, errorBars: "none" },
      }),
      withOutlier
    )
    const violin = figure.data.find((t) => t.type === "violin" && t.name === "Control") as {
      y: number[]
    }
    expect(violin.y).toEqual([10, 12])
  })

  it("does not merge two heatmap cells whose factor levels contain spaces", () => {
    // "Plate A" x "1" and "Plate" x "A 1" are the same string once joined by a
    // space. A collision-proof delimiter keeps them apart.
    const plates = result({
      plotData: [
        { rowId: "p1", values: { row: "Plate A", col: "1", v: 10 }, excluded: false },
        { rowId: "p2", values: { row: "Plate", col: "A 1", v: 90 }, excluded: false },
      ],
    })
    const trace = buildFigure(
      spec({
        analysis: {
          test: "none", groupColumn: "row", secondFactorColumn: "col", responseColumns: ["v"],
        },
        figure: { kind: "heatmap", x: {}, y: {}, errorBars: "none" },
      }),
      plates
    ).data[0] as { z: (number | null)[][]; y: string[]; x: string[] }
    const cell = (r: string, c: string) => trace.z[trace.y.indexOf(r)][trace.x.indexOf(c)]
    expect(cell("Plate A", "1")).toBe(10)
    expect(cell("Plate", "A 1")).toBe(90)
    // Averaged together the pair would both read 50.
    expect(cell("Plate A", "1")).not.toBe(cell("Plate", "A 1"))
  })

  it("keeps an excluded row out of the heatmap cell mean whatever the flag says", () => {
    const cells = result({
      plotData: [
        { rowId: "h1", values: { row: "A", col: "1", v: 10 }, excluded: false },
        { rowId: "h2", values: { row: "A", col: "1", v: 90 }, excluded: true },
      ],
    })
    for (const showExcludedPoints of [true, false]) {
      const trace = buildFigure(
        spec({
          analysis: {
            test: "none", groupColumn: "row", secondFactorColumn: "col", responseColumns: ["v"],
          },
          figure: { kind: "heatmap", x: {}, y: {}, errorBars: "none", showExcludedPoints },
        }),
        cells
      ).data[0] as { z: number[][] }
      expect(trace.z[0][0], `showExcludedPoints=${showExcludedPoints}`).toBe(10)
    }
  })

  it("draws an ellipse annotation as a shape Plotly understands", () => {
    const figure = buildFigure(
      spec({
        analysis: { test: "none", groupColumn: "treatment", responseColumns: ["viability"] },
        figure: {
          kind: "bar-scatter-error", x: {}, y: {}, errorBars: "none",
          annotations: [
            {
              kind: "shape", id: "e1", shape: "ellipse",
              x1: 0, y1: 0, x2: 1, y2: 1, colour: "#000000",
            },
          ],
        },
      }),
      result()
    )
    const shapes = figure.layout.shapes as Record<string, unknown>[]
    // "ellipse" is not in Plotly's circle/rect/line/path, so it drew nothing.
    expect(shapes.some((s) => s.type === "circle")).toBe(true)
    expect(shapes.some((s) => s.type === "ellipse")).toBe(false)
  })

  it("summarises replicates at a shared timepoint into one vertex with whiskers", () => {
    const triplicates = result({
      plotData: [
        { rowId: "t1", values: { day: 1, signal: 10 }, excluded: false },
        { rowId: "t2", values: { day: 1, signal: 12 }, excluded: false },
        { rowId: "t3", values: { day: 1, signal: 14 }, excluded: false },
        { rowId: "t4", values: { day: 2, signal: 20 }, excluded: false },
        { rowId: "t5", values: { day: 2, signal: 22 }, excluded: false },
        { rowId: "t6", values: { day: 2, signal: 24 }, excluded: false },
      ],
    })
    const trace = buildFigure(
      spec({
        analysis: { test: "none", groupColumn: "day", responseColumns: ["signal"] },
        figure: { kind: "line-timecourse", x: {}, y: {}, errorBars: "sd" },
      }),
      triplicates
    ).data[0] as {
      x: number[]
      y: number[]
      error_y: { array: number[]; arrayminus: number[] }
    }
    // Two vertices, not six: a six-vertex zigzag is what "no aggregation" drew.
    expect(trace.x).toEqual([1, 2])
    expect(trace.y).toEqual([12, 22])
    expect(trace.error_y.array[0]).toBeCloseTo(2, 10)
    expect(trace.error_y.arrayminus[0]).toBeCloseTo(2, 10)
  })

  it("centres a timecourse on the median under an IQR label", () => {
    const skewed = result({
      plotData: [
        { rowId: "s1", values: { day: 1, signal: 1 }, excluded: false },
        { rowId: "s2", values: { day: 1, signal: 2 }, excluded: false },
        { rowId: "s3", values: { day: 1, signal: 99 }, excluded: false },
      ],
    })
    const trace = buildFigure(
      spec({
        analysis: { test: "none", groupColumn: "day", responseColumns: ["signal"] },
        figure: { kind: "line-timecourse", x: {}, y: {}, errorBars: "iqr" },
      }),
      skewed
    ).data[0] as { y: number[] }
    expect(trace.y[0]).toBe(2)
  })

  it("labels a fit's confidence band from alpha, and hides it when untoggled", () => {
    const fitted = result({
      curveFit: {
        model: "4PL",
        parameters: [],
        rSquared: 0.99,
        curve: { x: [1, 2], y: [1, 2] },
        confidenceBand: { x: [1, 2], lower: [0, 1], upper: [2, 3] },
      } as unknown as EngineResult["curveFit"],
    })
    const build = (alpha: number, showConfidenceBands: boolean) =>
      buildFigure(
        spec({
          analysis: { test: "none", alpha, groupColumn: null, responseColumns: ["a", "b"] },
          figure: {
            kind: "dose-response", x: {}, y: {}, errorBars: "none", showConfidenceBands,
          },
        }),
        fitted
      ).data
    expect(build(0.05, true).some((t) => t.name === "95% CI")).toBe(true)
    expect(build(0.01, true).some((t) => t.name === "99% CI")).toBe(true)
    // The schema says this flag governs the fit's band as well as KM's.
    expect(build(0.05, false).some((t) => String(t.name).endsWith("CI"))).toBe(false)
  })

  it("labels a Kaplan-Meier band from alpha too", () => {
    const survival = result({
      survival: {
        groups: [
          {
            label: "Arm A", n: 3, time: [1, 2], survival: [1, 0.5],
            lower: [0.9, 0.3], upper: [1, 0.7], censoredTimes: [],
          },
        ],
      } as unknown as EngineResult["survival"],
    })
    const build = (alpha: number) =>
      buildFigure(
        spec({
          analysis: { test: "kaplan-meier", alpha, groupColumn: null, responseColumns: ["t"] },
          figure: { kind: "kaplan-meier", x: {}, y: {}, errorBars: "none" },
        }),
        survival
      ).data
    expect(build(0.05).some((t) => t.name === "Arm A 95% CI")).toBe(true)
    expect(build(0.1).some((t) => t.name === "Arm A 90% CI")).toBe(true)
  })
})

describe("a summarised vertex still links back to the spreadsheet", () => {
  it("resolves a time-course mean to one of its replicates", () => {
    const triplicates = result({
      plotData: [
        { rowId: "t1", values: { day: 1, signal: 10 }, excluded: false },
        { rowId: "t2", values: { day: 1, signal: 12 }, excluded: false },
      ],
    })
    const trace = buildFigure(
      spec({
        analysis: { test: "none", groupColumn: "day", responseColumns: ["signal"] },
        figure: { kind: "line-timecourse", x: {}, y: {}, errorBars: "sd" },
      }),
      triplicates
    ).data[0]
    const customdata = (trace.customdata as string[][])[0]
    expect(customdata).toEqual(["t1", "t2"])
    expect(rowIdAtPoint([{ customdata }], triplicates)).toBe("t1")
  })
})
