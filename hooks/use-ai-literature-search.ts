'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SearchPaper } from '@/types/paper-search'
import type { AiSearchResult } from '@/types/ai-search'
import {
  extractPmid,
  matchCitationToPaper,
  normalizeDoi,
  pickAbstractFromSearch,
  resultDedupeKey,
  type CitationLike,
} from '@/lib/ai-search-match'

type RawSource = Record<string, unknown>

/** Completed AI answer cached per query so results persist across unmounts
 * (switching to a staged-paper tab, the database view, etc.) and are NOT
 * re-fetched until the user runs a different query. Module-level on purpose. */
type CachedAi = { summary: string; sources: RawSource[]; papers: SearchPaper[] }
const aiSearchCache = new Map<string, CachedAi>()

/** Abstracts looked up for results that arrived without one (AI web sources not
 * in the initial paper search). Keyed by result identity; '' means "looked up,
 * none found" so we never re-fetch. Module-level so it survives remounts. */
const abstractCache = new Map<string, string>()
/** Lookups currently running, so re-renders never start a duplicate fetch. */
const abstractInFlight = new Set<string>()

function latestAssistant(messages: UIMessage[]): UIMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') return messages[i]
  }
  return undefined
}

function textOf(msg?: UIMessage): string {
  if (!msg?.parts) return ''
  return msg.parts
    .filter((p): p is { type: 'text'; text: string } => (p as { type: string }).type === 'text')
    .map((p) => p.text ?? '')
    .join('')
}

