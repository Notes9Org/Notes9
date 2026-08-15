import { describe, it, expect, vi, beforeEach } from "vitest"
import { Readable } from "node:stream"

// ── Shared mocks for the transport-level tests (redirect chains, DNS pinning) ──
// vi.mock factories are hoisted above imports, so hoisted-safe handles are used.
const { httpRequestMock, httpsRequestMock, dnsLookupMock } = vi.hoisted(() => ({
  httpRequestMock: vi.fn(),
  httpsRequestMock: vi.fn(),
  dnsLookupMock: vi.fn(),
}))

vi.mock("node:http", () => ({ default: { request: httpRequestMock }, request: httpRequestMock }))
vi.mock("node:https", () => ({ default: { request: httpsRequestMock }, request: httpsRequestMock }))
vi.mock("node:dns", () => ({
  default: { promises: { lookup: dnsLookupMock } },
  promises: { lookup: dnsLookupMock },
}))

// vi.mock calls above are hoisted above this import, so safeFetch picks up
// the mocked transport/DNS modules.
import { safeFetch, SsrfBlocked } from "./safe-fetch"

function fakeIncomingMessage(opts: {
  status?: number
  headers?: Record<string, string>
  body?: string
}) {
  const r = Readable.from([Buffer.from(opts.body ?? "")]) as unknown as {
    statusCode: number
    statusMessage: string
    headers: Record<string, string>
    resume: () => void
    destroy: () => void
  } & Readable
  r.statusCode = opts.status ?? 200
  r.statusMessage = "OK"
  r.headers = opts.headers ?? {}
  return r
}

/** Queue a fake `http.request`/`https.request` implementation that captures
 *  the options it was called with and replies with `responses[callIndex]`
 *  (clamped to the last entry) on the next microtask. */
function mockTransport(mod: "http" | "https", responses: ReturnType<typeof fakeIncomingMessage>[]) {
  const requestMock = mod === "https" ? httpsRequestMock : httpRequestMock
  const otherMock = mod === "https" ? httpRequestMock : httpsRequestMock
  const captured: Array<Record<string, unknown>> = []
  let callIndex = 0
  requestMock.mockImplementation((options: Record<string, unknown>, callback: (res: unknown) => void) => {
    captured.push(options)
    const res = responses[Math.min(callIndex, responses.length - 1)]
    callIndex++
    return {
      on: vi.fn(),
      end: vi.fn(() => queueMicrotask(() => callback(res))),
      destroy: vi.fn(),
    }
  })
  otherMock.mockImplementation(() => {
    throw new Error(`unexpected call to the other protocol's request()`)
  })
  return { captured, requestMock }
}

beforeEach(() => {
  httpRequestMock.mockReset()
  httpsRequestMock.mockReset()
  dnsLookupMock.mockReset()
})

