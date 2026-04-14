/**
 * Citation & Bibliography utilities.
 *
 * Extracted from tiptap-editor to keep citation logic modular and testable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CitationMetadata {
  citationNumber: number
  url: string
  title: string
  authors: string[]
  year: number
  journal: string
  doi: string
  paperId: string
}

export interface ParsedCitation {
  number: number
  url: string
  paperId: string
  title: string
  doi: string
  authors: string[]
  year: number
  journal: string
  isPlainText: boolean
}

// ---------------------------------------------------------------------------
// All 17 citation styles (labels for dropdowns)
// ---------------------------------------------------------------------------

export const CITATION_STYLE_OPTIONS = [
  { value: 'APA', label: 'APA 7th', longLabel: 'APA (7th Ed.)' },
  { value: 'MLA', label: 'MLA 9th', longLabel: 'MLA (9th Ed.)' },
  { value: 'Chicago (Author-Date)', label: 'Chicago AD', longLabel: 'Chicago (Author-Date)' },
  { value: 'Chicago (Notes & Bib)', label: 'Chicago NB', longLabel: 'Chicago (Notes & Bib)' },
  { value: 'Harvard', label: 'Harvard', longLabel: 'Harvard' },
  { value: 'Vancouver', label: 'Vancouver', longLabel: 'Vancouver' },
  { value: 'IEEE', label: 'IEEE', longLabel: 'IEEE' },
  { value: 'AMA', label: 'AMA', longLabel: 'AMA' },
  { value: 'Nature', label: 'Nature', longLabel: 'Nature' },
  { value: 'Science', label: 'Science', longLabel: 'Science' },
  { value: 'BibTeX', label: 'BibTeX', longLabel: 'BibTeX' },
  { value: 'RIS', label: 'RIS', longLabel: 'RIS (Reference Manager)' },
  { value: 'APA (6th Ed.)', label: 'APA 6th', longLabel: 'APA (6th Ed.)' },
  { value: 'CSE', label: 'CSE', longLabel: 'CSE (Scientific Style)' },
  { value: 'ASA', label: 'ASA', longLabel: 'ASA (Sociological Assoc.)' },
  { value: 'APS', label: 'APS', longLabel: 'APS (Physics)' },
  { value: 'AIP', label: 'AIP', longLabel: 'AIP (Physics)' },
] as const

export const DEFAULT_CITATION_STYLE = 'APA'

// ---------------------------------------------------------------------------
// Helper: get last name from a full name string
// ---------------------------------------------------------------------------

function lastName(full: string): string {
  return full.split(/\s+/).pop() || full
}

// ---------------------------------------------------------------------------
// Helper: build a human-readable author string from an authors array
// ---------------------------------------------------------------------------

function authorString(authors: string[] | undefined | null): string | null {
  if (!authors || authors.length === 0) return null
  if (authors.length === 1) return authors[0]
  if (authors.length === 2) return `${authors[0]} & ${authors[1]}`
  return `${authors[0]} et al.`
}

function shortAuthorString(authors: string[] | undefined | null): string | null {
  if (!authors || authors.length === 0) return null
  if (authors.length === 1) return lastName(authors[0])
  if (authors.length === 2) return `${lastName(authors[0])} & ${lastName(authors[1])}`
  return `${lastName(authors[0])} et al.`
}

/** Prefer explicit year; else first 4-digit 19xx/20xx in title, journal, or URL. */
export function getEffectivePublicationYear(
  meta: Pick<CitationMetadata, 'year' | 'title' | 'journal' | 'url'>,
): number | null {
  if (meta.year > 0 && Number.isFinite(meta.year)) return meta.year
  const blob = [meta.title, meta.journal, meta.url].filter(Boolean).join(' ')
  const m = blob.match(/\b(19|20)\d{2}\b/)
  if (!m) return null
  const y = parseInt(m[0], 10)
  if (y >= 1800 && y <= 2100) return y
  return null
}

function citationYearString(meta: CitationMetadata | null | undefined): string {
  if (!meta) return ''
  const y = getEffectivePublicationYear(meta)
  return y != null ? String(y) : ''
}

// ---------------------------------------------------------------------------
// Format an inline citation marker for a given style
// ---------------------------------------------------------------------------

