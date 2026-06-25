import { describe, expect, it } from "vitest"

import {
  buildPmcPdfCandidateUrls,
  looksLikeHtmlInterstitial,
} from "@/lib/literature-pdf-import"
import { extractPdfFromUnpaywallPayload, unpaywallContactEmail } from "@/lib/unpaywall"

const enc = (s: string) => new TextEncoder().encode(s)
const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]) // "%PDF-1.5"

describe("buildPmcPdfCandidateUrls — non-gated mirror first", () => {
  const urls = buildPmcPdfCandidateUrls("123456")

  it("puts the Europe PMC render mirror before any NLM /pdf URL", () => {
    const firstEuropePmc = urls.findIndex((u) => u.includes("europepmc.org"))
    const firstNlmPdf = urls.findIndex((u) => /ncbi\.nlm\.nih\.gov\/.*\/pdf/.test(u))
    expect(firstEuropePmc).toBeGreaterThanOrEqual(0)
    expect(firstNlmPdf).toBeGreaterThanOrEqual(0)
    expect(firstEuropePmc).toBeLessThan(firstNlmPdf)
  })

  it("orders the bare POW-prone /pdf/ folder forms last", () => {
    const lastMainPdf = Math.max(...urls.flatMap((u, i) => (u.endsWith("/pdf/main.pdf") ? [i] : [])))
    const firstFolder = urls.findIndex((u) => /\/pdf\/$/.test(u))
    expect(firstFolder).toBeGreaterThan(lastMainPdf)
  })

  it("normalizes the id to the PMC<digits> form", () => {
    expect(buildPmcPdfCandidateUrls("PMC777")[0]).toContain("PMC777")
  })
})

describe("looksLikeHtmlInterstitial", () => {
  it("flags an explicit text/html content-type", () => {
    expect(looksLikeHtmlInterstitial("text/html; charset=utf-8", PDF_MAGIC)).toBe(true)
  })

  it("flags a body that starts with '<' (with BOM/whitespace)", () => {
    expect(looksLikeHtmlInterstitial(null, enc("  <!DOCTYPE html>"))).toBe(true)
    expect(looksLikeHtmlInterstitial(null, new Uint8Array([0xef, 0xbb, 0xbf, 0x3c]))).toBe(true)
  })

  it("accepts real PDF bytes even when content-type is missing or octet-stream", () => {
    expect(looksLikeHtmlInterstitial(null, PDF_MAGIC)).toBe(false)
    expect(looksLikeHtmlInterstitial("application/octet-stream", PDF_MAGIC)).toBe(false)
  })
})

describe("extractPdfFromUnpaywallPayload", () => {
  it("prefers best_oa_location.url_for_pdf", () => {
    const url = extractPdfFromUnpaywallPayload({
      best_oa_location: { url_for_pdf: "https://repo.example.org/a.pdf", url: "https://x/landing" },
      oa_locations: [{ url_for_pdf: "https://other.example.org/b.pdf" }],
    })
    expect(url).toBe("https://repo.example.org/a.pdf")
  })

  it("falls back to an oa_locations entry when best is absent", () => {
    const url = extractPdfFromUnpaywallPayload({
      best_oa_location: null,
      oa_locations: [{ url: "https://no-pdf/landing" }, { url_for_pdf: "https://m.example.org/c.pdf" }],
    })
    expect(url).toBe("https://m.example.org/c.pdf")
  })

  it("accepts a .url only when it clearly points at a PDF", () => {
    expect(
      extractPdfFromUnpaywallPayload({ best_oa_location: { url: "https://h/paper.pdf?x=1" } }),
    ).toBe("https://h/paper.pdf?x=1")
    expect(extractPdfFromUnpaywallPayload({ best_oa_location: { url: "https://h/landing" } })).toBeNull()
  })

  it("returns null when there is no OA PDF anywhere", () => {
    expect(extractPdfFromUnpaywallPayload({})).toBeNull()
  })
})

describe("unpaywallContactEmail — prefer the signed-in user's email", () => {
  it("uses the caller-supplied (user) email over the env override", () => {
    const prev = process.env.UNPAYWALL_EMAIL
    process.env.UNPAYWALL_EMAIL = "env@notes9.com"
    try {
      expect(unpaywallContactEmail("user@lab.edu")).toBe("user@lab.edu")
    } finally {
      if (prev === undefined) delete process.env.UNPAYWALL_EMAIL
      else process.env.UNPAYWALL_EMAIL = prev
    }
  })

  it("falls back to the env override when no user email is given", () => {
    const prev = process.env.UNPAYWALL_EMAIL
    process.env.UNPAYWALL_EMAIL = "env@notes9.com"
    try {
      expect(unpaywallContactEmail(null)).toBe("env@notes9.com")
      expect(unpaywallContactEmail("  ")).toBe("env@notes9.com")
    } finally {
      if (prev === undefined) delete process.env.UNPAYWALL_EMAIL
      else process.env.UNPAYWALL_EMAIL = prev
    }
  })

  it("returns null when neither is available", () => {
    const prev = process.env.UNPAYWALL_EMAIL
    delete process.env.UNPAYWALL_EMAIL
    try {
      expect(unpaywallContactEmail(undefined)).toBeNull()
    } finally {
      if (prev !== undefined) process.env.UNPAYWALL_EMAIL = prev
    }
  })
})
