import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { cleanScrapedAbstract } from '@/lib/literature-abstract-display'

/**
 * Lightweight, fast abstract lookup for a SINGLE paper — used to fill in
 * abstracts on AI search results without running the slow full literature
 * search. Hits OpenAlex directly by DOI → PMID → title (one request) and
 * reconstructs the abstract from its inverted index. For a title lookup the top
 * hit's abstract is only returned when titles are similar, so we never attach a
 * wrong abstract.
 */
export const maxDuration = 20

function reconstructAbstract(inv: Record<string, number[]> | undefined | null): string {
  if (!inv || typeof inv !== 'object') return ''
  const positions: Array<[number, string]> = []
  for (const [word, idxs] of Object.entries(inv)) {
    if (!Array.isArray(idxs)) continue
    for (const i of idxs) positions.push([i, word])
  }
  if (positions.length === 0) return ''
  positions.sort((a, b) => a[0] - b[0])
  return positions.map((p) => p[1]).join(' ')
}

function norm(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function titlesSimilar(a: string, b: string): boolean {
  const wa = new Set(norm(a).split(' ').filter((w) => w.length > 2))
  const wb = new Set(norm(b).split(' ').filter((w) => w.length > 2))
  if (wa.size === 0 || wb.size === 0) return false
  let inter = 0
  for (const w of wa) if (wb.has(w)) inter++
  return inter / Math.min(wa.size, wb.size) >= 0.4
}

type OpenAlexWork = {
  display_name?: string
  abstract_inverted_index?: Record<string, number[]>
  abstract?: string
}

function userAgent(): string {
  const mail = process.env.OPENALEX_CONTACT_EMAIL?.trim()
  return mail
    ? `Notes9/1.0 (mailto:${mail})`
    : 'Notes9/1.0 (https://openalex.org; literature search)'
}

function abstractOf(work: OpenAlexWork | null | undefined): string {
  if (!work) return ''
  const fromInverted = reconstructAbstract(work.abstract_inverted_index)
  const raw = fromInverted || (typeof work.abstract === 'string' ? work.abstract : '')
  return raw ? cleanScrapedAbstract(raw) ?? raw : ''
}

async function fetchWork(url: string): Promise<OpenAlexWork | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': userAgent() } })
    if (!res.ok) return null
    return (await res.json()) as OpenAlexWork
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const p = request.nextUrl.searchParams
  const doi = p.get('doi')?.trim() || ''
  const pmid = p.get('pmid')?.trim() || ''
  const title = p.get('title')?.trim() || ''

  try {
    // 1. DOI — direct, exact.
    if (doi) {
      const clean = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
      const work = await fetchWork(`https://api.openalex.org/works/doi:${encodeURIComponent(clean)}`)
      const abstract = abstractOf(work)
      if (abstract) return NextResponse.json({ abstract })
    }

    // 2. PMID — direct, exact.
    if (pmid && /^\d+$/.test(pmid)) {
      const work = await fetchWork(`https://api.openalex.org/works/pmid:${pmid}`)
      const abstract = abstractOf(work)
      if (abstract) return NextResponse.json({ abstract })
    }

    // 3. Title — top search hit, only if the titles are similar enough.
    if (title && title.length >= 8) {
      const params = new URLSearchParams({ search: title, per_page: '1' })
      const res = await fetchWork(`https://api.openalex.org/works?${params.toString()}`)
      // /works?search returns { results: [...] }, not a single work.
      const list = (res as unknown as { results?: OpenAlexWork[] })?.results
      const top = Array.isArray(list) ? list[0] : null
      if (top && top.display_name && titlesSimilar(title, top.display_name)) {
        const abstract = abstractOf(top)
        if (abstract) return NextResponse.json({ abstract })
      }
    }

    return NextResponse.json({ abstract: '' })
  } catch {
    return NextResponse.json({ abstract: '' })
  }
}
