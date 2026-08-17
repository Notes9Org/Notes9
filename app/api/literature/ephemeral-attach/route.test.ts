import { describe, it, expect, vi, beforeEach } from "vitest"

// SEC-001 (N9-2): the vulnerability this route owned was letting the search
// card's raw, unvalidated `paper.pdfUrl` reach the network as a blind-SSRF
// probe. These tests exercise the REAL `downloadFirstPdf` (from
// `literature-pdf-import.ts`, not mocked) so the gate it now enforces
// (`shouldTrySearchCardPdfUrl`, called before any `safeFetch`) is proven
// end-to-end through this route, not just at the `safeFetch` unit level.
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", email: "u@example.com" })),
}))

vi.mock("@/lib/supabase/server", () => ({
  // `createClient()` is called unconditionally at the top of the route, but
  // `.storage` is never touched on the blocked-pdfUrl fallback path (that
  // branch returns before the upload step) — a `.storage` call would still
  // throw here and fail the test loudly if that ever changed.
  createClient: vi.fn(async () => ({
    storage: {
      from: () => {
        throw new Error("storage should not be reached on the blocked-pdfUrl fallback path")
      },
    },
  })),
}))

// Isolates these tests from the real OA resolver network calls (Unpaywall/
// OpenAlex/EuropePMC/etc.) — irrelevant to what's being proven here, which is
// that the card's own `pdfUrl` can't bypass the allowlist.
vi.mock("@/lib/literature-oa-resolve", () => ({
  resolveOaSources: vi.fn(async () => ({ pdfUrls: [], oaPackageTgzUrl: null, abstract: null })),
}))

const { safeFetchMock } = vi.hoisted(() => ({ safeFetchMock: vi.fn() }))
vi.mock("@/lib/net/safe-fetch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/net/safe-fetch")>("@/lib/net/safe-fetch")
  return { ...actual, safeFetch: safeFetchMock }
})

import { POST } from "./route"

function req(body: unknown) {
  return new Request("http://localhost/api/literature/ephemeral-attach", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  safeFetchMock.mockReset()
  // If the gate is ever bypassed, fail loudly (a real network call) rather
  // than silently succeeding and masking the regression.
  safeFetchMock.mockRejectedValue(new Error("safeFetch must not be reached for a blocked pdfUrl"))
})

describe("POST /api/literature/ephemeral-attach — blind-SSRF via paper.pdfUrl (N9-2)", () => {
  it("rejects an AWS/GCP metadata-IP pdfUrl before ever calling safeFetch, and falls back to the abstract", async () => {
    const res = await POST(
      req({
        paper: {
          title: "Evil Paper",
          pdfUrl: "http://169.254.169.254/latest/meta-data/",
          abstract: "An abstract.",
        },
      }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.fallback).toBe(true)
    expect(json.reason).toBe("fetch_failed") // a candidate existed (pdfUrl); it was blocked, not "absent"
    expect(safeFetchMock).not.toHaveBeenCalled()
  })

  it("rejects a loopback-IP pdfUrl the same way", async () => {
    const res = await POST(
      req({ paper: { title: "Evil Paper 2", pdfUrl: "http://127.0.0.1:8080/admin", abstract: "x" } }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.fallback).toBe(true)
    expect(safeFetchMock).not.toHaveBeenCalled()
  })

  it("ATTEMPTS a non-allowlisted public host by default, leaving the decision to safeFetch", async () => {
    // Behaviour change, deliberate. This previously asserted the publisher
    // allowlist blocked unlisted *public* hosts before safeFetch. Enforcing that
    // unconditionally is what stopped open-access downloads: the list omits
    // doi.org, BMC, Semantic Scholar and CORE, so legitimate papers were dropped
    // silently. The allowlist is now opt-in via NOTES9_ENFORCE_PDF_HOST_ALLOWLIST.
    //
    // The SSRF guarantee is unchanged and is covered by the two tests above: a
    // private/loopback/metadata host is still refused before safeFetch is reached.
    // For a genuinely public host, safeFetch resolves and validates the address,
    // which is the control that actually closes N9-2.
    const res = await POST(
      req({ paper: { title: "Random Paper", pdfUrl: "https://not-a-known-publisher.example.net/x.pdf", abstract: "x" } }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.fallback).toBe(true) // safeFetch rejects in this suite, so we still fall back
    expect(safeFetchMock).toHaveBeenCalled()
  })

  it("still blocks a non-allowlisted public host when the allowlist IS enforced", async () => {
    const KEY = "NOTES9_ENFORCE_PDF_HOST_ALLOWLIST"
    const original = process.env[KEY]
    process.env[KEY] = "1"
    try {
      const res = await POST(
        req({ paper: { title: "Random Paper", pdfUrl: "https://not-a-known-publisher.example.net/x.pdf", abstract: "x" } }),
      )
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.fallback).toBe(true)
      expect(safeFetchMock).not.toHaveBeenCalled()
    } finally {
      if (original === undefined) delete process.env[KEY]
      else process.env[KEY] = original
    }
  })

  it("returns 400 on an invalid JSON body", async () => {
    const res = await POST(new Request("http://localhost/x", { method: "POST", body: "not json" }))
    expect(res.status).toBe(400)
  })
})
