'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SearchPaper } from '@/types/paper-search'
import type { AiSearchResult } from '@/types/ai-search'
import {
  citationToSearchPaper,
  extractPmid,
  matchCitationToPaper,
  normalizeDoi,
  resultDedupeKey,
  type CitationLike,
} from '@/lib/ai-search-match'

type RawSource = Record<string, unknown>

/** Completed AI answer cached per query so results persist across unmounts
 * (switching to a staged-paper tab, the database view, etc.) and are NOT
 * re-fetched until the user runs a different query. Module-level on purpose. */
type CachedAi = { summary: string; sources: RawSource[]; papers: SearchPaper[] }
const aiSearchCache = new Map<string, CachedAi>()

/** Per-paper metadata resolved from the database (OpenAlex) for results that
 * arrived without it — the abstract AND the open-access PDF link + identifiers,
 * so every cited paper shows an abstract and open-access PDFs definitely render.
 * Keyed by result identity; a stored entry (even an empty one) means "already
 * looked up" so we never re-fetch. Module-level so it survives remounts. */
interface ResolvedMeta {
  abstract: string
  pdfUrl: string | null
  articlePageUrl: string | null
  isOpenAccess: boolean
  doi: string | null
  pmid: string | null
  year: number | null
  journal: string | null
  authors: string[]
}
const resolveCache = new Map<string, ResolvedMeta>()
/** Lookups currently running, so re-renders never start a duplicate fetch. */
const resolveInFlight = new Set<string>()

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

/** A snippet/description rather than a full abstract — ends with an ellipsis, or
 *  is suspiciously short. We prefer a full abstract over these. */
function isTruncatedAbstract(s: string | null | undefined): boolean {
  if (!s) return false
  const t = s.trim()
  return /(\.{3}|…)\s*$/.test(t) || t.length < 160
}

/** Choose the best abstract among candidates: the longest NON-truncated one;
 *  only fall back to a truncated snippet when nothing complete is available. */
function pickAbstract(cands: unknown[]): string | null {
  const list = cands.map((c) => str(c)).filter((c): c is string => !!c)
  if (list.length === 0) return null
  const full = list.filter((c) => !isTruncatedAbstract(c))
  const pool = full.length ? full : list
  return pool.reduce((a, b) => (b.length > a.length ? b : a))
}

/**
 * Remove a trailing "References" / "Sources" / "Bibliography" section from the
 * AI summary. We render our own deduped references list from the matched
 * results, so the model's raw (often duplicated) list is dropped to avoid two
 * lists and duplicate entries.
 */
function stripReferencesSection(text: string): string {
  if (!text) return text
  const re =
    /\n[ \t]*(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:references|reference list|sources|bibliography|citations|works cited)\s*:?\s*(?:\*\*|__)?[ \t]*\n[\s\S]*$/i
  const m = text.match(re)
  return m && m.index != null ? text.slice(0, m.index).trimEnd() : text
}

/**
 * Remap inline citation markers (`[5]`, `[5, 6]`) to the deduped, sequential
 * card numbers and collapse duplicates within a bracket — so the numbers in the
 * summary body line up with our references list. Safe to run only AFTER the raw
 * references section is stripped (otherwise it would mangle that list).
 */
