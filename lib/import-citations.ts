import { escapeHtml } from "@/lib/sanitize-html"

/**
 * Turn a document's existing references + inline `[N]` citations (from an
 * imported PDF/Word/Markdown/HTML file) into the editor's native citation
 * format, so they:
 *   - render as proper citation links,
 *   - participate in the citation-style system (the style dropdown reformats
 *     both the inline markers and the bibliography),
 *   - link to the cited source (DOI/URL) when one is present.
 *
 * Best-effort: reference metadata is parsed heuristically. If no References
 * section is found, the HTML is returned unchanged.
 *
 * Note: clicking a citation opens the cited source. In-document scroll-to-
 * reference isn't wired here because the editor schema doesn't preserve element
 * ids; the reference entries still carry ids for exported HTML.
 */

const REF_HEADING_RE =
  /^(?:\d+\.?\s+|[ivxlc]+\.?\s+)?(references|reference list|bibliography|works cited|literature cited|cited references)\b/i

type RefMeta = {
  number: number
  rawBody: string
  title: string
  authors: string[]
  year: number
  doi: string
  url: string
}

function extractRefMeta(rawBody: string, number: number): RefMeta {
  const text = rawBody.replace(/\s+/g, " ").trim()
  const doiMatch = text.match(/10\.\d{4,9}\/[^\s"<>);,]+/)
  const doi = doiMatch ? doiMatch[0].replace(/[.,;]+$/, "") : ""
  const urlMatch = text.match(/https?:\/\/[^\s"<>]+/)
  const url =
    (urlMatch ? urlMatch[0].replace(/[.,;]+$/, "") : "") || (doi ? `https://doi.org/${doi}` : "")
  const yearMatch = text.match(/\b(?:19|20)\d{2}\b/)
  const year = yearMatch ? parseInt(yearMatch[0], 10) : 0

  let authors: string[] = []
  let title = text
  if (yearMatch && yearMatch.index != null) {
    const before = text.slice(0, yearMatch.index).replace(/[(,.\s]+$/, "").trim()
    const after = text.slice(yearMatch.index + yearMatch[0].length).replace(/^[).,\s]+/, "").trim()
    if (before) {
      authors = before
        .split(/\s*(?:,|;|\band\b|&)\s*/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 25)
    }
    const firstSentence = after.split(/\.(?:\s|$)/)[0]
    title = (firstSentence || after || text).slice(0, 300)
  } else {
    title = text.slice(0, 300)
  }
  return { number, rawBody: text, title, authors, year, doi, url }
}

function attr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;")
}

function citationAnchor(meta: RefMeta, label: string): string {
  // Inline citations link to the in-document reference entry (the editor scrolls
  // to it on click); the reference entry then links out to the DOI/URL. The
  // source URL is still carried in data-paper-doi so the citation system and
  // exports retain it.
  const authorsJson = JSON.stringify(meta.authors || []).replace(/"/g, "&quot;")
  return (
    `<a href="#cite-ref-${meta.number}" data-paper-id="imported-ref-${meta.number}"` +
    ` data-paper-title="${attr(meta.title)}" data-paper-authors="${authorsJson}"` +
    ` data-paper-year="${meta.year || ""}" data-paper-journal=""` +
    ` data-paper-doi="${attr(meta.doi)}">${label}</a>`
  )
}

function expandNumberGroup(group: string): number[] {
  const out: number[] = []
  for (const part of group.split(/\s*,\s*/)) {
    const range = part.match(/^(\d{1,3})\s*[–—-]\s*(\d{1,3})$/)
    if (range) {
      const a = parseInt(range[1], 10)
      const b = parseInt(range[2], 10)
      if (b - a >= 0 && b - a < 100) for (let i = a; i <= b; i += 1) out.push(i)
    } else {
      const n = parseInt(part, 10)
      if (!Number.isNaN(n)) out.push(n)
    }
  }
  return out
}

export function linkImportedCitations(html: string): string {
  if (typeof window === "undefined" || !html) return html
  // Cheap bail-out: needs both a bracketed number and a references-ish heading.
  if (!/\[\d/.test(html)) return html

  try {
    const doc = new DOMParser().parseFromString(html, "text/html")

    // 1. Locate the references heading.
    const headings = Array.from(doc.body.querySelectorAll("h1,h2,h3,h4,h5,h6,p,strong,b"))
    const refHeading = headings.find((el) => {
      const t = (el.textContent || "").trim()
      return t.length < 40 && REF_HEADING_RE.test(t.replace(/[:.]\s*$/, ""))
    })
    if (!refHeading) return html

    // 2. Collect reference entries that follow the heading.
    const refMetas = new Map<number, RefMeta>()
    const refSectionEls = new Set<Element>([refHeading])

    const addEntry = (entryText: string) => {
      const t = entryText.replace(/\s+/g, " ").trim()
      if (!t) return
      const numMatch = t.match(/^\[?(\d{1,3})[\].)]\s+/) || t.match(/^(\d{1,3})\s+/)
      const num = numMatch ? parseInt(numMatch[1], 10) : refMetas.size + 1
      const body = numMatch ? t.slice(numMatch[0].length) : t
      if (!refMetas.has(num)) refMetas.set(num, extractRefMeta(body, num))
    }

    let node: Element | null = refHeading.nextElementSibling
    while (node) {
      const tag = node.tagName.toLowerCase()
      if (/^h[1-6]$/.test(tag)) break // next section ends the references
      refSectionEls.add(node)
      if (tag === "ol" || tag === "ul") {
        const items = Array.from(node.querySelectorAll(":scope > li"))
        items.forEach((li, i) => {
          const t = (li.textContent || "").replace(/\s+/g, " ").trim()
          if (!t) return
          const numMatch = t.match(/^\[?(\d{1,3})[\].)]\s+/)
          const num = numMatch ? parseInt(numMatch[1], 10) : i + 1
          const body = numMatch ? t.slice(numMatch[0].length) : t
          if (!refMetas.has(num)) refMetas.set(num, extractRefMeta(body, num))
        })
      } else {
        addEntry(node.textContent || "")
      }
      node = node.nextElementSibling
    }
    if (refMetas.size === 0) return html

    // 3. Convert inline [N] / [N, M] / [N–M] in the body into citation anchors.
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
    const textNodes: Text[] = []
    let tn: Node | null = walker.nextNode()
    while (tn) {
      const el = tn.parentElement
      // Skip the references section and anything already inside a link.
      if (el && !el.closest("a") && ![...refSectionEls].some((r) => r.contains(tn))) {
        textNodes.push(tn as Text)
      }
      tn = walker.nextNode()
    }

    const bracketRe = /\[(\d{1,3}(?:\s*[,–—-]\s*\d{1,3})*)\]/g
    for (const textNode of textNodes) {
      const value = textNode.nodeValue || ""
      if (!/\[\d/.test(value)) continue
      const escaped = escapeHtml(value)
      const replaced = escaped.replace(bracketRe, (match, group: string) => {
        const nums = expandNumberGroup(group)
        if (!nums.length || !nums.every((n) => refMetas.has(n))) return match
        return nums.map((n) => citationAnchor(refMetas.get(n)!, `[${n}]`)).join(" ")
      })
      if (replaced === escaped) continue
      const tpl = doc.createElement("template")
      tpl.innerHTML = replaced
      textNode.replaceWith(...Array.from(tpl.content.childNodes))
    }

    // 4. Rebuild the references section into the editor's bibliography structure,
    //    preserving each entry's original text and linkifying its DOI/URL.
    const bibParts: string[] = ['<h2>References</h2>', '<div class="bibliography">']
    for (const [num, meta] of [...refMetas.entries()].sort((a, b) => a[0] - b[0])) {
      let bodyHtml = escapeHtml(meta.rawBody)
      const linkTarget = meta.url
      if (linkTarget) {
        const escTarget = escapeHtml(linkTarget)
        if (bodyHtml.includes(escTarget)) {
          bodyHtml = bodyHtml.replace(
            escTarget,
            `<a href="${attr(linkTarget)}" target="_blank" rel="noopener noreferrer">${escTarget}</a>`,
          )
        }
      }
      bibParts.push(`<p class="bibliography-entry" id="cite-ref-${num}">[${num}] ${bodyHtml}</p>`)
    }
    bibParts.push("</div>")

    // Insert the rebuilt section right before the heading, then remove the
    // original references elements (heading + entries).
    const parent = refHeading.parentNode
    if (parent) {
      const frag = doc.createElement("template")
      frag.innerHTML = bibParts.join("")
      parent.insertBefore(frag.content, refHeading)
    }
    for (const el of refSectionEls) el.remove()

    return doc.body.innerHTML
  } catch (err) {
    console.warn("Failed to link imported citations:", err)
    return html
  }
}
