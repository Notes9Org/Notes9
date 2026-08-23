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