function sourcesOf(msg?: UIMessage): RawSource[] {
  if (!msg?.parts) return []
  return msg.parts
    .filter((p): p is { type: 'data-source'; data: { source: RawSource } } =>
      (p as { type: string }).type === 'data-source',
    )
    .map((p) => p.data?.source)
    .filter(Boolean) as RawSource[]
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export function useAiLiteratureSearch({
  papers: externalPapers,
  query,
}: { papers?: SearchPaper[]; query?: string } = {}) {
  const supabase = useMemo(() => createClient(), [])
  const tokenRef = useRef<string | null>(null)
  const sessionRef = useRef<string>('')
  const lastRunQueryRef = useRef<string | null>(null)
  const externalProvidedRef = useRef(externalPapers !== undefined)
  externalProvidedRef.current = externalPapers !== undefined

  const [internalPapers, setInternalPapers] = useState<SearchPaper[]>([])
  const [papersLoading, setPapersLoading] = useState(false)
  const [activeQuery, setActiveQuery] = useState<string | null>(query?.trim() || null)
  // Pre-restore synchronously on mount so a remount (tab switch) shows the
  // previous answer immediately instead of flashing a loader.
  const [restored, setRestored] = useState<CachedAi | null>(() =>
    query?.trim() ? aiSearchCache.get(query.trim()) ?? null : null,
  )
  // Bumped when a background abstract lookup fills the cache, to re-derive results.
  const [abstractVersion, setAbstractVersion] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      tokenRef.current = data.session?.access_token ?? null
    })
  }, [supabase])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest(request) {
          const token = tokenRef.current
          return {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            body: {
              messages: request.messages,
              sessionId: sessionRef.current,
              webSearch: true,
              ...request.body,
            },
          }
        },
      }),
    [],
  )

  const { messages, sendMessage, status, setMessages, stop } = useChat({
    id: 'ai-lit-search',
    transport,
  })

  const fetchPapers = useCallback((q: string) => {
    setInternalPapers([])
    setPapersLoading(true)
    fetch(`/api/search-papers?query=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`search ${r.status}`))))
      .then((data: unknown) => {
        const list = Array.isArray((data as { papers?: unknown })?.papers)
          ? (data as { papers: SearchPaper[] }).papers
          : Array.isArray(data)
            ? (data as SearchPaper[])
            : []
        setInternalPapers(list)
      })
      .catch(() => setInternalPapers([]))
      .finally(() => setPapersLoading(false))
  }, [])

  const run = useCallback(
    async (q0: string) => {
      const q = q0.trim()
      if (!q) return
      if (q === lastRunQueryRef.current) return // already current — never re-run
      lastRunQueryRef.current = q
      setActiveQuery(q)

      // Already answered this query → restore from cache, no AI call.
      const cached = aiSearchCache.get(q)
      if (cached) {
        setRestored(cached)
        setMessages([])
        if (!externalProvidedRef.current) setInternalPapers(cached.papers)
        return
      }

      setRestored(null)
      if (!tokenRef.current) {
        const { data } = await supabase.auth.getSession()
        tokenRef.current = data.session?.access_token ?? null
      }
      sessionRef.current =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `ai-lit-${q.slice(0, 24)}`
      setMessages([])
      if (!externalProvidedRef.current) fetchPapers(q)
      void sendMessage({ text: q })
    },
    [sendMessage, setMessages, supabase, fetchPapers],
  )

  const assistant = latestAssistant(messages)
  const liveSummary = textOf(assistant)
  const liveSources = useMemo(() => sourcesOf(assistant), [assistant])

  const papers = externalPapers ?? internalPapers

  // Persist a completed answer so it survives unmounts.
  useEffect(() => {
    if (restored) return
    if (status === 'ready' && activeQuery && liveSummary.trim().length > 0) {
      aiSearchCache.set(activeQuery, { summary: liveSummary, sources: liveSources, papers })
    }
  }, [restored, status, activeQuery, liveSummary, liveSources, papers])

  const rawSummary = restored ? restored.summary : liveSummary
  const sources = restored ? restored.sources : liveSources
  const isStreaming = !restored && (status === 'streaming' || status === 'submitted')
  const error = !restored && status === 'error' ? 'The AI search failed. Please try again.' : null

  // Build the deduped result cards. Duplicate papers (same work surfaced from
  // different publishers) collapse onto the kept card, and cards are numbered
  // 1, 2, 3, … in order so their numbers are always sequential. The AI summary
  // text is rendered exactly as written — its inline references and any
  // reference list are preserved as-is (no renumber, no dedupe).
  const results = useMemo(() => {
    const byKey = new Set<string>()
    const out: AiSearchResult[] = []
    sources.forEach((s) => {
      const url = str(s.source_url) ?? str(s.url)
      const title = str(s.source_name) ?? str(s.title)
      const snippet = str(s.cited_text) ?? str(s.excerpt) ?? str(s.snippet)
      const citation: CitationLike = { title: title ?? null, url: url ?? null, doi: str(s.doi) ?? null }
      const { paper, matchKind } = matchCitationToPaper(citation, papers)
      // Dedupe the same paper surfaced from different publishers (PubMed/PMC/…):
      // prefer the matched paper's identity, else the citation's DOI/PMID/title.
      const key = paper
        ? resultDedupeKey({ title: paper.title, url: paper.articlePageUrl ?? paper.pdfUrl, doi: paper.doi })
        : resultDedupeKey(citation)
      if (byKey.has(key)) return // duplicate paper → a card already exists
      byKey.add(key)
      const display = out.length + 1
      // Best term for a background abstract lookup: an id (DOI/PMID, from the
      // matched paper or the citation itself) is most reliable, else the title.
      const idTerm =
        paper?.doi ||
        paper?.pmid ||
        normalizeDoi(citation.doi) ||
        normalizeDoi(citation.url) ||
        extractPmid(citation.url) ||
        null
      const titleTerm = (paper?.title || title || '').trim()
      const lookupTerm = idTerm ?? (titleTerm.length >= 8 ? titleTerm : null)
      const lookupById = !!idTerm
      // Abstract, in order: matched DB paper → source payload → background lookup.
      const abstract =
        str(paper?.abstract ?? undefined) ??
        str(s.abstract) ??
        str(s.description) ??
        str(s.summary) ??
        (abstractCache.get(key) || null)
      // Pending = no abstract yet, a lookup is possible, and we haven't recorded
      // a result for it. Once the cache holds the key (a string or ''), it's no
      // longer pending — either the abstract is shown or it's genuinely absent.
      const abstractPending = !abstract && !!lookupTerm && !abstractCache.has(key)
      out.push({
        citeLabel: String(display),
        snippet: snippet ?? '',
        aiTitle: title ?? null,
        sourceUrl: url ?? null,
        paper,
        matchKind,
        abstract,
        dedupeKey: key,
        lookupTerm,
        lookupById,
        abstractPending,
      })
    })
    return out
    // `abstractVersion` re-derives abstracts once a background lookup fills the cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, papers, abstractVersion])

  // Render the summary exactly as the AI produced it (references untouched).
  const summary = rawSummary

  // For EVERY result without an abstract, run the normal database paper search
  // (one query per paper, by DOI/PMID/title) and attach the abstract — so the AI
  // results always show an abstract just like the database results. Runs in the
  // background, a few in parallel, filling cards in progressively.
  useEffect(() => {
    // Wait until the answer + initial paper search settle, so papers already in
    // the search results match locally instead of triggering a network lookup.
    if (isStreaming || papersLoading) return
    let cancelled = false

    const queue = results.filter((r) => {
      if (str(r.abstract ?? undefined)) return false
      if (!r.lookupTerm) return false
      // Same key the results memo reads back with — guaranteed not to drift.
      return !abstractCache.has(r.dedupeKey) && !abstractInFlight.has(r.dedupeKey)
    })
    if (queue.length === 0) return

    const lookupOne = async (r: AiSearchResult) => {
      const key = r.dedupeKey
      abstractInFlight.add(key)
      try {
        const res = await fetch(`/api/search-papers?query=${encodeURIComponent(r.lookupTerm ?? '')}`)
        const data: unknown = res.ok ? await res.json() : null
        const list = Array.isArray((data as { papers?: unknown })?.papers)
          ? (data as { papers: SearchPaper[] }).papers
          : []
        const cite: CitationLike = {
          title: r.paper?.title ?? r.aiTitle ?? null,
          url: r.sourceUrl,
          doi: r.paper?.doi ?? null,
        }
        const abs = pickAbstractFromSearch(cite, list, r.lookupById)
        abstractCache.set(key, abs)
      } catch {
        abstractCache.set(key, '')
      } finally {
        abstractInFlight.delete(key)
        // Re-derive on EVERY completion (found or not) so the card's loading
        // shimmer resolves to the abstract or the "unavailable" state.
        if (!cancelled) setAbstractVersion((v) => v + 1)
      }
    }

    // Bounded concurrency so we don't fire dozens of slow searches at once.
    const CONCURRENCY = 6
    let idx = 0
    const worker = async () => {
      while (!cancelled && idx < queue.length) {
        await lookupOne(queue[idx++])
      }
    }
    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))

    return () => {
      cancelled = true
    }
  }, [results, isStreaming, papersLoading])

  // While a new query has been requested but not yet processed (or while the old
  // answer is still in state mid-transition), the active query won't match the
  // requested one. Gate the exposed answer on that so the PREVIOUS results never
  // flash before the new ones render — show the loading state instead.
  const requested = (query ?? '').trim()
  const inSync = !requested || activeQuery === requested

  return {
    run,
    summary: inSync ? summary : '',
    results: inSync ? results : [],
    isStreaming: isStreaming || (!!requested && !inSync),
    papersLoading: restored ? false : papersLoading,
    error: inSync ? error : null,
    activeQuery,
    stop,
  }
}
