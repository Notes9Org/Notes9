/**
 * BibTeX parser and generator for research paper citations.
 *
 * Parses .bib files into structured entries and converts
 * citation metadata back to BibTeX format.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BibEntry {
  /** Citation key (e.g. "smith2024") */
  key: string
  /** Entry type (article, book, inproceedings, etc.) */
  type: string
  /** Fields */
  title: string
  author: string
  year: string
  journal?: string
  volume?: string
  number?: string
  pages?: string
  doi?: string
  url?: string
  publisher?: string
  booktitle?: string
  abstract?: string
  /** All raw fields for round-tripping */
  fields: Record<string, string>
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a .bib file string into an array of BibEntry objects.
 * Handles standard BibTeX format with nested braces.
 */
export function parseBibtex(input: string): BibEntry[] {
  const entries: BibEntry[] = []
  // Match @type{key, ... }
  const entryRegex = /@(\w+)\s*\{([^,]*),/g
  let match: RegExpExecArray | null

  while ((match = entryRegex.exec(input)) !== null) {
    const type = match[1].toLowerCase()
    const key = match[2].trim()

    // Skip @string, @preamble, @comment
    if (["string", "preamble", "comment"].includes(type)) continue

    // Find the matching closing brace for this entry
    const startIdx = match.index + match[0].length
    let depth = 1
    let endIdx = startIdx

    for (let i = startIdx; i < input.length && depth > 0; i++) {
      if (input[i] === "{") depth++
      else if (input[i] === "}") depth--
      endIdx = i
    }

    const body = input.substring(startIdx, endIdx)
    const fields = parseFields(body)

    entries.push({
      key,
      type,
      title: fields.title || "",
      author: fields.author || "",
      year: fields.year || "",
      journal: fields.journal || fields.journaltitle || undefined,
      volume: fields.volume || undefined,
      number: fields.number || undefined,
      pages: fields.pages || undefined,
      doi: fields.doi || undefined,
      url: fields.url || undefined,
      publisher: fields.publisher || undefined,
      booktitle: fields.booktitle || undefined,
      abstract: fields.abstract || undefined,
      fields,
    })
  }

  return entries
}

/** Parse the field=value pairs inside a BibTeX entry body */
function parseFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {}
  // Match field = {value} or field = "value" or field = number
  const fieldRegex = /(\w+)\s*=\s*/g
  let fMatch: RegExpExecArray | null

  while ((fMatch = fieldRegex.exec(body)) !== null) {
    const fieldName = fMatch[1].toLowerCase()
    const valueStart = fMatch.index + fMatch[0].length
    const value = extractValue(body, valueStart)
    if (value !== null) {
      fields[fieldName] = value
    }
  }

  return fields
}

/** Extract a BibTeX field value starting at the given index */
function extractValue(body: string, start: number): string | null {
  let i = start
  // Skip whitespace
  while (i < body.length && /\s/.test(body[i])) i++

  if (i >= body.length) return null

  const ch = body[i]

  if (ch === "{") {
    // Brace-delimited value
    let depth = 1
    let result = ""
    i++
    while (i < body.length && depth > 0) {
      if (body[i] === "{") depth++
      else if (body[i] === "}") {
        depth--
        if (depth === 0) break
      }
      result += body[i]
      i++
    }
    return result.trim()
  }

  if (ch === '"') {
    // Quote-delimited value
    let result = ""
    i++
    while (i < body.length && body[i] !== '"') {
      result += body[i]
      i++
    }
    return result.trim()
  }

  // Bare number or string concatenation
  let result = ""
  while (i < body.length && body[i] !== "," && body[i] !== "}" && body[i] !== "\n") {
    result += body[i]
    i++
  }
  return result.trim() || null
}

// ---------------------------------------------------------------------------
// Author helpers
// ---------------------------------------------------------------------------

/** Parse BibTeX author string ("Last, First and Last, First") into array */
export function parseAuthors(authorStr: string): string[] {
  if (!authorStr) return []
  return authorStr
    .split(/\s+and\s+/i)
    .map((a) => a.trim())
    .filter(Boolean)
}

/** Generate a citation key from author + year (e.g. "smith2024") */
export function generateKey(authors: string[], year: string | number): string {
  const firstAuthor = (authors[0] || "unknown")
    .split(",")[0]
    .split(" ")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z]/g, "") || "unknown"
  return `${firstAuthor}${year || "nd"}`
}

// ---------------------------------------------------------------------------
// Generator — citation metadata to BibTeX string
// ---------------------------------------------------------------------------

export interface CitationForBib {
  key?: string
  title: string
  authors: string[]
  year: number | string
  journal?: string
  doi?: string
  url?: string
  volume?: string
  number?: string
  pages?: string
}

/** Convert a single citation to a BibTeX entry string */
export function toBibtexEntry(c: CitationForBib): string {
  const key = c.key || generateKey(c.authors, String(c.year))
  const authorStr = c.authors.join(" and ")
  const type = c.journal ? "article" : "misc"

  const fields: string[] = [
    `  author    = {${authorStr}}`,
    `  title     = {${c.title}}`,
    `  year      = {${c.year}}`,
  ]

  if (c.journal) fields.push(`  journal   = {${c.journal}}`)
  if (c.volume) fields.push(`  volume    = {${c.volume}}`)
  if (c.number) fields.push(`  number    = {${c.number}}`)
  if (c.pages) fields.push(`  pages     = {${c.pages}}`)
  if (c.doi) fields.push(`  doi       = {${c.doi}}`)
  if (c.url) fields.push(`  url       = {${c.url}}`)

  return `@${type}{${key},\n${fields.join(",\n")}\n}`
}

/** Convert an array of citations to a full .bib file string */
export function toBibtexFile(citations: CitationForBib[]): string {
  // Deduplicate keys
  const usedKeys = new Set<string>()
  return citations
    .map((c) => {
      let key = c.key || generateKey(c.authors, String(c.year))
      let suffix = ""
      let counter = 0
      while (usedKeys.has(key + suffix)) {
        counter++
        suffix = String.fromCharCode(96 + counter) // a, b, c...
      }
      usedKeys.add(key + suffix)
      return toBibtexEntry({ ...c, key: key + suffix })
    })
    .join("\n\n")
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

export function downloadBibtex(citations: CitationForBib[], filename: string): void {
  const bib = toBibtexFile(citations)
  const blob = new Blob([bib], { type: "application/x-bibtex" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${filename || "references"}.bib`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
