/**
 * The one integrity failure that leaves every existing check green.
 *
 * Row ids are sheet-anchored, so inserting a row above a saved exclusion shifts
 * every id below it. Nothing errors: the ids all still resolve, the figure still
 * draws, and the orphan check finds nothing missing — while the excluded sample
 * has quietly rejoined the analysis and an innocent one has quietly left, with
 * the original author, reason and timestamp still attached. `checkExclusions`
 * detects it; these tests cover that it reaches the researcher and that it
 * never repairs anything on its own.
 */

import { describe, it, expect, vi, afterEach } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"

import { MovedExclusionsBanner } from "@/components/data-analysis/workspace/reopen-banner"
import { checkExclusions } from "@/lib/data-analysis/workspace/saved-analysis-session"

afterEach(cleanup)

const workspace = readFileSync(
  path.join(path.resolve(__dirname, "../.."), "components/data-analysis/data-analysis-workspace.tsx"),
  "utf8",
)

const table = (rows: [string, Record<string, string | number | null>][]) => ({
  columns: ["Dose", "OD450"],
  rows: rows.map(([rowId, values]) => ({ rowId, values })),
})

describe("checkExclusions is reached from the reopen path", () => {
  it("the workspace calls it with the saved table, the live table and the exclusions", () => {
    expect(workspace).toContain("checkExclusions(snapshot.table, liveTable, verdict.spec.exclusions)")
  })

  it("the live table keeps the reader's row ids instead of re-minting them", () => {
    // Re-minting from position on one side only would make every row read as
    // moved the moment anything shifted.
    expect(workspace).toContain("tableFromChartRows(t.columns, t.rows, t.rowIds)")
  })

  it("the result is rendered, not just computed", () => {
    expect(workspace).toMatch(/<MovedExclusionsBanner[\s\S]{0,300}?moved=\{movedExclusions\}/)
  })
})

describe("an insert above an exclusion is caught", () => {
  const saved = table([
    ["row-2", { Dose: 1, OD450: 0.11 }],
    ["row-3", { Dose: 3, OD450: 0.22 }],
    ["row-4", { Dose: 10, OD450: 0.42 }],
  ])

  it("reports `moved` when a row is inserted above the excluded sample", () => {
    // A new first row pushes everything down: row-4 now holds what row-3 held.
    const live = table([
      ["row-2", { Dose: 0, OD450: 0.05 }],
      ["row-3", { Dose: 1, OD450: 0.11 }],
      ["row-4", { Dose: 3, OD450: 0.22 }],
      ["row-5", { Dose: 10, OD450: 0.42 }],
    ])
    expect(checkExclusions(saved, live, [{ rowId: "row-4" }])).toEqual([
      { rowId: "row-4", status: "moved" },
    ])
  })

  it("stays quiet when nothing moved", () => {
    expect(checkExclusions(saved, saved, [{ rowId: "row-4" }])).toEqual([
      { rowId: "row-4", status: "ok" },
    ])
  })
})

describe("the banner reports and lets the researcher decide", () => {
  it("renders nothing when every exclusion is still anchored", () => {
    render(
      <MovedExclusionsBanner
        moved={[{ rowId: "row-4", status: "ok" }]}
        onKeepStored={() => {}}
        onRerun={() => {}}
      />,
    )
    expect(document.body.textContent).toBe("")
  })

  it("names the affected rows and offers the same two choices as the integrity banner", () => {
    const keep = vi.fn()
    const rerun = vi.fn()
    render(
      <MovedExclusionsBanner
        moved={[
          { rowId: "row-4", status: "moved" },
          { rowId: "row-9", status: "missing" },
        ]}
        onKeepStored={keep}
        onRerun={rerun}
      />,
    )
    const text = document.body.textContent ?? ""
    expect(text).toContain("row-4")
    expect(text).toContain("row-9")
    // The promise that matters: it did not fix anything behind the researcher.
    expect(text).toContain("Nothing has been changed for you")

    fireEvent.click(screen.getByRole("button", { name: "Keep the stored result" }))
    fireEvent.click(screen.getByRole("button", { name: /Re-run into a new revision/ }))
    expect(keep).toHaveBeenCalledOnce()
    expect(rerun).toHaveBeenCalledOnce()
  })

  it("disables re-run while a re-run is in flight", () => {
    render(
      <MovedExclusionsBanner
        moved={[{ rowId: "row-4", status: "moved" }]}
        rerunning
        onKeepStored={() => {}}
        onRerun={() => {}}
      />,
    )
    expect(screen.getByRole("button", { name: /Re-running/ })).toBeDisabled()
  })
})