describe("safeFetch — shape rejections (no network, synchronous before connect)", () => {
  it("rejects a malformed URL", async () => {
    await expect(safeFetch("not a url")).rejects.toThrow(SsrfBlocked)
  })

  it("rejects a non-http(s) protocol", async () => {
    await expect(safeFetch("ftp://example.com/file")).rejects.toThrow(SsrfBlocked)
    await expect(safeFetch("file:///etc/passwd")).rejects.toThrow(SsrfBlocked)
  })

  it("rejects plain loopback (127.0.0.1)", async () => {
    await expect(safeFetch("http://127.0.0.1/")).rejects.toThrow(SsrfBlocked)
  })

  it("rejects RFC1918 private ranges", async () => {
    await expect(safeFetch("http://10.0.0.5/")).rejects.toThrow(SsrfBlocked)
    await expect(safeFetch("http://172.16.0.1/")).rejects.toThrow(SsrfBlocked)
    await expect(safeFetch("http://192.168.1.1/")).rejects.toThrow(SsrfBlocked)
  })

  it("rejects link-local / cloud metadata (169.254.169.254)", async () => {
    await expect(safeFetch("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(SsrfBlocked)
  })

  it("rejects the dotless-hex encoding of 127.0.0.1", async () => {
    // Node's URL parser normalizes 0x7f000001 -> 127.0.0.1 in .hostname,
    // so this must be blocked exactly like the dotted form.
    await expect(safeFetch("http://0x7f000001/")).rejects.toThrow(SsrfBlocked)
  })

  it("rejects IPv4-mapped IPv6 loopback (the N9-3 bypass)", async () => {
    await expect(safeFetch("http://[::ffff:127.0.0.1]/")).rejects.toThrow(SsrfBlocked)
  })

  it("rejects IPv4-mapped IPv6 cloud metadata", async () => {
    await expect(safeFetch("http://[::ffff:169.254.169.254]/")).rejects.toThrow(SsrfBlocked)
  })

  it("rejects native IPv6 loopback, link-local, and ULA", async () => {
    await expect(safeFetch("http://[::1]/")).rejects.toThrow(SsrfBlocked)
    await expect(safeFetch("http://[fe80::1]/")).rejects.toThrow(SsrfBlocked)
    await expect(safeFetch("http://[fc00::1]/")).rejects.toThrow(SsrfBlocked)
    await expect(safeFetch("http://[fd12:3456:789a::1]/")).rejects.toThrow(SsrfBlocked)
  })

  it("never calls the transport for any blocked target", async () => {
    await safeFetch("http://127.0.0.1/").catch(() => {})
    expect(httpRequestMock).not.toHaveBeenCalled()
    expect(httpsRequestMock).not.toHaveBeenCalled()
  })
})

describe("safeFetch — DNS-resolved hostnames", () => {
  it("rejects a hostname that resolves to a private address", async () => {
    dnsLookupMock.mockResolvedValue([{ address: "10.1.2.3", family: 4 }])
    await expect(safeFetch("http://internal.example.com/")).rejects.toThrow(SsrfBlocked)
    expect(httpRequestMock).not.toHaveBeenCalled()
  })

  it("rejects when ANY resolved address is private, even if another is public", async () => {
    dnsLookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ])
    await expect(safeFetch("http://multi-homed.example.com/")).rejects.toThrow(SsrfBlocked)
  })

  it("connects to a pinned IP for a hostname that resolves cleanly to a public address", async () => {
    dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
    const { captured } = mockTransport("https", [fakeIncomingMessage({ status: 200, body: "ok" })])
    const res = await safeFetch("https://public.example.com/resource")
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("ok")
    // The socket connects via a custom `lookup` pinned to the validated IP,
    // not by letting Node re-resolve `public.example.com` itself.
    expect(captured[0].hostname).toBe("public.example.com") // Host header / SNI stay on the real hostname
    expect(typeof captured[0].lookup).toBe("function")
  })
})

describe("safeFetch — DNS-rebinding TOCTOU pin-at-connect", () => {
  it("connects to the address validated at resolve time, never re-resolving at connect", async () => {
    // First (and per this test, ONLY) lookup call returns a public address.
    // If safeFetch re-resolved at connect time it would be able to observe a
    // different answer here — the assertion below proves it never asks again.
    dnsLookupMock.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
    dnsLookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]) // "rebind" answer, must never be used

    const { captured } = mockTransport("https", [fakeIncomingMessage({ status: 200, body: "ok" })])
    await safeFetch("https://rebind.example.com/")

    expect(dnsLookupMock).toHaveBeenCalledTimes(1)
    const lookupFn = captured[0].lookup as (
      hostname: string,
      options: unknown,
      cb: (err: Error | null, address: string, family: number) => void
    ) => void
    // Simulate what Node's socket layer does internally when connecting —
    // it must get back the pinned public IP, regardless of what hostname is
    // asked about (proving the pin ignores the hostname / can't be rebound).
    const calls: Array<[string | null, number | undefined]> = []
    lookupFn("rebind.example.com", {}, (err, address, family) => calls.push([address, family]))
    lookupFn("totally-different-host.evil.com", {}, (err, address, family) => calls.push([address, family]))
    expect(calls).toEqual([
      ["93.184.216.34", 4],
      ["93.184.216.34", 4],
    ])
  })
})

