/** Decode common HTML entities in attribute values (e.g. data-latex). */
function decodeHtmlAttr(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function readAttr(tagOrFragment: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(["'])((?:\\\\.|(?!\\1)[\\s\\S])*)\\1`, "i")
  const match = tagOrFragment.match(re)
  return match ? decodeHtmlAttr(match[2] ?? "") : null
}

function mathNodeToPlain(type: "inline-math" | "block-math", latex: string): string {
  const trimmed = latex.trim()
  if (!trimmed) return " "
  const safe = trimmed.replace(/</g, "\\lt ").replace(/>/g, "\\gt ")
  if (type === "block-math") return ` [math block: ${safe}] `
  return ` [math: ${safe}] `
}

const MATH_SPAN_RE =
  /<span\b[^>]*\bdata-type\s*=\s*["'](inline-math|block-math)["'][^>]*>[\s\S]*?<\/span>/gi

const MATH_DIV_RE =
  /<div\b[^>]*\bdata-type\s*=\s*["']block-math["'][^>]*>[\s\S]*?<\/div>/gi

function replaceMathNodes(html: string): string {
  let withMath = html.replace(MATH_SPAN_RE, (match, type: "inline-math" | "block-math") => {
    const latex = readAttr(match, "data-latex")
    if (!latex) return " "
    return mathNodeToPlain(type, latex)
  })

  withMath = withMath.replace(MATH_DIV_RE, (match) => {
    const latex = readAttr(match, "data-latex")
    if (!latex) return " "
    return mathNodeToPlain("block-math", latex)
  })

  return withMath
}

const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "TR",
  "BLOCKQUOTE",
  "PRE",
  "SECTION",
  "ARTICLE",
  "UL",
  "OL",
  "TABLE",
  "FIGURE",
  "HR",
])

const EMBED_DATA_TYPES: Record<string, string> = {
  "resizable-image": "[image]",
  "spreadsheet-embed": "[spreadsheet]",
  "simple-shape": "[shape]",
}

function embedTokenForElement(el: HTMLElement): string {
  const dataType = el.getAttribute("data-type")
  if (dataType && EMBED_DATA_TYPES[dataType]) {
    if (dataType === "resizable-image") {
      const img = el.querySelector("img")
      const alt = img?.getAttribute("alt")?.trim()
      return alt ? `[image: ${alt}]` : "[image]"
    }
    if (dataType === "spreadsheet-embed") {
      const name = el.getAttribute("data-filename")?.trim()
      return name ? `[spreadsheet: ${name}]` : "[spreadsheet]"
    }
    return EMBED_DATA_TYPES[dataType]
  }
  return ""
}

function appendNewline(parts: string[]) {
  if (parts.length === 0) return
  const last = parts[parts.length - 1] ?? ""
  if (!last.endsWith("\n")) parts.push("\n")
}

function serializeNodeToParts(node: Node, parts: string[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? "").replace(/\u00a0/g, " ")
    if (text) parts.push(text)
    return
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return

  const el = node as HTMLElement
  const tag = el.tagName

  if (tag === "BR") {
    parts.push("\n")
    return
  }

  if (tag === "IMG") {
    const alt = el.getAttribute("alt")?.trim()
    parts.push(alt ? `[image: ${alt}]` : "[image]")
    appendNewline(parts)
    return
  }

  const embedToken = embedTokenForElement(el)
  if (embedToken) {
    parts.push(embedToken)
    appendNewline(parts)
    return
  }

  const isBlock = BLOCK_TAGS.has(tag)

  if (isBlock) appendNewline(parts)

  for (const child of Array.from(el.childNodes)) {
    serializeNodeToParts(child, parts)
  }

  if (isBlock) appendNewline(parts)
}

function normalizePlainParts(parts: string[]): string {
  return parts
    .join("")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function stripHtmlTagsFallback(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function stripHtmlTags(html: string): string {
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(`<div id="cdiff-plain-root">${html}</div>`, "text/html")
    const root = doc.getElementById("cdiff-plain-root")
    if (!root) return stripHtmlTagsFallback(html)
    const parts: string[] = []
    for (const child of Array.from(root.childNodes)) {
      serializeNodeToParts(child, parts)
    }
    return normalizePlainParts(parts)
  }

  return stripHtmlTagsFallback(html)
}

/**
 * Convert editor HTML into plain text suitable for word diffs and change history.
 * Preserves paragraph breaks as newlines and represents embeds as [image], [spreadsheet], etc.
 */
export function htmlToDiffPlainText(html: string): string {
  return stripHtmlTags(replaceMathNodes(html))
}
