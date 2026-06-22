'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SearchPaper } from '@/types/paper-search'
import type { AiSearchResult } from '@/types/ai-search'
import {
  aiResultDedupeKey,
  matchCitationToPaper,
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

/**
 * Rewrite inline citation markers (`[5]`, `[5, 6]`) in the AI summary to the
 * final, sequential card numbers after dedupe — so the numbers in the summary
 * match the result cards, and citations that collapsed to the same paper share
 * one number instead of appearing as several.
 */
function renumberCitations(summary: string, map: Map<number, number>): string {
  if (!summary || map.size === 0) return summary
  return summary.replace(/\[([0-9]+(?:\s*,\s*[0-9]+)*)\]/g, (full, inner: string) => {
    const nums = inner.split(',').map((p) => parseInt(p.trim(), 10))
    if (nums.some((n) => Number.isNaN(n))) return full
    const mapped = nums
      .map((n) => map.get(n))
      .filter((n): n is number => typeof n === 'number')
    if (mapped.length === 0) return full
    const uniq = Array.from(new Set(mapped)).sort((a, b) => a - b)
    return `[${uniq.join(', ')}]`
  })
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

  // Build the deduped result cards AND a map from each AI source's original
  // citation number to its final, sequential card number. Duplicate papers (same
  // work from different publishers) collapse onto the kept card, and cards are
  // numbered 1, 2, 3, … in order — so the numbers stay correct even when earlier
  // sources were merged away.
  const { results, citeRenumber } = useMemo(() => {
    const byKey = new Map<string, number>() // dedupe key -> display number
    const renumber = new Map<number, number>() // original (1-based) -> display number
    const out: AiSearchResult[] = []
    sources.forEach((s, i) => {
      const orig = i + 1
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
      const existing = byKey.get(key)
      if (existing != null) {
        renumber.set(orig, existing) // duplicate → folds onto the kept card
        return
      }
      const display = out.length + 1
      byKey.set(key, display)
      renumber.set(orig, display)
      // Abstract, in order: matched DB paper → source payload → background lookup.
      const abstract =
        str(paper?.abstract ?? undefined) ??
        str(s.abstract) ??
        str(s.description) ??
        str(s.summary) ??
        (abstractCache.get(key) || null)
      out.push({
        citeLabel: String(display),
        snippet: snippet ?? '',
        aiTitle: title ?? null,
        sourceUrl: url ?? null,
        paper,
        matchKind,
        abstract,
      })
    })
    return { results: out, citeRenumber: renumber }
    // `abstractVersion` re-derives abstracts once a background lookup fills the cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, papers, abstractVersion])

  // Renumber the summary's inline citations to match the deduped card numbers.
  const summary = useMemo(
    () => renumberCitations(rawSummary, citeRenumber),
    [rawSummary, citeRenumber],
  )

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
      const key = aiResultDedupeKey({ paper: r.paper, title: r.aiTitle, url: r.sourceUrl })
      if (abstractCache.has(key) || abstractInFlight.has(key)) return false
      const lookup = r.paper?.doi || r.paper?.pmid || r.paper?.title || r.aiTitle
      return !!(lookup && lookup.trim().length >= 8)
    })
    if (queue.length === 0) return

    const lookupOne = async (r: AiSearchResult) => {
      const key = aiResultDedupeKey({ paper: r.paper, title: r.aiTitle, url: r.sourceUrl })
      abstractInFlight.add(key)
      const byId = !!(r.paper?.doi || r.paper?.pmid)
      const lookup = (r.paper?.doi || r.paper?.pmid || r.paper?.title || r.aiTitle || '').trim()
      try {
        const res = await fetch(`/api/search-papers?query=${encodeURIComponent(lookup)}`)
        const data: unknown = res.ok ? await res.json() : null
        const list = Array.isArray((data as { papers?: unknown })?.papers)
          ? (data as { papers: SearchPaper[] }).papers
          : []
        const cite: CitationLike = {
          title: r.paper?.title ?? r.aiTitle ?? null,
          url: r.sourceUrl,
          doi: r.paper?.doi ?? null,
        }
        const abs = pickAbstractFromSearch(cite, list, byId)
        abstractCache.set(key, abs)
        if (abs && !cancelled) setAbstractVersion((v) => v + 1)
      } catch {
        abstractCache.set(key, '')
      } finally {
        abstractInFlight.delete(key)
      }
    }

    // Bounded concurrency so we don't fire dozens of slow searches at once.
    const CONCURRENCY = 4
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

  return {
    run,
    summary,
    results,
    isStreaming,
    papersLoading: restored ? false : papersLoading,
    error,
    activeQuery,
    stop,
  }
}
