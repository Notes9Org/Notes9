import { describe, expect, it } from "vitest"
import {
  ALLOWED_MUTATION_KINDS,
  FORBIDDEN_MUTATION_KINDS,
  SpecPatchProposal,
} from "@/lib/data-analysis/ai/spec-author"
import type { SpecMutation } from "./mutations"
import { MUTATION_CONTRACT, parseMutation, SpecMutationSchema } from "./mutation-schema"
import contractFixture from "./spec-patch-proposal.contract-fixture.json"

/**
 * P1, the contract.
 *
 * These tests guard the one property the whole file exists for: that the zod
 * schema and the `SpecMutation` TS union never quietly drift apart, and that a
 * malformed patch is rejected with a reason a researcher can read rather than
 * crashing something downstream (§ the `data.setFilters` regression below).
 */

// One valid example per kind, keyed by kind, covering every branch of the
// union, including the three FORBIDDEN kinds, whose SHAPE is still legal
// even though `spec-author.ts` never lets the model author one.
const VALID_EXAMPLES: Record<SpecMutation["kind"], SpecMutation> = {
  "figure.setKind": { kind: "figure.setKind", value: "bar-scatter-error" },
  "figure.setTitle": { kind: "figure.setTitle", value: "IC50 by treatment" },
  "figure.setCaption": { kind: "figure.setCaption", value: "Mean ± SD, n=3." },
  "figure.setSubtitle": { kind: "figure.setSubtitle", value: null },
  "figure.setPalette": { kind: "figure.setPalette", value: "okabe-ito" },
  "figure.setLegend": { kind: "figure.setLegend", show: true, position: "bottom" },
  "figure.setGridlines": { kind: "figure.setGridlines", value: true },
  "figure.setDimensions": { kind: "figure.setDimensions", width: 800, height: 600 },
  "figure.setFont": { kind: "figure.setFont", family: "sans", titleSize: 20, axisSize: 14 },
  "figure.setSeriesStyle": {
    kind: "figure.setSeriesStyle",
    seriesKey: "viability",
    patch: { colour: "#0072B2", pointSize: 10 },
  },
  "figure.addAnnotation": {
    kind: "figure.addAnnotation",
    annotation: { kind: "text", id: "a1", x: 1, y: 2, text: "note", fontSize: 12, colour: "#000000" },
  },
  "figure.updateAnnotation": {
    kind: "figure.updateAnnotation",
    id: "a1",
    patch: { text: "revised note" },
  },
  "figure.removeAnnotation": { kind: "figure.removeAnnotation", id: "a1" },
  "figure.moveBracket": { kind: "figure.moveBracket", id: "b1", offsetY: 5 },
  "figure.setBracketStyle": {
    kind: "figure.setBracketStyle",
    id: "b1",
    patch: { colour: "#ff0000", lineWidth: 2, fontSize: 14, capLength: 6, hidden: false, display: "both" },
  },
  "figure.setShowExcluded": { kind: "figure.setShowExcluded", value: true },
  "axis.set": { kind: "axis.set", axis: "y", patch: { label: "Viability (%)", scale: "log10" } },
  "figure.setErrorBars": { kind: "figure.setErrorBars", value: "sd" },
  "analysis.setTest": { kind: "analysis.setTest", value: "anova-one-way" },
  "analysis.setPostHoc": { kind: "analysis.setPostHoc", value: "tukey" },
  "analysis.setTails": { kind: "analysis.setTails", value: "two" },
  "analysis.setAlpha": { kind: "analysis.setAlpha", value: 0.05 },
  "analysis.setColumns": { kind: "analysis.setColumns", response: ["viability"], group: "treatment" },
  "analysis.setReferenceLevel": { kind: "analysis.setReferenceLevel", value: "control" },
  "analysis.setMissingValues": { kind: "analysis.setMissingValues", value: "listwise" },
  "analysis.setNonlinear": {
    kind: "analysis.setNonlinear",
    patch: { model: "4pl", confidenceBands: true },
  },
  "data.addTransform": { kind: "data.addTransform", transform: { kind: "log10", column: "viability" } },
  "data.removeTransform": { kind: "data.removeTransform", index: 0 },
  "data.setFilters": {
    kind: "data.setFilters",
    filters: [{ column: "viability", op: "gt", value: 0 }],
  },
  "data.excludeRow": {
    kind: "data.excludeRow",
    exclusion: {
      rowId: "A7",
      reasonKind: "contamination",
      reasonText: null,
      method: null,
      excludedBy: "researcher@lab.org",
      excludedAt: "2026-08-03T10:00:00Z",
    },
  },
  "data.restoreRow": { kind: "data.restoreRow", rowId: "A7" },
  "design.set": { kind: "design.set", patch: { paired: true } },
  "roles.set": {
    kind: "roles.set",
    roles: [{ column: "viability", role: "response", unit: null, source: "user", confidence: null }],
  },
}

