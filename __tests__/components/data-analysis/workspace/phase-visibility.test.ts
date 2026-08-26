/**
 * T0.2 — the Plate tab is reachable.
 *
 * It was switched off in code with `if (p.id === "plate") return false`, in a
 * refactor about the spec-driven engine that never mentions the plate. The
 * model behind it kept running: the standard curve reads the plate layout, and
 * the curve panel's own hint tells the researcher to "Mark >= 2 standards on
 * the Plate tab" — a tab nothing could reach.
 *
 * This is the test that the phase list cannot lose a tab in silence again.
 */

import { describe, expect, it } from "vitest"

import { isPhaseVisible, visiblePhaseIds, type PhaseId } from "@/components/data-analysis/workspace/phase-visibility"

const ALL: PhaseId[] = ["chart", "stats", "curve", "plate", "workspace"]
const NOTHING = { detected: {}, curvePinned: false }

describe("isPhaseVisible", () => {
  it("offers the plate map", () => {
    expect(isPhaseVisible("plate", NOTHING)).toBe(true)
  })

  it("offers chart, stats and the sheet outright", () => {
    expect(visiblePhaseIds(ALL, NOTHING)).toEqual(["chart", "stats", "plate", "workspace"])
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
