/**
 * SEC-001 (egress guard): the ONLY sanctioned way any server-side code in this
 * repo reaches an external URL. See docs/arch/security-remediation/SEC-001-egress-guard.md.
 *
 * Root cause this closes: the previous SSRF allowlist (`literature-pdf-urls.ts`)
 * was an *optional* pre-check individual callers had to remember to run, and the
 * platform `fetch()` re-resolves DNS at connect time (a classic DNS-rebinding
 * TOCTOU: validate a public IP, then the OS resolves a *different*, private IP
 * for the actual TCP connect). `safeFetch` fixes both by construction:
 *
 *  1. Parse the URL; reject anything that isn't `http:`/`https:`.
 *  2. Resolve DNS ONCE (or accept a literal IP host directly). Reject if ANY
 *     resolved address is loopback / RFC1918 / link-local / unique-local (ULA)
 *     / IPv4-mapped-or-compatible IPv6 wrapping one of those.
 *  3. Connect to the exact validated IP (a custom `lookup` pinned into
 *     `http.request`/`https.request` — the socket never re-resolves the
 *     hostname), while keeping the `Host` header / TLS SNI on the original
 *     hostname so virtual-hosted / CDN-fronted targets keep working.
 *  4. Redirects are followed manually, capped at `maxRedirects` (default 3),
 *     re-running steps 1-3 for every hop — an allowlisted public host that
 *     302s to an internal IP is blocked on that hop, not the first one.
 *  5. A redirect that crosses origin (scheme/host/port changes) strips
 *     `Authorization`/`Cookie`/`Proxy-Authorization` before the next hop,
 *     matching WHATWG fetch / undici — otherwise secrets sent to a
 *     first-party host (e.g. an API key in `lib/literature-oa-resolve.ts`)
 *     would replay to whatever host a 3xx redirects to.
 */
import * as http from "node:http"
import * as https from "node:https"
import { promises as dns } from "node:dns"
import { isIP } from "node:net"

export class SsrfBlocked extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SsrfBlocked"
  }
}

const DEFAULT_MAX_REDIRECTS = 3

// ── IPv4 classification ──────────────────────────────────────────────────
function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number)
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true
  const [a, b] = parts
  if (a === 127) return true // loopback
  if (a === 10) return true // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true // RFC1918
  if (a === 192 && b === 168) return true // RFC1918
  if (a === 169 && b === 254) return true // link-local (covers cloud metadata IPs)
  if (a === 0) return true // "this network"
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT (RFC6598), defense-in-depth
  if (a === 192 && b === 0 && parts[2] === 2) return true // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
  if (a >= 224) return true // multicast + reserved + broadcast
  return false
}

// ── IPv6 classification ──────────────────────────────────────────────────
/** Expand a valid (per `net.isIP`) IPv6 literal into its 8 16-bit groups. */
function expandIPv6Groups(hostIn: string): number[] | null {
  let addr = hostIn
  // Defensive: a trailing embedded IPv4 dotted-quad (e.g. an un-normalized
  // "::ffff:127.0.0.1") is rewritten to two hex groups before expansion.
  // `new URL(...).hostname` already normalizes this for us, but DNS results
  // or other callers may not.
  const lastColon = addr.lastIndexOf(":")
  const tailSegment = addr.slice(lastColon + 1)
  if (tailSegment.includes(".")) {
    const octets = tailSegment.split(".").map(Number)
    if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null
    const hex1 = (((octets[0] << 8) | octets[1]) >>> 0).toString(16)
    const hex2 = (((octets[2] << 8) | octets[3]) >>> 0).toString(16)
    addr = `${addr.slice(0, lastColon + 1)}${hex1}:${hex2}`
  }

  let headParts: string[]
  let tailParts: string[]
  let missing: number
  if (addr.includes("::")) {
    const [head, tail] = addr.split("::")
    headParts = head ? head.split(":").filter(Boolean) : []
    tailParts = tail ? tail.split(":").filter(Boolean) : []
    missing = 8 - headParts.length - tailParts.length
    if (missing < 0) return null
  } else {
    headParts = addr.split(":").filter(Boolean)
    tailParts = []
    missing = 0
  }
  const groups = [
    ...headParts.map((g) => parseInt(g, 16)),
    ...Array(missing).fill(0),
    ...tailParts.map((g) => parseInt(g, 16)),
  ]
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g) || g < 0 || g > 0xffff)) return null
  return groups
}

