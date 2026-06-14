import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/current-user"

// Server-side image fetch used by document import to "copy" externally-linked
// images into the note as inline data URIs (bypassing browser CORS). Guarded:
// auth required, http(s) only, private/loopback hosts blocked, image content
// types only, with a size + time cap.

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const FETCH_TIMEOUT_MS = 15_000

/** Block loopback / private / link-local hosts to limit SSRF blast radius. */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (h === "localhost" || h === "ip6-localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^0\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  return false
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let rawUrl = ""
  try {
    const body = await request.json()
    rawUrl = String(body?.url ?? "")
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 })
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 })
  }
  if (isBlockedHost(parsed.hostname)) {
    return NextResponse.json({ error: "Blocked host" }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(parsed.toString(), { signal: controller.signal, redirect: "follow" })
    if (!res.ok) return NextResponse.json({ error: `Fetch failed (${res.status})` }, { status: 502 })

    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Not an image" }, { status: 415 })
    }

    const arrayBuffer = await res.arrayBuffer()
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 })
    }

    const base64 = Buffer.from(arrayBuffer).toString("base64")
    return NextResponse.json({ dataUri: `data:${contentType};base64,${base64}` })
  } catch {
    return NextResponse.json({ error: "Fetch error" }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
