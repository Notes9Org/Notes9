/**
 * T0.25 — jitter and aspect ratio.
 *
 * Jitter was promptable and had no hand control; aspect ratio was absent on
 * both paths. Both assertions below end on a real spec, because both fields
 * take an unusual road: jitter has no home on `ChartState` and rides the
 * overlay, and aspect ratio has no field of its own at all — it is the two
 * dimensions that ARE stored.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import {
  AspectRatioField,
  JitterField,
  dimensionsForAspect,
  matchAspect,
} from "@/components/data-analysis/workspace/figure-controls"
import { appliedMutation, applyMutation, type SpecMutation } from "@/lib/data-analysis/spec/mutations"
import { splitApprovedMutations } from "@/lib/data-analysis/workspace/spec-prompt"
import { tableFromChartRows } from "@/lib/data-analysis/workspace/chart-state-spec"
import { parseSpec } from "@/lib/data-analysis/spec/analysis-spec"
import { baseSpec } from "./spec-fixture"

afterEach(cleanup)

describe("matchAspect", () => {
  it("reads 720x405 as 16:9 despite integer rounding", () => {
    expect(matchAspect(720, 405)).toBe("16:9")
  })
  it("calls anything else custom", () => {
    expect(matchAspect(720, 520)).toBeNull()
  })
  it("survives a zero height rather than dividing by it", () => {
    expect(matchAspect(720, 0)).toBeNull()
  })
})

describe("dimensionsForAspect", () => {
  it("holds the long edge so a ratio never grows the figure", () => {
    expect(dimensionsForAspect(720, 520, 16 / 9)).toEqual({ width: 720, height: 405 })
  })
  it("holds the height for a portrait ratio", () => {
    expect(dimensionsForAspect(720, 520, 3 / 4)).toEqual({ width: 390, height: 520 })
  })
  it("clamps into the schema's range instead of writing a spec that will not parse", () => {
    const tiny = dimensionsForAspect(120, 120, 16 / 9)
    expect(tiny.height).toBeGreaterThanOrEqual(120)
    expect(parseSpec({ ...baseSpec(), figure: { ...baseSpec().figure, ...tiny } }).ok).toBe(true)
  })
})

describe("AspectRatioField reaches the spec", () => {
  it("choosing 16:9 sets figure.width and figure.height", () => {
    const onMutate = vi.fn<(m: SpecMutation) => void>()
    render(<AspectRatioField width={720} height={520} onMutate={onMutate} />)

    fireEvent.change(screen.getByLabelText("Aspect ratio"), { target: { value: "16:9" } })

    const after = applyMutation(baseSpec(), onMutate.mock.calls[0][0])
    expect(after.figure.width / after.figure.height).toBeCloseTo(16 / 9, 2)
    expect(after.figure.width).toBe(720)
  })

  it("shows the pixel size, because a ratio alone does not say how big", () => {
    render(<AspectRatioField width={720} height={405} onMutate={vi.fn()} />)
    expect(screen.getByText("720×405 px")).toBeInTheDocument()
  })
})

describe("JitterField reaches the spec", () => {
  it("a jitter slider lands on the series style the renderer reads", () => {
    const onMutate = vi.fn<(m: SpecMutation) => void>()
    render(<JitterField seriesKey="Treated" value={0} onMutate={onMutate} />)

    fireEvent.change(screen.getByLabelText("Point jitter"), { target: { value: "0.25" } })

    const after = applyMutation(baseSpec(), onMutate.mock.calls[0][0])
    expect(after.figure.series.find((s) => s.key === "Treated")?.jitter).toBe(0.25)
  })

  it("merges onto an existing series rather than replacing its style", () => {
    const withColour = applyMutation(baseSpec(), {
      kind: "figure.setSeriesStyle",
      seriesKey: "Treated",
      patch: { colour: "#123456" },
    })
    const onMutate = vi.fn<(m: SpecMutation) => void>()
    render(<JitterField seriesKey="Treated" value={0} onMutate={onMutate} />)

    fireEvent.change(screen.getByLabelText("Point jitter"), { target: { value: "0.1" } })

    const after = applyMutation(withColour, onMutate.mock.calls[0][0])
    const series = after.figure.series.find((s) => s.key === "Treated")
    expect(series).toMatchObject({ colour: "#123456", jitter: 0.1 })
  })
})

/**
 * The seam, not the control: `applySpecMutation` splits a hand edit into the
 * rail edits the rail CAN hold and an overlay for the rest. A mutation the
 * split calls a rail edit whose key no control reads is dropped on the floor
 * with no error — which is exactly what would have happened to
 * `figure.setDimensions` before `width`/`height` became rail state.
 */
describe("the workspace seam these mutations travel through", () => {
  const table = tableFromChartRows(["Time", "OD600"], [{ Time: 0, OD600: 0.1 }])

  it("setDimensions is kept on the overlay, because no rail control holds it", () => {
    const spec = baseSpec()
    const { edits, overlay } = splitApprovedMutations(
      spec,
      [appliedMutation({ kind: "figure.setDimensions", width: 720, height: 405 })],
      table
    )
    // This is why the control reads `derivedSpec.figure.width` rather than a
    // rail `useState`: nothing in the rail projection carries the dimensions,
    // so rail state would go stale the moment the ratio changed — and an edit
    // the split called a rail edit whose key no control reads would be dropped
    // on the floor with no error.
    expect(edits.width).toBeUndefined()
    expect(edits.height).toBeUndefined()
    expect(overlay).toHaveLength(1)
    expect(applyMutation(spec, overlay[0].mutation).figure).toMatchObject({ width: 720, height: 405 })
  })

  it("jitter survives on the overlay even though the rail records the rest of the series", () => {
    const spec = baseSpec()
    const { edits, overlay } = splitApprovedMutations(
      spec,
      [appliedMutation({ kind: "figure.setSeriesStyle", seriesKey: "Treated", patch: { jitter: 0.2 } })],
      table
    )
    // The rail captures what it CAN hold — colour, marker, width — and none of
    // those fields is jitter, which has no home on `ChartState`.
    expect(edits.seriesStyles).not.toHaveProperty("Treated.jitter")
    // The residue is what makes the edit stick across the next derivation.
    expect(overlay).toHaveLength(1)
    expect(applyMutation(spec, overlay[0].mutation).figure.series.find((s) => s.key === "Treated")?.jitter).toBe(0.2)
  })

  it("an annotation is kept on the overlay too", () => {
    const spec = baseSpec()
    const { overlay } = splitApprovedMutations(
      spec,
      [appliedMutation({ kind: "figure.addAnnotation", annotation: { kind: "text", id: "t1", x: 1, y: 2, text: "hi", fontSize: 12, colour: "#000000" } })],
      table
    )
    expect(overlay).toHaveLength(1)
  })

  it("roles.set and design.set survive the same way", () => {
    const spec = baseSpec()
    const { overlay } = splitApprovedMutations(
      spec,
      [
        appliedMutation({ kind: "roles.set", roles: [{ column: "Time", role: "time", unit: "h", source: "user", confidence: null }] }),
        appliedMutation({ kind: "design.set", patch: { paired: true, source: "user" } }),
      ],
      table
    )
    // Nothing on `ChartState` holds either, so both must ride the overlay or
    // the next derivation infers them away again.
    expect(overlay).toHaveLength(2)
  })
})
