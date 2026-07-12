'use client'

import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import type { SearchPaper } from '@/types/paper-search'
import type { AiSearchMatchKind, AiSearchResult } from '@/types/ai-search'
import * as engine from '@/lib/literature-search-engine'
import type { AiSearchLimitInfo } from '@/lib/literature-search-engine'

export type { AiSearchLimitInfo }

/**
 * AI literature search — backed by the DEDICATED catalyst orchestrator via
 * `POST /api/literature/ai-search` (NOT the general `/api/chat` stream).
 *
 * This hook is a thin `useSyncExternalStore` subscriber over the module-level
 * `literature-search-engine`, which owns the actual fetch/SSE/cache lifecycle.
 * That's what lets a search survive this component unmounting (tab switch,
 * SPA navigation) — on unmount we only unsubscribe, we never abort. Manual
 * Stop (returned below) still really aborts, via engine.stop().
 */

function matchKindFor(p: SearchPaper): AiSearchMatchKind {
  if (p.doi) return 'doi'
  if (p.pmid) return 'pmid'
  if (p.sourceUrl) return 'url'
  return 'title'
}

function toResult(p: SearchPaper, index: number, isStreaming: boolean): AiSearchResult {
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
    summaryPending: isStreaming && !p.aiSummary,
  }
}

export function useAiLiteratureSearch({
  query,
}: { papers?: SearchPaper[]; query?: string } = {}) {
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getServerSnapshot)

  // Keep the latest requested query available to stop() (which has [] deps).
  const requestedRef = useRef('')
  const requested = (query ?? '').trim()
  requestedRef.current = requested

  const run = useCallback((q: string) => engine.run(q), [])

  const stop = useCallback(() => {
    engine.stop(requestedRef.current)
  }, [])

  const results = useMemo<AiSearchResult[]>(() => {
    return snapshot.papers.map((p, i) => toResult(p, i, snapshot.isStreaming))
  }, [snapshot.papers, snapshot.isStreaming])

  const inSync = !requested || snapshot.activeQuery === requested

  return {
    run,
    /** Overall AI synthesis (streamed) — rendered in the Catalyst sidebar. */
    summary: inSync ? snapshot.summary : '',
    /** Server-authoritative citation manifest (null until emitted / on stale). */
    manifest: inSync ? snapshot.manifest : null,
    /** Per-paper result cards. */
    results: inSync ? results : [],
    /** Underlying structured papers (lifted to the host for staging/count). */
    papers: inSync ? snapshot.papers : [],
    isStreaming: snapshot.isStreaming || (!!requested && !inSync),
    papersLoading: snapshot.isStreaming && snapshot.papers.length === 0,
    /** Current pipeline phase while streaming (e.g. "searching"), else null. */
    phase: inSync ? snapshot.phase : null,
    /** Accumulated pipeline phases for a live progress timeline. */
    phases: inSync ? snapshot.phases : [],
    error: inSync ? snapshot.error : null,
    /** Free-tier quota notice (429) — a fact with a reset date, not an error. */
    limitInfo: snapshot.limitInfo,
    activeQuery: snapshot.activeQuery,
    stop,
  }
}
