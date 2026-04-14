import { describe, expect, it } from "vitest"
import {
  broadPubMedFallbackOrClause,
  buildExpandedPubMedTerm,
  capExpandedPubMedTermEncodedLength,
  expandQueryForLexicalScoring,
  generateQueryVariants,
  literatureApiSearchQuery,
  meshHintsForQuery,
  normalizeAcademicSearchText,
  pubMedAuthorHintClause,
} from "./paper-query-variants"

describe("generateQueryVariants", () => {
  it("returns empty for blank input", () => {
    expect(generateQueryVariants("   ", 4)).toEqual([])
  })

  it("first variant is the original normalized query", () => {
    const v = generateQueryVariants("How does CKD affect drug metabolism?", 5)
    expect(v.length).toBeGreaterThanOrEqual(1)
    expect(v[0]).toContain("CKD")
  })

  it("second variant is the compact keyword form", () => {
    const v = generateQueryVariants("What is the surrogate methodology for SMFA being developed by patrick duffy", 4)
    // compact form: ALL-CAPS first, stop-words stripped
    expect(v[1]?.toLowerCase()).toContain("smfa")
    expect(v[1]?.toLowerCase()).toContain("surrogate")
  })

  it("deduplicates case-insensitively", () => {
    const v = generateQueryVariants("kidney disease drug", 4)
    const lower = v.map((s) => s.toLowerCase())
    expect(new Set(lower).size).toBe(lower.length)
  })
})

describe("meshHintsForQuery (deprecated stub)", () => {
  it("always returns empty array — PubMed ATM handles MeSH mapping natively", () => {
    expect(meshHintsForQuery("renal clearance in CKD", 4)).toEqual([])
    expect(meshHintsForQuery("malaria transmission blocking SMFA", 4)).toEqual([])
  })
})

describe("buildExpandedPubMedTerm", () => {
  it("produces a compact AND query that lets PubMed ATM work (no full NL question in parens)", () => {
    const t = buildExpandedPubMedTerm("CKD drug metabolism")
    // compact AND query: ATM-eligible tokens
    expect(t).toContain("CKD")
    expect(t).toContain("drug")
    // Should NOT wrap the full sentence (that would disable ATM)
    expect(t).not.toMatch(/\(CKD drug metabolism\)/)
  })

  it("includes author hint for 'by firstname lastname' queries", () => {
    const q = "What is the surrogate methodology for SMFA being developed by patrick duffy"
    const t = buildExpandedPubMedTerm(q)
    expect(t).toContain("SMFA")
    expect(t).toContain("Duffy P[au]")
  })

  it("appends a broad OR fallback for verbose question-style queries", () => {
    const q = "What is the surrogate methodology for SMFA being developed by patrick duffy"
    const broad = broadPubMedFallbackOrClause(q)
    expect(broad).toBeTruthy()
    const t = buildExpandedPubMedTerm(q)
    expect(t).toContain(" OR ")
    // broad OR group is part of the output
    const orPart = broad!.split(" OR ")[0]
    expect(t.toLowerCase()).toContain(orPart!.toLowerCase())
  })

  it("does NOT wrap the full NL question in parentheses (ATM must not be disabled)", () => {
    const q = "What is the surrogate methodology for SMFA being developed by patrick duffy"
    const t = buildExpandedPubMedTerm(q)
    expect(t).not.toContain("What is the")
  })
})

describe("normalizeAcademicSearchText", () => {
  it("fixes common methodology misspelling", () => {
    expect(normalizeAcademicSearchText("methodolgy of clearance")).toContain("methodology")
  })

  it("fixes pharmacokinetics misspelling", () => {
    expect(normalizeAcademicSearchText("pharmakokinetcs study")).toBe("pharmakokinetcs study")
    expect(normalizeAcademicSearchText("pharmacokinetcs study")).toBe("pharmacokinetics study")
  })
})

describe("pubMedAuthorHintClause", () => {
  it("builds Last F[au] from trailing by firstname lastname", () => {
    const q = normalizeAcademicSearchText(
      "What is the surrogate methodolgy for SMFA being developed by patrick duffy",
    )
    expect(pubMedAuthorHintClause(q)).toBe("(Duffy P[au])")
  })

  it("returns null when no author pattern present", () => {
    expect(pubMedAuthorHintClause("SMFA surrogate malaria assay")).toBeNull()
  })

  it("returns null when trailing words are non-person tokens", () => {
    expect(pubMedAuthorHintClause("efficacy determined by surrogate assay")).toBeNull()
  })
})

describe("literatureApiSearchQuery", () => {
  it("strips question words and promotes ALL-CAPS acronym first", () => {
    const q = "What is the surrogate methodolgy for SMFA being developed by patrick duffy"
    const s = literatureApiSearchQuery(q)
    expect(s.toLowerCase()).toContain("smfa")
    expect(s.toLowerCase()).toContain("surrogate")
    expect(s.toLowerCase()).toContain("methodology")
    // Question boilerplate removed
    expect(s.toLowerCase().startsWith("what")).toBe(false)
    // Author tokens excluded (handled separately by author hint)
    expect(s.toLowerCase()).not.toContain("patrick")
  })

  it("promotes ALL-CAPS tokens before lowercase tokens", () => {
    const s = literatureApiSearchQuery("analysis of EGFR mutations in lung cancer")
    const tokens = s.split(" ")
    const egfrIdx = tokens.findIndex((t) => t === "EGFR")
    const analysisIdx = tokens.findIndex((t) => t.toLowerCase() === "analysis")
    expect(egfrIdx).toBeLessThan(analysisIdx)
  })

  it("works for any unknown acronym without a lookup table", () => {
    const s = literatureApiSearchQuery("efficacy of XYZQ in treating disease")
    // Structural ALL-CAPS detection — XYZQ is promoted even though it's not in any table
    expect(s).toContain("XYZQ")
  })
})

describe("capExpandedPubMedTermEncodedLength", () => {
  it("returns unchanged when under budget", () => {
    const { term, clipped } = capExpandedPubMedTermEncodedLength("(kidney)[tiab]", 4000)
    expect(clipped).toBe(false)
    expect(term).toBe("(kidney)[tiab]")
  })

  it("drops trailing OR clauses until within encoded budget", () => {
    const parts = Array.from({ length: 40 }, (_, i) => `"term${String(i).padStart(3, "0")}longphrase"[tiab]`)
    const huge = parts.join(" OR ")
    expect(encodeURIComponent(huge).length).toBeGreaterThan(500)
    const { term, clipped } = capExpandedPubMedTermEncodedLength(huge, 500)
    expect(clipped).toBe(true)
    expect(encodeURIComponent(term).length).toBeLessThanOrEqual(500)
  })
})

describe("expandQueryForLexicalScoring", () => {
  it("returns the normalized query without injecting synonyms", () => {
    const s = expandQueryForLexicalScoring("kidney disease treatment")
    expect(s).toBe("kidney disease treatment")
    // No synonym injection — BM25 scores on actual token overlap
    expect(s.toLowerCase()).not.toContain("renal")
    expect(s.toLowerCase()).not.toContain("glomerular")
  })

  it("applies typo normalization", () => {
    const s = expandQueryForLexicalScoring("methodolgy of drug clearance")
    expect(s).toContain("methodology")
  })
})
