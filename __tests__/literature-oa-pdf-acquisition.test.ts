import { afterEach, describe, expect, it, vi } from "vitest"

import {
  buildPmcPdfCandidateUrls,
  downloadFirstPdf,
  looksLikeHtmlInterstitial,
  oaPdfCacheKey,
} from "@/lib/literature-pdf-import"
import { extractPdfFromUnpaywallPayload, unpaywallContactEmail } from "@/lib/unpaywall"
import {
  extractSemanticScholarPdf,
  pickCoreDownloadUrl,
  resolveFromCore,
} from "@/lib/literature-oa-resolve"

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

describe("downloadFirstPdf (shared literature PDF downloader)", () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
    vi.restoreAllMocks()
  })

  const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35, 0x0a, 0x0a])
  const HTML_BYTES = new TextEncoder().encode("<!doctype html><html><body>Just a moment...</body></html>")

  function streamResponse(bytes: Uint8Array, contentType: string): Response {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    })
    return new Response(body, { status: 200, headers: { "content-type": contentType } })
  }

  it("rejects an HTML interstitial and returns the first valid PDF in a race", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("bot-wall")) return streamResponse(HTML_BYTES, "text/html; charset=utf-8")
      if (url.includes("good")) return streamResponse(PDF_BYTES, "application/pdf")
      return new Response(null, { status: 404 })
    }) as typeof fetch

    const result = await downloadFirstPdf(
      ["https://example.org/bot-wall.pdf", "https://example.org/good.pdf"],
      { perFetchTimeoutMs: 2_000, totalBudgetMs: 4_000 },
    )
    expect(result).not.toBeNull()
    expect(result!.usedUrl).toBe("https://example.org/good.pdf")
    expect(new Uint8Array(result!.buffer)[0]).toBe(0x25) // "%"
  })

  it("returns null when every candidate is a non-PDF", async () => {
    globalThis.fetch = vi.fn(async () => streamResponse(HTML_BYTES, "text/html")) as typeof fetch
    const result = await downloadFirstPdf(["https://example.org/a", "https://example.org/b"], {
      perFetchTimeoutMs: 2_000,
      totalBudgetMs: 4_000,
    })
    expect(result).toBeNull()
  })

  it("returns null for an empty candidate list", async () => {
    expect(await downloadFirstPdf([])).toBeNull()
  })
})

describe("oaPdfCacheKey", () => {
  it("is stable for the same paper so tag and read hit the same cache object", () => {
    const paper = { doi: "10.1/ABC", pmid: "123", title: "Megalin uptake", year: 2020 }
    expect(oaPdfCacheKey(paper)).toBe(oaPdfCacheKey({ ...paper }))
  })

  it("keys by normalized DOI (DOI variants collapse to one key)", () => {
    const a = oaPdfCacheKey({ doi: "10.1/ABC", pmid: "1" })
    const b = oaPdfCacheKey({ doi: "https://doi.org/10.1/abc", pmid: "2" })
    expect(a).toBe(b) // DOI wins over PMID and is normalized
  })

  it("falls back to PMID, then title|year, and is null when no identity", () => {
    expect(oaPdfCacheKey({ pmid: "555" })).toBe(oaPdfCacheKey({ pmid: "555" }))
    expect(oaPdfCacheKey({ title: "A", year: 2000 })).not.toBe(oaPdfCacheKey({ title: "A", year: 2001 }))
    expect(oaPdfCacheKey({})).toBeNull()
  })
})

describe("extractSemanticScholarPdf", () => {
  it("returns the openAccessPdf url when present", () => {
    expect(extractSemanticScholarPdf({ openAccessPdf: { url: "https://repo.example/x.pdf" } })).toBe(
      "https://repo.example/x.pdf",
    )
  })

  it("returns null when absent, non-http, or malformed", () => {
    expect(extractSemanticScholarPdf({ openAccessPdf: null })).toBeNull()
    expect(extractSemanticScholarPdf({})).toBeNull()
    expect(extractSemanticScholarPdf(null)).toBeNull()
    expect(extractSemanticScholarPdf({ openAccessPdf: { url: "ftp://nope" } })).toBeNull()
  })
})

describe("pickCoreDownloadUrl — matches the RIGHT paper by DOI", () => {
  const doi = "10.1234/abc"

  it("picks the downloadUrl of the result whose DOI matches exactly", () => {
    const results = [
      { doi: "10.9999/other", downloadUrl: "https://repo/wrong.pdf" },
      { doi: "10.1234/ABC", downloadUrl: "https://repo/right.pdf" }, // case-insensitive match
    ]
    expect(pickCoreDownloadUrl(results, doi)).toBe("https://repo/right.pdf")
  })

  it("never returns a neighbouring paper's PDF (no DOI match → null)", () => {
    const results = [{ doi: "10.9999/other", downloadUrl: "https://repo/wrong.pdf" }]
    expect(pickCoreDownloadUrl(results, doi)).toBeNull()
    expect(pickCoreDownloadUrl([], doi)).toBeNull()
    expect(pickCoreDownloadUrl(null, doi)).toBeNull()
  })

  it("skips a matching result that has no usable download url", () => {
    const results = [
      { doi: "10.1234/abc", downloadUrl: null },
      { doi: "10.1234/abc", downloadUrl: "https://repo/right.pdf" },
    ]
    expect(pickCoreDownloadUrl(results, doi)).toBe("https://repo/right.pdf")
  })
})

describe("resolveFromCore — no-op without a key", () => {
  it("returns null when CORE_API_KEY is unset (never calls the network)", async () => {
    const prev = process.env.CORE_API_KEY
    delete process.env.CORE_API_KEY
    try {
      await expect(resolveFromCore("10.1234/abc")).resolves.toBeNull()
    } finally {
      if (prev !== undefined) process.env.CORE_API_KEY = prev
    }
  })

  it("returns null for a missing DOI", async () => {
    await expect(resolveFromCore(null)).resolves.toBeNull()
  })
})
