/**
 * Citation & Bibliography utilities.
 *
 * Extracted from tiptap-editor to keep citation logic modular and testable.
 */

import { escapeHtml } from "@/lib/sanitize-html"

// Internal: HTML-escape user-controlled metadata fields before interpolating
// them into citation HTML. Paper title/authors/journal/url originate from
// external sources (Perplexity, PubMed, user input) and must never reach
// `dangerouslySetInnerHTML` unescaped.
function escapeMetadata(meta: CitationMetadata): CitationMetadata {
  return {
    ...meta,
    title: escapeHtml(meta.title || ''),
    authors: (meta.authors || []).map(escapeHtml),
    journal: escapeHtml(meta.journal || ''),
    url: escapeHtml(meta.url || ''),
    doi: escapeHtml(meta.doi || ''),
  }
}

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

// ---------------------------------------------------------------------------
// Author-name parsing + per-style author-list formatting.
//
// Names arrive either "Given Family" (e.g. "Jane A. Smith") or inverted
// "Family, Given" (e.g. "Smith, Jane A."). We normalise to {family, given} and
// then format per the real rules of each style. Fields we don't have (volume,
// issue, pages) are omitted rather than invented.
// ---------------------------------------------------------------------------

function parseName(full: string): { family: string; given: string } {
  const s = (full || '').trim()
  if (!s) return { family: '', given: '' }
  if (s.includes(',')) {
    const [family, ...rest] = s.split(',')
    return { family: family.trim(), given: rest.join(',').trim() }
  }
  const parts = s.split(/\s+/)
  if (parts.length === 1) return { family: parts[0], given: '' }
  return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') }
}

/** "Jane A." → "J. A." (spaced, periods) — APA/MLA/Chicago/IEEE/Nature style. */
function initialsDotted(given: string): string {
  return given
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((p) => `${p[0].toUpperCase()}.`)
    .join(' ')
}

/** "Jane A." → "JA" (no periods, no spaces) — Vancouver/AMA/CSE/NLM style. */
function initialsPacked(given: string): string {
  return given
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase())
    .join('')
}

type Author = { family: string; given: string }
const parsedAuthors = (authors?: string[] | null): Author[] =>
  (authors || []).map(parseName).filter((a) => a.family || a.given)

/** APA 7 / Harvard: "Family, G. G." with an ampersand before the last author. */
function apaAuthorList(authors: Author[]): string {
  const one = (a: Author) => (a.given ? `${a.family}, ${initialsDotted(a.given)}` : a.family)
  if (authors.length === 1) return one(authors[0])
  if (authors.length === 2) return `${one(authors[0])}, & ${one(authors[1])}`
  if (authors.length <= 20)
    return `${authors.slice(0, -1).map(one).join(', ')}, & ${one(authors[authors.length - 1])}`
  // APA caps at 20: first 19, an ellipsis, then the final author.
  return `${authors.slice(0, 19).map(one).join(', ')}, … ${one(authors[authors.length - 1])}`
}

/** MLA 9: first author inverted, second normal; 3+ → "First, et al." */
function mlaAuthorList(authors: Author[]): string {
  const inv = (a: Author) => (a.given ? `${a.family}, ${a.given}` : a.family)
  const norm = (a: Author) => (a.given ? `${a.given} ${a.family}` : a.family)
  if (authors.length === 1) return inv(authors[0])
  if (authors.length === 2) return `${inv(authors[0])}, and ${norm(authors[1])}`
  return `${inv(authors[0])}, et al.`
}

/** Chicago / ASA reference list: first author inverted, the rest normal. */
function chicagoAuthorList(authors: Author[]): string {
  const inv = (a: Author) => (a.given ? `${a.family}, ${a.given}` : a.family)
  const norm = (a: Author) => (a.given ? `${a.given} ${a.family}` : a.family)
  if (authors.length === 1) return inv(authors[0])
  if (authors.length === 2) return `${inv(authors[0])}, and ${norm(authors[1])}`
  if (authors.length <= 10) {
    const middle = authors.slice(1, -1).map(norm).join(', ')
    return `${inv(authors[0])}, ${middle ? middle + ', ' : ''}and ${norm(authors[authors.length - 1])}`
  }
  return `${inv(authors[0])}, et al.`
}

