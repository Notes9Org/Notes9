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
 * Trim body text that leaks into an "abstract" from web scraping / full-text
 * extraction (title + authors + affiliations prepended, or the introduction and
 * later sections appended).
 *
 * This is deliberately conservative: a normal-length abstract (≤ 2500 chars) is
 * returned untouched so we never truncate a legitimate abstract. Only when the
 * text is suspiciously long do we try to isolate the real abstract by (a)
 * dropping any leading junk before an "Abstract" heading and (b) cutting at the
 * first section that conventionally follows an abstract (Keywords /
 * Introduction / …). Inline structured-abstract labels (Background:, Methods:,
 * Results:, Conclusions:) are NOT treated as stops. Falls back to the original
 * text if isolation would leave too little behind.
 */
export function cleanScrapedAbstract(raw: string | null | undefined): string | null {
  if (raw == null) return raw ?? null
  const original = raw
  let text = raw.trim()
  if (!text) return original
  // Normal abstract length — leave it completely alone.
  if (text.length <= 2500) return original

  // (a) Strip a leading title/author/affiliation block before an "Abstract"
  // heading, but only when that heading appears near the very start.
  const headingRe = /(?<!graphical\s)\bAbstract\b\s*[:.—-]?\s*/i
  const headingMatch = headingRe.exec(text)
  if (headingMatch && headingMatch.index <= 800) {
    text = text.slice(headingMatch.index + headingMatch[0].length).trim()
  }

  // (b) Cut trailing body text at the first post-abstract section boundary,
  // keeping at least a substantial chunk so we don't chop a short abstract.
  const stopRe =
    /\b(?:Keywords?|Key\s*words|Index\s*terms|Introduction|Graphical\s+abstract|Highlights)\b|\b\d{1,2}\.?\s+Introduction\b/i
  const stopMatch = stopRe.exec(text)
  if (stopMatch && stopMatch.index >= 120) {
    text = text.slice(0, stopMatch.index).trim()
  }

  return text.length >= 80 ? text : original
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
  // Structured-abstract labels (Background:, Methods:, Results:, …) often arrive
  // inline as one run-on block. Break before each so sections render with gaps.
  t = t.replace(
    /\s*\b(Background|Objectives?|Aims?|Purpose|Rationale|Introduction|Methods?|Materials?\s+and\s+Methods|Methodology|Study\s+Design|Design|Setting|Participants|Patients|Subjects|Interventions?|Exposures?|Main\s+Outcomes?(?:\s+and\s+Measures?)?|Outcomes?|Measurements?|Results?|Findings?|Conclusions?|Conclusions?\s+and\s+Relevance|Discussion|Interpretation|Significance|Limitations?|Implications?|Keywords?)\s*:/gi,
    "\n\n$1:",
  )
  t = t.replace(/[ \t\f\v]+\n/g, "\n")
  t = t.replace(/\n[ \t]+/g, "\n")
  t = t.replace(/\n{3,}/g, "\n\n")
  return t.replace(/^\n+/, "").trim()
}