function isBlockedIPv6(host: string): boolean {
  const groups = expandIPv6Groups(host)
  if (!groups) return true // unparseable → block, do not fail open

  if (groups.every((g) => g === 0)) return true // :: (unspecified)
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true // ::1 (loopback)
  if ((groups[0] & 0xfe00) === 0xfc00) return true // fc00::/7 (unique local / ULA)
  if ((groups[0] & 0xffc0) === 0xfe80) return true // fe80::/10 (link-local)

  // IPv4-mapped (::ffff:a.b.c.d) or the deprecated IPv4-compatible (::a.b.c.d)
  // form: unwrap and re-run the IPv4 checks on the embedded address.
  const first5Zero = groups.slice(0, 5).every((g) => g === 0)
  if (first5Zero && (groups[5] === 0xffff || groups[5] === 0)) {
    const a = (groups[6] >> 8) & 0xff
    const b = groups[6] & 0xff
    const c = (groups[7] >> 8) & 0xff
    const d = groups[7] & 0xff
    return isBlockedIPv4(`${a}.${b}.${c}.${d}`)
  }
  return false
}

/** Strip the `[...]` brackets a URL's `.hostname` puts around IPv6 literals. */
function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host
}

function isBlockedAddress(rawHost: string): boolean {
  const host = stripBrackets(rawHost).toLowerCase()
  const family = isIP(host)
  if (family === 4) return isBlockedIPv4(host)
  if (family === 6) return isBlockedIPv6(host)
  return true // not a literal IP — caller must resolve first, never assume safe
}

type ResolvedTarget = { ip: string; family: 4 | 6 }

/**
 * Resolve `hostname` to an IP and validate it. A literal IP host is validated
 * directly (no DNS round trip). A DNS name is resolved ONCE via `dns.lookup`
 * (all addresses, both families) and EVERY returned address must pass — one
 * private hit among several public ones is still a block, since callers/OS
 * resolvers are free to pick any of the returned addresses.
 */