/** Vancouver / AMA / CSE (NLM): "Family GG", comma-separated, ≤6 then "et al." */
function nlmAuthorList(authors: Author[]): string {
  const one = (a: Author) => (a.given ? `${a.family} ${initialsPacked(a.given)}` : a.family)
  if (authors.length <= 6) return authors.map(one).join(', ')
  return `${authors.slice(0, 6).map(one).join(', ')}, et al.`
}

/** IEEE / Science / APS / AIP: initials before surname ("G. G. Family"). */
function initialsFirstAuthorList(authors: Author[], conjunction = 'and'): string {
  const one = (a: Author) => (a.given ? `${initialsDotted(a.given)} ${a.family}` : a.family)
  if (authors.length === 1) return one(authors[0])
  if (authors.length <= 6)
    return `${authors.slice(0, -1).map(one).join(', ')}, ${conjunction} ${one(authors[authors.length - 1])}`
  return `${one(authors[0])} et al.`
}

/** Nature: "Family, G. G." with an ampersand before the last; ≤5 then "et al." */
function natureAuthorList(authors: Author[]): string {
  const one = (a: Author) => (a.given ? `${a.family}, ${initialsDotted(a.given)}` : a.family)
  if (authors.length === 1) return one(authors[0])
  if (authors.length <= 5)
    return `${authors.slice(0, -1).map(one).join(', ')} & ${one(authors[authors.length - 1])}`
  return `${authors.slice(0, 5).map(one).join(', ')} et al.`
}

