import { describe, it, expect } from "vitest"
import { deriveAiGate } from "@/lib/data-analysis/workspace/ai-gate"

/**
 * Slice 01: the tri-state gate that replaces the single `aiReady` boolean
 * (ADR-023). `canCapture` must never depend on a dataset, a spec or a
 * successful parse; `canPropose` must, and `reason` must always name the
 * actual blocker rather than a hardcoded string (ADR-015's lying-gate defect).
 */

describe("deriveAiGate", () => {
  it("canCapture is true whenever an analysis is mounted, even with no dataset at all", () => {
    const gate = deriveAiGate({
      datasetPresent: false,
      derivedSpecPresent: false,
      rowCount: 0,
      parseError: null,
      dataQualityAcknowledged: true,
    })
    expect(gate.canCapture).toBe(true)
    expect(gate.canPropose).toBe(false)
    expect(gate.reason).toBeTruthy()
  })

  it("canCapture stays true on a parse failure", () => {
    const gate = deriveAiGate({
      datasetPresent: true,
      derivedSpecPresent: false,
      rowCount: 0,
      parseError: "No header row was found on this sheet.",
      dataQualityAcknowledged: true,
    })
    expect(gate.canCapture).toBe(true)
    expect(gate.canPropose).toBe(false)
    expect(gate.reason).toContain("No header row was found on this sheet.")
  })

  it("canCapture is not affected by column shape (no numeric columns / single column)", () => {
    // deriveAiGate takes no column-shape input at all: shape must never block capture.
    const gate = deriveAiGate({
      datasetPresent: true,
      derivedSpecPresent: true,
      rowCount: 5,
      parseError: null,
      dataQualityAcknowledged: true,
    })
    expect(gate.canCapture).toBe(true)
  })

  it("boundary: an empty table (0 rows) blocks canPropose with a derived reason, capture stays true", () => {
    const gate = deriveAiGate({
      datasetPresent: true,
      derivedSpecPresent: true,
      rowCount: 0,
      parseError: null,
      dataQualityAcknowledged: true,
    })
    expect(gate.canCapture).toBe(true)
    expect(gate.canPropose).toBe(false)
    expect(gate.reason).toBeTruthy()
    expect(gate.reason).toMatch(/0 rows|no rows|nothing to propose/i)
  })

  it("no dataset yields a reason naming the dataset, distinct from a parse-error reason", () => {
    const noDataset = deriveAiGate({
      datasetPresent: false,
      derivedSpecPresent: false,
      rowCount: 0,
      parseError: null,
      dataQualityAcknowledged: true,
    })
    const parseFailed = deriveAiGate({
      datasetPresent: true,
      derivedSpecPresent: false,
      rowCount: 0,
      parseError: "boom",
      dataQualityAcknowledged: true,
    })
    expect(noDataset.reason).not.toEqual(parseFailed.reason)
  })

  it("dataset present but no derivable spec blocks canPropose with its own reason", () => {
    const gate = deriveAiGate({
      datasetPresent: true,
      derivedSpecPresent: false,
      rowCount: 3,
      parseError: null,
      dataQualityAcknowledged: true,
    })
    expect(gate.canPropose).toBe(false)
    expect(gate.reason).toBeTruthy()
  })

  it("canPropose is true, with reason null, once dataset, spec and rows all hold", () => {
    const gate = deriveAiGate({
      datasetPresent: true,
      derivedSpecPresent: true,
      rowCount: 10,
      parseError: null,
      dataQualityAcknowledged: true,
    })
    expect(gate.canPropose).toBe(true)
    expect(gate.reason).toBeNull()
    expect(gate.canCapture).toBe(true)
  })

  it("reason is derived, not a fixed literal: two different blockers produce two different strings", () => {
    const reasons = new Set<string | null>()
    reasons.add(deriveAiGate({ datasetPresent: false, derivedSpecPresent: false, rowCount: 0, parseError: null, dataQualityAcknowledged: true }).reason)
    reasons.add(deriveAiGate({ datasetPresent: true, derivedSpecPresent: false, rowCount: 0, parseError: null, dataQualityAcknowledged: true }).reason)
    reasons.add(deriveAiGate({ datasetPresent: true, derivedSpecPresent: true, rowCount: 0, parseError: null, dataQualityAcknowledged: true }).reason)
    reasons.add(deriveAiGate({ datasetPresent: true, derivedSpecPresent: false, rowCount: 0, parseError: "x", dataQualityAcknowledged: true }).reason)
    expect(reasons.size).toBe(4)
  })
})

describe("the data-quality review gates proposing, not capturing", () => {
  const ready = {
    datasetPresent: true,
    derivedSpecPresent: true,
    rowCount: 12,
    parseError: null,
  }

  it("blocks a proposal while the review is outstanding", () => {
    const gate = deriveAiGate({ ...ready, dataQualityAcknowledged: false })
    expect(gate.canPropose).toBe(false)
    expect(gate.reason).toMatch(/data quality/i)
  })

  it("still lets the researcher state intent (ADR-023)", () => {
    expect(deriveAiGate({ ...ready, dataQualityAcknowledged: false }).canCapture).toBe(true)
  })

  it("opens once the review is acknowledged", () => {
    const gate = deriveAiGate({ ...ready, dataQualityAcknowledged: true })
    expect(gate.canPropose).toBe(true)
    expect(gate.reason).toBeNull()
  })

  it("keeps naming the more fundamental blocker when both apply", () => {
    // An empty table with an unacknowledged review must not say "review the
    // findings" — there is nothing to review, and the reason must stay derived
    // from the inputs rather than picked by declaration order.
    const gate = deriveAiGate({
      ...ready,
      rowCount: 0,
      dataQualityAcknowledged: false,
    })
    expect(gate.reason).toMatch(/0 rows/)
  })
})