export function formatInlineCitation(
  num: number,
  meta: CitationMetadata | null,
  style: string,
): string {
  const authorStr = shortAuthorString(meta?.authors) || `#${num}`
  const yearStr = citationYearString(meta)

  switch (style) {
    case 'APA':
    case 'APA (6th Ed.)':
      return yearStr ? `(${authorStr}, ${yearStr})` : `(${authorStr})`
    case 'MLA':
      return `(${authorStr}${meta?.title ? ' ' + meta.title.split(' ').slice(0, 3).join(' ') : ''})`
    case 'Chicago (Author-Date)':
    case 'ASA':
    case 'Harvard':
      return yearStr ? `(${authorStr} ${yearStr})` : `(${authorStr})`
    case 'Chicago (Notes & Bib)':
    case 'Nature':
    case 'Science':
    case 'APS':
    case 'AIP':
      return `<sup>${num}</sup>`
    case 'IEEE':
    case 'Vancouver':
    case 'AMA':
    case 'CSE':
    case 'BibTeX':
    case 'RIS':
    default:
      return `[${num}]`
  }
}

// ---------------------------------------------------------------------------
// Format a full reference-list entry for a given style
// ---------------------------------------------------------------------------

/** When authors are missing, lead with title (no "Unknown author" placeholders). */
function formatCitationNoAuthor(metadata: CitationMetadata, style: string): string {
  const { title, journal, url } = metadata
  const yearStr = citationYearString(metadata)
  const t = title?.trim() || ''

  switch (style) {
    case 'APA':
    case 'APA (6th Ed.)':
      return `${t}.${yearStr ? ` (${yearStr}).` : ''} ${journal ? `<em>${journal}</em>. ` : ''}${url ? `Retrieved from ${url}` : ''}`
    case 'MLA':
      return `"${t}." ${journal ? `<em>${journal}</em>, ` : ''}${yearStr ? `${yearStr}. ` : ''}${url ? `Web. ${url}` : ''}`
    case 'Chicago':
    case 'Chicago (Author-Date)':
      return `"${t}." ${journal ? `<em>${journal}</em> ` : ''}${yearStr ? `(${yearStr}). ` : ''}${url || ''}`
    case 'Chicago (Notes & Bib)':
      return `"${t}," ${journal ? `<em>${journal}</em> ` : ''}${yearStr ? `(${yearStr}). ` : ''}${url || ''}`
    case 'Harvard':
      return `${yearStr ? `${yearStr}. ` : ''}${t}. ${journal ? `<em>${journal}</em>. ` : ''}${url ? `Available at: ${url}` : ''}`
    case 'IEEE':
      return `"${t}," ${journal ? `<em>${journal}</em>, ` : ''}${yearStr ? `${yearStr}. ` : ''}${url ? `[Online]. Available: ${url}` : ''}`
    case 'Vancouver':
      return `${t}. ${journal ? `${journal}. ` : ''}${yearStr ? `${yearStr}. ` : ''}${url ? `Available from: ${url}` : ''}`
    case 'AMA':
      return `${t}. ${journal ? `<em>${journal}</em>. ` : ''}${yearStr ? `${yearStr}. ` : ''}${url ? `doi:${url}` : ''}`
    case 'Nature':
      return `${t}. ${journal ? `<em>${journal}</em> ` : ''}${yearStr ? `(${yearStr}). ` : ''}${url || ''}`
    case 'Science':
      return `${t}. ${journal ? `<em>${journal}</em> ` : ''}${yearStr ? `(${yearStr}). ` : ''}${url || ''}`
    case 'CSE':
      return `${yearStr ? `${yearStr}. ` : ''}${t}. ${journal ? `${journal}. ` : ''}${url ? `Available from: ${url}` : ''}`
    case 'ASA':
      return `${yearStr ? `${yearStr}. ` : ''}"${t}." ${journal ? `<em>${journal}</em>. ` : ''}${url ? `Retrieved ${url}` : ''}`
    case 'APS':
      return `${t}, ${journal ? `${journal} ` : ''}${yearStr ? `(${yearStr}). ` : ''}${url || ''}`
    case 'AIP':
      return `"${t}," ${journal ? `${journal} ` : ''}${yearStr ? `(${yearStr}). ` : ''}${url || ''}`
    case 'BibTeX': {
      const key = `ref${yearStr || 'X'}${t ? `_${t.slice(0, 12).replace(/\W+/g, '')}` : ''}`
      return `@article{${key},<br/>&nbsp;&nbsp;title = {${t}},${journal ? `<br/>&nbsp;&nbsp;journal = {${journal}},` : ''}${yearStr ? `<br/>&nbsp;&nbsp;year = {${yearStr}}` : ''}${url ? `,<br/>&nbsp;&nbsp;url = {${url}}` : ''}<br/>}`
    }
    case 'RIS':
      return `TY  - JOUR<br/>TI  - ${t}${journal ? `<br/>JO  - ${journal}` : ''}${yearStr ? `<br/>PY  - ${yearStr}` : ''}${url ? `<br/>UR  - ${url}` : ''}<br/>ER  -`
    default:
      return `${t}.${yearStr ? ` (${yearStr}).` : ''} ${journal ? `<em>${journal}</em>. ` : ''}${url || ''}`
  }
}

