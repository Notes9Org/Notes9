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

function stripHtmlTags(html: string): string {
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(`<div id="cdiff-plain-root">${html}</div>`, "text/html")
    const root = doc.getElementById("cdiff-plain-root")
    return (root?.textContent || "").replace(/\s+/g, " ").trim()
  }

  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * Convert editor HTML into plain text suitable for word diffs and change history.
 * Inline/block math nodes store LaTeX in attributes only — include them as [math: ...] tokens.
 */
export function htmlToDiffPlainText(html: string): string {
  return stripHtmlTags(replaceMathNodes(html))
}
