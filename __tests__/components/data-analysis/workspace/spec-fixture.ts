import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"

/**
 * A minimal, valid spec for the hand-control tests.
 *
 * Every test in this folder asserts the same thing in the end: the control
 * emitted a mutation, and applying that mutation to a REAL spec moved the field
 * the researcher was reaching for. Asserting only the emitted object would pass
 * for a mutation the spec cannot hold, which is the exact defect these controls
 * exist to close.
 */
export function baseSpec(overrides: Record<string, unknown> = {}): AnalysisSpec {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: null,
      fileName: "growth.xlsx",
      sheet: null,
      versionHash: "sha256:abcd1234",
      rowCount: 24,
      columnCount: 3,
    },
    design: { source: "inferred" },
    analysis: { test: "anova-one-way" },
    figure: { kind: "bar-scatter-error", x: {}, y: {} },
    export: {},
    ...overrides,
  })
  if (!parsed.ok) throw new Error(`fixture invalid: ${JSON.stringify(parsed.issues)}`)
  return parsed.spec
}
