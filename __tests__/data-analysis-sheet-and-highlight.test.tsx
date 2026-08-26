/**
 * Two gaps that made the workspace lie about its own data.
 *
 *  1. The analysed sheet was hard-pinned to sheet 1 while the grid showed
 *     whatever tab was clicked, so a multi-sheet workbook could put sheet 2 on
 *     screen and sheet 1 in the chart, the statistics and the standard curve.
 *  2. A click on a mark went nowhere, because the only landing place
 *     considered was the Univer grid, which has no imperative "select this
 *     row". The "Rows used" panel is one, and this proves the click reaches it.
 *
 * Harness mirrors `__tests__/data-analysis-intent-first.test.tsx` — same heavy
 * stubs — plus a `LayoutCanvas` double, which is where the figure's
 * interaction callbacks are handed to the renderer.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import * as XLSX from "xlsx"

import type { DataFileRow } from "@/components/data-analysis/data-files-list"
import { buildSpreadsheetWorkbookSnapshot } from "@/lib/spreadsheet-workbook"

vi.mock("@/components/spreadsheet/univer-workbook-view", () => ({
  UniverWorkbookView: () => <div data-testid="mock-sheet" />,
}))
vi.mock("@/components/data-analysis/plotly-chart", () => ({
  PlotlyChart: () => <div data-testid="mock-chart" />,
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
vi.mock("@/components/ui/sidebar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/sidebar")>()
  return { ...actual, useSidebar: () => ({ state: "collapsed", setOpen: vi.fn() }) }
})
vi.mock("@/components/auth/auth-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/auth/auth-provider")>()
  return { ...actual, useAuthUser: () => null }
})
vi.mock("@/lib/data-analysis/ai/analysis-thread-store", () => ({
  createAnalysisThread: vi.fn(async () => null),
  appendAnalysisTurn: vi.fn(async () => {}),
  loadAnalysisThread: vi.fn(async () => []),
  updateAnalysisTurnPlan: vi.fn(async () => {}),
  writeAnalysisIntent: vi.fn(async () => true),
  readAnalysisIntent: vi.fn(async () => undefined),
}))
vi.mock("@/components/data-analysis/workspace/analysis-console", () => ({
  AnalysisConsole: (props: { attachSlot?: React.ReactNode }) => (
    <div data-testid="mock-console">{props.attachSlot}</div>
  ),
}))

/**
 * The seam under test. The real `LayoutCanvas` hands `interaction.onSelectRow`
 * to `FigureCanvas`, which calls it with the row id `rowIdAtPoint` resolved
 * from the clicked mark's `customdata`. Standing in for Plotly, this exposes a
 * button per row id so a test can play a click on a specific mark.
 */
let lastInteraction: { onSelectRow?: (rowId: string) => void } | null = null
vi.mock("@/components/data-analysis/workspace/layout-canvas", () => ({
  LayoutCanvas: (props: { interaction?: { onSelectRow?: (rowId: string) => void } }) => {
    lastInteraction = props.interaction ?? null
    return <div data-testid="mock-layout-canvas" />
  },
}))

import { DataAnalysisWorkspace } from "@/components/data-analysis/data-analysis-workspace"

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })),
  })
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
  lastInteraction = null
  vi.restoreAllMocks()
  localStorage.clear()
})

function file(overrides: Partial<DataFileRow> = {}): DataFileRow {
  return {
    id: "f1",
    file_name: "two-sheets.xlsx",
    file_type: null,
    file_size: 1024,
    data_type: null,
    created_at: "2024-01-01T00:00:00.000Z",
    experiment_id: "e1",
    project_id: "p1",
    file_url: "https://example.test/f1",
    tabular_format: null,
    experiment_name: "Experiment 1",
    project_name: "Project 1",
    ...overrides,
  }
}

/**
 * Two sheets whose columns and row COUNTS differ, so "which one is analysed"
 * is answerable from the toolbar's own row/column readout rather than from a
 * label that could be right while the numbers are wrong.
 */
function twoSheetSnapshot() {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Treatment", "Viability"],
      ["Vehicle", 91],
      ["Drug", 47],
    ]),
    "Screen A"
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Dose", "Response", "Replicate"],
      [1, 10, 1],
      [3, 30, 1],
      [9, 90, 1],
      [27, 95, 2],
    ]),
    "Screen B"
  )
  return buildSpreadsheetWorkbookSnapshot("two-sheets.xlsx", wb)
}