export function formatCitation(metadata: CitationMetadata, style: string): string {
  const { authors, title, journal, url } = metadata
  const authorStr = authorString(authors)
  const yearStr = citationYearString(metadata)

  if (!authorStr) {
    return formatCitationNoAuthor(metadata, style)
  }

  switch (style) {
    case 'APA':
      return `${authorStr}${yearStr ? ` (${yearStr})` : ''}. ${title}. ${journal ? `<em>${journal}</em>. ` : ''}${url ? `Retrieved from ${url}` : ''}`
    case 'MLA':
      return `${authorStr}. "${title}." ${journal ? `<em>${journal}</em>, ` : ''}${yearStr ? `${yearStr}. ` : ''}${url ? `Web. ${url}` : ''}`
    case 'Chicago':
    case 'Chicago (Author-Date)':
      return `${authorStr}. "${title}." ${journal ? `<em>${journal}</em> ` : ''}${yearStr ? `(${yearStr}). ` : ''}${url || ''}`
    case 'Chicago (Notes & Bib)':
      return `${authorStr}, "${title}," ${journal ? `<em>${journal}</em> ` : ''}${yearStr ? `(${yearStr}). ` : ''}${url || ''}`
    case 'Harvard':
      return `${authorStr}, ${yearStr ? `${yearStr}. ` : ''}${title}. ${journal ? `<em>${journal}</em>. ` : ''}${url ? `Available at: ${url}` : ''}`
    case 'IEEE':
      return `${authorStr}, "${title}," ${journal ? `<em>${journal}</em>, ` : ''}${yearStr ? `${yearStr}. ` : ''}${url ? `[Online]. Available: ${url}` : ''}`
    case 'Vancouver':
      return `${authorStr}. ${title}. ${journal ? `${journal}. ` : ''}${yearStr ? `${yearStr}. ` : ''}${url ? `Available from: ${url}` : ''}`
    case 'AMA':
      return `${authorStr}. ${title}. ${journal ? `<em>${journal}</em>. ` : ''}${yearStr ? `${yearStr}. ` : ''}${url ? `doi:${url}` : ''}`
    case 'Nature':
      return `${authorStr}. ${title}. ${journal ? `<em>${journal}</em> ` : ''}${yearStr ? `(${yearStr}). ` : ''}${url || ''}`
    case 'Science':
      return `${authorStr}, ${title}. ${journal ? `<em>${journal}</em> ` : ''}${yearStr ? `(${yearStr}). ` : ''}${url || ''}`
    case 'APA (6th Ed.)':
      return `${authorStr}${yearStr ? ` (${yearStr})` : ''}. ${title}. ${journal ? `<em>${journal}</em>. ` : ''}${url ? `Retrieved from ${url}` : ''}`
    case 'CSE':
      return `${authorStr}. ${yearStr ? `${yearStr}. ` : ''}${title}. ${journal ? `${journal}. ` : ''}${url ? `Available from: ${url}` : ''}`
    case 'ASA':
      return `${authorStr}. ${yearStr ? `${yearStr}. ` : ''}"${title}." ${journal ? `<em>${journal}</em>. ` : ''}${url ? `Retrieved ${url}` : ''}`
    case 'APS':
      return `${authorStr}, ${title}, ${journal ? `${journal} ` : ''}${yearStr ? `(${yearStr}). ` : ''}${url || ''}`
    case 'AIP':
      return `${authorStr}, "${title}," ${journal ? `${journal} ` : ''}${yearStr ? `(${yearStr}). ` : ''}${url || ''}`
    case 'BibTeX':
      return `@article{ref${yearStr || 'X'},<br/>&nbsp;&nbsp;author = {${authorStr}},<br/>&nbsp;&nbsp;title = {${title}},${journal ? `<br/>&nbsp;&nbsp;journal = {${journal}},` : ''}${yearStr ? `<br/>&nbsp;&nbsp;year = {${yearStr}}` : ''}${url ? `,<br/>&nbsp;&nbsp;url = {${url}}` : ''}<br/>}`
    case 'RIS':
      return `TY  - JOUR<br/>AU  - ${authorStr}<br/>TI  - ${title}${journal ? `<br/>JO  - ${journal}` : ''}${yearStr ? `<br/>PY  - ${yearStr}` : ''}${url ? `<br/>UR  - ${url}` : ''}<br/>ER  -`
    default:
      return `${authorStr}${yearStr ? ` (${yearStr})` : ''}. ${title}. ${url || ''}`
  }
}

