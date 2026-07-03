import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

export const runtime = "nodejs"

// Registration for the "Making AI Reliable for Researchers" webinar is backed by
// a Google Form. We POST server-side to the form's formResponse endpoint so we
// can (a) avoid the browser CORS wall on docs.google.com and (b) control the
// post-submit experience (custom thank-you + connect screen) instead of Google's
// default confirmation page.
const GOOGLE_FORM_ACTION =
  process.env.WEBINAR_FORM_ACTION ||
  "https://docs.google.com/forms/d/e/1FAIpQLSfBbOIy870HIPhST2LPzT8hUJcDK3OKo2hHCMqRDvg0ZYEfsQ/formResponse"

// Google Form field (entry) IDs, extracted from the live form. Overridable via
// env in case the form is rebuilt.
const FIELDS = {
  name: process.env.WEBINAR_ENTRY_NAME || "entry.1888661726",
  email: process.env.WEBINAR_ENTRY_EMAIL || "entry.880556618",
  organization: process.env.WEBINAR_ENTRY_ORG || "entry.1613562472",
  updates: process.env.WEBINAR_ENTRY_UPDATES || "entry.577304692",
} as const

// Exact checkbox option label the Google Form expects for the opt-in.
const UPDATES_OPTION = "Send me occasional updates on Notes9"

const registrationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("A valid email is required").max(320),
  organization: z.string().trim().max(200).optional().default(""),
  updates: z.boolean().optional().default(false),
  // Honeypot: bots fill hidden fields; humans leave it blank.
  company: z.string().max(200).optional().default(""),
})

// Best-effort per-IP rate limit. Public unauthenticated endpoint, so cap abuse.
// In-memory is per-instance only — back with Redis for multi-instance prod.
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 60_000
const hits = new Map<string, number[]>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) {
    hits.set(ip, recent)
    return true
  }
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) hits.delete(k)
    }
  }
  return false
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown"
    if (rateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again in a minute." },
        { status: 429 }
      )
    }

    const json = await request.json()
    const parsed = registrationSchema.safeParse(json)
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || "Invalid registration."
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const { name, email, organization, updates, company } = parsed.data

    // Honeypot tripped — pretend success, don't forward.
    if (company.trim()) {
      return NextResponse.json({ ok: true })
    }

    const body = new URLSearchParams()
    body.append(FIELDS.name, name)
    body.append(FIELDS.email, email)
    if (organization) body.append(FIELDS.organization, organization)
    if (updates) body.append(FIELDS.updates, UPDATES_OPTION)

    const res = await fetch(GOOGLE_FORM_ACTION, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      // Google responds 200 with an HTML confirmation page on success.
    })

    // Google returns 200 on accept; treat network/5xx as failure.
    if (!res.ok) {
      console.error("Webinar form forward failed:", res.status)
      return NextResponse.json(
        { error: "We could not complete your registration right now." },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Webinar route error:", error)
    return NextResponse.json(
      { error: "We could not complete your registration right now." },
      { status: 500 }
    )
  }
}
