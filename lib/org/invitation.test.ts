import { describe, it, expect, vi, afterEach } from "vitest"
import { generateInvitationToken, buildInvitationUrl } from "./invitation"

describe("generateInvitationToken", () => {
  it("returns a 64-character hex string", () => {
    const token = generateInvitationToken()
    expect(token).toHaveLength(64)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  it("generates unique tokens on each call", () => {
    const token1 = generateInvitationToken()
    const token2 = generateInvitationToken()
    expect(token1).not.toBe(token2)
  })
})

describe("buildInvitationUrl", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  it("uses NEXT_PUBLIC_APP_URL when set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://notes9.com"
    const url = buildInvitationUrl("abc123")
    expect(url).toBe("https://notes9.com/auth/invite?token=abc123")
  })

  it("falls back to localhost:3000 when env var is missing", () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    const url = buildInvitationUrl("abc123")
    expect(url).toBe("http://localhost:3000/auth/invite?token=abc123")
  })

  it("includes the token in the URL", () => {
    const token = generateInvitationToken()
    const url = buildInvitationUrl(token)
    expect(url).toContain(`?token=${token}`)
  })
})
