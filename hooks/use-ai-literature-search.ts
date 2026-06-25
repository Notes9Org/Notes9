'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
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
  const [error, setError] = useState<string | null>(null)
  const [activeQuery, setActiveQuery] = useState<string | null>(query?.trim() || null)

  const lastRunQueryRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
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
      if (q === lastRunQueryRef.current) return // already current — never re-run
      lastRunQueryRef.current = q
      setActiveQuery(q)
      setError(null)

      // Restore a completed answer from cache — no network call.
      const cached = aiSearchCache.get(q)
      if (cached) {
        setPapers(cached.papers)
        setSummary(cached.summary)
        setIsStreaming(false)
        return
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setPapers([])
      setSummary('')
      setIsStreaming(true)

      let receivedPapers: SearchPaper[] = []
      let overall = ''

      try {
        const res = await fetch('/api/literature/ai-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, limit: 10 }),
          signal: controller.signal,
        })
        if (!res.ok || !res.body) {
          throw new Error(`Literature search failed (${res.status})`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const blocks = buffer.split('\n\n')
          buffer = blocks.pop() ?? ''
          for (const block of blocks) {
            const parsed = parseSseBlock(block)
            if (!parsed) continue
            const [event, data] = parsed
            if (event === 'papers') {
              const payload = data as SsePapersEvent
              receivedPapers = Array.isArray(payload.papers) ? payload.papers : []
              setPapers(receivedPapers)
            } else if (event === 'paper_summary') {
              const { id, text } = data as { id: string; text: string }
              if (id && text) {
                applyPaperSummary(id, text)
                receivedPapers = receivedPapers.map((p) =>
                  String(p.id) === String(id) ? { ...p, aiSummary: text } : p,
                )
              }
            } else if (event === 'overall_summary') {
              overall = String((data as { text?: string }).text ?? '')
              setSummary(overall)
            } else if (event === 'error') {
              setError(
                String((data as { error?: string }).error ?? 'Literature search failed.'),
              )
            }
            // `done` needs no special handling — the loop ends with the stream.
          }
        }

        // Stop any lingering per-card shimmers and cache the completed answer.
        setPapers((prev) => prev.map((p) => ({ ...p })))
        if (receivedPapers.length > 0) {
          aiSearchCache.set(q, { summary: overall, papers: receivedPapers })
        }
      } catch (e) {
        if ((e as Error)?.name !== 'AbortError') {
          setError(e instanceof Error ? e.message : 'The AI search failed. Please try again.')
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        setIsStreaming(false)
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

  const requested = (query ?? '').trim()
  const inSync = !requested || activeQuery === requested

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
    error: inSync ? error : null,
    activeQuery,
    stop,
  }
}
