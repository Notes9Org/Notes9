import { NextRequest } from 'next/server'
import type { PaperSearchSortMode } from '@/types/paper-search'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { searchPapersWithMeta } from '@/lib/paper-search'

/**
 * Dedicated AI literature-search endpoint — proxies the catalyst orchestrator
 * `POST /literature/ai-search/stream` and pipes its SSE through unchanged.
 *
 * This is intentionally SEPARATE from `/api/chat`: literature search no longer
 * piggybacks on the general chat stream. The catalyst orchestrator does web
 * search first, falls back to PubMed/Europe PMC/OpenAlex, and generates an
 * overall + per-paper AI summary in parallel.
 *
 * SSE events forwarded to the client:
 *   papers → paper_summary* → overall_summary → done   (or error)
 *
 * Graceful degradation: if catalyst is unreachable, fall back to the legacy
 * in-process paper search and synthesize a minimal `papers` + `done` stream so
 * the UI still shows results (without AI summaries).
 */

// The web-search agent + summary fan-out can run well over a minute on a cold
// catalyst. Allow enough wall-clock (Vercel clamps to the plan limit).
export const maxDuration = 200

function catalystBaseUrl(): string | null {
  const raw = (process.env.CATALYST_URL?.trim() || process.env.CHAT_API_URL?.trim()) ?? ''
  return raw ? raw.replace(/\/+$/, '') : null
}

function parseSort(v: unknown): PaperSearchSortMode {
  return v === 'recent' || v === 'cited' ? v : 'relevance'
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const query = typeof body.query === 'string' ? body.query.trim() : ''
  if (!query) {
    return new Response(JSON.stringify({ error: 'query is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (query.length > 1000) {
    return new Response(JSON.stringify({ error: 'Query too long' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const sort = parseSort(body.sort)
  const limit =
    typeof body.limit === 'number' && body.limit >= 1 && body.limit <= 30
      ? Math.floor(body.limit)
      : 10
  const webSearch = body.web_search !== false && body.webSearch !== false
  const openAccessOnly = body.open_access_only === true || body.openAccessOnly === true
  const recentYears =
    typeof body.recent_years === 'number'
      ? body.recent_years
      : typeof body.recentYears === 'number'
        ? body.recentYears
        : undefined
  // Dedupe keys of papers the client has already shown — a non-empty list marks a
  // "load more" continuation page. Bounded so the forwarded payload stays sane.
  const rawExclude = body.exclude_ids ?? body.excludeIds
  const excludeIds = Array.isArray(rawExclude)
    ? rawExclude.filter((x): x is string => typeof x === 'string').slice(0, 500)
    : []

  const accessToken = (await supabase.auth.getSession()).data.session?.access_token
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const base = catalystBaseUrl()

  // Legacy fallback: in-process search → single `papers` + `done` SSE.
  const legacyStream = async (): Promise<Response> => {
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enc = new TextEncoder()
        try {
          const legacy = await searchPapersWithMeta(query, {
            sort,
            openAccessOnly,
            ...(recentYears !== undefined ? { recentYears } : {}),
          })
          // "Load more" continuation: drop already-shown papers (mirrors the
          // frontend dedupeKey: id || doi || pmid || title) before slicing.
          const seen = new Set(excludeIds)
          const pool = excludeIds.length
            ? legacy.papers.filter(
                (p) => !seen.has(p.id || p.doi || p.pmid || p.title || ''),
              )
            : legacy.papers
          const papers = pool.slice(0, limit)
          controller.enqueue(
            enc.encode(
              sse('papers', {
                query,
                papers,
                totalCount: papers.length,
                pipeline: {
                  db_fallback: true,
                  fallback: 'legacy-in-process',
                  has_more: papers.length >= limit,
                  page: excludeIds.length ? 2 : 1,
                },
              })
            )
          )
          // No AI summaries in the legacy path. Surface a visible notice instead
          // of an empty overall_summary (which left the pane hanging on
          // "Composing…" forever). The frontend maps `error` events to a banner
          // while still rendering the DB papers above. Skip on a continuation
          // page so it can't clear page 1.
          if (!excludeIds.length) {
            controller.enqueue(
              enc.encode(
                sse('error', {
                  error:
                    'AI summary is temporarily unavailable — showing database results only.',
                }),
              ),
            )
          }
          controller.enqueue(enc.encode(sse('done', { totalCount: papers.length })))
        } catch (err) {
          controller.enqueue(
            enc.encode(sse('error', { error: err instanceof Error ? err.message : 'search failed' }))
          )
        } finally {
          controller.close()
        }
      },
    })
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  if (!base) return legacyStream()

  try {
    const upstream = await fetch(`${base}/literature/ai-search/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        query,
        limit,
        web_search: webSearch,
        sort,
        open_access_only: openAccessOnly,
        ...(recentYears !== undefined ? { recent_years: recentYears } : {}),
        ...(excludeIds.length ? { exclude_ids: excludeIds } : {}),
      }),
    })

    if (!upstream.ok || !upstream.body) {
      console.warn('catalyst ai-search stream failed, falling back:', upstream.status)
      return legacyStream()
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err) {
    console.warn(
      'catalyst unreachable for ai-search, falling back to legacy:',
      err instanceof Error ? err.message : err
    )
    return legacyStream()
  }
}