/** In-text label author fragment (surname-only), used by author–date styles. */
function shortAuthorString(authors: string[] | undefined | null): string | null {
  const list = parsedAuthors(authors)
  if (list.length === 0) return null
  if (list.length === 1) return list[0].family
  if (list.length === 2) return `${list[0].family} & ${list[1].family}`
  return `${list[0].family} et al.`
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
    // Author–date, comma before year: (Author, Year)
    case 'APA':
    case 'APA (6th Ed.)':
    case 'Harvard':
      return yearStr ? `(${authorStr}, ${yearStr})` : `(${authorStr})`
    // Author–date, no comma: (Author Year)
    case 'Chicago (Author-Date)':
    case 'ASA':
      return yearStr ? `(${authorStr} ${yearStr})` : `(${authorStr})`
    // MLA 9: (Author page). We have no page numbers → author only.
    case 'MLA':
      return `(${authorStr})`
    // Superscript numeric note/reference styles.
    case 'Chicago (Notes & Bib)':
    case 'Nature':
    case 'AMA':
    case 'AIP':
    case 'CSE':
      return `<sup>${num}</sup>`
    // Parenthetical numeric.
    case 'Vancouver':
    case 'Science':
      return `(${num})`
    // Bracketed numeric.
    case 'IEEE':
    case 'APS':
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
/** DOI as a canonical link when present, else the raw URL. */
function refLink(meta: Pick<CitationMetadata, 'doi' | 'url'>): string {
  const doi = (meta.doi || '').trim()
  if (doi) return `https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}`
  return (meta.url || '').trim()
}

/** No-author entries lead with the title (no "Unknown author" placeholder). */
function formatCitationNoAuthor(rawMetadata: CitationMetadata, style: string): string {
  const metadata = escapeMetadata(rawMetadata)
  const { title, journal, doi, url } = metadata
  const yearStr = citationYearString(metadata)
  const t = title?.trim() || ''
  const j = journal?.trim() || ''
  const em = j ? `<em>${j}</em>` : ''
  const link = refLink(metadata)

  switch (style) {
    case 'APA':
    case 'APA (6th Ed.)':
      return `${t}.${yearStr ? ` (${yearStr}).` : ''}${em ? ` ${em}.` : ''}${link ? ` ${link}` : ''}`
    case 'MLA': {
      const tail = [em, yearStr, link].filter(Boolean)
      return `"${t}."${tail.length ? ' ' + tail.join(', ') + '.' : ''}`
    }
    case 'Chicago':
    case 'Chicago (Author-Date)':
      return `${yearStr ? `${yearStr}. ` : ''}"${t}."${em ? ` ${em}.` : ''}${link ? ` ${link}.` : ''}`
    case 'Chicago (Notes & Bib)':
      return `"${t}."${em ? ` ${em}` : ''}${yearStr ? ` (${yearStr})` : ''}.${link ? ` ${link}.` : ''}`
    case 'Harvard':
      return `${t}${yearStr ? ` (${yearStr})` : ''}.${em ? ` ${em}.` : ''}${link ? ` Available at: ${link}` : ''}`
    case 'Vancouver':
      return `${t}.${j ? ` ${j}.` : ''}${yearStr ? ` ${yearStr}.` : ''}${link ? ` ${link}` : ''}`
    case 'AMA':
      return `${t}.${em ? ` ${em}.` : ''}${yearStr ? ` ${yearStr}.` : ''}${doi ? ` doi:${doi}` : link ? ` ${link}` : ''}`
    case 'CSE':
      return `${yearStr ? `${yearStr}. ` : ''}${t}.${j ? ` ${j}.` : ''}${link ? ` ${link}` : ''}`
    case 'IEEE':
      return `"${t},"${em ? ` ${em},` : ''}${yearStr ? ` ${yearStr}.` : ''}${link ? ` ${link}` : ''}`
    case 'Nature':
    case 'Science':
      return `${t}.${em ? ` ${em}` : ''}${yearStr ? ` (${yearStr})` : ''}.${link ? ` ${link}` : ''}`
    case 'ASA':
      return `${yearStr ? `${yearStr}. ` : ''}"${t}."${em ? ` ${em}.` : ''}${link ? ` ${link}` : ''}`
    case 'APS':
      return `${t}, ${em ? `${em} ` : ''}${yearStr ? `(${yearStr})` : ''}.${link ? ` ${link}` : ''}`
    case 'AIP':
      return `"${t}," ${em ? `${em} ` : ''}${yearStr ? `(${yearStr})` : ''}.${link ? ` ${link}` : ''}`
    case 'BibTeX':
      return `@article{ref${yearStr || 'X'},<br/>&nbsp;&nbsp;title = {${t}},${j ? `<br/>&nbsp;&nbsp;journal = {${j}},` : ''}${yearStr ? `<br/>&nbsp;&nbsp;year = {${yearStr}},` : ''}${doi ? `<br/>&nbsp;&nbsp;doi = {${doi}}` : url ? `<br/>&nbsp;&nbsp;url = {${url}}` : ''}<br/>}`
    case 'RIS':
      return `TY  - JOUR<br/>TI  - ${t}${j ? `<br/>JO  - ${j}` : ''}${yearStr ? `<br/>PY  - ${yearStr}` : ''}${doi ? `<br/>DO  - ${doi}` : ''}${url ? `<br/>UR  - ${url}` : ''}<br/>ER  -`
    default:
      return `${t}.${yearStr ? ` (${yearStr}).` : ''}${em ? ` ${em}.` : ''}${link ? ` ${link}` : ''}`
  }
}

/**
 * Full reference-list entry. Follows each style's real ordering, author
 * formatting, and punctuation for the fields we have (authors, year, title,
 * journal, DOI/URL). Fields the app doesn't store (volume, issue, pages,
 * publisher) are omitted rather than fabricated.
 */
export function formatCitation(rawMetadata: CitationMetadata, style: string): string {
  const metadata = escapeMetadata(rawMetadata)
  const { title, journal, doi, url } = metadata
  const yearStr = citationYearString(metadata)
  const authors = parsedAuthors(metadata.authors)
  const t = title?.trim() || ''
  const j = journal?.trim() || ''
  const em = j ? `<em>${j}</em>` : ''
  const link = refLink(metadata)

  if (authors.length === 0) return formatCitationNoAuthor(rawMetadata, style)

  switch (style) {
    // APA 7: Family, G. G. (Year). Title. Journal. https://doi.org/xxx
    case 'APA':
      return `${apaAuthorList(authors)}${yearStr ? ` (${yearStr})` : ''}. ${t}.${em ? ` ${em}.` : ''}${link ? ` ${link}` : ''}`
    // APA 6: same shape, "Retrieved from" for a bare URL (not for a DOI).
    case 'APA (6th Ed.)': {
      const loc = doi ? link : url ? `Retrieved from ${url}` : ''
      return `${apaAuthorList(authors)}${yearStr ? ` (${yearStr})` : ''}. ${t}.${em ? ` ${em}.` : ''}${loc ? ` ${loc}` : ''}`
    }
    // MLA 9: Family, First. "Title." Journal, Year, URL.
    case 'MLA': {
      const tail = [em, yearStr, link].filter(Boolean)
      return `${mlaAuthorList(authors)}. "${t}."${tail.length ? ' ' + tail.join(', ') + '.' : ''}`
    }
    // Chicago Author–Date: Family, First. Year. "Title." Journal. URL.
    case 'Chicago':
    case 'Chicago (Author-Date)':
      return `${chicagoAuthorList(authors)}.${yearStr ? ` ${yearStr}.` : ''} "${t}."${em ? ` ${em}.` : ''}${link ? ` ${link}.` : ''}`
    // Chicago Notes & Bibliography: Family, First. "Title." Journal (Year). URL.
    case 'Chicago (Notes & Bib)':
      return `${chicagoAuthorList(authors)}. "${t}."${em ? ` ${em}` : ''}${yearStr ? ` (${yearStr})` : ''}.${link ? ` ${link}.` : ''}`
    // Harvard: Family, G. G. (Year) Title. Journal. Available at: URL
    case 'Harvard':
      return `${apaAuthorList(authors)}${yearStr ? ` (${yearStr})` : ''} ${t}.${em ? ` ${em}.` : ''}${link ? ` Available at: ${link}` : ''}`
    // Vancouver: Family GG. Title. Journal. Year. (journal not italicised here)
    case 'Vancouver':
      return `${nlmAuthorList(authors)}. ${t}.${j ? ` ${j}.` : ''}${yearStr ? ` ${yearStr}.` : ''}${link ? ` ${link}` : ''}`
    // AMA: Family GG. Title. Journal. Year. doi:xxx
    case 'AMA':
      return `${nlmAuthorList(authors)}. ${t}.${em ? ` ${em}.` : ''}${yearStr ? ` ${yearStr}.` : ''}${doi ? ` doi:${doi}` : link ? ` ${link}` : ''}`
    // CSE (name–year): Family GG. Year. Title. Journal.
    case 'CSE':
      return `${nlmAuthorList(authors)}.${yearStr ? ` ${yearStr}.` : ''} ${t}.${j ? ` ${j}.` : ''}${link ? ` ${link}` : ''}`
    // IEEE: G. G. Family, "Title," Journal, Year.
    case 'IEEE':
      return `${initialsFirstAuthorList(authors)}, "${t},"${em ? ` ${em},` : ''}${yearStr ? ` ${yearStr}.` : ''}${link ? ` ${link}` : ''}`
    // Nature: Family, G. G. Title. Journal (Year).
    case 'Nature':
      return `${natureAuthorList(authors)} ${t}.${em ? ` ${em}` : ''}${yearStr ? ` (${yearStr})` : ''}.${link ? ` ${link}` : ''}`
    // Science: G. G. Family, Title. Journal (Year).
    case 'Science':
      return `${initialsFirstAuthorList(authors)}, ${t}.${em ? ` ${em}` : ''}${yearStr ? ` (${yearStr})` : ''}.${link ? ` ${link}` : ''}`
    // ASA: Family, First. Year. "Title." Journal.
    case 'ASA':
      return `${chicagoAuthorList(authors)}.${yearStr ? ` ${yearStr}.` : ''} "${t}."${em ? ` ${em}.` : ''}${link ? ` ${link}` : ''}`
    // APS: G. G. Family, Title, Journal (Year).
    case 'APS':
      return `${initialsFirstAuthorList(authors)}, ${t}, ${em ? `${em} ` : ''}${yearStr ? `(${yearStr})` : ''}.${link ? ` ${link}` : ''}`
    // AIP: G. G. Family, "Title," Journal (Year).
    case 'AIP':
      return `${initialsFirstAuthorList(authors)}, "${t}," ${em ? `${em} ` : ''}${yearStr ? `(${yearStr})` : ''}.${link ? ` ${link}` : ''}`
    case 'BibTeX': {
      const bibAuthors = authors.map((a) => (a.given ? `${a.family}, ${a.given}` : a.family)).join(' and ')
      return `@article{ref${yearStr || 'X'},<br/>&nbsp;&nbsp;author = {${bibAuthors}},<br/>&nbsp;&nbsp;title = {${t}},${j ? `<br/>&nbsp;&nbsp;journal = {${j}},` : ''}${yearStr ? `<br/>&nbsp;&nbsp;year = {${yearStr}},` : ''}${doi ? `<br/>&nbsp;&nbsp;doi = {${doi}}` : url ? `<br/>&nbsp;&nbsp;url = {${url}}` : ''}<br/>}`
    }
    case 'RIS': {
      const auLines = authors
        .map((a) => `AU  - ${a.given ? `${a.family}, ${a.given}` : a.family}`)
        .join('<br/>')
      return `TY  - JOUR<br/>${auLines}<br/>TI  - ${t}${j ? `<br/>JO  - ${j}` : ''}${yearStr ? `<br/>PY  - ${yearStr}` : ''}${doi ? `<br/>DO  - ${doi}` : ''}${url ? `<br/>UR  - ${url}` : ''}<br/>ER  -`
    }
    default:
      return `${apaAuthorList(authors)}${yearStr ? ` (${yearStr})` : ''}. ${t}.${em ? ` ${em}.` : ''}${link ? ` ${link}` : ''}`
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

// Matches an existing References/Bibliography section so a re-insert REPLACES it
// (updating in place) instead of appending a second one. Tolerates heading
// attributes and inline tags wrapping the word (e.g. <h2><strong>References</strong></h2>),
// and runs from the heading to the next heading or the end of the document.
const REFS_SECTION_REGEX =
  /<h[1-3][^>]*>\s*(?:<[^>]*>\s*)*(?:References|Bibliography|Works Cited)\s*(?:<\/[^>]*>\s*)*<\/h[1-3]>[\s\S]*?(?:(?=<h[1-3])|\s*$)/i

export function reformatBibliography(
  html: string,
  citations: Map<number, CitationMetadata>,
  style: string,
  /** When provided, the heading + list inherit the document's font so the
   *  bibliography matches the body text rather than the editor default. */
  fontFamily?: string,
): string {
  const sorted = Array.from(citations.entries()).sort((a, b) => a[0] - b[0])

  // Single-quote any inner quotes so the value stays valid inside a double-quoted attr.
  const fontAttr = fontFamily ? ` style="font-family:${fontFamily.replace(/"/g, "'")}"` : ''
  let bibHtml = `<h2${fontAttr}>References</h2><div class="bibliography"${fontAttr}>`
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
