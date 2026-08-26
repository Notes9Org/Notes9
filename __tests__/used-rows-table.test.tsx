import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { UsedRowsTable } from "@/components/data-analysis/used-rows-table"
import type { EngineResult } from "@/lib/data-analysis/engine/contract"

afterEach(cleanup)

type PlotData = EngineResult["plotData"]

function makeRows(n: number, excludeEvery = 0): PlotData {
  return Array.from({ length: n }, (_, i) => ({
    rowId: `row-${i + 2}`,
    values: { arm: i % 2 ? "Drug" : "Ctrl", signal: i * 1.5 },
    excluded: excludeEvery > 0 && i % excludeEvery === 0,
  }))
}

describe("UsedRowsTable", () => {
  it("says there is nothing yet rather than rendering an empty grid", () => {
    render(<UsedRowsTable plotData={null} />)
    expect(screen.getByText(/no rows to show/i)).toBeInTheDocument()
  })

  it("shows the post-transform columns and one row per plot row", () => {
    render(<UsedRowsTable plotData={makeRows(3)} />)
    expect(screen.getByRole("columnheader", { name: "arm" })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "signal" })).toBeInTheDocument()
    // header row + 3 data rows
    expect(screen.getAllByRole("row")).toHaveLength(4)
  })

  it("marks excluded rows in words, not only by styling", () => {
    render(<UsedRowsTable plotData={makeRows(4, 2)} />)
    expect(screen.getAllByText("excluded")).toHaveLength(2)
    expect(screen.getAllByText("used")).toHaveLength(2)
    expect(screen.getByText(/2 excluded, kept and marked/)).toBeInTheDocument()
  })

  it("bounds the DOM at one page and says so, instead of truncating silently", () => {
    render(<UsedRowsTable plotData={makeRows(450)} />)
    // 200 data rows + the header row, never 450.
    expect(screen.getAllByRole("row")).toHaveLength(201)
    expect(screen.getByText(/450 rows post-transform/)).toBeInTheDocument()
    expect(screen.getByText(/showing 1–200/)).toBeInTheDocument()
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument()
  })

  it("pages to the rest of the data", () => {
    render(<UsedRowsTable plotData={makeRows(450)} />)
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByText(/showing 201–400/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByText(/showing 401–450/)).toBeInTheDocument()
    expect(screen.getAllByRole("row")).toHaveLength(51)
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled()
  })

  it("does not put aria-hidden on the table or its rows", () => {
    const { container } = render(<UsedRowsTable plotData={makeRows(3, 2)} />)
    expect(container.querySelectorAll("[aria-hidden]")).toHaveLength(0)
    const table = screen.getByRole("table")
    expect(within(table).getByText(/rows the figure used/i)).toBeInTheDocument()
  })
})

describe("UsedRowsTable · revealing the row a mark was clicked on", () => {
  it("pages to the highlighted row instead of silently doing nothing", () => {
    // 450 rows, 200 to a page: row-814 is index 812, on page 5 of the
    // underlying data but page 1 is what the reader is looking at. A highlight
    // that does not turn the page marks a row nobody can see.
    const { rerender } = render(<UsedRowsTable plotData={makeRows(450)} />)
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument()

    // rowId of index 300 (rows start at row-2) -> "row-302", page 2.
    rerender(<UsedRowsTable plotData={makeRows(450)} highlight={{ rowId: "row-302" }} />)
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument()
    expect(screen.getByText(/showing 201–400/)).toBeInTheDocument()
    expect(screen.getByRole("rowheader", { name: "row-302" })).toBeInTheDocument()
  })

  it("marks the highlighted row in words and in semantics, not by colour alone", () => {
    render(<UsedRowsTable plotData={makeRows(5)} highlight={{ rowId: "row-4" }} />)

    const marked = screen.getByRole("rowheader", { name: "row-4" }).closest("tr")
    expect(marked).not.toBeNull()
    expect(marked).toHaveAttribute("aria-current", "true")
    // The word is in the row itself, so the state is readable with styling off.
    expect(within(marked as HTMLElement).getByText(/used · selected/)).toBeInTheDocument()
    // Exactly one row is marked.
    expect(screen.getAllByText(/· selected/)).toHaveLength(1)
    expect(screen.getByRole("status")).toHaveTextContent(/Row row-4 selected from the figure/)
  })

  it("re-pages to the same row after the reader has paged away", () => {
    // Clicking the SAME mark twice is a real flow: the id has not changed, so
    // a bare-string prop would not fire and the reader would be left on
    // whatever page they had browsed to.
    const rows = makeRows(450)
    const first = { rowId: "row-302" }
    const { rerender } = render(<UsedRowsTable plotData={rows} highlight={first} />)
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Previous" }))
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument()

    rerender(<UsedRowsTable plotData={rows} highlight={{ rowId: "row-302" }} />)
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument()
  })

  it("leaves the reader where they are when the row is not in this result", () => {
    render(<UsedRowsTable plotData={makeRows(450)} highlight={{ rowId: "row-9999" }} />)
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(/not among the rows this figure used/)
  })
})
