'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SearchPaper } from '@/types/paper-search'
import type { AiSearchMatchKind, AiSearchResult } from '@/types/ai-search'

/**
 * AI literature search — backed by the DEDICATED catalyst orchestrator via
 * `POST /api/literature/ai-search` (NOT the general `/api/chat` stream).
 *
 * The backend does web search first, falls back to PubMed/Europe PMC/OpenAlex,
 * and returns ~10 structured papers (each with its source link, abstract, and
 * citation count). It then streams an OVERALL synthesis plus an INDIVIDUAL
 * per-paper summary for each paper. We render papers immediately (two-phase
 * "fast then enrich") and fill each card's summary as it arrives.
 *
 * SSE event contract (see api/literature_ai_search.py):
 *   papers → paper_summary* → overall_summary → done   (or error)
 */

type CachedAi = { summary: string; papers: SearchPaper[] }
/** Completed answers cached per query so results survive unmounts (tab switches)
 *  and aren't re-fetched until a different query runs. Module-level on purpose. */
const aiSearchCache = new Map<string, CachedAi>()

function cacheKeyForSearch(query: string): string {
  return query
}

function matchKindFor(p: SearchPaper): AiSearchMatchKind {
  if (p.doi) return 'doi'
  if (p.pmid) return 'pmid'
  if (p.sourceUrl) return 'url'
  return 'title'
}

function toResult(p: SearchPaper, index: number): AiSearchResult {
  const abstract = (p.abstract || '').trim()
  return {
    citeLabel: String(index + 1),
    snippet: '',
    aiTitle: p.title ?? null,
    sourceUrl: p.sourceUrl ?? null,
    paper: p,
    matchKind: matchKindFor(p),
    abstract: abstract || null,
    dedupeKey: p.id || p.doi || p.pmid || p.title || String(index),
    lookupTerm: null,
    lookupById: false,
    // The backend already enriched abstracts/PDFs/citations — nothing to fetch.
    abstractPending: false,
    aiSummary: p.aiSummary ?? null,
    // Pending until the per-paper summary streams in (set false once the
    // backend has no more summaries to send, i.e. on `done`).
    summaryPending: !p.aiSummary,
  }
}

interface SsePapersEvent {
  query: string
  papers: SearchPaper[]
  totalCount: number
  pipeline?: Record<string, unknown>
}

/** Parse a single SSE block ("event: x\ndata: {...}") into [event, data]. */
function parseSseBlock(block: string): [string, unknown] | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length === 0) return null
  try {
    return [event, JSON.parse(dataLines.join('\n'))]
  } catch {
    return null
  }
}