async function resolveValidatedTarget(rawHostname: string): Promise<ResolvedTarget> {
  // `URL.hostname` keeps the `[...]` brackets around an IPv6 literal; strip
  // them before asking `net.isIP` (which rejects bracketed input as 0/"not an IP").
  const hostname = stripBrackets(rawHostname)
  const literalFamily = isIP(hostname)
  if (literalFamily === 4 || literalFamily === 6) {
    if (isBlockedAddress(hostname)) {
      throw new SsrfBlocked(`Blocked target address: ${hostname}`)
    }
    return { ip: hostname, family: literalFamily }
  }

  let addresses: { address: string; family: number }[]
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true })
  } catch (e) {
    throw new Error(`DNS resolution failed for ${hostname}: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (addresses.length === 0) {
    throw new Error(`DNS resolution returned no addresses for ${hostname}`)
  }
  for (const addr of addresses) {
    if (isBlockedAddress(addr.address)) {
      throw new SsrfBlocked(`Host ${hostname} resolves to a blocked address (${addr.address})`)
    }
  }
  // Pin to the FIRST validated address — this exact IP (not the hostname) is
  // what the socket connects to, so a resolver that returns a different,
  // unvalidated address on a later lookup (DNS rebinding) can never take effect.
  const chosen = addresses[0]
  return { ip: chosen.address, family: chosen.family === 6 ? 6 : 4 }
}

/**
 * A custom `dns.lookup`-shaped function that ignores whatever hostname
 * Node's http/https client asks about and always answers with the
 * already-validated, pinned address. This is what makes the connect step
 * un-re-resolvable.
 */
function pinnedLookup(ip: string, family: 4 | 6) {
  return (
    _hostname: string,
    optionsOrCallback: unknown,
    maybeCallback?: (err: Error | null, address: string, family: number) => void
  ) => {
    const callback =
      typeof optionsOrCallback === "function"
        ? (optionsOrCallback as (err: Error | null, address: string, family: number) => void)
        : maybeCallback
    callback?.(null, ip, family)
  }
}

function parseHttpUrl(raw: string): URL {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new SsrfBlocked(`Malformed URL: ${raw}`)
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfBlocked(`Unsupported protocol: ${parsed.protocol}`)
  }
  return parsed
}

function normalizeHeaders(h: RequestInit["headers"]): Record<string, string> {
  const out: Record<string, string> = {}
  if (!h) return out
  if (Array.isArray(h)) {
    for (const [k, v] of h) out[k] = v
    return out
  }
  if (typeof (h as Headers).forEach === "function" && typeof (h as Headers).entries === "function") {
    for (const [k, v] of (h as Headers).entries()) out[k] = v
    return out
  }
  return { ...(h as Record<string, string>) }
}

// ── Cross-origin redirect header stripping ───────────────────────────────
// Mirrors WHATWG fetch / undici: a redirect that crosses origin (scheme,
// host, or port changes) must not replay credential-bearing headers to the
// new target. `lib/literature-oa-resolve.ts` sends `Authorization`/
// `x-api-key`-style secrets through safeFetch — without this, a malicious or
// compromised redirect target on the far side of a 3xx could exfiltrate them.
const SENSITIVE_REDIRECT_HEADERS = new Set(["authorization", "cookie", "proxy-authorization"])

function originOf(url: URL): string {
  return `${url.protocol}//${url.host}`
}

function stripSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (!SENSITIVE_REDIRECT_HEADERS.has(k.toLowerCase())) out[k] = v
  }
  return out
}

function bodyToWire(body: RequestInit["body"]): string | Buffer | undefined {
  if (body == null) return undefined
  if (typeof body === "string") return body
  if (body instanceof Uint8Array) return Buffer.from(body)
  if (body instanceof URLSearchParams) return body.toString()
  // ponytail: streaming/FormData/Blob bodies unsupported — no current caller in
  // the owned files sends a request body at all (all are GET). Add support
  // when a caller actually needs it.
  throw new TypeError("safeFetch: unsupported request body type")
}

type NodeResponse = http.IncomingMessage

function performOneRequest(
  urlObj: URL,
  opts: RequestInit | undefined,
  headers: Record<string, string>,
  target: ResolvedTarget
): Promise<NodeResponse> {
  return new Promise((resolve, reject) => {
    const isHttps = urlObj.protocol === "https:"
    const mod = isHttps ? https : http
    const req = mod.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port ? Number(urlObj.port) : undefined,
        path: `${urlObj.pathname}${urlObj.search}`,
        method: opts?.method ?? "GET",
        headers,
        lookup: pinnedLookup(target.ip, target.family) as unknown as typeof import("node:dns").lookup,
        ...(isHttps ? { servername: urlObj.hostname } : {}),
        signal: opts?.signal ?? undefined,
      },
      (res) => resolve(res)
    )
    req.on("error", (e) => reject(e instanceof Error ? e : new Error(String(e))))
    let wireBody: string | Buffer | undefined
    try {
      wireBody = bodyToWire(opts?.body)
    } catch (e) {
      req.destroy()
      reject(e)
      return
    }
    req.end(wireBody)
  })
}

/** Minimal reader satisfying `ReadableStreamDefaultReader<Uint8Array>` usage
 *  in the owned files (`.read()` / `.cancel()`), backed by a Node Readable. */
