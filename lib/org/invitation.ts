import { randomBytes } from "crypto"

export function generateInvitationToken(): string {
  return randomBytes(32).toString("hex")
}

export function buildInvitationUrl(token: string): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  // Validate the configured origin so a misconfigured env var can't produce a
  // malformed or non-http(s) invitation link. In production we require https;
  // localhost http is allowed for local development.
  let base = raw
  try {
    const url = new URL(raw)
    const isLocalhost =
      url.hostname === "localhost" || url.hostname === "127.0.0.1"
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost)) {
      console.warn(
        `[invitation] NEXT_PUBLIC_APP_URL has an unexpected protocol (${url.protocol}); ` +
        "invitation links must be https in production.",
      )
    }
    // Normalize: drop any trailing slash so the path join can't double-slash.
    base = url.origin
  } catch (e) {
    console.warn(
      `[invitation] NEXT_PUBLIC_APP_URL is not a valid URL (${raw}); ` +
      "falling back to the raw value for the invitation link.",
      e,
    )
  }
  return `${base}/auth/invite?token=${encodeURIComponent(token)}`
}
