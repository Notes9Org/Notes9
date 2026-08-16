import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/current-user"
import { safeFetch, SsrfBlocked } from "@/lib/net/safe-fetch"

// Server-side image fetch used by document import to "copy" externally-linked
// images into the note as inline data URIs (bypassing browser CORS). Guarded:
// auth required, http(s) only, image content types only, with a size + time cap.
//
// SEC-001: SSRF protection (private/loopback/link-local/ULA/IPv4-mapped-IPv6
// hosts, DNS-rebinding pin-at-connect, per-redirect-hop re-validation) now
// lives entirely in `safeFetch` — this route no longer maintains its own
// hostname blocklist (the old one missed IPv4-mapped-IPv6 and didn't
// re-check after redirects; see SEC-001-egress-guard.md, findings N9-3/N9-4).

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const FETCH_TIMEOUT_MS = 15_000

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

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await safeFetch(rawUrl, { signal: controller.signal })
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
  } catch (err) {
    if (err instanceof SsrfBlocked) {
      return NextResponse.json({ error: "Blocked host" }, { status: 400 })
    }
    return NextResponse.json({ error: "Fetch error" }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