// ---------------------------------------------------------------------------
// Extract CitationMetadata from an <a> tag's attributes string
// ---------------------------------------------------------------------------

export function metadataFromAttrs(attrs: string, num: number): CitationMetadata {
  const hrefMatch = attrs.match(/href="([^"]*)"/)
  const paperIdMatch = attrs.match(/data-paper-id="([^"]*)"/)
  const titleMatch = attrs.match(/data-paper-title="([^"]*)"/)
  const doiMatch = attrs.match(/data-paper-doi="([^"]*)"/)
  const authorsMatch = attrs.match(/data-paper-authors="([^"]*)"/)
  const yearMatch = attrs.match(/data-paper-year="([^"]*)"/)
  const journalMatch = attrs.match(/data-paper-journal="([^"]*)"/)

  let authors: string[] = []
  if (authorsMatch) {
    try {
      authors = JSON.parse(authorsMatch[1].replace(/&quot;/g, '"'))
    } catch { /* ignore */ }
  }

  const url = hrefMatch ? hrefMatch[1] : ''
  const title = titleMatch ? titleMatch[1].replace(/&quot;/g, '"') : ''
  const journal = journalMatch ? journalMatch[1].replace(/&quot;/g, '"') : ''
  let year = 0
  if (yearMatch) {
    const p = parseInt(String(yearMatch[1]).trim(), 10)
    if (!Number.isNaN(p) && p > 0) year = p
  }
  const resolvedYear = getEffectivePublicationYear({ year, title, journal, url })

  return {
    citationNumber: num,
    url,
    paperId: paperIdMatch ? paperIdMatch[1] : '',
    title,
    doi: doiMatch ? doiMatch[1] : '',
    authors,
    year: resolvedYear ?? 0,
    journal,
  }
}

// ---------------------------------------------------------------------------
// Regex that matches any citation anchor (by data-paper-title attribute)
// ---------------------------------------------------------------------------

export const CITATION_ANCHOR_REGEX = /<a([^>]*data-paper-title="[^"]*"[^>]*)>[^<]*<\/a>/g

// ---------------------------------------------------------------------------
// Parse all citations from editor HTML
// ---------------------------------------------------------------------------