describe("safeFetch — redirects", () => {
  it("follows a redirect and re-validates the new hop", async () => {
    dnsLookupMock.mockImplementation(async (hostname: string) => {
      if (hostname === "public-a.example.com") return [{ address: "93.184.216.34", family: 4 }]
      if (hostname === "public-b.example.com") return [{ address: "1.2.3.4", family: 4 }]
      throw new Error("unexpected hostname")
    })
    mockTransport("https", [
      fakeIncomingMessage({ status: 302, headers: { location: "https://public-b.example.com/final" } }),
      fakeIncomingMessage({ status: 200, body: "final-body" }),
    ])
    const res = await safeFetch("https://public-a.example.com/start")
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("final-body")
    expect(dnsLookupMock).toHaveBeenCalledTimes(2) // both hops independently resolved+validated
  })

  it("blocks a redirect hop that targets an internal IP, and never connects to it", async () => {
    dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
    mockTransport("https", [
      fakeIncomingMessage({
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      }),
    ])
    await expect(safeFetch("https://allowlisted-host.example.com/start")).rejects.toThrow(SsrfBlocked)
    // Exactly one real request was made (the first hop) — the malicious
    // redirect target was rejected before a second connection was attempted.
    expect(httpsRequestMock).toHaveBeenCalledTimes(1)
    expect(httpRequestMock).not.toHaveBeenCalled()
  })

  it("caps redirect depth at 3 by default", async () => {
    let n = 0
    dnsLookupMock.mockImplementation(async () => [{ address: "93.184.216.34", family: 4 }])
    httpsRequestMock.mockImplementation((_options: unknown, callback: (res: unknown) => void) => {
      n++
      const res = fakeIncomingMessage({
        status: 302,
        headers: { location: `https://public.example.com/hop-${n}` },
      })
      return { on: vi.fn(), end: vi.fn(() => queueMicrotask(() => callback(res))), destroy: vi.fn() }
    })
    await expect(safeFetch("https://public.example.com/hop-0")).rejects.toThrow(SsrfBlocked)
    // Initial request + 3 allowed redirects = 4 attempts before the 5th (would-be)
    // hop is rejected as exceeding the cap.
    expect(n).toBe(4)
  })

  it("strips Authorization/Cookie on a cross-origin redirect", async () => {
    dnsLookupMock.mockImplementation(async (hostname: string) => {
      if (hostname === "public-a.example.com") return [{ address: "93.184.216.34", family: 4 }]
      if (hostname === "public-b.example.com") return [{ address: "1.2.3.4", family: 4 }]
      throw new Error("unexpected hostname")
    })
    const { captured } = mockTransport("https", [
      fakeIncomingMessage({ status: 302, headers: { location: "https://public-b.example.com/final" } }),
      fakeIncomingMessage({ status: 200, body: "final-body" }),
    ])
    const res = await safeFetch("https://public-a.example.com/start", {
      headers: { Authorization: "Bearer secret", Cookie: "sid=abc", "x-keep": "yes" },
    })
    expect(res.status).toBe(200)
    // First hop (same origin as the request itself) still carries the secrets...
    expect(captured[0].headers).toMatchObject({ Authorization: "Bearer secret", Cookie: "sid=abc" })
    // ...but the cross-origin redirect target must not receive them.
    const secondHeaders = captured[1].headers as Record<string, string>
    expect(secondHeaders.Authorization).toBeUndefined()
    expect(secondHeaders.Cookie).toBeUndefined()
    expect(secondHeaders["x-keep"]).toBe("yes")
  })

  it("keeps Authorization/Cookie on a same-origin redirect", async () => {
    dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
    const { captured } = mockTransport("https", [
      fakeIncomingMessage({ status: 302, headers: { location: "https://public-a.example.com/final" } }),
      fakeIncomingMessage({ status: 200, body: "final-body" }),
    ])
    const res = await safeFetch("https://public-a.example.com/start", {
      headers: { Authorization: "Bearer secret", Cookie: "sid=abc" },
    })
    expect(res.status).toBe(200)
    const secondHeaders = captured[1].headers as Record<string, string>
    expect(secondHeaders.Authorization).toBe("Bearer secret")
    expect(secondHeaders.Cookie).toBe("sid=abc")
  })
})
