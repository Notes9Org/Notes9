/**
 * Design inference cross-checked against the notes9 experiment record.
 *
 * Three behaviours are load-bearing and each has a test that fails if it
 * regresses: a role the record establishes is never re-guessed; a genuine
 * record/file disagreement is reported with BOTH sides named; and technical
 * replicates no longer defeat paired detection.
 */

import { describe, it, expect } from "vitest"
import type { Table } from "@/lib/data-analysis/engine/resolver"
import type { DesignDeclaration } from "@/lib/data-analysis/spec/analysis-spec"
import { inferDesign, inferRoles } from "./infer"
import { applyRecord, rolesFromRecord, type ExperimentRecord } from "./record"
import { specFromTable } from "@/lib/data-analysis/workspace/bootstrap"

function table(columns: string[], rows: Record<string, number | string | null>[]): Table {
  return { columns, rows: rows.map((values, i) => ({ rowId: `r${i + 1}`, values })) }
}

function record(over: Partial<ExperimentRecord> = {}): ExperimentRecord {
  return {
    experimentId: "exp-1",
    subjects: [],
    groups: [],
    replicates: null,
    design: null,
    ...over,
  }
}

const meta = { fileName: "assay.xlsx", versionHash: "fnv1a64:abc" }

/**
 * Four mice, two conditions, TWO measurements of each mouse in each condition.
 * This is the ordinary bench case: a paired design carrying technical
 * replicates. It is the dataset the old crossing test reported as unpaired.
 */
const TECH_REPS = table(
  ["Mouse", "Condition", "Signal"],
  [
    { Mouse: "M1", Condition: "Pre", Signal: 10 },
    { Mouse: "M1", Condition: "Pre", Signal: 11 },
    { Mouse: "M1", Condition: "Post", Signal: 20 },
    { Mouse: "M1", Condition: "Post", Signal: 21 },
    { Mouse: "M2", Condition: "Pre", Signal: 12 },
    { Mouse: "M2", Condition: "Pre", Signal: 13 },
    { Mouse: "M2", Condition: "Post", Signal: 22 },
    { Mouse: "M2", Condition: "Post", Signal: 23 },
    { Mouse: "M3", Condition: "Pre", Signal: 14 },
    { Mouse: "M3", Condition: "Pre", Signal: 15 },
    { Mouse: "M3", Condition: "Post", Signal: 24 },
    { Mouse: "M3", Condition: "Post", Signal: 25 },
    { Mouse: "M4", Condition: "Pre", Signal: 16 },
    { Mouse: "M4", Condition: "Pre", Signal: 17 },
    { Mouse: "M4", Condition: "Post", Signal: 26 },
    { Mouse: "M4", Condition: "Post", Signal: 27 },
  ]
)

describe("technical replicates no longer defeat paired detection", () => {
  it("reads the same subject measured twice per condition as PAIRED", () => {
    const design = inferDesign(TECH_REPS, inferRoles(TECH_REPS))
    expect(design.paired).toBe(true)
    expect(design.subjectColumn).toBe("Mouse")
  })

  it("does not drop a non-independent design onto an independent-samples test", () => {
    const spec = specFromTable(TECH_REPS, meta)
    // The whole point of the fix: a t-test on paired data would treat 16
    // non-independent measurements as 16 independent ones.
    expect(spec.analysis.test).not.toBe("t-test-unpaired")
    expect(spec.design.paired).toBe(true)
  })

  it("still refuses to call an incomplete crossing paired", () => {
    // M2 was never measured Post, so there is no pairing to exploit.
    const ragged = table(
      ["Mouse", "Condition", "Signal"],
      [
        { Mouse: "M1", Condition: "Pre", Signal: 10 },
        { Mouse: "M1", Condition: "Post", Signal: 20 },
        { Mouse: "M2", Condition: "Pre", Signal: 12 },
        { Mouse: "M3", Condition: "Pre", Signal: 14 },
        { Mouse: "M3", Condition: "Post", Signal: 24 },
      ]
    )
    expect(inferDesign(ragged, inferRoles(ragged)).paired).toBe(false)
  })

  it("does not promote one of two equal-grained factors to subject", () => {
    // A crossed 2x2 factorial is not a repeated-measures design; neither
    // "Group" nor "Time" is a subject just because they cross each other.
    const factorial = table(
      ["Group", "Time", "Value"],
      [
        { Group: "Control", Time: "0h", Value: 1 },
        { Group: "Control", Time: "0h", Value: 2 },
        { Group: "Control", Time: "24h", Value: 3 },
        { Group: "Treated", Time: "0h", Value: 4 },
        { Group: "Treated", Time: "24h", Value: 5 },
        { Group: "Treated", Time: "24h", Value: 6 },
      ]
    )
    const roles = inferRoles(factorial)
    expect(roles.find((r) => r.role === "subject")).toBeUndefined()
    expect(inferDesign(factorial, roles).paired).toBe(false)
  })
})

