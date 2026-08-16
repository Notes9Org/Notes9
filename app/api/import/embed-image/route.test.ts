import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", email: "u@example.com" })),
}))

const { safeFetchMock } = vi.hoisted(() => ({ safeFetchMock: vi.fn() }))
vi.mock("@/lib/net/safe-fetch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/net/safe-fetch")>("@/lib/net/safe-fetch")
  return { ...actual, safeFetch: safeFetchMock }
})

import { POST } from "./route"
import { SsrfBlocked } from "@/lib/net/safe-fetch"

function req(body: unknown) {
  return new Request("http://localhost/api/import/embed-image", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  safeFetchMock.mockReset()
})

describe("POST /api/import/embed-image", () => {
  it("routes the URL through safeFetch and returns a data URI for a legitimate image", async () => {
    safeFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (n: string) => (n.toLowerCase() === "content-type" ? "image/png" : null) },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })
    const res = await POST(req({ url: "https://cdn.example.com/pic.png" }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.dataUri).toBe(`data:image/png;base64,${Buffer.from([1, 2, 3]).toString("base64")}`)
    expect(safeFetchMock).toHaveBeenCalledWith("https://cdn.example.com/pic.png", expect.any(Object))
  })

  it("maps an SsrfBlocked rejection (private/loopback/mapped-IPv6 target) to 400", async () => {
    safeFetchMock.mockRejectedValue(new SsrfBlocked("blocked"))
    const res = await POST(req({ url: "http://169.254.169.254/latest/meta-data/" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Blocked host")
  })

  it("rejects a non-image content type", async () => {
    safeFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (n: string) => (n.toLowerCase() === "content-type" ? "text/html" : null) },
      arrayBuffer: async () => new Uint8Array([]).buffer,
    })
    const res = await POST(req({ url: "https://example.com/page.html" }))
    expect(res.status).toBe(415)
  })

  it("rejects an oversized image", async () => {
    safeFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (n: string) => (n.toLowerCase() === "content-type" ? "image/png" : null) },
      arrayBuffer: async () => new ArrayBuffer(11 * 1024 * 1024),
    })
    const res = await POST(req({ url: "https://example.com/huge.png" }))
    expect(res.status).toBe(413)
  })

  it("returns 400 on an invalid body", async () => {
    const res = await POST(new Request("http://localhost/x", { method: "POST", body: "not json" }))
    expect(res.status).toBe(400)
  })
})
