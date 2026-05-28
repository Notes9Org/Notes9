import { NextRequest, NextResponse } from 'next/server'
import type { PaperSearchSortMode, SearchPaper } from '@/types/paper-search'
import { createClient } from '@/lib/supabase/server'
import {
  callCatalyst,
  CatalystHttpError,
  CatalystUnavailableError,
} from '@/lib/catalyst-client'
import { searchPapersWithMeta } from '@/lib/paper-search'

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
    const { data: { user } } = await supabase.auth.getUser()
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
        papers: data.papers,
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
      const shouldFallback =
        catalystErr instanceof CatalystUnavailableError ||
        (catalystErr instanceof CatalystHttpError && catalystErr.status >= 500) ||
        isAbort
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
        papers: legacy.papers,
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