function toWebReaderLikeBody(nodeRes: NodeResponse) {
  const iterator = (nodeRes as unknown as AsyncIterable<Buffer>)[Symbol.asyncIterator]()
  return {
    getReader() {
      return {
        async read(): Promise<{ done: boolean; value?: Uint8Array }> {
          const { done, value } = await iterator.next()
          if (done) return { done: true, value: undefined }
          return { done: false, value: value instanceof Uint8Array ? value : new Uint8Array(value) }
        },
        async cancel(): Promise<void> {
          nodeRes.destroy()
          if (typeof iterator.return === "function") await iterator.return()
        },
      }
    },
  }
}

/** Buffer a Node response fully (used for `.text()`/`.json()`/`.arrayBuffer()`). */
async function bufferNodeResponse(nodeRes: NodeResponse): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of nodeRes) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

/**
 * A `fetch`-Response-shaped object covering exactly what the owned call sites
 * use (`ok`/`status`/`headers.get`/`body.getReader`/`json`/`text`/`arrayBuffer`/
 * `url`). Deliberately not the full DOM `Response` (no `.clone()`/`.formData()`/
 * `.blob()`) — see the file-level comment; cast to `Response` at the boundary
 * to satisfy the SEC-001 interface signature.
 * ponytail: minimal Response shape, add clone()/formData()/blob() if a future
 * caller needs them.
 */
function buildResponse(nodeRes: NodeResponse, finalUrl: string) {
  const status = nodeRes.statusCode ?? 0
  let bodyUsed = false
  const headerMap = new Map<string, string>()
  for (const [k, v] of Object.entries(nodeRes.headers)) {
    if (v === undefined) continue
    headerMap.set(k.toLowerCase(), Array.isArray(v) ? v.join(", ") : v)
  }
  const markUsed = () => {
    if (bodyUsed) throw new TypeError("Body already consumed")
    bodyUsed = true
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: nodeRes.statusMessage ?? "",
    url: finalUrl,
    headers: { get: (name: string) => headerMap.get(name.toLowerCase()) ?? null },
    get body() {
      markUsed()
      return toWebReaderLikeBody(nodeRes)
    },
    async arrayBuffer(): Promise<ArrayBuffer> {
      markUsed()
      const buf = await bufferNodeResponse(nodeRes)
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    },
    async text(): Promise<string> {
      markUsed()
      const buf = await bufferNodeResponse(nodeRes)
      return buf.toString("utf8")
    },
    async json(): Promise<unknown> {
      markUsed()
      const buf = await bufferNodeResponse(nodeRes)
      return JSON.parse(buf.toString("utf8"))
    },
  }
}

/**
 * The only sanctioned way to reach an external URL from server-side code in
 * this repo. Throws `SsrfBlocked` on a malformed URL, a non-http(s) protocol,
 * a private/loopback/link-local/ULA/IPv4-mapped target (at any redirect hop),
 * or exceeding `maxRedirects` (default 3). Otherwise behaves like `fetch`.
 */
export async function safeFetch(
  url: string,
  opts?: RequestInit & { maxRedirects?: number }
): Promise<Response> {
  const maxRedirects = opts?.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  let currentUrl = parseHttpUrl(url)
  let currentHeaders = normalizeHeaders(opts?.headers)
  let redirectCount = 0

  for (;;) {
    const target = await resolveValidatedTarget(currentUrl.hostname)
    const nodeRes = await performOneRequest(currentUrl, opts, currentHeaders, target)
    const status = nodeRes.statusCode ?? 0
    const location = nodeRes.headers.location

    if (status >= 300 && status < 400 && location) {
      nodeRes.resume() // discard the redirect body, we're not returning it
      if (redirectCount >= maxRedirects) {
        throw new SsrfBlocked(`Redirect limit (${maxRedirects}) exceeded fetching ${url}`)
      }
      redirectCount++
      const nextUrl = parseHttpUrl(new URL(location, currentUrl).toString())
      if (originOf(nextUrl) !== originOf(currentUrl)) {
        currentHeaders = stripSensitiveHeaders(currentHeaders)
      }
      currentUrl = nextUrl
      continue
    }

    return buildResponse(nodeRes, currentUrl.toString()) as unknown as Response
  }
}
