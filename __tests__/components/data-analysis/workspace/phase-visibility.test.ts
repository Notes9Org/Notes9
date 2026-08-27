/**
 * A tab is either offered or it does not exist.
 *
 * The Plate tab was once switched off in code with `if (p.id === "plate")
 * return false` while the standard curve still read its layout — so the curve
 * panel pointed at a view nothing could reach. It has since been removed
 * outright, along with the curve's dependency on it; these assertions are what
 * keep the remaining phases from being lost the same silent way.
 */

import { describe, expect, it } from "vitest"

import { isPhaseVisible, visiblePhaseIds, type PhaseId } from "@/components/data-analysis/workspace/phase-visibility"

const ALL: PhaseId[] = ["chart", "stats", "curve", "workspace"]
const NOTHING = { detected: {}, curvePinned: false }

describe("isPhaseVisible", () => {
  it("offers chart, stats and the sheet outright", () => {
    expect(visiblePhaseIds(ALL, NOTHING)).toEqual(["chart", "stats", "workspace"])
  })

  it("has no plate phase to offer", () => {
    // Removed with the curve's dependency on it, not merely hidden.
    expect(ALL).not.toContain("plate" as PhaseId)
  })

  it("holds the standard curve back until something earns it", () => {
    // Offering a fit on a sheet with no standards is offering a dead end.
    expect(isPhaseVisible("curve", NOTHING)).toBe(false)
  })

  it("earns the curve from structure, intent or memory", () => {
    expect(isPhaseVisible("curve", { detected: { standardCurve: true }, curvePinned: false })).toBe(true)
    expect(isPhaseVisible("curve", { detected: {}, figureKind: "dose-response", curvePinned: false })).toBe(true)
    expect(isPhaseVisible("curve", { detected: {}, testKind: "nonlinear-regression", curvePinned: false })).toBe(true)
    // Pinning sticks.
    expect(isPhaseVisible("curve", { detected: {}, curvePinned: true })).toBe(true)
  })
})
