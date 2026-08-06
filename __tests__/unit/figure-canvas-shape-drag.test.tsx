/**
 * Only a bracket may be dragged.
 *
 * `config.edits.shapePosition` is a single global switch: it hangs a move
 * handle on EVERY shape in `layout.shapes` and ignores each shape's own
 * `editable` flag while it is on. Turning it on for the significance brackets
 * therefore also armed the volcano threshold lines and the spec's own shape
 * annotations, which sit past the bracket run where `bracketMoveFromRelayout`
 * has no mutation to map a drag onto — they moved on screen and dispatched
 * nothing, so the edit was discarded in silence.
 *
 * This drives the real component against the real bundled plotly.js and asks
 * the DOM which shapes can be grabbed. Exactly one may be: the bracket.
 */

import { describe, it, expect, vi, beforeAll } from "vitest"
import { render, waitFor } from "@testing-library/react"

// jsdom has no ResizeObserver; the canvas re-measures Plotly through one.
// Plotly itself is pulled in up front: the canvas imports it dynamically, and
// on a loaded machine that import alone outruns the default `waitFor` window.
beforeAll(async () => {
  if (!("ResizeObserver" in globalThis)) {
    ;(globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
  await import("plotly.js-dist-min")
}, 60_000)

/** Long enough for the first draw on a busy machine, not a real timing assertion. */
const DRAWN = { timeout: 20_000 }

import { FigureCanvas } from "@/components/data-analysis/workspace/figure-canvas"
import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import { ENGINE_VERSION, type EngineResult } from "@/lib/data-analysis/engine/contract"

/** A bar chart carrying one significance bracket AND one drawn line. */
function spec(): AnalysisSpec {
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
    figure: {
      kind: "bar-scatter-error",
      x: {},
      y: {},
      errorBars: "sd",
      // Stands in for a volcano threshold line: a shape the figure draws that
      // no mutation can record a move for.
      annotations: [
        {
          kind: "shape",
          id: "a1",
          shape: "line",
          x1: 0,
          y1: 80,
          x2: 1,
          y2: 80,
          colour: "#9aa0a6",
        },
      ],
    },
    export: {},
  })
  if (!parsed.ok) throw new Error("fixture invalid")
  return parsed.spec
}

function result(): EngineResult {
  return {
    engineVersion: ENGINE_VERSION,
    dataVersionHash: "sha256:abcd1234",
    specHash: "hash",
    computedAt: "2026-07-30T10:00:00Z",
    durationMs: 40,
    descriptives: [],
    warnings: [],
    curveFit: null,
    survival: null,
    testRan: null,
    error: null,
    exclusionImpact: null,
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
    plotData: [
      { rowId: "r1", values: { treatment: "Control", viability: 100 }, excluded: false },
      { rowId: "r2", values: { treatment: "Control", viability: 98 }, excluded: false },
      { rowId: "r3", values: { treatment: "Control", viability: 96 }, excluded: false },
      { rowId: "r4", values: { treatment: "Treated", viability: 60 }, excluded: false },
      { rowId: "r5", values: { treatment: "Treated", viability: 62 }, excluded: false },
      { rowId: "r6", values: { treatment: "Treated", viability: 58 }, excluded: false },
    ],
  }
}

/** Every shape path the user could take hold of, in draw order. */
function grabbable(root: HTMLElement) {
  return Array.from(root.querySelectorAll<SVGPathElement>(".shapelayer path")).filter(
    (p) => p.style.cursor === "move" || p.style.pointerEvents !== ""
  )
}

describe("figure canvas — only a bracket carries a drag affordance", () => {
  it("arms the bracket and leaves every other shape alone", async () => {
    const onMoveBracket = vi.fn()
    const { container } = render(
      <FigureCanvas spec={spec()} result={result()} onMoveBracket={onMoveBracket} />
    )

    await waitFor(() => {
      expect(container.querySelectorAll(".shapelayer path").length).toBeGreaterThan(0)
    }, DRAWN)

    // The figure really is the mixed case this is about: a bracket first, then
    // a shape the canvas cannot record a move for.
    const shapes = container.querySelectorAll(".shapelayer path[data-index]")
    expect(shapes.length).toBe(2)

    // Exactly one shape can be grabbed, and it is the bracket. Under the old
    // global switch both shapes got their own `cursor: move` handle, so this
    // saw two.
    const armed = grabbable(container)
    expect(armed).toHaveLength(1)
    expect(armed[0].getAttribute("data-index")).toBe("0")

    // ...and the drawn line is inert.
    const line = container.querySelector<SVGPathElement>('.shapelayer path[data-index="1"]')
    expect(line).not.toBeNull()
    expect(line!.style.cursor).not.toBe("move")
    expect(line!.style.pointerEvents).toBe("")
  })

  it("still records a bracket drag as a mutation", async () => {
    const onMoveBracket = vi.fn()
    const { container } = render(
      <FigureCanvas spec={spec()} result={result()} onMoveBracket={onMoveBracket} />
    )
    await waitFor(() => {
      expect(grabbable(container)).toHaveLength(1)
    }, DRAWN)

    // Take hold of the bracket the way a pointer does: activate, then drag.
    const bracket = () =>
      container.querySelector<SVGPathElement>('.shapelayer path[data-index="0"]')!
    bracket().dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await waitFor(() => {
      expect(bracket().style.cursor).toBe("move")
    })

    const at = (type: string, y: number, node: EventTarget) =>
      node.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 100, clientY: y, buttons: 1 })
      )
    at("mousedown", 100, bracket())
    at("mousemove", 60, document)
    at("mouseup", 60, document)

    await waitFor(() => {
      expect(onMoveBracket).toHaveBeenCalled()
    })
    expect(typeof onMoveBracket.mock.calls[0][1]).toBe("number")
  })
})
