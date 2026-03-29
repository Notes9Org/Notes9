/**
 * Literature abstracts from Europe PMC, OpenAlex, etc. often include HTML fragments
 * (<h4> sections) and numeric entities (&#xa0;, &#x2264;). React text nodes show those
 * literally; this module decodes entities and flattens markup into readable plain text.
 */

export function decodeHtmlEntities(text: string): string {
  if (!text) return ""
  return text
    .replace(/&#x([0-9a-fA-F]{1,6});/gi, (full, hex) => {
      const code = parseInt(hex, 16)
      if (Number.isNaN(code)) return full
      try {
        return String.fromCodePoint(code)
      } catch {
        return full
      }
    })
    .replace(/&#(\d{1,7});/g, (full, num) => {
      const code = parseInt(num, 10)
      if (Number.isNaN(code)) return full
      try {
        return String.fromCodePoint(code)
      } catch {
        return full
      }
    })
    .replace(/&nbsp;/gi, "\u00a0")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&ldquo;/g, "\u201c")
    .replace(/&rdquo;/g, "\u201d")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

/**
 * Decode entities and strip/simplify HTML so the abstract reads clearly in a single text block.
 */
export function formatLiteratureAbstractPlain(raw: string): string {
  const s = raw.trim()
  if (!s) return ""
  let t = decodeHtmlEntities(s)
  t = t.replace(/<\/(?:p|div|section|article|blockquote)>/gi, "\n\n")
  t = t.replace(/<(?:p|div|section|article|blockquote)(?:\s[^>]*)?>/gi, "")
  t = t.replace(/<br\s*\/?>/gi, "\n")
  t = t.replace(/<\/h[1-6]>/gi, "\n\n")
  t = t.replace(/<h[1-6](?:\s[^>]*)?>/gi, "\n\n")
  t = t.replace(/<\/li>/gi, "\n")
  t = t.replace(/<li(?:\s[^>]*)?>/gi, "• ")
  t = t.replace(/<\/(?:ul|ol)>/gi, "\n\n")
  t = t.replace(/<(?:ul|ol)(?:\s[^>]*)?>/gi, "\n")
  t = t.replace(/<[^>]+>/g, "")
  t = t.replace(/[ \t\f\v]+\n/g, "\n")
  t = t.replace(/\n[ \t]+/g, "\n")
  t = t.replace(/\n{3,}/g, "\n\n")
  return t.trim()
}