export function useAiLiteratureSearch({
  query,
}: { papers?: SearchPaper[]; query?: string } = {}) {
  const [papers, setPapers] = useState<SearchPaper[]>([])
  const [summary, setSummary] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [phase, setPhase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeQuery, setActiveQuery] = useState<string | null>(query?.trim() || null)

  const lastRunQueryRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const activeRequestIdRef = useRef(0)
  const requestedRef = useRef('')

  const stop = useCallback(() => {
    activeRequestIdRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
    // Force inSync (activeQuery === requested) so the derived `isStreaming`
    // (which is `isStreaming || (!!requested && !inSync)`) can't stay true after
    // an abort — otherwise onLoadingChange re-sets isSearching and the bar
    // re-locks, making Stop look broken.
    setActiveQuery(requestedRef.current)
    setPhase(null)
    // Clear the dedupe guard so the SAME query can run again after an abort.
    // Without this, an unmount-abort (incl. React StrictMode's mount-time
    // setup→cleanup→setup) leaves the guard set and the remount's run() is
    // blocked — the search silently never fires. Also enables manual re-search.
    lastRunQueryRef.current = null
  }, [])

  const applyPaperSummary = useCallback((id: string, text: string) => {
    setPapers((prev) =>
      prev.map((p) => (String(p.id) === String(id) ? { ...p, aiSummary: text } : p)),
    )
  }, [])

  const run = useCallback(
    async (q0: string) => {
      const q = q0.trim()
      if (!q) return
      const cacheKey = cacheKeyForSearch(q)
      if (cacheKey === lastRunQueryRef.current) return // already current — never re-run
      lastRunQueryRef.current = cacheKey
      const requestId = activeRequestIdRef.current + 1
      activeRequestIdRef.current = requestId
      abortRef.current?.abort()
      abortRef.current = null
      setActiveQuery(q)
      setError(null)

      // Restore a completed answer from cache — no network call.
      const cached = aiSearchCache.get(cacheKey)
      if (cached) {
        setPapers(cached.papers)
        setSummary(cached.summary)
        setIsStreaming(false)
        return
      }

      const controller = new AbortController()
      abortRef.current = controller

      setPapers([])
      setSummary('')
      setPhase('searching')
      setIsStreaming(true)

      let receivedPapers: SearchPaper[] = []
      let overall = ''

      try {
        const res = await fetch('/api/literature/ai-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Cap at 10 results — the backend summarizes each paper, so a smaller
          // set keeps token cost low. 10 is enough for a relevance-ranked answer
          // and fills the first client-side page (PAGE_SIZE=10), so no "Load more".
          body: JSON.stringify({ query: q, limit: 10 }),
          signal: controller.signal,
        })
        if (!res.ok || !res.body) {
          throw new Error(`Literature search failed (${res.status})`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        const isActiveRequest = () => activeRequestIdRef.current === requestId

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (!isActiveRequest()) break
          buffer += decoder.decode(value, { stream: true })
          const blocks = buffer.split('\n\n')
          buffer = blocks.pop() ?? ''
          for (const block of blocks) {
            if (!isActiveRequest()) break
            const parsed = parseSseBlock(block)
            if (!parsed) continue
            const [event, data] = parsed
            if (event === 'status') {
              const p = (data as { phase?: string }).phase
              if (p && isActiveRequest()) setPhase(p)
            } else if (event === 'papers') {
              const payload = data as SsePapersEvent
              receivedPapers = Array.isArray(payload.papers) ? payload.papers : []
              if (isActiveRequest()) setPapers(receivedPapers)
            } else if (event === 'paper_summary') {
              const { id, text } = data as { id: string; text: string }
              if (id && text) {
                if (isActiveRequest()) applyPaperSummary(id, text)
                receivedPapers = receivedPapers.map((p) =>
                  String(p.id) === String(id) ? { ...p, aiSummary: text } : p,
                )
              }
            } else if (event === 'overall_summary') {
              // Try all field names the Python backend may use. Treat empty/
              // whitespace as absent so a blank `text` doesn't win over a real
              // `content`/`summary` (`??` would keep the empty string).
              const raw = data as { text?: string; content?: string; summary?: string }
              const firstNonEmpty = [raw.text, raw.content, raw.summary].find(
                (v) => typeof v === 'string' && v.trim().length > 0,
              )
              overall = String(firstNonEmpty ?? '')
              if (isActiveRequest()) setSummary(overall)
            } else if (event === 'error') {
              if (isActiveRequest())
                setError(
                  String((data as { error?: string }).error ?? 'Literature search failed.'),
                )
            }
            // `done` needs no special handling — the loop ends with the stream.
          }
        }

        // Stop any lingering per-card shimmers and cache the completed answer.
        if (isActiveRequest()) setPapers((prev) => prev.map((p) => ({ ...p })))
        if (receivedPapers.length > 0) {
          aiSearchCache.set(q, { summary: overall, papers: receivedPapers })
        }
      } catch (e) {
        // Only the still-active request may touch shared state — a superseded
        // request must not clear the newer one's retry guard or set its error.
        if ((e as Error)?.name !== 'AbortError' && activeRequestIdRef.current === requestId) {
          // Clear the guard so the user can retry the same query.
          lastRunQueryRef.current = null
          setError(e instanceof Error ? e.message : 'The AI search failed. Please try again.')
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        // Only the still-active request may flip global loading/phase. A search
        // superseded by a newer one (its controller aborted) must NOT clear the
        // new search's streaming state — that was the "second search won't load" bug.
        if (activeRequestIdRef.current === requestId) {
          setIsStreaming(false)
          setPhase(null)
        }
      }
    },
    [applyPaperSummary],
  )

  const results = useMemo<AiSearchResult[]>(() => {
    return papers.map((p, i) => {
      const r = toResult(p, i)
      // While the stream is live and this paper has no summary yet, show a
      // shimmer; once streaming ends, resolve to whatever we have.
      r.summaryPending = isStreaming && !p.aiSummary
      return r
    })
  }, [papers, isStreaming])

  // Abort any in-flight stream when the host component unmounts (e.g. tab switch).
  useEffect(() => () => stop(), [stop])

  const requested = (query ?? '').trim()
  const inSync = !requested || activeQuery === requested
  // Keep the latest requested query available to stop() (which has [] deps).
  requestedRef.current = requested

  return {
    run,
    /** Overall AI synthesis (streamed) — rendered in the Catalyst sidebar. */
    summary: inSync ? summary : '',
    /** Per-paper result cards. */
    results: inSync ? results : [],
    /** Underlying structured papers (lifted to the host for staging/count). */
    papers: inSync ? papers : [],
    isStreaming: isStreaming || (!!requested && !inSync),
    papersLoading: isStreaming && papers.length === 0,
    /** Current pipeline phase while streaming (e.g. "searching"), else null. */
    phase: inSync ? phase : null,
    error: inSync ? error : null,
    activeQuery,
    stop,
  }
}
