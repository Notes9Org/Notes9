import { NextRequest, NextResponse } from 'next/server'
import { searchPapers, searchPapersWithMeta } from '@/lib/paper-search'
import type { PaperSearchSortMode } from '@/types/paper-search'
import { createClient } from '@/lib/supabase/server'

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

    const debug =
      searchParams.get('debug') === '1' || searchParams.get('debug') === 'true'

    const opts = {
      sort,
      ...(recentYears != null ? { recentYears } : {}),
      openAccessOnly,
    }

    if (debug) {
      const { papers, variants, pipeline } = await searchPapersWithMeta(query, opts)
      return NextResponse.json({
        papers,
        totalCount: papers.length,
        meta: { variants, pipeline },
      })
    }

    const results = await searchPapers(query, opts)

    return NextResponse.json({
      papers: results,
      totalCount: results.length,
    })
  } catch (error) {
    console.error('Paper search API error:', error)
    return NextResponse.json({ error: 'Failed to search papers' }, { status: 500 })
  }
}