describe("SpecMutationSchema / parseMutation", () => {
  for (const kind of Object.keys(VALID_EXAMPLES) as SpecMutation["kind"][]) {
    it(`parses a valid "${kind}" example`, () => {
      const result = parseMutation(VALID_EXAMPLES[kind])
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.mutation.kind).toBe(kind)
    })
  }

  // Anti-drift: every kind in the schema must appear in exactly one of the
  // two gating sets `spec-author.ts` uses, and every kind in those sets must
  // exist in the schema. This is the test that catches "added a branch to
  // `SpecMutation` and forgot to gate it", the `figure.setCaption` gap this
  // very patch closes.
  it("has a kind list that exactly matches ALLOWED ∪ FORBIDDEN in spec-author.ts", () => {
    const schemaKinds = new Set(
      SpecMutationSchema.options.map((option) => option.shape.kind.value as string)
    )
    const gatedKinds = new Set<string>([...ALLOWED_MUTATION_KINDS, ...FORBIDDEN_MUTATION_KINDS])
    expect(schemaKinds).toEqual(gatedKinds)
  })

  // Regression: before `parseMutation` existed, `validateProposal` cast the raw
  // JSON straight to `SpecMutation` (`candidate as unknown as SpecMutation`),
  // so `{ kind: "data.setFilters", value: [...] }`, a plausible mistake, since
  // every other kind uses "value", sailed through with no `filters` array at
  // all. `describeMutation` then read `m.filters.length` (mutations.ts:190)
  // and threw. It must be rejected here, not discovered downstream.
  it("rejects data.setFilters sent with the wrong field name", () => {
    const result = parseMutation({
      kind: "data.setFilters",
      value: [{ column: "viability", op: "gt", value: 0 }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0)
  })

  it("rejects an unknown mutation kind with a human-readable reason", () => {
    const result = parseMutation({ kind: "figure.explode", value: true })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain("figure.explode")
  })

  it("rejects a non-object payload", () => {
    const result = parseMutation("not a mutation")
    expect(result.ok).toBe(false)
  })

  it("rejects a recognised kind with a malformed field", () => {
    const result = parseMutation({ kind: "figure.setGridlines", value: "yes" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain("figure.setGridlines")
  })
})

describe("MUTATION_CONTRACT", () => {
  it("names every allowed and forbidden kind", () => {
    for (const kind of [...ALLOWED_MUTATION_KINDS, ...FORBIDDEN_MUTATION_KINDS]) {
      expect(MUTATION_CONTRACT).toContain(kind)
    }
  })

  it("is non-empty prose, not a stringified object", () => {
    expect(MUTATION_CONTRACT.length).toBeGreaterThan(0)
    expect(() => JSON.parse(MUTATION_CONTRACT)).toThrow()
  })
})

/**
 * The cross-repo contract fixture.
 *
 * `spec-patch-proposal.contract-fixture.json` is committed byte-identically in
 * BOTH repos, here and at `AI/catalyst/tests/fixtures/`. Catalyst carries
 * mutations as an opaque `List[Dict[str, Any]]` passthrough, so nothing else in
 * either build catches the two sides disagreeing about what a patch looks like
 * on the wire. This fixture is that check: Catalyst asserts it survives its
 * parse/normalise path, Notes9 asserts every mutation in it is accepted by the
 * schema that actually applies it. Change the fixture on one side only and one
 * of the two suites goes red.
 *
 * It deliberately spans the payload shapes that DIFFER per kind, `filters`,
 * `transform`, `patch`, `index`, `axis`, `seriesKey`, and the plain
 * `{ kind, value }` form, because a passthrough that flattens or renames a
 * field only breaks on the kinds that don't use `value`.
 */
describe("cross-repo contract fixture", () => {
  it("parses as a whole SpecPatchProposal envelope", () => {
    const parsed = SpecPatchProposal.safeParse(contractFixture)
    expect(parsed.success).toBe(true)
  })

  for (const [index, mutation] of contractFixture.mutations.entries()) {
    it(`mutation[${index}] ("${mutation.kind}") parses under SpecMutationSchema`, () => {
      const result = parseMutation(mutation)
      // Surface zod's reason rather than a bare `false` when this breaks.
      expect(result.ok ? null : result.reason).toBeNull()
    })
  }

  // The shape coverage is the point of the fixture, so it is asserted rather
  // than left to whoever edits the JSON next.
  it("covers every per-kind payload shape the passthrough could flatten", () => {
    const fields = new Set(contractFixture.mutations.flatMap((m) => Object.keys(m)))
    for (const field of ["value", "filters", "transform", "patch", "index", "axis", "seriesKey"]) {
      expect(fields).toContain(field)
    }
  })

  it("only contains kinds the assistant is allowed to author", () => {
    for (const mutation of contractFixture.mutations) {
      expect(FORBIDDEN_MUTATION_KINDS.has(mutation.kind)).toBe(false)
      expect(ALLOWED_MUTATION_KINDS.has(mutation.kind as SpecMutation["kind"])).toBe(true)
    }
  })
})

// Type-level only, this block runs no assertions; a `tsc` failure here IS the
// test. It confirms the zod-inferred type is assignable to the hand-written
// `SpecMutation` union, so a schema branch that diverges in shape from its TS
// counterpart fails the build instead of surfacing as a silent runtime gap.
function typeAssignabilityCheck(m: import("zod").infer<typeof SpecMutationSchema>): SpecMutation {
  return m
}
void typeAssignabilityCheck
