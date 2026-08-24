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
    // The name is back on `text` because customdata now carries the bar's rows
    // (T0.34), so the guard is `textposition`, which is what actually stops
    // Plotly painting it, and the hover reading the name from there.
    expect(bar.text).toEqual(["Control", "Treated"])
    expect(bar.textposition).toBe("none")
    expect(bar.hovertemplate).toContain("%{text}")
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

/* ── Two-factor bars ───────────────────────────────────────────────────────*/

/**
 * A real two-way design: 2 treatments × 2 timepoints × 3 replicates.
 *
 * Cell means are 10, 20, 40, 80, all distinct, so a figure that collapsed the
 * second factor cannot accidentally produce the right numbers.
 */
const twoWay = result({
  plotData: [
    { rowId: "a1", values: { treatment: "Ctrl", time: "24h", y: 9 }, excluded: false },
    { rowId: "a2", values: { treatment: "Ctrl", time: "24h", y: 10 }, excluded: false },
    { rowId: "a3", values: { treatment: "Ctrl", time: "24h", y: 11 }, excluded: false },
    { rowId: "b1", values: { treatment: "Ctrl", time: "48h", y: 19 }, excluded: false },
    { rowId: "b2", values: { treatment: "Ctrl", time: "48h", y: 20 }, excluded: false },
    { rowId: "b3", values: { treatment: "Ctrl", time: "48h", y: 21 }, excluded: false },
    { rowId: "c1", values: { treatment: "Drug", time: "24h", y: 38 }, excluded: false },
    { rowId: "c2", values: { treatment: "Drug", time: "24h", y: 40 }, excluded: false },
    { rowId: "c3", values: { treatment: "Drug", time: "24h", y: 42 }, excluded: false },
    { rowId: "d1", values: { treatment: "Drug", time: "48h", y: 76 }, excluded: false },
    { rowId: "d2", values: { treatment: "Drug", time: "48h", y: 80 }, excluded: false },
    { rowId: "d3", values: { treatment: "Drug", time: "48h", y: 84 }, excluded: false },
  ],
})

function twoWaySpec(kind: "grouped-bar" | "stacked-bar", figureOverrides = {}) {
  return spec({
    analysis: {
      test: "anova-two-way",
      groupColumn: "treatment",
      secondFactorColumn: "time",
      responseColumns: ["y"],
    },
    figure: { kind, x: {}, y: {}, errorBars: "sd", ...figureOverrides },
  })
}

describe("grouped bar draws the second factor", () => {
  // bootstrap.ts picks grouped-bar as the DEFAULT figure for a two-way ANOVA,
  // so a grouped bar that collapses the second factor is a two-way analysis
  // whose default figure asserts a one-way comparison.
  const bars = (f: ReturnType<typeof buildFigure>) => f.data.filter((t) => t.type === "bar")

  it("emits one bar trace per second-factor level, not one in total", () => {
    const figure = buildFigure(twoWaySpec("grouped-bar"), twoWay)
    expect(bars(figure).map((t) => t.name)).toEqual(["24h", "48h"])
  })

  it("puts every primary level on every level's trace", () => {
    const figure = buildFigure(twoWaySpec("grouped-bar"), twoWay)
    // Two groups, both present in both traces: that is what makes it grouped
    // rather than two half-populated charts side by side.
    for (const trace of bars(figure)) expect(trace.x).toEqual([0, 1])
    expect((figure.layout.xaxis as { ticktext: string[] }).ticktext).toEqual(["Ctrl", "Drug"])
  })

  it("carries the per-CELL mean, not the group mean", () => {
    const figure = buildFigure(twoWaySpec("grouped-bar"), twoWay)
    // Group means would be 15 and 60. Cell means are these.
    expect(bars(figure)[0].y).toEqual([10, 40])
    expect(bars(figure)[1].y).toEqual([20, 80])
  })

  it("draws per-cell error bars, sized from the cell", () => {
    const figure = buildFigure(twoWaySpec("grouped-bar"), twoWay)
    const sd = (vals: number[]) => {
      const m = vals.reduce((a, b) => a + b, 0) / vals.length
      return Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / (vals.length - 1))
    }
    const first = bars(figure)[0].error_y as { array: number[]; arrayminus: number[] }
    expect(first.array[0]).toBeCloseTo(sd([9, 10, 11]), 10)
    expect(first.array[1]).toBeCloseTo(sd([38, 40, 42]), 10)
    // Symmetric SD, but still written as an asymmetric pair, so a later switch
    // to IQR cannot silently mirror the wrong half.
    expect(first.arrayminus).toEqual(first.array)
  })

  it("actually groups: the sub-bars partition the band and do not overlap", () => {
    const figure = buildFigure(twoWaySpec("grouped-bar"), twoWay)
    // `barmode: "group"` was a no-op with one trace. It is set AND the geometry
    // is explicit, because the point overlay is positioned from these numbers.
    expect(figure.layout.barmode).toBe("group")
    const spans = bars(figure).map((t) => [t.offset as number, (t.offset as number) + (t.width as number)])
    expect(spans[0][1]).toBeCloseTo(spans[1][0], 10)
    expect(spans[0][0]).toBeCloseTo(-0.4, 10)
    expect(spans[1][1]).toBeCloseTo(0.4, 10)
  })

  it("puts each cell's replicates over their own sub-bar", () => {
    const figure = buildFigure(twoWaySpec("grouped-bar"), twoWay)
    const points = figure.data.filter((t) => t.type === "scatter" && t.mode === "markers")
    expect(points).toHaveLength(2)
    const at = (name: string) => points.find((t) => String(t.name).startsWith(name))!
    // 24h occupies [-0.4, 0) of each group's band, 48h occupies (0, 0.4].
    for (const x of at("24h").x as number[]) {
      const withinGroup = x - Math.round(x)
      expect(withinGroup).toBeGreaterThan(-0.4)
      expect(withinGroup).toBeLessThan(0)
    }
    for (const x of at("48h").x as number[]) {
      const withinGroup = x - Math.round(x)
      expect(withinGroup).toBeGreaterThan(0)
      expect(withinGroup).toBeLessThan(0.4)
    }
  })

  it("keeps every replicate's row id on its mark", () => {
    const figure = buildFigure(twoWaySpec("grouped-bar"), twoWay)
    const ids = figure.data
      .filter((t) => t.type === "scatter")
      .flatMap((t) => t.customdata as string[])
    expect(ids.sort()).toEqual(twoWay.plotData.map((r) => r.rowId).sort())
  })

  it("greys an excluded replicate without moving its cell's bar", () => {
    const withExcluded = result({
      plotData: twoWay.plotData.map((r) => (r.rowId === "a1" ? { ...r, excluded: true } : r)),
    })
    const shown = buildFigure(twoWaySpec("grouped-bar"), withExcluded)
    const hidden = buildFigure(
      twoWaySpec("grouped-bar", { showExcludedPoints: false }),
      withExcluded
    )
    // The cell mean is 10.5 either way — computed from {10, 11}, never from {9}.
    expect((bars(shown)[0].y as number[])[0]).toBeCloseTo(10.5, 10)
    expect(bars(hidden)[0].y).toEqual(bars(shown)[0].y)
    // Drawn, greyed, not removed (§8.1).
    const marker = figureMarker(shown, "24h")
    expect(marker.symbol).toContain("circle-open")
    expect(hidden.data.filter((t) => t.type === "scatter").flatMap((t) => t.customdata as string[]))
      .not.toContain("a1")
  })

  function figureMarker(f: ReturnType<typeof buildFigure>, level: string) {
    const trace = f.data.find((t) => t.type === "scatter" && String(t.name).startsWith(level))!
    return trace.marker as { symbol: string[] }
  }

  it("falls back to a plain bar-with-points when no second factor is mapped", () => {
    // Naming the same column twice is a one-factor design described twice, and
    // splitting on it would draw one occupied cell per group and one empty.
    for (const second of [null, "treatment"]) {
      const figure = buildFigure(
        spec({
          analysis: {
            test: "none",
            groupColumn: "treatment",
            secondFactorColumn: second,
            responseColumns: ["y"],
          },
          figure: { kind: "grouped-bar", x: {}, y: {}, errorBars: "sd" },
        }),
        twoWay
      )
      expect(bars(figure)).toHaveLength(1)
      expect(bars(figure)[0].y).toEqual([15, 60])
      expect(figure.data.some((t) => t.type === "scatter" && t.mode === "markers")).toBe(true)
    }
  })
})

