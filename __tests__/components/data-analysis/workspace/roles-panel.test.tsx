/**
 * T0.4 — a researcher can correct a mis-inferred role, and the correction
 * reaches the spec.
 *
 * `roles.set` and `design.set` were typed, applied and described before this;
 * what did not exist was anything outside the AI path that emitted one. So the
 * assertion is not "the panel renders" — it is that turning the control
 * produces a mutation, and that applying that mutation to a real spec moves
 * `spec.roles` / `spec.design`.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { RolesPanel, rolesForColumns, rolesWithEdit } from "@/components/data-analysis/workspace/roles-panel"
import { applyMutation, type SpecMutation } from "@/lib/data-analysis/spec/mutations"
import type { ColumnRole } from "@/lib/data-analysis/spec/analysis-spec"
import { baseSpec } from "./spec-fixture"

const ROLES: ColumnRole[] = [
  { column: "Time", role: "time", unit: "h", source: "inferred", confidence: 0.9 },
  { column: "Well", role: "response", unit: null, source: "inferred", confidence: 0.5 },
]
const COLUMNS = ["Time", "Well", "OD600"]

afterEach(cleanup)

function setup() {
  const onMutate = vi.fn<(m: SpecMutation) => void>()
  render(
    <RolesPanel columns={COLUMNS} roles={ROLES} design={baseSpec().design} onMutate={onMutate} />
  )
  return { onMutate }
}

describe("rolesForColumns", () => {
  it("gives a column inference never named a row of its own", () => {
    const rows = rolesForColumns(COLUMNS, ROLES)
    expect(rows.map((r) => r.column)).toEqual(COLUMNS)
    // The whole point of the panel is the column the inference missed.
    expect(rows[2]).toMatchObject({ column: "OD600", role: "ignore" })
  })
})

describe("rolesWithEdit", () => {
  it("marks only the touched column as the user's decision", () => {
    const next = rolesWithEdit(ROLES, "Well", { role: "subject" })
    expect(next[1]).toMatchObject({ column: "Well", role: "subject", source: "user", confidence: null })
    // Untouched rows keep their provenance, or the next derivation would treat
    // an inference as a decision.
    expect(next[0]).toEqual(ROLES[0])
  })
})

describe("RolesPanel reaches the spec", () => {
  it("a corrected role lands on spec.roles", () => {
    const { onMutate } = setup()
    fireEvent.change(screen.getByLabelText("Well"), { target: { value: "subject" } })

    expect(onMutate).toHaveBeenCalledTimes(1)
    const mutation = onMutate.mock.calls[0][0]
    expect(mutation.kind).toBe("roles.set")

    const after = applyMutation(baseSpec(), mutation)
    expect(after.roles.find((r) => r.column === "Well")).toMatchObject({ role: "subject", source: "user" })
    // "Well" was inferred as the response; correcting it must not silently
    // rewrite the columns nobody touched.
    expect(after.roles.find((r) => r.column === "Time")).toMatchObject({ role: "time", unit: "h" })
  })

  it("a typed unit lands on spec.roles[].unit", () => {
    const { onMutate } = setup()
    fireEvent.change(screen.getByLabelText("Unit for OD600"), { target: { value: "AU" } })

    const after = onMutate.mock.calls.reduce<ReturnType<typeof baseSpec>>(
      (spec, [m]) => applyMutation(spec, m),
      baseSpec()
    )
    expect(after.roles.find((r) => r.column === "OD600")?.unit).toBe("AU")
  })

  it("the design checkboxes land on spec.design", () => {
    const { onMutate } = setup()
    fireEvent.click(screen.getByLabelText(/Paired/i))
    fireEvent.change(screen.getByLabelText("Subject column"), { target: { value: "Well" } })

    const after = onMutate.mock.calls.reduce<ReturnType<typeof baseSpec>>(
      (spec, [m]) => applyMutation(spec, m),
      baseSpec()
    )
    expect(after.design.paired).toBe(true)
    expect(after.design.subjectColumn).toBe("Well")
    expect(after.design.source).toBe("user")
  })

  it("says where each role came from in words, not colour alone", () => {
    setup()
    expect(screen.getByText(/inferred · 90%/)).toBeInTheDocument()
  })
})
