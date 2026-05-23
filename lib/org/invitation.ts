import { randomBytes } from "crypto"

export function generateInvitationToken(): string {
  return randomBytes(32).toString("hex")
}

export function buildInvitationUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  return `${base}/auth/invite?token=${token}`
}