describe("stacked bar is a composition, not stacked means", () => {
  const bars = (f: ReturnType<typeof buildFigure>) => f.data.filter((t) => t.type === "bar")

  it("emits one trace per component level and stacks them", () => {
    const figure = buildFigure(twoWaySpec("stacked-bar"), twoWay)
    expect(bars(figure).map((t) => t.name)).toEqual(["24h", "48h"])
    expect(figure.layout.barmode).toBe("stack")
  })

  it("segments are SUMS, so the stack height is the group total", () => {
    const figure = buildFigure(twoWaySpec("stacked-bar"), twoWay)
    // Stacking means would give 10+20 = 30 and 40+80 = 120, numbers nothing
    // measured. The sums are the totals actually observed.
    expect(bars(figure)[0].y).toEqual([30, 120])
    expect(bars(figure)[1].y).toEqual([60, 240])
    const totals = [0, 1].map((i) => bars(figure).reduce((a, t) => a + (t.y as number[])[i], 0))
    expect(totals).toEqual([90, 360])
  })

  it("sits on a category axis so the group names actually draw", () => {
    // It passed group NAMES as x while the layout declared the axis "linear",
    // which draws an empty numeric frame.
    const figure = buildFigure(twoWaySpec("stacked-bar"), twoWay)
    expect(bars(figure)[0].x).toEqual(["Ctrl", "Drug"])
    expect((figure.layout.xaxis as { type: string }).type).toBe("category")
  })

  it("draws no error bars and does not claim any", () => {
    // A whisker on a segment floating mid-stack measures a part against a
    // baseline made of other parts.
    const figure = buildFigure(twoWaySpec("stacked-bar"), twoWay)
    expect(figure.data.some((t) => t.error_y !== undefined || t.error_x !== undefined)).toBe(false)
    expect((figure.layout.title as { text: string }).text).not.toContain("mean ±")
  })

  it("composes over the response columns when there is no second factor", () => {
    const figure = buildFigure(
      spec({
        analysis: { test: "none", groupColumn: "treatment", responseColumns: ["y", "z"] },
        figure: { kind: "stacked-bar", x: {}, y: {}, errorBars: "sd" },
      }),
      result({
        plotData: [
          { rowId: "p1", values: { treatment: "Ctrl", y: 1, z: 4 }, excluded: false },
          { rowId: "p2", values: { treatment: "Drug", y: 2, z: 8 }, excluded: false },
        ],
      })
    )
    expect(bars(figure).map((t) => t.name)).toEqual(["y", "z"])
    expect(bars(figure)[0].y).toEqual([1, 2])
    expect(bars(figure)[1].y).toEqual([4, 8])
  })

  it("treats a component absent from a group as zero, not as a gap", () => {
    const sparse = result({
      plotData: [
        { rowId: "s1", values: { treatment: "Ctrl", time: "24h", y: 5 }, excluded: false },
        { rowId: "s2", values: { treatment: "Drug", time: "48h", y: 7 }, excluded: false },
      ],
    })
    const figure = buildFigure(twoWaySpec("stacked-bar"), sparse)
    // In a composition "none of this component" is a real answer.
    expect(bars(figure)[0].y).toEqual([5, 0])
    expect(bars(figure)[1].y).toEqual([0, 7])
  })

  it("never counts an excluded row into a segment", () => {
    const withExcluded = result({
      plotData: twoWay.plotData.map((r) => (r.rowId === "a1" ? { ...r, excluded: true } : r)),
    })
    const shown = buildFigure(twoWaySpec("stacked-bar"), withExcluded)
    const hidden = buildFigure(
      twoWaySpec("stacked-bar", { showExcludedPoints: false }),
      withExcluded
    )
    expect((bars(shown)[0].y as number[])[0]).toBe(21)
    expect(bars(hidden)[0].y).toEqual(bars(shown)[0].y)
  })
})

/* ── Secondary axis ────────────────────────────────────────────────────────*/

