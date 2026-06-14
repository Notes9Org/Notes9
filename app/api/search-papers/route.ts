import { NextRequest, NextResponse } from 'next/server'
import type { PaperSearchSortMode, SearchPaper } from '@/types/paper-search'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import {
  callCatalyst,
  CatalystHttpError,
  CatalystUnavailableError,
} from '@/lib/catalyst-client'
import { searchPapersWithMeta } from '@/lib/paper-search'
import { cleanScrapedAbstract, decodeHtmlEntities } from '@/lib/literature-abstract-display'

/** Decode HTML entities (e.g. "15&#xa0;years", "M&#xfc;ller") that upstream
 *  sources leave in the title/authors/journal, and trim body text that web
 *  scraping leaks into the abstract — so search results (and anything staged
 *  from them) display and store cleanly. */
function withCleanedPapers(papers: SearchPaper[]): SearchPaper[] {
  return papers.map((paper) => ({
    ...paper,
    title: paper.title ? decodeHtmlEntities(paper.title) : paper.title,
    journal: paper.journal ? decodeHtmlEntities(paper.journal) : paper.journal,
    authors: Array.isArray(paper.authors) ? paper.authors.map((a) => decodeHtmlEntities(a)) : paper.authors,
    abstract: paper.abstract ? cleanScrapedAbstract(paper.abstract) ?? paper.abstract : paper.abstract,
  }))
}

// The web-search literature agent can run well over a minute. Allow the route
// enough wall-clock so it isn't killed before catalyst responds (Vercel clamps
// this to the plan limit; ignored on self-hosted Node).
export const maxDuration = 160

function parseSort(param: string | null): PaperSearchSortMode {
  if (param === 'recent' || param === 'cited') return param
  return 'relevance'
}

function parseRecentYears(param: string | null): number | undefined {
  if (param == null || param === '') return undefined
  const n = parseInt(param, 10)
  if (Number.isNaN(n)) return undefined
  return n
}

type CatalystSearchBody = {
  query: string
  sort: PaperSearchSortMode
  recent_years?: number
  open_access_only: boolean
}

type CatalystSearchResponse = {
  papers: SearchPaper[]
  totalCount: number
  pipeline?: {
    cache_hit?: boolean
    agent_enabled?: boolean
    degraded_sources?: string[]
    source_durations_ms?: Record<string, number>
    iterations?: number
    dropped_offtopic?: number
    intent_summary?: string
    short_circuit?: 'doi' | 'pmid'
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('query')

    if (!query) {
      return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 })
    }
    if (query.length > 1000) {
      return NextResponse.json({ error: 'Query too long' }, { status: 413 })
    }

    const sort = parseSort(searchParams.get('sort'))
    const recentYears = parseRecentYears(searchParams.get('recentYears'))
    const openAccessOnly =
      searchParams.get('openAccessOnly') === '1' ||
      searchParams.get('openAccessOnly') === 'true'

    const accessToken = (await supabase.auth.getSession()).data.session?.access_token
    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: CatalystSearchBody = {
      query,
      sort,
      open_access_only: openAccessOnly,
    }
    if (recentYears !== undefined) body.recent_years = recentYears

    try {
      const data = await callCatalyst<CatalystSearchBody, CatalystSearchResponse>(
        '/literature/search',
        body,
        accessToken
      )

      return NextResponse.json({
        papers: withCleanedPapers(data.papers),
        totalCount: data.totalCount,
        ...(data.pipeline ? { pipeline: data.pipeline } : {}),
      })
    } catch (catalystErr) {
      // Graceful degradation: when catalyst is unreachable (not configured,
      // 5xx, network failure, or our own client-side timeout), serve the
      // search from the legacy in-process pipeline so the UI keeps working.
      // Logged so operators can see how often it fires.
      const isAbort =
        catalystErr instanceof DOMException && catalystErr.name === "AbortError"
      // A failed fetch (catalyst not running, connection refused, DNS, TLS) throws
      // a TypeError rather than one of our typed errors — treat it as unavailable
      // so the UI still gets results instead of a hard failure.
      const isNetworkError = catalystErr instanceof TypeError
      const shouldFallback =
        catalystErr instanceof CatalystUnavailableError ||
        (catalystErr instanceof CatalystHttpError && catalystErr.status >= 500) ||
        isAbort ||
        isNetworkError
      if (!shouldFallback) throw catalystErr

      console.warn(
        'Catalyst unavailable, falling back to legacy in-process search:',
        catalystErr instanceof Error ? catalystErr.message : catalystErr
      )
      const legacy = await searchPapersWithMeta(query, {
        sort,
        openAccessOnly,
        ...(recentYears !== undefined ? { recentYears } : {}),
      })
      return NextResponse.json({
        papers: withCleanedPapers(legacy.papers),
        totalCount: legacy.papers.length,
        pipeline: {
          cache_hit: false,
          agent_enabled: false,
          degraded_sources: ['catalyst'],
          fallback: 'legacy-in-process',
        },
      })
    }
  } catch (error) {
    if (error instanceof CatalystHttpError) {
      console.error('Catalyst error:', error.status, error.body)
      return NextResponse.json(
        { error: 'Literature search failed' },
        { status: error.status >= 500 ? 502 : error.status }
      )
    }
    console.error('Paper search API error:', error)
    return NextResponse.json({ error: 'Failed to search papers' }, { status: 500 })
  }
}