describe("a role the record knows is not re-guessed", () => {
  it("locks the subject column to project-record when values match registered samples", () => {
    const rec = record({ subjects: ["M1", "M2", "M3", "M4"] })
    const known = rolesFromRecord(TECH_REPS, rec)
    expect(known).toContainEqual(
      expect.objectContaining({ column: "Mouse", role: "subject", source: "project-record" })
    )

    const roles = inferRoles(TECH_REPS, known)
    const mouse = roles.find((r) => r.column === "Mouse")
    expect(mouse?.source).toBe("project-record")
    expect(mouse?.role).toBe("subject")
    expect(mouse?.rationale).toContain("record")
  })

  it("keeps the record's role even where inference would have chosen another", () => {
    // "Signal" is numeric and would be inferred as the response. The record
    // says these values are its registered sample codes, so it is the subject
    // and inference does not get to overrule that.
    const rec = record({ subjects: ["10", "11", "20", "21"] })
    const known = rolesFromRecord(TECH_REPS, rec)
    expect(known.find((r) => r.column === "Signal")).toBeUndefined()

    const forced = [
      { column: "Signal", role: "subject" as const, unit: null, source: "project-record" as const, confidence: 1 },
    ]
    const roles = inferRoles(TECH_REPS, forced)
    const signal = roles.find((r) => r.column === "Signal")
    expect(signal?.role).toBe("subject")
    expect(signal?.source).toBe("project-record")
  })

  it("claims nothing when the file's values are not the record's", () => {
    const rec = record({ subjects: ["DONOR-A", "DONOR-B", "DONOR-C"] })
    expect(rolesFromRecord(TECH_REPS, rec)).toEqual([])
  })

  it("matches a sheet that uses only part of a larger experiment", () => {
    const rec = record({ subjects: ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8"] })
    const known = rolesFromRecord(TECH_REPS, rec)
    expect(known.find((r) => r.column === "Mouse")?.role).toBe("subject")
  })

  it("supplies knownRoles through specFromTable with no caller wiring", () => {
    const rec = record({ subjects: ["M1", "M2", "M3", "M4"] })
    const spec = specFromTable(TECH_REPS, meta, { record: rec })
    const mouse = spec.roles.find((r) => r.column === "Mouse")
    expect(mouse?.source).toBe("project-record")
  })
})

describe("a genuine mismatch is reported with both sides named", () => {
  const THREE_GROUPS = table(
    ["Sample", "Arm", "Titre"],
    [
      { Sample: "S1", Arm: "Control", Titre: 1 },
      { Sample: "S2", Arm: "LowDose", Titre: 2 },
      { Sample: "S3", Arm: "HighDose", Titre: 3 },
      { Sample: "S4", Arm: "Control", Titre: 4 },
      { Sample: "S5", Arm: "LowDose", Titre: 5 },
      { Sample: "S6", Arm: "HighDose", Titre: 6 },
    ]
  )

  it("names four recorded groups against three in the file", () => {
    const rec = record({ groups: ["Control", "LowDose", "MidDose", "HighDose"] })
    const roles = inferRoles(THREE_GROUPS).map(({ rationale: _r, ...r }) => r)
    const { rationale: _d, ...fileDesign } = inferDesign(THREE_GROUPS, roles)
    const out = applyRecord(THREE_GROUPS, roles, fileDesign, rec)

    expect(out.recordMismatch).toBeTruthy()
    // Both sides, with their counts, so the researcher can decide which is stale.
    expect(out.recordMismatch).toContain("4")
    expect(out.recordMismatch).toContain("MidDose")
    expect(out.recordMismatch).toContain("3")
    expect(out.recordMismatch).toContain("Arm")
  })

  it("is a description, not a boolean", () => {
    const rec = record({ groups: ["A", "B", "C", "D"] })
    const roles = inferRoles(THREE_GROUPS).map(({ rationale: _r, ...r }) => r)
    const { rationale: _d, ...fileDesign } = inferDesign(THREE_GROUPS, roles)
    const out = applyRecord(THREE_GROUPS, roles, fileDesign, rec)
    expect(typeof out.recordMismatch).toBe("string")
    expect((out.recordMismatch ?? "").length).toBeGreaterThan(20)
  })

  it("stays silent when the record and the file agree", () => {
    const rec = record({ groups: ["Control", "LowDose", "HighDose"] })
    const roles = inferRoles(THREE_GROUPS).map(({ rationale: _r, ...r }) => r)
    const { rationale: _d, ...fileDesign } = inferDesign(THREE_GROUPS, roles)
    expect(applyRecord(THREE_GROUPS, roles, fileDesign, rec).recordMismatch).toBeNull()
  })

  it("reports a paired/unpaired disagreement with both sides named", () => {
    const unpaired = table(
      ["Subject", "Arm", "Value"],
      [
        { Subject: "P1", Arm: "A", Value: 1 },
        { Subject: "P2", Arm: "A", Value: 2 },
        { Subject: "P3", Arm: "B", Value: 3 },
        { Subject: "P4", Arm: "B", Value: 4 },
      ]
    )
    const declared: DesignDeclaration = {
      paired: true,
      repeatedMeasures: false,
      subjectColumn: "Subject",
      nesting: [],
      replicateType: "biological",
      source: "project-record",
      recordMismatch: null,
    }
    const roles = inferRoles(unpaired).map(({ rationale: _r, ...r }) => r)
    const design = inferDesign(unpaired, roles, declared)

    expect(design.recordMismatch).toBeTruthy()
    expect(design.recordMismatch).toContain("paired")
    expect(design.recordMismatch).toContain("unpaired")
    // The record wins on the value, but the disagreement travels with it.
    expect(design.paired).toBe(true)
    expect(design.source).toBe("project-record")
  })

  it("flags subjects the record has never heard of", () => {
    const rec = record({ subjects: ["S1", "S2", "S3"] })
    const roles = inferRoles(THREE_GROUPS).map(({ rationale: _r, ...r }) => r)
    const fileDesign: DesignDeclaration = {
      paired: false,
      repeatedMeasures: false,
      subjectColumn: "Sample",
      nesting: [],
      replicateType: "unknown",
      source: "inferred",
      recordMismatch: null,
    }
    const out = applyRecord(THREE_GROUPS, roles, fileDesign, rec)
    expect(out.recordMismatch).toContain("S4")
  })

  it("flags a declared replicate count the file does not carry", () => {
    const rec = record({ subjects: ["M1", "M2", "M3", "M4"], replicates: 3 })
    const roles = inferRoles(TECH_REPS).map(({ rationale: _r, ...r }) => r)
    const { rationale: _d, ...fileDesign } = inferDesign(TECH_REPS, roles)
    const out = applyRecord(TECH_REPS, roles, fileDesign, rec)
    expect(out.recordMismatch).toContain("3")
    expect(out.recordMismatch).toContain("2")
  })

  it("never exceeds the schema's 512-character cap", () => {
    const rec = record({
      groups: Array.from({ length: 40 }, (_, i) => `VeryLongConditionName${i}`),
      subjects: ["nope"],
      replicates: 9,
    })
    const roles = inferRoles(THREE_GROUPS).map(({ rationale: _r, ...r }) => r)
    const { rationale: _d, ...fileDesign } = inferDesign(THREE_GROUPS, roles)
    const out = applyRecord(THREE_GROUPS, roles, fileDesign, rec)
    expect((out.recordMismatch ?? "").length).toBeLessThanOrEqual(512)
  })
})

describe("replicate type is read properly, not from a bare name check", () => {
  it("calls a column named 'Biological replicate' biological", () => {
    const t = table(
      ["Donor", "Arm", "Biological replicate", "Value"],
      [
        { Donor: "D1", Arm: "A", "Biological replicate": 1, Value: 1 },
        { Donor: "D2", Arm: "A", "Biological replicate": 2, Value: 2 },
        { Donor: "D3", Arm: "B", "Biological replicate": 1, Value: 3 },
        { Donor: "D4", Arm: "B", "Biological replicate": 2, Value: 4 },
      ]
    )
    expect(inferDesign(t, inferRoles(t)).replicateType).toBe("biological")
  })

  it("calls a column named 'Technical replicate' technical", () => {
    const t = table(
      ["Donor", "Arm", "Technical replicate", "Value"],
      [
        { Donor: "D1", Arm: "A", "Technical replicate": 1, Value: 1 },
        { Donor: "D1", Arm: "A", "Technical replicate": 2, Value: 2 },
        { Donor: "D2", Arm: "B", "Technical replicate": 1, Value: 3 },
        { Donor: "D2", Arm: "B", "Technical replicate": 2, Value: 4 },
      ]
    )
    expect(inferDesign(t, inferRoles(t)).replicateType).toBe("technical")
  })

  it("reads repeated cells plus multiple subjects per arm as mixed", () => {
    // Four mice per condition (biological) each measured twice (technical).
    expect(inferDesign(TECH_REPS, inferRoles(TECH_REPS)).replicateType).toBe("mixed")
  })

  it("is no longer permanently unknown", () => {
    expect(inferDesign(TECH_REPS, inferRoles(TECH_REPS)).replicateType).not.toBe("unknown")
  })
})

describe("nesting is detected instead of left empty", () => {
  it("reports mice nested in sites, outermost first", () => {
    // Two sites, two mice each, each mouse measured twice. Mouse clusters the
    // repeat measurements; Site clusters the mice. That is a real hierarchy,
    // and it is exactly the dependence an independent-samples test would miss.
    const t = table(
      ["Site", "Mouse", "Reading"],
      [
        { Site: "Oxford", Mouse: "M1", Reading: 1 },
        { Site: "Oxford", Mouse: "M1", Reading: 2 },
        { Site: "Oxford", Mouse: "M2", Reading: 3 },
        { Site: "Oxford", Mouse: "M2", Reading: 4 },
        { Site: "Leeds", Mouse: "M3", Reading: 5 },
        { Site: "Leeds", Mouse: "M3", Reading: 6 },
        { Site: "Leeds", Mouse: "M4", Reading: 7 },
        { Site: "Leeds", Mouse: "M4", Reading: 8 },
      ]
    )
    const roles = inferRoles(t).map(({ rationale: _r, ...r }) => r)
    const withUnits = [
      ...roles.filter((r) => r.column !== "Site" && r.column !== "Mouse"),
      { column: "Site", role: "group" as const, unit: null, source: "user" as const, confidence: 1 },
      { column: "Mouse", role: "subject" as const, unit: null, source: "user" as const, confidence: 1 },
    ]
    expect(inferDesign(t, withUnits).nesting).toEqual(["Site", "Mouse"])
  })

  it("reports no nesting for two crossed factors", () => {
    const crossed = table(
      ["Arm", "Time", "Value"],
      [
        { Arm: "A", Time: "0h", Value: 1 },
        { Arm: "A", Time: "24h", Value: 2 },
        { Arm: "B", Time: "0h", Value: 3 },
        { Arm: "B", Time: "24h", Value: 4 },
      ]
    )
    expect(inferDesign(crossed, inferRoles(crossed)).nesting).toEqual([])
  })

  it("reports no nesting for a level that clusters nothing", () => {
    // Every well is its own row, so "Well within Plate" is containment without
    // clustering: the plate is the only level that groups anything.
    const t = table(
      ["Plate", "Well", "OD"],
      [
        { Plate: "P1", Well: "A1", OD: 1 },
        { Plate: "P1", Well: "A2", OD: 2 },
        { Plate: "P2", Well: "B1", OD: 3 },
        { Plate: "P2", Well: "B2", OD: 4 },
      ]
    )
    const roles = inferRoles(t).map(({ rationale: _r, ...r }) => r)
    const withUnits = [
      ...roles.filter((r) => r.column !== "Plate" && r.column !== "Well"),
      { column: "Plate", role: "group" as const, unit: null, source: "user" as const, confidence: 1 },
      { column: "Well", role: "subject" as const, unit: null, source: "user" as const, confidence: 1 },
    ]
    expect(inferDesign(t, withUnits).nesting).toEqual([])
  })
})
