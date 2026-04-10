/**
 * From full protocol HTML (TipTap output), keep only a "letterhead" shell:
 * top headings, short title lines, figures/images, and small header tables — not procedure body text.
 */

const SUBSTANTIAL_PARAGRAPH = 220

function extractShellWithDom(html: string): string {
  const doc = new DOMParser().parseFromString(
    html.trim().startsWith("<") ? html : `<p>${html}</p>`,
    "text/html"
  )
  const body = doc.body
  const out: Element[] = []

  const children = Array.from(body.children)
  for (const el of children) {
    const tag = el.tagName.toLowerCase()
    const textLen = (el.textContent ?? "").trim().length

    if (["h1", "h2", "h3", "h4", "figure", "hr"].includes(tag)) {
      out.push(el)
      continue
    }
    if (tag === "img") {
      out.push(el)
      continue
    }
    if (tag === "p") {
      if (el.querySelector("img, picture, svg")) {
        out.push(el)
        continue
      }
      if (textLen <= SUBSTANTIAL_PARAGRAPH) {
        out.push(el)
        continue
      }
      break
    }
    if (tag === "div") {
      if (el.querySelector("img, picture, svg")) {
        out.push(el)
        continue
      }
      if (textLen <= 180) {
        out.push(el)
        continue
      }
      break
    }
    if (tag === "table") {
      const rows = el.querySelectorAll("tr").length
      if (rows <= 4) {
        out.push(el)
        continue
      }
      break
    }
    if (tag === "blockquote") {
      if (textLen <= SUBSTANTIAL_PARAGRAPH) {
        out.push(el)
        continue
      }
      break
    }
    // Lists / long blocks = procedure body — stop
    if (["ul", "ol", "pre"].includes(tag)) break
    break
  }

  return out.map((n) => n.outerHTML).join("")
}

/** Regex fallback when DOMParser is unavailable (SSR import). */
function extractShellRegexFallback(html: string): string {
  const parts: string[] = []
  const hMatch = html.match(/<h[1-4][^>]*>[\s\S]*?<\/h[1-4]>/gi)
  if (hMatch) parts.push(...hMatch.slice(0, 3))

  const imgMatches = html.matchAll(/<figure[^>]*>[\s\S]*?<\/figure>|<img[^>]*\/?>/gi)
  let n = 0
  for (const m of imgMatches) {
    if (n++ >= 6) break
    parts.push(m[0])
  }

  return parts.join("\n")
}

export function extractProtocolTemplateShell(html: string): string {
  if (!html?.trim()) return ""

  let shell = ""
  if (typeof window !== "undefined") {
    try {
      shell = extractShellWithDom(html)
    } catch {
      shell = ""
    }
  }
  if (!shell.trim()) {
    shell = extractShellRegexFallback(html)
  }

  return shell.trim()
}