function mockWorkbookFetch(snapshot: unknown) {
  global.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "GET") {
      return { json: async () => ({ workbook_snapshot: null }) } as Response
    }
    return { json: async () => ({ workbook_snapshot: snapshot }) } as Response
  }) as typeof fetch
}

async function openTwoSheetWorkbook() {
  mockWorkbookFetch(twoSheetSnapshot())
  render(<DataAnalysisWorkspace files={[file()]} />)
  fireEvent.click(screen.getByRole("button", { name: /from your data files/i }))
  await screen.findByRole("dialog")
  fireEvent.click(screen.getByText("two-sheets.xlsx"))
  await waitFor(() => expect(screen.getByText(/rows · .* cols/)).toBeInTheDocument())
}

describe("the analysed sheet is chosen and shown", () => {
  it("names the analysed sheet and switches what is analysed when it changes", async () => {
    await openTwoSheetWorkbook()

    const picker = screen.getByRole("combobox", { name: /analysing/i })
    // Both sheets are offered, plus the "however it read before" default that
    // every analysis saved before this picker existed still resolves through.
    expect(
      Array.from(picker.querySelectorAll("option")).map((o) => o.textContent?.trim())
    ).toEqual(["Auto (Screen A)", "Screen A", "Screen B"])

    // Sheet 1 by default: 2 rows, 2 columns.
    expect(screen.getByText("2 rows · 2 cols")).toBeInTheDocument()

    fireEvent.change(picker, { target: { value: "Screen B" } })

    // The numbers move with the choice. This is the assertion that fails if
    // the picker is cosmetic and `snapshotToTable` still reads sheet 1.
    await waitFor(() => expect(screen.getByText("4 rows · 3 cols")).toBeInTheDocument())
    expect(screen.queryByText("2 rows · 2 cols")).not.toBeInTheDocument()

    // And back, so the default is a real value rather than a one-way door.
    fireEvent.change(picker, { target: { value: "" } })
    await waitFor(() => expect(screen.getByText("2 rows · 2 cols")).toBeInTheDocument())
  })

  it("offers no picker for a single-sheet workbook, where nothing can diverge", async () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["x", "y"],
        [1, 2],
      ]),
      "Sheet1"
    )
    mockWorkbookFetch(buildSpreadsheetWorkbookSnapshot("one-sheet.xlsx", wb))
    render(<DataAnalysisWorkspace files={[file({ file_name: "one-sheet.xlsx" })]} />)
    fireEvent.click(screen.getByRole("button", { name: /from your data files/i }))
    await screen.findByRole("dialog")
    fireEvent.click(screen.getByText("one-sheet.xlsx"))

    await waitFor(() => expect(screen.getByText("1 rows · 2 cols")).toBeInTheDocument())
    expect(screen.queryByRole("combobox", { name: /analysing/i })).not.toBeInTheDocument()
  })
})

describe("a click on a mark lands in the Rows used panel", () => {
  it("hands the figure an onSelectRow, and it opens the panel the row lands in", async () => {
    await openTwoSheetWorkbook()

    // The figure lives in the layout phase; that is where `interaction` is
    // handed to the renderer. Radix activates a tab on mousedown, not click.
    const layoutTab = screen.getByRole("tab", { name: /figure layout/i })
    fireEvent.mouseDown(layoutTab)
    fireEvent.click(layoutTab)
    await screen.findByTestId("mock-layout-canvas")

    // The wiring itself. Before this change the workspace deliberately passed
    // no `onSelectRow` -- "the sheet is a Univer instance with no imperative
    // 'select this row' entry point" -- so a click had nothing to call.
    expect(lastInteraction?.onSelectRow).toBeTypeOf("function")

    // The landing place has to be on THIS screen. The right dock that carries
    // the "Rows used" panel in the chart/stats phases is not rendered in the
    // layout phase, so without a copy under the canvas the click would reveal
    // a row nobody can see.
    const panel = screen.getByText(/^Rows used/).closest("details") as HTMLDetailsElement
    expect(panel).not.toBeNull()
    expect(panel.open).toBe(false)

    await act(async () => {
      lastInteraction!.onSelectRow!("row-3")
    })

    expect(panel.open).toBe(true)
    // What the panel then does with that row -- page to it and mark it -- is
    // driven end to end from a real Plotly click in
    // `__tests__/figure-click-reveals-row.test.tsx`.
  })
})
