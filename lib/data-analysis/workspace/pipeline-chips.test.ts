import { describe, expect, it } from "vitest"
import { exclusionChipLabel, filterChipLabel, transformChipLabel } from "./pipeline-chips"
import { canExecuteProposal } from "./spec-prompt"
import { applyAiPatch, initHistory } from "@/lib/data-analysis/spec/mutations"
import { parseSpec, type AnalysisSpec, type Exclusion, type RowFilter, type Transform } from "@/lib/data-analysis/spec/analysis-spec"

function baseSpec(): AnalysisSpec {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: null,
      fileName: "plate.xlsx",
      sheet: null,
      versionHash: "sha256:abcd1234",
      rowCount: 96,
      columnCount: 4,
    },
    design: { source: "inferred" },
    analysis: { test: "anova-one-way" },
    figure: { kind: "bar-scatter-error", x: {}, y: {} },
    export: {},
  })
  if (!parsed.ok) throw new Error("fixture invalid")
  return parsed.spec
}

describe("filterChipLabel", () => {
  it("renders column, operator and value", () => {
    const filter: RowFilter = { column: "group", op: "eq", value: "control" }
    expect(filterChipLabel(filter)).toBe("group = control")
  })

  it("joins array values for in/notIn", () => {
    const filter: RowFilter = { column: "plate", op: "in", value: ["A", "B"] }
    expect(filterChipLabel(filter)).toBe("plate in A, B")
  })

  it("omits the value for isNull/notNull", () => {
    const filter: RowFilter = { column: "notes", op: "isNull", value: null }
    expect(filterChipLabel(filter)).toBe("notes is empty")
  })
})

describe("transformChipLabel", () => {
  it("reuses describeMutation's wording, adjusted to present tense", () => {
    const transform: Transform = { kind: "baselineSubtract", column: "signal", blankGroup: "blank", blankValue: null }
    expect(transformChipLabel(transform)).toBe("Transform: baselineSubtract")
  })
})

describe("exclusionChipLabel", () => {
  it("is describeMutation's own sentence for data.excludeRow, unmodified", () => {
    const exclusion: Exclusion = {
      rowId: "r7",
      reasonKind: "contamination",
      reasonText: null,
      method: null,
      excludedBy: "user",
      excludedAt: "2026-01-01T00:00:00.000Z",
    }
    expect(exclusionChipLabel(exclusion)).toBe("Row r7 excluded (contamination)")
  })
})

describe("canExecuteProposal", () => {
  it("is false when there is no proposal", () => {
    expect(canExecuteProposal(null)).toBe(false)
  })

  it("is false when the proposal is only a clarifying question", () => {
    expect(canExecuteProposal({ mutationCount: 0, clarificationNeeded: "Which group is the control?" })).toBe(false)
  })

  it("is false when nothing needed changing", () => {
    expect(canExecuteProposal({ mutationCount: 0, clarificationNeeded: null })).toBe(false)
  })

  it("is true when there are mutations and no open question", () => {
    expect(canExecuteProposal({ mutationCount: 2, clarificationNeeded: null })).toBe(true)
  })
})

describe("propose then execute (§P3)", () => {
  it("discard leaves the spec byte-identical: computing a patch never touches the original", () => {
    const spec = baseSpec()
    const before = JSON.stringify(spec)
    // Mirrors what askForChange does to build a proposal: applyAiPatch runs
    // the pure applyMutation under the hood and returns a new spec. Never
    // calling applyConfig with it (i.e. discarding) must leave `spec` as it was.
    applyAiPatch(initHistory(spec), [{ kind: "figure.setTitle", value: "Changed" }])
    expect(JSON.stringify(spec)).toBe(before)
  })
})