describe("a series marked right lands on a right-hand axis", () => {
  const dual = result({
    plotData: [
      { rowId: "t1", values: { day: 1, od: 0.1, rfu: 1200, treatment: "Ctrl" }, excluded: false },
      { rowId: "t2", values: { day: 2, od: 0.4, rfu: 4800, treatment: "Ctrl" }, excluded: false },
      { rowId: "t3", values: { day: 3, od: 0.9, rfu: 9100, treatment: "Ctrl" }, excluded: false },
    ],
  })

  function dualSpec(kind: string, right: string, y2: unknown = null) {
    return spec({
      analysis: { test: "none", groupColumn: "day", responseColumns: ["od", "rfu"] },
      figure: {
        kind,
        x: {},
        y: {},
        y2,
        errorBars: "none",
        series: [{ key: right, axis: "right" }],
      },
    })
  }

  it("routes the marked series on a time course, and only that series", () => {
    const figure = buildFigure(dualSpec("line-timecourse", "rfu"), dual)
    const byName = Object.fromEntries(figure.data.map((t) => [t.name, t.yaxis]))
    expect(byName).toEqual({ od: "y", rfu: "y2" })
  })

  it("creates the axis even when the spec carries no y2", () => {
    // Targeting an axis Plotly was never told about drops the trace from the
    // figure entirely — worse than ignoring the request.
    const figure = buildFigure(dualSpec("line-timecourse", "rfu"), dual)
    expect(figure.layout.y2).toBeUndefined()
    const y2 = figure.layout.yaxis2 as { overlaying: string; side: string }
    expect(y2).toBeDefined()
    expect(y2.overlaying).toBe("y")
    expect(y2.side).toBe("right")
  })

  it("keeps the spec's own y2 when there is one", () => {
    const figure = buildFigure(
      dualSpec("line-timecourse", "rfu", { label: "Fluorescence", unit: "RFU" }),
      dual
    )
    const title = (figure.layout.yaxis2 as { title: { text: string } }).title
    expect(title.text).toBe("Fluorescence (RFU)")
  })

  it("routes an area band and rests it on its own zero", () => {
    const figure = buildFigure(dualSpec("area", "rfu"), dual)
    const rfu = figure.data.find((t) => t.name === "rfu")!
    expect(rfu.yaxis).toBe("y2")
    // "tonexty" would stack it onto the primary band, whose scale it does not
    // share. The primary band still rests on zero itself.
    expect(rfu.fill).toBe("tozeroy")
    expect(figure.data.find((t) => t.name === "od")!.fill).toBe("tozeroy")
  })

  it("routes both of a Q-Q column's traces together", () => {
    const figure = buildFigure(dualSpec("qq", "rfu"), dual)
    const rfuTraces = figure.data.filter((t) => String(t.name).startsWith("rfu"))
    expect(rfuTraces).toHaveLength(2)
    // A reference line left behind on the primary axis stops being a reference.
    for (const t of rfuTraces) expect(t.yaxis).toBe("y2")
    for (const t of figure.data.filter((t) => String(t.name).startsWith("od"))) {
      expect(t.yaxis).toBe("y")
    }
  })

  it.each(["bar-scatter-error", "stacked-bar", "horizontal-bar", "box", "roc", "pie-composition"])(
    "refuses the request out loud on a %s instead of silently ignoring it",
    (kind) => {
      const figure = buildFigure(dualSpec(kind, "rfu"), dual)
      expect(figure.data.some((t) => t.yaxis === "y2")).toBe(false)
      expect(figure.layout.yaxis2).toBeUndefined()
      // The refusal is on the figure, where it survives export.
      expect((figure.layout.title as { text: string }).text).toContain(
        "secondary axis not available"
      )
    }
  )

  it("says nothing when no series asked", () => {
    const figure = buildFigure(
      spec({ figure: { kind: "bar-scatter-error", x: {}, y: {}, errorBars: "sd" } }),
      result()
    )
    expect((figure.layout.title as { text: string }).text).not.toContain("secondary axis")
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
    "pie-composition", "scatter-3d", "surface-3d", "dose-response",
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
      // The bar is an AGGREGATING mark, so it carries the rows it aggregated —
      // the group name it used to carry there could never open anything.
      const bars = f.data.filter((t) => t.type === "bar")
      expect(bars.every((t) => (t.customdata as unknown[]).every(Array.isArray))).toBe(true)
    },
    // `everyKind` names one column for both factors, which is a one-factor
    // design described twice, so the honest drawing is the single-factor bar
    // with its replicate overlay. The real grouping is asserted against a real
    // two-way fixture in "grouped bar draws the second factor".
    "grouped-bar": (f) => {
      expect(f.data.some((t) => t.type === "bar")).toBe(true)
      expect(f.data.some((t) => t.type === "scatter" && t.mode === "markers")).toBe(true)
      const bars = f.data.filter((t) => t.type === "bar")
      expect(bars.every((t) => (t.customdata as unknown[]).every(Array.isArray))).toBe(true)
    },
    "stacked-bar": (f) => {
      // One trace per component, or `barmode: "stack"` has nothing to stack.
      const segments = f.data.filter((t) => t.type === "bar")
      expect(segments.length).toBeGreaterThan(1)
      expect(f.layout.barmode).toBe("stack")
      // A composition, so no whisker anywhere on it.
      expect(segments.some((t) => t.error_y !== undefined)).toBe(false)
    },
    "horizontal-bar": (f) =>
      expect(f.data.some((t) => t.type === "bar" && t.orientation === "h")).toBe(true),
    box: (f) => {
      expect(f.data.some((t) => t.type === "box")).toBe(true)
      // Slot 0 of a box trace is the whole row set, because that is the slot
      // Plotly reads for a click on the BODY (one box per trace here).
      for (const t of f.data.filter((x) => x.type === "box")) {
        expect(Array.isArray((t.customdata as unknown[])[0])).toBe(true)
        // The per-point hover label lives on `text` now, indexed by point.
        expect(String(t.hovertemplate)).toContain("%{text}")
      }
    },
    violin: (f) => {
      expect(f.data.some((t) => t.type === "violin")).toBe(true)
      for (const t of f.data.filter((x) => x.type === "violin")) {
        expect(Array.isArray((t.customdata as unknown[])[0])).toBe(true)
      }
      // The idiom is not "a violin": it is a density that stops where the data
      // stops. Plotly's default runs the kernel past the extremes, which draws
      // density below zero for a concentration, a count or a time.
      expect(f.data.filter((t) => t.type === "violin").every((t) => t.spanmode === "hard")).toBe(
        true
      )
    },
    "line-timecourse": (f) => {
      expect(f.data.some((t) => String(t.mode).includes("lines"))).toBe(true)
      // "line/time-course WITH ERROR BARS" is the requirement verbatim.
      expect(f.data.some((t) => t.error_y !== undefined)).toBe(true)
    },
    histogram: (f) => {
      // Binned here, not by Plotly: `type: "histogram"` hands back a bar with
      // no route to the rows inside it, which is a Tier 0 break.
      const bars = f.data.filter((t) => t.type === "bar")
      expect(bars.length).toBeGreaterThan(0)
      expect(f.layout.barmode).toBe("overlay")
      expect(bars.every((t) => Array.isArray(t.customdata))).toBe(true)
      // Contiguous bars: a histogram with gaps is a bar chart of categories.
      expect(bars.every((t) => Array.isArray(t.width))).toBe(true)
    },
    heatmap: (f) => expect(f.data.some((t) => t.type === "heatmap")).toBe(true),
    "correlation-matrix": (f) => expect(f.data.some((t) => t.type === "heatmap")).toBe(true),
    "pie-composition": (f) => expect(f.data.some((t) => t.type === "pie")).toBe(true),
    "scatter-3d": (f) => expect(f.data.some((t) => t.type === "scatter3d")).toBe(true),
    "surface-3d": (f) => expect(f.data.some((t) => t.type === "surface")).toBe(true),
    forest: (f) => expect(f.data.some((t) => t.error_x !== undefined)).toBe(true),
    ecdf: (f) => expect(f.data.some((t) => (t.line as { shape?: string })?.shape === "hv")).toBe(true),
    roc: (f) => expect(f.data.some((t) => String(t.name).startsWith("ROC"))).toBe(true),
    area: (f) => expect(f.data.some((t) => t.fill !== undefined)).toBe(true),
    volcano: (f) => {
      expect(f.data.some((t) => t.mode === "markers")).toBe(true)
      // Nothing in this fixture clears alpha, and a label trace with nothing to
      // say would be a mark standing for no finding. The labels themselves are
      // exercised on volcano-shaped data below.
      expect(f.data.some((t) => t.mode === "text")).toBe(false)
    },
    "dose-response": (f) => {
      // A 4PL on a linear dose axis crushes the low-dose half into the margin,
      // which is the half the EC50 comes from.
      expect((f.layout.xaxis as { type: string }).type).toBe("log")
      expect(f.data.some((t) => t.mode === "markers")).toBe(true)
    },
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
    // `histogram` used to sit here, which is how it shipped with no row link at
    // all. A bar covers many rows, so it carries all of their ids — the same
    // convention a stacked segment and a summarised time-course vertex use.
    const aggregate = new Set([
      "heatmap", "correlation-matrix", "pie-composition", "ecdf", "qq",
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

  it.each(KINDS)("never points a %s trace at an axis that was not created", (kind) => {
    // Plotly drops a trace whose `yaxis` names an axis the layout does not
    // declare, so the figure loses a whole series with nothing to show for it.
    // Either the kind routes the request and the axis exists, or it declines
    // and no trace asks — never the third state.
    for (const y2 of [null, { label: "Second" }]) {
      const figure = buildFigure(
        spec({
          analysis: {
            test: "none", groupColumn: "treatment", secondFactorColumn: "treatment",
            responseColumns: ["a", "b", "c"],
          },
          figure: {
            kind, x: {}, y: {}, y2, errorBars: "sd",
            series: [{ key: "b", axis: "right" }, { key: "Ctrl", axis: "right" }],
          },
        }),
        xy
      )
      const targets = new Set(figure.data.map((t) => t.yaxis).filter(Boolean))
      if (targets.has("y2")) expect(figure.layout.yaxis2, kind).toBeDefined()
      // Nothing may name a third axis at all; only y and y2 are ever built.
      expect([...targets].every((t) => t === "y" || t === "y2"), kind).toBe(true)
    }
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

/* ── The four idioms the kinds were missing ───────────────────────────────
   Each of these asserts a scientific claim about the picture, not the shape of
   the object that produces it: where the density stops, which axis a fit lands
   on, whether a reader can get names off the plot, whether a bar leads back to
   rows. */

describe("violin: the density stops where the data stops", () => {
  // Times, counts and concentrations are non-negative by construction. Plotly's
  // default spanmode runs the kernel a bandwidth past the extremes, so a violin
  // of a quantity floored at zero draws visible density below zero.
  const nonNegative = result({
    plotData: [0.2, 0.4, 0.5, 0.6, 12, 0.3, 0.35, 0.45].map((v, i) => ({
      rowId: `n${i}`,
      values: { treatment: i % 2 ? "Drug" : "Ctrl", conc: v },
      excluded: false,
    })),
  })
  const violinSpec = (figure: Record<string, unknown> = {}) =>
    spec({
      analysis: {
        test: "none",
        groupColumn: "treatment",
        responseColumns: ["conc"],
      },
      figure: { kind: "violin", x: {}, y: {}, errorBars: "none", ...figure },
    })

  it("truncates to the observed range by default", () => {
    const violins = buildFigure(violinSpec(), nonNegative).data.filter(
      (t) => t.type === "violin"
    )
    expect(violins.length).toBeGreaterThan(0)
    for (const t of violins) expect(t.spanmode).toBe("hard")
  })

  it("lets the soft tail back for a genuinely unbounded quantity, and says so", () => {
    const figure = buildFigure(violinSpec({ violinTruncate: false }), nonNegative)
    expect(figure.data.filter((t) => t.type === "violin").every((t) => t.spanmode === "soft")).toBe(
      true
    )
    expect((figure.layout.title as { text: string }).text).toContain(
      "density extends past the observed range"
    )
  })

  it("draws the median/IQR box inside the density by default, and drops it when asked", () => {
    const withBox = buildFigure(violinSpec(), nonNegative).data.find((t) => t.type === "violin")
    expect((withBox!.box as { visible: boolean }).visible).toBe(true)
    const without = buildFigure(violinSpec({ violinInnerBox: false }), nonNegative).data.find(
      (t) => t.type === "violin"
    )
    expect(without!.box).toBeUndefined()
  })

  it("mirrors two levels of a second factor about one tick", () => {
    const paired = result({
      plotData: Array.from({ length: 12 }, (_, i) => ({
        rowId: `p${i}`,
        values: {
          treatment: i % 2 ? "Drug" : "Ctrl",
          sex: i % 4 < 2 ? "F" : "M",
          conc: 1 + (i % 5) * 0.4,
        },
        excluded: false,
      })),
    })
    const figure = buildFigure(
      spec({
        analysis: {
          test: "none",
          groupColumn: "treatment",
          secondFactorColumn: "sex",
          responseColumns: ["conc"],
        },
        figure: { kind: "violin", x: {}, y: {}, errorBars: "none", violinSplit: true },
      }),
      paired
    )
    const violins = figure.data.filter((t) => t.type === "violin")
    // One trace per (level, group) — two levels over two groups. It used to be
    // one trace per level holding both groups' violins, which drew the same
    // picture but made a body click resolve to a row from the wrong group
    // (T0.34): Plotly indexes a body's customdata by its position in its trace.
    expect(violins).toHaveLength(4)
    expect(new Set(violins.map((t) => t.side))).toEqual(new Set(["negative", "positive"]))
    // Halves normalised apart would make three replicates as wide as thirty.
    expect(new Set(violins.map((t) => t.scalegroup)).size).toBe(1)
    // Both halves still sit over the group ticks, not over one collapsed tick.
    expect(new Set(violins.flatMap((t) => t.x as string[]))).toEqual(new Set(["Ctrl", "Drug"]))
    // Splitting the traces must not split the legend: one entry per LEVEL.
    expect(violins.filter((t) => t.showlegend !== false)).toHaveLength(2)
    expect(new Set(violins.map((t) => t.legendgroup))).toEqual(
      new Set(violins.map((t) => t.name))
    )
  })

  it("refuses a split it cannot draw out loud rather than silently drawing one violin", () => {
    const figure = buildFigure(
      spec({
        analysis: {
          test: "none",
          groupColumn: "treatment",
          responseColumns: ["conc"],
        },
        figure: { kind: "violin", x: {}, y: {}, errorBars: "none", violinSplit: true },
      }),
      nonNegative
    )
    expect(figure.data.every((t) => t.side === undefined)).toBe(true)
    expect((figure.layout.title as { text: string }).text).toContain("split violin needs")
  })

  it("says so when violin settings are asked for on a kind that is not a violin", () => {
    const figure = buildFigure(
      spec({ figure: { kind: "box", x: {}, y: {}, errorBars: "none", violinSplit: true } }),
      nonNegative
    )
    expect((figure.layout.title as { text: string }).text).toContain(
      "violin settings not applied"
    )
  })
})

describe("dose-response: the dose axis is logarithmic unless someone says otherwise", () => {
  const doses = result({
    plotData: [0, 0.01, 0.1, 1, 10, 100].map((d, i) => ({
      rowId: `d${i}`,
      values: { dose: d, signal: 100 / (1 + Math.pow(10 / Math.max(d, 1e-6), 1)) },
      excluded: false,
    })),
  })
  const drSpec = (x: Record<string, unknown>) =>
    spec({
      analysis: { test: "none", groupColumn: null, responseColumns: ["dose", "signal"] },
      figure: { kind: "dose-response", x, y: {}, errorBars: "none" },
    })

  it("defaults to log x when the spec never named a scale", () => {
    const parsed = drSpec({})
    // Resolved in the spec itself, not only at draw time: the chart-state round
    // trip writes a concrete scale back on every edit, so a sentinel that only
    // the renderer understood would be erased by the first toolbar interaction.
    expect(parsed.figure.x.scale).toBe("log10")
    expect((buildFigure(parsed, doses).layout.xaxis as { type: string }).type).toBe("log")
  })

  it("leaves an explicitly chosen linear axis alone", () => {
    const parsed = drSpec({ scale: "linear" })
    expect(parsed.figure.x.scale).toBe("linear")
    expect((buildFigure(parsed, doses).layout.xaxis as { type: string }).type).toBe("linear")
  })

  it("does not push a log default onto any other kind", () => {
    expect(spec().figure.x.scale).toBe("linear")
    expect(spec().figure.y.scale).toBe("linear")
    expect(drSpec({}).figure.y.scale).toBe("linear")
  })

  it("reports the zero-dose control the log axis cannot place", () => {
    // The engine already drops it from the fit and says so. The axis drops it
    // from the picture too, and that has to be said in the same place.
    const text = (buildFigure(drSpec({}), doses).layout.title as { text: string }).text
    expect(text).toContain("1 point at x ≤ 0 cannot be placed on a log axis")
    // …and there is nothing to report once the axis can place it.
    expect(
      (buildFigure(drSpec({ scale: "linear" }), doses).layout.title as { text: string }).text
    ).not.toContain("cannot be placed")
  })
})

describe("volcano: the labels are the output", () => {
  const features = (n: number) =>
    result({
      plotData: Array.from({ length: n }, (_, i) => ({
        rowId: `g${i}`,
        // Every feature clears both thresholds; significance descends with i so
        // the ranking is checkable.
        values: { gene: `GENE${i}`, effect: 2 + i * 0.1, p: Math.pow(10, -(20 - i * 0.1)) },
        excluded: false,
      })),
    })
  const vSpec = (figure: Record<string, unknown> = {}) =>
    spec({
      analysis: {
        test: "none",
        groupColumn: "gene",
        responseColumns: ["effect", "p"],
      },
      figure: { kind: "volcano", x: {}, y: {}, errorBars: "none", ...figure },
    })

  it("labels the significant hits on the plot", () => {
    const labels = buildFigure(vSpec(), features(4)).data.find((t) => t.mode === "text")
    expect(labels!.text).toEqual(["GENE0", "GENE1", "GENE2", "GENE3"])
    // A label is a mark; Tier 0 applies to it too.
    expect(labels!.customdata).toEqual(["g0", "g1", "g2", "g3"])
  })

  it("bounds the labels and states the bound instead of truncating quietly", () => {
    const figure = buildFigure(vSpec(), features(40))
    const labels = figure.data.find((t) => t.mode === "text")
    expect((labels!.text as string[]).length).toBe(10)
    // Most significant first, so the ten shown are the ten worth showing.
    expect((labels!.text as string[])[0]).toBe("GENE0")
    expect((figure.layout.title as { text: string }).text).toContain(
      "labelled top 10 of 40 significant features"
    )
  })

  it("honours a raised bound, and says nothing when everything fits", () => {
    const figure = buildFigure(vSpec({ volcanoLabelCount: 50 }), features(40))
    expect((figure.data.find((t) => t.mode === "text")!.text as string[]).length).toBe(40)
    expect((figure.layout.title as { text: string }).text).not.toContain("labelled top")
  })

  it("never labels an excluded row", () => {
    const withExcluded = features(3)
    withExcluded.plotData[0].excluded = true
    const labels = buildFigure(vSpec(), withExcluded).data.find((t) => t.mode === "text")
    expect(labels!.text).toEqual(["GENE1", "GENE2"])
  })
})

describe("histogram: a bar resolves back to its rows", () => {
  const readings = result({
    plotData: Array.from({ length: 40 }, (_, i) => ({
      rowId: `h${i}`,
      values: { treatment: "Ctrl", od: i * 0.25, other: 2 + i * 0.25 },
      excluded: i === 39,
    })),
  })
  const hSpec = (figure: Record<string, unknown> = {}, columns = ["od"]) =>
    spec({
      analysis: { test: "none", groupColumn: null, responseColumns: columns },
      figure: { kind: "histogram", x: {}, y: {}, errorBars: "none", ...figure },
    })

  it("carries every row id in the bin on the bar that covers it", () => {
    const bars = buildFigure(hSpec(), readings).data.filter((t) => t.type === "bar")
    expect(bars).toHaveLength(1)
    const ids = bars[0].customdata as string[][]
    const counts = bars[0].y as number[]
    ids.forEach((bin, b) => expect(bin.length).toBe(counts[b]))
    // Every included row is reachable from exactly one bar; the excluded one is
    // in no bin, because a bin height is a number.
    const flat = ids.flat()
    expect(flat).toHaveLength(39)
    expect(new Set(flat).size).toBe(39)
    expect(flat).not.toContain("h39")
    // …and clicking the bar gets you back to the spreadsheet.
    expect(rowIdAtPoint([{ customdata: ids[0] }], readings)).toBe(ids[0][0])
  })

  it("honours an explicit bin count", () => {
    const bars = buildFigure(hSpec({ histogramBins: 5 }), readings).data.filter(
      (t) => t.type === "bar"
    )
    expect((bars[0].y as number[]).length).toBe(5)
    expect((bars[0].customdata as string[][]).flat()).toHaveLength(39)
  })

  it("normalises to probability and density without losing the row link", () => {
    const counts = buildFigure(hSpec({ histogramBins: 4 }), readings).data[0]
    const probability = buildFigure(
      hSpec({ histogramBins: 4, histogramNorm: "probability" }),
      readings
    ).data[0]
    const density = buildFigure(
      hSpec({ histogramBins: 4, histogramNorm: "density" }),
      readings
    ).data[0]
    const width = (counts.width as number[])[0]
    expect((probability.y as number[])[0]).toBeCloseTo((counts.y as number[])[0] / 39, 10)
    expect((density.y as number[])[0]).toBeCloseTo((counts.y as number[])[0] / width, 10)
    // Probabilities are a distribution: they sum to one.
    expect((probability.y as number[]).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
    expect(probability.customdata).toEqual(counts.customdata)
  })

  it("overlays several series on one grid so the comparison is honest", () => {
    const figure = buildFigure(hSpec({ histogramBins: 8 }, ["od", "other"]), readings)
    const bars = figure.data.filter((t) => t.type === "bar")
    expect(bars).toHaveLength(2)
    expect(figure.layout.barmode).toBe("overlay")
    // One set of edges for both, or a taller bar could just mean a wider bin.
    expect(bars[0].x).toEqual(bars[1].x)
    expect(bars[0].width).toEqual(bars[1].width)
    // …and the grid has to SPAN both series. `od` runs 0-9.75 and `other` runs
    // 2-11.75; a grid cut from one of them alone shifts the other off its own
    // edges and clamps its tail into one bar, which is a shared grid in shape
    // only.
    for (const t of bars) {
      expect((t.y as number[]).filter((v) => v > 0).length).toBeGreaterThan(1)
      expect((t.customdata as string[][]).flat()).toHaveLength(39)
    }
    const centres = bars[0].x as number[]
    const widths = bars[0].width as number[]
    const lo = centres[0] - widths[0] / 2
    const hi = centres[centres.length - 1] + widths[widths.length - 1] / 2
    // `od` runs 0-9.5 and `other` runs 2-11.5. Edges cut from either column
    // alone leave the other's tail outside the grid, where it can only be
    // clamped into the end bar — a shared grid in shape and a wrong one in fact.
    expect(lo).toBeLessThanOrEqual(0)
    expect(hi).toBeGreaterThanOrEqual(11.5)
    // See-through, or the last one drawn hides the first.
    for (const t of bars) expect((t.marker as { opacity: number }).opacity).toBeLessThan(1)
  })

  it("says so when bin settings are asked for on a kind that cannot bin", () => {
    const figure = buildFigure(
      spec({ figure: { kind: "box", x: {}, y: {}, errorBars: "none", histogramBins: 5 } }),
      readings
    )
    expect((figure.layout.title as { text: string }).text).toContain("bin settings not applied")
  })
})

/* ── T0.34: an aggregating mark resolves to the rows behind it ─────────────*/

describe("aggregating marks resolve to their row set", () => {
  /** What a Plotly click hands `rowIdAtPoint` for the mark at `index`. */
  function clickAt(trace: Record<string, unknown>, index: number) {
    return [{ customdata: (trace.customdata as unknown[])[index] }]
  }

  it("resolves a bar body to the rows it averaged", () => {
    const r = result()
    const figure = buildFigure(spec(), r)
    const bar = figure.data.find((t) => t.type === "bar")!
    // Two groups in the fixture, and each bar stands for the rows it averaged.
    const included = r.plotData.filter((row) => !row.excluded)
    expect((bar.customdata as string[][]).map((ids) => ids.length)).toEqual([
      included.filter((row) => row.values.treatment === "Control").length,
      included.filter((row) => row.values.treatment === "Treated").length,
    ])
    expect((bar.customdata as string[][]).flat()).toHaveLength(included.length)
    // The whole set is reachable, and every id in it is a real row.
    const behind = (bar.customdata as string[][])[0]
    expect(behind.every((id) => r.plotData.some((row) => row.rowId === id))).toBe(true)
    // And the click itself resolves rather than returning null.
    expect(rowIdAtPoint(clickAt(bar, 0), r)).toBe(behind[0])
    expect(rowIdAtPoint(clickAt(bar, 1), r)).toBe((bar.customdata as string[][])[1][0])
  })

  it("leaves excluded replicates out of the bar's row set", () => {
    const r = result({
      plotData: result().plotData.map((row, i) => ({ ...row, excluded: i === 0 })),
    })
    const bar = buildFigure(spec({ figure: { kind: "bar-scatter-error", x: {}, y: {} } }), r)
      .data.find((t) => t.type === "bar")!
    const excludedId = r.plotData.find((row) => row.excluded)!.rowId
    // The bar did not average it, so the bar does not claim it. It is still on
    // the figure with its own id, greyed, as its own mark.
    expect((bar.customdata as string[][]).flat()).not.toContain(excludedId)
    const marks = buildFigure(spec(), r).data.filter((t) => t.mode === "markers")
    expect(marks.flatMap((t) => t.customdata as string[])).toContain(excludedId)
  })

  it("resolves a grouped-bar sub-bar to its own cell", () => {
    const twoWay = result({
      plotData: Array.from({ length: 12 }, (_, i) => ({
        rowId: `g${i}`,
        values: { treatment: i % 2 ? "Drug" : "Ctrl", sex: i % 4 < 2 ? "F" : "M", conc: 1 + i },
        excluded: false,
      })),
    })
    const figure = buildFigure(
      spec({
        analysis: {
          test: "none",
          groupColumn: "treatment",
          secondFactorColumn: "sex",
          responseColumns: ["conc"],
        },
        figure: { kind: "grouped-bar", x: {}, y: {}, errorBars: "sd" },
      }),
      twoWay
    )
    const bars = figure.data.filter((t) => t.type === "bar")
    expect(bars.length).toBeGreaterThan(0)
    for (const bar of bars) {
      for (const [i] of (bar.customdata as string[][]).entries()) {
        const ids = (bar.customdata as string[][])[i]
        if (ids.length === 0) continue
        // Every id in one sub-bar's set comes from ONE cell: same primary group
        // and same second-factor level. A set that mixed cells would be the bar
        // claiming rows it did not average.
        const rows = ids.map((id) => twoWay.plotData.find((row) => row.rowId === id)!)
        expect(new Set(rows.map((row) => row.values.treatment)).size).toBe(1)
        expect(new Set(rows.map((row) => row.values.sex)).size).toBe(1)
        expect(rowIdAtPoint(clickAt(bar, i), twoWay)).toBe(ids[0])
      }
    }
  })

  it("resolves a box body to its rows without breaking the points inside it", () => {
    const r = result()
    const figure = buildFigure(spec({ figure: { kind: "box", x: {}, y: {}, errorBars: "none" } }), r)
    const box = figure.data.find((t) => t.type === "box")!
    const ids = box.text as string[]
    // Slot 0 is the whole set: that is the slot Plotly reads for a body click.
    expect((box.customdata as unknown[])[0]).toEqual(ids)
    expect(rowIdAtPoint(clickAt(box, 0), r)).toBe(ids[0])
    // Every point still resolves to ITS OWN row, slot 0 included.
    ids.forEach((id, k) => expect(rowIdAtPoint(clickAt(box, k), r)).toBe(id))
  })

  it("resolves each half of a split violin to its own group", () => {
    const paired = result({
      plotData: Array.from({ length: 12 }, (_, i) => ({
        rowId: `p${i}`,
        values: {
          treatment: i % 2 ? "Drug" : "Ctrl",
          sex: i % 4 < 2 ? "F" : "M",
          conc: 1 + (i % 5) * 0.4,
        },
        excluded: false,
      })),
    })
    const figure = buildFigure(
      spec({
        analysis: {
          test: "none",
          groupColumn: "treatment",
          secondFactorColumn: "sex",
          responseColumns: ["conc"],
        },
        figure: { kind: "violin", x: {}, y: {}, errorBars: "none", violinSplit: true },
      }),
      paired
    )
    for (const violin of figure.data.filter((t) => t.type === "violin")) {
      const group = (violin.x as string[])[0]
      const level = violin.name as string
      const behind = (violin.customdata as unknown[])[0] as string[]
      expect(Array.isArray(behind)).toBe(true)
      // The body's set is exactly this half's cell — the case that used to hand
      // back a row from whichever group happened to sit at that index.
      for (const id of behind) {
        const row = paired.plotData.find((x) => x.rowId === id)!
        expect(row.values.treatment).toBe(group)
        expect(row.values.sex).toBe(level)
      }
      expect(rowIdAtPoint(clickAt(violin, 0), paired)).toBe(behind[0])
    }
  })
})

/* ── T0.25: the spec's series opacity, with the idiom's value as default ────*/

describe("series opacity", () => {
  const styled = (opacity: number, key: string) => ({
    series: [{ key, colour: null, opacity }],
  })

  it("keeps each kind's own opacity when the series does not ask", () => {
    const overlay = buildFigure(spec(), result()).data.find(
      (t) => t.type === "scatter" && t.mode === "markers"
    )!
    expect((overlay.marker as { opacity: number }).opacity).toBe(0.75)

    const bubble = buildFigure(
      spec({
        analysis: { test: "none", groupColumn: "treatment", responseColumns: ["a", "b", "c"] },
        figure: { kind: "bubble", x: {}, y: {} },
      }),
      result()
    ).data[0]
    expect((bubble.marker as { opacity: number }).opacity).toBe(0.7)

    const threeD = buildFigure(
      spec({
        analysis: { test: "none", groupColumn: "treatment", responseColumns: ["a", "b", "c"] },
        figure: { kind: "scatter-3d", x: {}, y: {} },
      }),
      result()
    ).data.find((t) => t.type === "scatter3d")!
    expect((threeD.marker as { opacity: number }).opacity).toBe(0.85)
  })

  it("honours the series opacity where it used to be hardcoded", () => {
    const overlay = buildFigure(
      spec({ figure: { kind: "bar-scatter-error", x: {}, y: {}, ...styled(0.2, "Control") } }),
      result()
    ).data.find((t) => t.type === "scatter" && t.mode === "markers")!
    expect((overlay.marker as { opacity: number }).opacity).toBe(0.2)

    const bubble = buildFigure(
      spec({
        analysis: { test: "none", groupColumn: "treatment", responseColumns: ["a", "b", "c"] },
        figure: { kind: "bubble", x: {}, y: {}, ...styled(0.35, "b") },
      }),
      result()
    ).data[0]
    expect((bubble.marker as { opacity: number }).opacity).toBe(0.35)

    const threeD = buildFigure(
      spec({
        analysis: { test: "none", groupColumn: "treatment", responseColumns: ["a", "b", "c"] },
        figure: { kind: "scatter-3d", x: {}, y: {}, ...styled(0.45, "c") },
      }),
      result()
    ).data.find((t) => t.type === "scatter3d")!
    expect((threeD.marker as { opacity: number }).opacity).toBe(0.45)
  })
})

/* ── Axis breaks: drawn, or said out loud ──────────────────────────────────*/

describe("axis breaks", () => {
  const broken = (overrides: Record<string, unknown> = {}) =>
    spec({
      figure: {
        kind: "bar-scatter-error",
        x: {},
        y: { breaks: [[60, 90]] },
        errorBars: "sd",
        ...overrides,
      },
    })

  const subtitle = (f: ReturnType<typeof buildFigure>) =>
    String((f.layout.title as { text: string }).text)

  it("cuts the y axis into a subplot pair on one shared x", () => {
    const f = buildFigure(broken(), result())
    const lower = f.layout.yaxis as { domain: number[]; autorangeoptions: { maxallowed: number } }
    const upper = f.layout.yaxis2 as { domain: number[]; autorangeoptions: { minallowed: number } }
    expect(lower.domain[0]).toBe(0)
    expect(lower.autorangeoptions.maxallowed).toBe(60)
    expect(upper.domain[1]).toBe(1)
    expect(upper.autorangeoptions.minallowed).toBe(90)
    // A gap, not an overlap: the two segments must not touch.
    expect(upper.domain[0]).toBeGreaterThan(lower.domain[1])
    // One logical x, so the halves of a bar line up by construction.
    expect((f.layout.xaxis2 as { matches: string }).matches).toBe("x")
    expect((f.layout.xaxis2 as { showticklabels: boolean }).showticklabels).toBe(false)
    // And the cut is marked, or the figure is just a convenient scale.
    const marks = (f.layout.shapes as { yref?: string }[]).filter((sh) => sh.yref === "paper")
    expect(marks.length).toBeGreaterThanOrEqual(2)
  })

  it("draws the same traces above the cut, and no more than the axes declared", () => {
    const plain = buildFigure(spec(), result())
    const f = buildFigure(broken(), result())
    expect(f.data).toHaveLength(plain.data.length * 2)
    // The upper copy is the same data, so it carries the same row ids and a
    // click above the cut opens the same row as a click below it.
    const upper = f.data.filter((t) => t.yaxis === "y2")
    expect(upper).toHaveLength(plain.data.length)
    expect(upper.every((t) => t.showlegend === false)).toBe(true)
    expect(upper.map((t) => t.customdata)).toEqual(plain.data.map((t) => t.customdata))
    // The tested invariant: no trace may target an axis the layout did not make.
    const declared = new Set(
      Object.keys(f.layout)
        .filter((k) => /^[xy]axis\d*$/.test(k))
        .map((k) => k.replace("axis", ""))
    )
    for (const t of f.data) {
      if (t.yaxis) expect(declared.has(String(t.yaxis))).toBe(true)
      if (t.xaxis) expect(declared.has(String(t.xaxis))).toBe(true)
    }
    // Nothing to apologise for when it was drawn.
    expect(subtitle(f)).not.toContain("axis break requested")
  })

  it("re-anchors a significance bracket that sits above the cut", () => {
    const withTest = result({
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
        reportSentence: "One-way ANOVA, F(1, 4) = 200, p < 0.001",
      },
    })
    const plain = buildFigure(spec(), withTest)
    const bracketY = (plain.brackets ?? [])[0]?.y
    expect(bracketY).toBeGreaterThan(0)
    // Cut below the bracket, so the bracket belongs to the upper segment.
    const f = buildFigure(
      spec({
        figure: {
          kind: "bar-scatter-error",
          x: {},
          y: { breaks: [[bracketY! * 0.4, bracketY! * 0.6]] },
          errorBars: "sd",
        },
      }),
      withTest
    )
    const bracket = (f.layout.shapes as Record<string, unknown>[])[0]
    expect(bracket.yref).toBe("y2")
    expect(bracket.xref).toBe("x2")
    // Real data units on both sides of the cut, which is why the drag still
    // reports an offset the spec can store.
    expect(bracketMoveFromRelayout({ "shapes[0].y0": bracketY! + 5 }, f.brackets)).toEqual({
      id: bracketId("Control", "Treated"),
      offsetY: 5,
    })
    const star = (f.layout.annotations as Record<string, unknown>[]).find(
      (a) => typeof a.text === "string" && a.text.includes("*")
    )!
    expect(star.yref).toBe("y2")
  })

  it("says so instead of dropping the request it cannot draw", () => {
    // A kind with no continuous y to cut.
    const pie = buildFigure(
      spec({
        figure: { kind: "pie-composition", x: {}, y: { breaks: [[1, 2]] }, errorBars: "none" },
      }),
      result()
    )
    expect(subtitle(pie)).toContain("axis break requested but not applied")
    expect(pie.layout.yaxis2).toBeUndefined()

    // An axis this renderer does not cut.
    const onX = buildFigure(spec({ figure: { kind: "bar-scatter-error", x: { breaks: [[1, 2]] }, y: {} } }), result())
    expect(subtitle(onX)).toContain("x axis breaks are not drawn")
    expect(onX.layout.xaxis2).toBeUndefined()

    // More than the one cut the subplot pair can draw.
    const two = buildFigure(broken({ y: { breaks: [[10, 20], [60, 90]] } }), result())
    expect(subtitle(two)).toContain("only one break at a time")
    expect(two.layout.yaxis2).toBeUndefined()

    // A backwards interval, which is a request with nothing in it.
    const empty = buildFigure(broken({ y: { breaks: [[90, 60]] } }), result())
    expect(subtitle(empty)).toContain("the interval is empty")
    expect(empty.layout.yaxis2).toBeUndefined()

    // A log axis already does the compressing a break is asked for.
    const log = buildFigure(broken({ y: { breaks: [[60, 90]], scale: "log10" } }), result())
    expect(subtitle(log)).toContain("logarithmic")
    expect(log.layout.yaxis2).toBeUndefined()
  })

  it("still names the axis it did not cut when it cut the other one", () => {
    // The y break is drawn AND the x request is reported. A drawn break must not
    // be allowed to swallow an undrawn one — that is the same silent no-op with
    // a figure in front of it.
    const f = buildFigure(
      spec({
        figure: {
          kind: "bar-scatter-error",
          x: { breaks: [[1, 2]] },
          y: { breaks: [[60, 90]] },
          errorBars: "sd",
        },
      }),
      result()
    )
    expect(f.layout.yaxis2).toBeDefined()
    expect(subtitle(f)).toContain("x axis breaks are not drawn")
  })

  it("refuses the break rather than collide with a second y scale", () => {
    // line-timecourse can carry BOTH a right-hand series and a break, and the
    // upper segment of a break IS y2, so drawing both would put the right-hand
    // series into the top half of a broken axis — a figure that looks finished
    // and means something else.
    const f = buildFigure(
      spec({
        analysis: { test: "none", groupColumn: "treatment", responseColumns: ["a", "b"] },
        figure: {
          kind: "line-timecourse",
          x: {},
          y: { breaks: [[2, 6]] },
          errorBars: "none",
          series: [{ key: "b", axis: "right" }],
        },
      }),
      result()
    )
    expect(subtitle(f)).toContain("already uses a second y axis")
    expect(f.layout.xaxis2).toBeUndefined()
    // y2 is still the right-hand scale the series asked for, not a break half.
    expect((f.layout.yaxis2 as { overlaying?: string }).overlaying).toBe("y")
    expect(f.data.some((t) => t.yaxis === "y2")).toBe(true)
  })

  it("leaves a figure with no break asked for exactly as it was", () => {
    const f = buildFigure(spec(), result())
    expect(f.layout.yaxis2).toBeUndefined()
    expect(f.layout.xaxis2).toBeUndefined()
    expect(subtitle(f)).not.toContain("axis break")
  })
})
