/**
 * The provenance card has to be reachable from the SHIPPING surface.
 *
 * It was not. `ProvenancePanel` was imported only by `workspace/analysis-
 * workspace.tsx`, imported only by `workspace-preview.tsx`, which has zero
 * importers, behind `app/(app)/data-analysis/preview/page.tsx` — a bare
 * `redirect()`. Meanwhile the production `<ResultsCard>` omitted
 * `onShowProvenance`, so its button never rendered. A card nobody can open is
 * indistinguishable from a card that does not exist, so the test that matters
 * is not "does it render given the prop" but "does production pass the prop".
 */

import { describe, it, expect, vi, afterEach } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"

import { ResultsCard } from "@/components/data-analysis/workspace/results-card"
import { ProvenancePanel } from "@/components/data-analysis/workspace/provenance-panel"
import { buildProvenanceCard } from "@/lib/data-analysis/provenance"
import type { AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import type { EngineResult } from "@/lib/data-analysis/engine/contract"

afterEach(cleanup)

const ROOT = path.resolve(__dirname, "../..")
const source = (p: string) => readFileSync(path.join(ROOT, p), "utf8")

const spec = {
  version: 1,
  dataset: {
    fileId: "f1",
    fileName: "plate-3.xlsx",
    sheet: "Raw",
    versionHash: "sha256:9f2c1b7ae4d05f38",
    rowCount: 24,
    columnCount: 4,
  },
  filters: [],
  transforms: [{ kind: "log10", column: "OD450" }],
  exclusions: [
    {
      rowId: "row-7",
      reasonKind: "statistical-outlier",
      reasonText: null,
      method: { name: "Grubbs", params: { alpha: 0.01 } },
      excludedBy: "u1",
      excludedAt: "2026-01-04T10:00:00.000Z",
    },
  ],
  analysis: {
    kind: "compare-groups",
    valueColumn: "OD450",
    groupColumn: "Treatment",
    subjectColumn: null,
    paired: false,
    tails: "two",
    alpha: 0.05,
    postHoc: "tukey",
    missingValues: "pairwise",
    randomSeed: null,
    nonlinear: null,
  },
  figure: { errorBars: "sem" },
} as unknown as AnalysisSpec

const result = {
  engineVersion: "notes9-engine 0.9.2 / scipy 1.14.1",
  computedAt: "2026-01-04T10:00:05.000Z",
  specHash: "3f9a2b18c4d7e60518aa",
  warnings: [],
  error: null,
  test: {
    test: "Welch's t-test",
    statistic: 3.14,
    df: 21.4,
    pValue: 0.0048,
    groupSizes: { Vehicle: 12, Drug: 11 },
    pairwise: [],
    terms: [],
    assumptions: [{ name: "Normality (Shapiro–Wilk)", passed: true, verdict: "p = 0.31" }],
    effectSizes: [{ name: "hedges-g", value: 1.24, ciLow: 0.41, ciHigh: 2.05, term: null }],
  },
  curveFit: null,
} as unknown as EngineResult

describe("the shipping route wires the provenance card", () => {
  const workspace = source("components/data-analysis/data-analysis-workspace.tsx")

  it("production ResultsCard is given onShowProvenance", () => {
    expect(workspace).toMatch(/<ResultsCard[\s\S]{0,400}?onShowProvenance=/)
  })

  it("production mounts ProvenancePanel itself, not only the preview harness", () => {
    expect(workspace).toContain(
      'import { ProvenancePanel } from "@/components/data-analysis/workspace/provenance-panel"',
    )
    expect(workspace).toMatch(/<ProvenancePanel[\s\S]{0,400}?spec=\{derivedSpec\}/)
  })

  it("the figure can open it too, not just the statistics", () => {
    // A figure travels into a manuscript on its own; "what produced this?" is
    // asked of the picture as often as of the table.
    expect(workspace).toMatch(/setProvenanceOpen\(true\)[\s\S]{0,600}?Provenance/)
  })
})

describe("the button renders and the panel opens with populated fields", () => {
  it("ResultsCard shows the button only when it can do something", () => {
    const { rerender } = render(<ResultsCard spec={spec} result={result} />)
    expect(screen.queryByRole("button", { name: /provenance/i })).toBeNull()

    rerender(<ResultsCard spec={spec} result={result} onShowProvenance={vi.fn()} />)
    expect(screen.getByRole("button", { name: /provenance/i })).toBeInTheDocument()
  })

  it("clicking it asks the workspace to open the panel", () => {
    const onShow = vi.fn()
    render(<ResultsCard spec={spec} result={result} onShowProvenance={onShow} />)
    fireEvent.click(screen.getByRole("button", { name: /provenance/i }))
    expect(onShow).toHaveBeenCalledOnce()
  })

  it("the opened panel carries every field the spec requires", () => {
    render(<ProvenancePanel open onClose={() => {}} spec={spec} result={result} />)
    const text = document.body.textContent ?? ""

    // §6.7 / §10.5, field by field.
    expect(text).toContain("plate-3.xlsx") // source file
    expect(text).toContain("sha256:9f2c1b7ae4d05f38") // version hash
    expect(text).toContain("23 of 24") // rows included/excluded
    expect(text).toContain("Statistical outlier") // ...and the reason
    expect(text).toContain("Grubbs")
    expect(text).toContain("log₁₀(OD450)") // transforms
    expect(text).toContain("Welch's t-test") // test
    expect(text).toContain("tukey") // ...and its options
    expect(text).toContain("0.05")
    expect(text).toContain("notes9-engine 0.9.2 / scipy 1.14.1") // engine version
  })

  it("renders nothing when closed", () => {
    render(<ProvenancePanel open={false} onClose={() => {}} spec={spec} result={result} />)
    expect(document.body.textContent).not.toContain("plate-3.xlsx")
  })
})

describe("no required field comes through empty on the production path", () => {
  it("every section of the card has entries, and none has a blank value", () => {
    const card = buildProvenanceCard(spec, result, {
      history: [],
      revisionNo: 3,
      isFrozen: false,
      sourceDetached: false,
    })
    for (const section of ["source", "data", "analysis", "engine"] as const) {
      expect(card[section].length, `${section} is empty`).toBeGreaterThan(0)
      for (const entry of card[section]) {
        expect(String(entry.value).trim(), `${section}/${entry.label} is blank`).not.toBe("")
      }
    }
    expect(card.exclusions.count).toBe(1)
    expect(card.exclusions.rows[0].reason).toContain("alpha=0.01")
  })
})