export function parseCitationsFromHtml(html: string): ParsedCitation[] {
  const citations: ParsedCitation[] = []
  const seenTitles = new Set<string>()
  let counter = 1

  // 1. Anchors with data-paper-title (any inline format)
  const linkRegex = new RegExp(CITATION_ANCHOR_REGEX.source, 'g')
  let match
  while ((match = linkRegex.exec(html)) !== null) {
    const attrs = match[1]
    const meta = metadataFromAttrs(attrs, counter)
    const titleLower = meta.title.toLowerCase()
    if (titleLower && seenTitles.has(titleLower)) continue
    if (titleLower) seenTitles.add(titleLower)

    citations.push({
      number: counter++,
      url: meta.url,
      paperId: meta.paperId,
      title: meta.title || '',
      doi: meta.doi,
      authors: meta.authors,
      year: meta.year,
      journal: meta.journal,
      isPlainText: false,
    })
  }

  // 2. Plain-text [N] not inside <a> tags
  const stripped = html.replace(/<a[^>]*>[^<]*<\/a>/g, '')
  const plainRegex = /\[(\d+)\]/g
  const seenNums = new Set(citations.map(c => c.number))
  let pm
  while ((pm = plainRegex.exec(stripped)) !== null) {
    const n = parseInt(pm[1])
    if (seenNums.has(n)) continue
    seenNums.add(n)
    citations.push({
      number: n, url: '', paperId: '', title: `Reference ${n}`,
      doi: '', authors: [], year: 0, journal: '', isPlainText: true,
    })
  }

  // 3. Enrich plain-text citations from existing References section
  const refsMatch = html.match(
    /<h[1-3][^>]*>\s*(?:References|Bibliography|Works Cited)\s*<\/h[1-3]>([\s\S]*?)(?=<h[1-3]|$)/i,
  )
  if (refsMatch) {
    const refEntryRegex = /\[(\d+)\]\s*(.*?)(?=<\/p>|<br|$)/gi
    let rm
    while ((rm = refEntryRegex.exec(refsMatch[1])) !== null) {
      const refNum = parseInt(rm[1])
      const refText = rm[2].replace(/<[^>]*>/g, '').trim()
      const existing = citations.find(c => c.number === refNum)
      if (existing?.isPlainText && refText) {
        existing.title = refText.slice(0, 200)
      }
    }
  }

  return citations
}

// ---------------------------------------------------------------------------
// Reformat all inline citations in HTML to match a given style
// ---------------------------------------------------------------------------

/** Match citation links with optional nested HTML inside the anchor (TipTap may wrap content). */
const CITATION_ANCHOR_WITH_BODY_SOURCE =
  '<a([^>]*data-paper-title="[^"]*"[^>]*)>([\\s\\S]*?)</a>'

export function reformatInlineCitations(html: string, style: string): string {
  let counter = 1
  const re = new RegExp(CITATION_ANCHOR_WITH_BODY_SOURCE, "gi")
  return html.replace(re, (_match: string, attrs: string) => {
    const num = counter++
    const meta = metadataFromAttrs(attrs, num)
    const label = formatInlineCitation(num, meta, style)
    return `<a${attrs}>${label}</a>`
  })
}

// ---------------------------------------------------------------------------
// Reformat the References section in HTML (or append one)
// ---------------------------------------------------------------------------

const REFS_SECTION_REGEX =
  /<h[1-3][^>]*>\s*(?:References|Bibliography|Works Cited)\s*<\/h[1-3]>[\s\S]*?(?:(?=<h[1-3])|\s*$)/i

export function reformatBibliography(
  html: string,
  citations: Map<number, CitationMetadata>,
  style: string,
): string {
  const sorted = Array.from(citations.entries()).sort((a, b) => a[0] - b[0])

  let bibHtml = '<h2>References</h2><div class="bibliography">'
  sorted.forEach(([number, meta]) => {
    const formatted = formatCitation(meta, style)
    const prefix = ['BibTeX', 'RIS'].includes(style) ? '' : `[${number}] `
    bibHtml += `<p class="bibliography-entry">${prefix}${formatted}</p>`
  })
  bibHtml += '</div>'

  if (REFS_SECTION_REGEX.test(html)) {
    return html.replace(REFS_SECTION_REGEX, bibHtml)
  }
  return html + bibHtml
}

// ---------------------------------------------------------------------------
// Full reformat: inline citations + bibliography in one pass
// ---------------------------------------------------------------------------

export function reformatAllCitations(
  html: string,
  citations: Map<number, CitationMetadata>,
  style: string,
): string {
  let result = reformatInlineCitations(html, style)
  result = reformatBibliography(result, citations, style)
  return result
}