function renumberInlineCitations(text: string, map: Map<number, number>): string {
  if (!text || map.size === 0) return text
  return text.replace(/\[([0-9]+(?:\s*,\s*[0-9]+)*)\]/g, (full, inner: string) => {
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

/**
 * Build the paper attached to a result so open-access PDFs always render and the
 * metadata is complete: start from the matched database paper (or a synthesized
 * one when the AI cited a web source we couldn't match) and fill any gaps from
 * the database lookup — PDF link, open-access flag, ids, journal, year, authors.
 */
function enrichPaper(
  matched: SearchPaper | null,
  citation: CitationLike,
  title: string | undefined,
  snippet: string | undefined,
  abstract: string | null,
  meta: ResolvedMeta | null,
): SearchPaper | null {
  if (!matched && !meta && !title && !citation.url && !citation.doi) return null
  const base =
    matched ??
    citationToSearchPaper({ title: title ?? null, url: citation.url, doi: citation.doi, snippet })
  const out: SearchPaper = { ...base }
  if (abstract && !str(out.abstract ?? undefined)) out.abstract = abstract
  if (meta) {
    if (!out.pdfUrl && meta.pdfUrl) out.pdfUrl = meta.pdfUrl
    if (!out.articlePageUrl && meta.articlePageUrl) out.articlePageUrl = meta.articlePageUrl
    if (meta.isOpenAccess) out.isOpenAccess = true
    if (!out.doi && meta.doi) out.doi = meta.doi
    if (!out.pmid && meta.pmid) out.pmid = meta.pmid
    if ((!out.year || out.year <= 0) && meta.year) out.year = meta.year
    if (!str(out.journal ?? undefined) && meta.journal) out.journal = meta.journal
    if ((!out.authors || out.authors.length === 0) && meta.authors.length) out.authors = meta.authors
    if (!str(out.abstract ?? undefined) && meta.abstract) out.abstract = meta.abstract
  }
  return out
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
  const { results, renumber } = useMemo(() => {
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
        renumber.set(orig, existing) // duplicate paper → folds onto the kept card
        return
      }
      const display = out.length + 1
      byKey.set(key, display)
      renumber.set(orig, display)
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
      const meta = resolveCache.get(key) ?? null
      // Prefer a FULL abstract (matched DB / source / resolved lookup) over a
      // truncated description/snippet ("…"). The resolved abstract (OpenAlex /
      // Europe PMC / Semantic Scholar) outranks the AI source's short blurb.
      const abstract = pickAbstract([
        paper?.abstract,
        s.abstract,
        meta?.abstract,
        s.description,
        s.summary,
      ])
      const canResolve = !!lookupTerm || !!url || !!paper?.articlePageUrl
      // Pending while we still lack a FULL abstract and a lookup hasn't run yet.
      // Stays true for the whole multi-source fetch; a truncated snippet still
      // counts as "needs the full abstract" until the lookup completes.
      const needsFullAbstract = !abstract || isTruncatedAbstract(abstract)
      const abstractPending = needsFullAbstract && canResolve && !resolveCache.has(key)
      out.push({
        citeLabel: String(display),
        snippet: snippet ?? '',
        aiTitle: title ?? null,
        sourceUrl: url ?? null,
        paper: enrichPaper(paper, citation, title, snippet, abstract, meta),
        matchKind,
        abstract,
        dedupeKey: key,
        lookupTerm,
        lookupById,
        abstractPending,
      })
    })
    return { results: out, renumber }
    // `abstractVersion` re-derives abstracts once a background lookup fills the cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, papers, abstractVersion])

  // Drop the model's raw (often duplicated) reference list and remap the inline
  // citations to our deduped, sequential card numbers — we render our own clean
  // references list from `results`.
  const summary = useMemo(
    () => renumberInlineCitations(stripReferencesSection(rawSummary), renumber),
    [rawSummary, renumber],
  )

  // For EVERY result missing an abstract OR a PDF link, resolve it against the
  // database (OpenAlex direct, by DOI/PMID/title) and attach the abstract +
  // open-access PDF + identifiers — so every AI result shows an abstract and
  // open-access papers definitely render their full PDF (matching the database
  // results). Runs in the background, a few in parallel, filling cards as it goes.
  useEffect(() => {
    // Wait until the answer + initial paper search settle, so papers already in
    // the search results match locally instead of triggering a network lookup.
    if (isStreaming || papersLoading) return
    let cancelled = false

    const queue = results.filter((r) => {
      const canResolve = !!r.lookupTerm || !!r.sourceUrl || !!r.paper?.articlePageUrl
      if (!canResolve) return false
      // Same key the results memo reads back with — guaranteed not to drift.
      if (resolveCache.has(r.dedupeKey) || resolveInFlight.has(r.dedupeKey)) return false
      // A truncated "…" snippet counts as missing — re-fetch the full abstract.
      const hasFullAbstract = !!str(r.abstract ?? undefined) && !isTruncatedAbstract(r.abstract)
      const hasPdf = !!r.paper?.pdfUrl
      // Resolve when we lack a full abstract or an open-access PDF link.
      return !hasFullAbstract || !hasPdf
    })
    if (queue.length === 0) return

    const EMPTY_META: ResolvedMeta = {
      abstract: '',
      pdfUrl: null,
      articlePageUrl: null,
      isOpenAccess: false,
      doi: null,
      pmid: null,
      year: null,
      journal: null,
      authors: [],
    }

    const lookupOne = async (r: AiSearchResult) => {
      const key = r.dedupeKey
      resolveInFlight.add(key)
      try {
        // Fast, single-paper lookup (OpenAlex direct) — much quicker than the
        // full literature search. The endpoint validates title matches itself.
        const doi = r.paper?.doi || normalizeDoi(r.sourceUrl) || ''
        const pmid = r.paper?.pmid || extractPmid(r.sourceUrl) || ''
        const title = (r.paper?.title || r.aiTitle || '').trim()
        const params = new URLSearchParams()
        if (doi) params.set('doi', doi)
        if (pmid) params.set('pmid', pmid)
        if (title) params.set('title', title)
        // The cited URL lets the resolver read the abstract straight off the
        // source page when no index matched the paper.
        const srcUrl = r.paper?.articlePageUrl || r.sourceUrl || ''
        if (srcUrl) params.set('url', srcUrl)
        const res = await fetch(`/api/paper-abstract?${params.toString()}`)
        const data = res.ok ? ((await res.json()) as Partial<ResolvedMeta>) : null
        resolveCache.set(key, {
          abstract: typeof data?.abstract === 'string' ? data.abstract.trim() : '',
          pdfUrl: data?.pdfUrl ?? null,
          articlePageUrl: data?.articlePageUrl ?? null,
          isOpenAccess: !!data?.isOpenAccess,
          doi: data?.doi ?? null,
          pmid: data?.pmid ?? null,
          year: typeof data?.year === 'number' ? data.year : null,
          journal: data?.journal ?? null,
          authors: Array.isArray(data?.authors) ? data!.authors! : [],
        })
      } catch {
        resolveCache.set(key, EMPTY_META)
      } finally {
        resolveInFlight.delete(key)
        // Re-derive on EVERY completion (found or not) so the card's loading
        // shimmer resolves to the abstract/PDF or the "unavailable" state.
        if (!cancelled) setAbstractVersion((v) => v + 1)
      }
    }

    // OpenAlex is fast, so we can fan out more aggressively.
    const CONCURRENCY = 8
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

  // Final pass: renumber inline citations AND result labels to 1, 2, 3, … in the
  // order the summary first cites them — so the inline markers and the references
  // list always read ascending from 1 with no gaps, no matter which sources the
  // model cited. Papers not cited inline are appended after the cited ones.
  const { displaySummary, displayResults } = useMemo(() => {
    const order: string[] = []
    const seen = new Set<string>()
    for (const m of summary.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
      for (const part of m[1].split(',')) {
        const lbl = part.trim()
        if (lbl && !seen.has(lbl)) {
          seen.add(lbl)
          order.push(lbl)
        }
      }
    }
    if (order.length === 0) return { displaySummary: summary, displayResults: results }
    const map = new Map<string, string>()
    let k = 1
    for (const old of order) if (!map.has(old)) map.set(old, String(k++))
    for (const r of results) if (!map.has(r.citeLabel)) map.set(r.citeLabel, String(k++))
    const newSummary = summary.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (full, inner: string) => {
      const mapped = inner
        .split(',')
        .map((s) => map.get(s.trim()))
        .filter((x): x is string => !!x)
      if (mapped.length === 0) return full
      const uniq = Array.from(new Set(mapped)).sort((a, b) => Number(a) - Number(b))
      return `[${uniq.join(', ')}]`
    })
    const newResults = results
      .map((r) => ({ ...r, citeLabel: map.get(r.citeLabel) ?? r.citeLabel }))
      // Keep the cards in the same 1, 2, 3, … order as the inline citations and
      // the references list, so a card's number always matches everywhere.
      .sort((a, b) => Number(a.citeLabel) - Number(b.citeLabel))
    return { displaySummary: newSummary, displayResults: newResults }
  }, [summary, results])

  // While a new query has been requested but not yet processed (or while the old
  // answer is still in state mid-transition), the active query won't match the
  // requested one. Gate the exposed answer on that so the PREVIOUS results never
  // flash before the new ones render — show the loading state instead.
  const requested = (query ?? '').trim()
  const inSync = !requested || activeQuery === requested

  return {
    run,
    summary: inSync ? displaySummary : '',
    results: inSync ? displayResults : [],
    isStreaming: isStreaming || (!!requested && !inSync),
    papersLoading: restored ? false : papersLoading,
    error: inSync ? error : null,
    activeQuery,
    stop,
  }
}
