/**
 * The two ways the exclusion screen could lie to a researcher.
 *
 * §8.1 exists because a frictionless exclusion is a p-hacking machine, and the
 * defence is that the record is exactly true: the named test really ran, and
 * the row shown is really the row being removed. Both had regressed.
 */

import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { ExclusionDialog } from "@/components/data-analysis/workspace/exclusion-dialog"
import { describeExcludedRow } from "@/components/data-analysis/data-analysis-workspace"

afterEach(cleanup)

/** Pick the reason radio by value; several reasons share words with the copy. */
const chooseStatisticalOutlier = () =>
  fireEvent.click(document.querySelector('input[value="statistical-outlier"]')!)
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Exclude point" }))

function open(onConfirm = vi.fn()) {
  render(
    <ExclusionDialog
      open
      rowId="row-7"
      rowSummary="Row 7 · Dose 10 · OD450 0.42"
      currentUserId="u1"
      onCancel={() => {}}
      onConfirm={onConfirm}
    />,
  )
  return onConfirm
}

describe("the outlier method offered is one that exists", () => {
  it("does not offer ROUT — nothing in this codebase computes it", () => {
    open()
    chooseStatisticalOutlier()
    expect(screen.queryByText("ROUT")).toBeNull()
    expect(screen.queryByText(/Q \(%\)/)).toBeNull()
  })

  it("names Grubbs, which is real, and labels its parameter α", () => {
    open()
    chooseStatisticalOutlier()
    expect(screen.getByText("Grubbs")).toBeInTheDocument()
    expect(screen.getByText(/α \(%\)/)).toBeInTheDocument()
  })

  it("records the parameter under the key the chosen method actually takes", () => {
    const onConfirm = open()
    chooseStatisticalOutlier()
    submit()

    const rec = onConfirm.mock.calls[0][0]
    expect(rec.method).toEqual({ name: "Grubbs", params: { alpha: 0.01 } })
    // Grubbs has no Q. Writing one would attribute a parameter to a test that
    // does not take it, in the one field the spec requires to be exact.
    expect(rec.method.params).not.toHaveProperty("Q")
  })

  it("still refuses to submit without a reason", () => {
    const onConfirm = open()
    submit()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})

describe("the confirmation describes the row being excluded", () => {
  const table = {
    columns: ["Dose", "OD450", "Plate"],
    rows: [
      { Dose: 1, OD450: 0.11, Plate: "A" },
      { Dose: 3, OD450: 0.22, Plate: "A" },
      { Dose: 10, OD450: 0.42, Plate: "B" },
    ],
  }

  it("resolves the positional rowId back to its own row, not the cursor's", () => {
    // `row-4` is table.rows[2] (`row-${i + 2}`). Right-clicking this point on
    // the figure while the sheet cursor sits on row 2 used to show row 4's id
    // above row 2's values.
    expect(describeExcludedRow("row-4", table, ["Dose", "OD450"])).toBe(
      "Row 4 · Dose 10 · OD450 0.42",
    )
    expect(describeExcludedRow("row-2", table, ["Dose", "OD450"])).toBe(
      "Row 2 · Dose 1 · OD450 0.11",
    )
  })

  it("never returns another row's values for an id it cannot resolve", () => {
    expect(describeExcludedRow("row-99", table, ["Dose"])).toBeUndefined()
    expect(describeExcludedRow("row-1", table, ["Dose"])).toBeUndefined()
    expect(describeExcludedRow("nonsense", table, ["Dose"])).toBeUndefined()
  })

  it("falls back to the first columns when the plotted ones are unset", () => {
    expect(describeExcludedRow("row-3", table, ["", ""])).toBe("Row 3 · Dose 3 · OD450 0.22")
  })

  it("caps the summary at three columns so the dialog stays readable", () => {
    const wide = {
      columns: ["a", "b", "c", "d", "e"],
      rows: [{ a: 1, b: 2, c: 3, d: 4, e: 5 }],
    }
    const out = describeExcludedRow("row-2", wide, ["a", "b", "c", "d", "e"])!
    expect(out.split("·")).toHaveLength(4) // "Row 2" + three columns
    expect(out).not.toContain("d 4")
  })
})
