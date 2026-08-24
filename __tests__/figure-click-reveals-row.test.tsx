/**
 * Click-to-highlight, end to end, with only Plotly itself stubbed.
 *
 * The two real components are wired the way the workspace wires them:
 * `FigureCanvas` resolves the clicked mark to a row id through the real
 * `rowIdAtPoint` (which validates against `result.plotData` and returns null
 * rather than a wrong id), the container turns that into a highlight, and the
 * real `UsedRowsTable` pages to the row and marks it.
 *
 * Stubbing Plotly rather than the adapter is deliberate: the mark→rowId step
 * is the part that could quietly return the wrong row, so it runs for real.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"

import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import { ENGINE_VERSION, type EngineResult } from "@/lib/data-analysis/engine/contract"

type Handler = (e: { points?: { customdata?: unknown }[] }) => void

/** The handlers `FigureCanvas` attaches to the plot div, by event name. */
const handlers = new Map<string, Handler>()

vi.mock("plotly.js-dist-min", () => ({
  default: {
    react: async (el: HTMLElement) => {
      const div = el as HTMLElement & {
        on?: (event: string, h: Handler) => void
        removeAllListeners?: (event: string) => void
      }
      div.on = (event, h) => handlers.set(event, h)
      div.removeAllListeners = (event) => handlers.delete(event)
    },
    purge: () => {},
    Plots: { resize: () => {} },
  },
}))

import { FigureCanvas } from "@/components/data-analysis/workspace/figure-canvas"
import {
  UsedRowsTable,
  type UsedRowHighlight,
} from "@/components/data-analysis/used-rows-table"

beforeAll(() => {
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = MockResizeObserver
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  handlers.clear()
})

const ROW_COUNT = 450

function spec(): AnalysisSpec {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: null,
      fileName: "plate.xlsx",
      sheet: null,
      versionHash: "sha256:abcd1234",
      rowCount: ROW_COUNT,
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
  })
  if (!parsed.ok) throw new Error("fixture invalid")
  return parsed.spec
}

/** Enough rows that the row under test is well past the panel's 200-row page. */
function result(): EngineResult {
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
    plotData: Array.from({ length: ROW_COUNT }, (_, i) => ({
      rowId: `r${i + 1}`,
      values: { treatment: i % 2 ? "Treated" : "Control", viability: 100 - i * 0.1 },
      excluded: false,
    })),
    warnings: [],
  } as unknown as EngineResult
}

/** The workspace's own wiring, reduced to the part under test. */
function Wired() {
  const [highlight, setHighlight] = useState<UsedRowHighlight | null>(null)
  const r = result()
  return (
    <div>
      <FigureCanvas spec={spec()} result={r} onSelectRow={(rowId) => setHighlight({ rowId })} />
      <UsedRowsTable plotData={r.plotData} highlight={highlight} />
    </div>
  )
}

/** Play a Plotly click on a mark carrying `rowId` in its `customdata`. */
async function clickMark(customdata: unknown) {
  const click = handlers.get("plotly_click")
  expect(click).toBeTypeOf("function")
  await act(async () => {
    click!({ points: [{ customdata }] })
  })
}

describe("clicking a mark reveals its row in the Rows used panel", () => {
  it("pages to the clicked row and marks it, from a page it was not on", async () => {
    render(<Wired />)
    await waitFor(() => expect(handlers.has("plotly_click")).toBe(true))

    // r320 is index 319 — page 2 of 3. The reader is on page 1.
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument()
    expect(screen.queryByRole("rowheader", { name: "r320" })).not.toBeInTheDocument()

    await clickMark("r320")

    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument()
    const marked = screen.getByRole("rowheader", { name: "r320" }).closest("tr")
    expect(marked).toHaveAttribute("aria-current", "true")
    expect(within(marked as HTMLElement).getByText(/· selected/)).toBeInTheDocument()
    expect(screen.getAllByText(/· selected/)).toHaveLength(1)
  })

  it("re-reveals the same row after the reader has paged away", async () => {
    render(<Wired />)
    await waitFor(() => expect(handlers.has("plotly_click")).toBe(true))

    await clickMark("r320")
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Previous" }))
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument()

    await clickMark("r320")
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument()
  })

  it("ignores a mark whose customdata is not a row in this result", async () => {
    render(<Wired />)
    await waitFor(() => expect(handlers.has("plotly_click")).toBe(true))

    await clickMark("r99999")

    // `rowIdAtPoint` returns null rather than a wrong id, so nothing moves.
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument()
    expect(screen.queryByText(/· selected/)).not.toBeInTheDocument()
  })

  it("names the hovered row's VALUES, not just its id", async () => {
    render(<Wired />)
    await waitFor(() => expect(handlers.has("plotly_hover")).toBe(true))

    await act(async () => {
      handlers.get("plotly_hover")!({ points: [{ customdata: "r3" }] })
    })

    // "Open the data behind this point" means showing the data.
    const readout = screen.getByText(/^Row r3 ·/)
    expect(readout).toHaveTextContent("treatment Control")
    expect(readout).toHaveTextContent("viability 99.8")
    expect(readout).toHaveTextContent("click to show the row")
  })
})
