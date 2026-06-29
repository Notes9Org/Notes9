'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Telescope, Loader2, AlertCircle } from 'lucide-react'
import { useAiLiteratureSearch } from '@/hooks/use-ai-literature-search'
import { AiPaperCard } from './ai-paper-card'
import { AiSearchFilters } from './ai-search-filters'
import { openCatalystPanel } from '@/lib/catalyst-launch'
import { setCatalystLiterature, type LiteratureRef } from '@/lib/catalyst-literature'
import { papersToGrounding, buildLiteratureSessionContext } from '@/lib/literature-citations'
import { renumberCitations } from '@/lib/citation-renumber'
import { applyAiFilters, DEFAULT_AI_FILTERS, journalOptions, yearBounds, type AiResultFilters } from '@/lib/ai-search-filters'
import { decodeHtmlEntities } from '@/lib/literature-abstract-display'
import type { SearchPaper } from '@/types/paper-search'
import type { AiSearchResult } from '@/types/ai-search'

/** Searches we've already auto-opened Catalyst for — module-level so a tab switch
 *  / remount doesn't re-open the sidebar for the same query. */

/** Best external link for a result (matched metadata first, then the cited URL). */
function refHref(r: AiSearchResult): string | null {
  const p = r.paper
  if (p?.articlePageUrl && /^https?:\/\//i.test(p.articlePageUrl)) return p.articlePageUrl
  if (p?.pdfUrl && /^https?:\/\//i.test(p.pdfUrl)) return p.pdfUrl
  const doi = p?.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim()
  if (doi) return `https://doi.org/${doi}`
  if (p?.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`
  if (r.sourceUrl && /^https?:\/\//i.test(r.sourceUrl)) return r.sourceUrl
  return null
}

/** How many result cards to reveal per "Load more" click (and on first render). */
const PAGE_SIZE = 10

function openAccessFirst(results: AiSearchResult[]): AiSearchResult[] {
  return [...results].sort((a, b) => Number(!!b.paper?.isOpenAccess) - Number(!!a.paper?.isOpenAccess))
}

function refMeta(r: AiSearchResult): string {
  const authors = r.paper?.authors ?? []
  const lead = authors[0] ? `${decodeHtmlEntities(authors[0])}${authors.length > 1 ? ' et al.' : ''}` : ''
  const journal = r.paper?.journal ? decodeHtmlEntities(r.paper.journal) : ''
  const year = r.paper?.year || null
  return [lead, journal, year].filter(Boolean).join(' · ')
}

function CardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <Card
      className="n9-skeleton-shimmer duration-500 animate-in fade-in fill-mode-both"
      style={{ animationDelay: `${delay}ms` }}
    >
      <CardContent className="p-4">
        <div className="mb-2 h-4 w-24 rounded bg-muted" />
        <div className="mb-2 h-5 w-3/4 rounded bg-muted" />
        <div className="mb-3 h-16 w-full rounded bg-muted/60" />
        <div className="h-8 w-40 rounded bg-muted" />
      </CardContent>
    </Card>
  )
}

export function AiSearchView({
  query,
  projectId,
  filters = DEFAULT_AI_FILTERS,
  onFiltersChange,
  onStagePaper,
  onOpenStaged,
  isPaperStaged,
  isPaperStaging,
  onResults,
  onLoadingChange,
}: {
  query: string
  projectId?: string | null
  papers?: SearchPaper[]
  /** Result filters (controlled from the search bar). */
  filters?: AiResultFilters
  /** When provided, the filter control is rendered inline above the results. */
  onFiltersChange?: (next: AiResultFilters) => void
  onStagePaper?: (paper: SearchPaper) => void | Promise<void>
  onOpenStaged?: (paper: SearchPaper) => void
  isPaperStaged?: (id: string) => boolean
  isPaperStaging?: (id: string) => boolean
  /** Lift the structured papers to the host (staging detection, count). */
  onResults?: (papers: SearchPaper[]) => void
  /** Report search loading to the host so the search bar spinner stays in sync. */
  onLoadingChange?: (loading: boolean) => void
}) {
  // The dedicated catalyst orchestrator (/api/literature/ai-search) returns the
  // papers AND streams the overall + per-paper summaries. The overall summary is
  // DISPLAYED in the Catalyst sidebar; this page shows the papers (cards).
  const {
    run,
    summary,
    results,
    papers: resultPapers,
    isStreaming,
    papersLoading,
    error,
    loadMore,
    isLoadingMore,
    hasMore,
  } = useAiLiteratureSearch({ query })

  // Track saved paper keys across re-renders so cards don't revert on remount.
  const savedKeysRef = useRef(new Set<string>())

  // Pagination: show an initial page, "Load more" reveals the rest of the buffer
  // and then fetches a fresh continuation page (excluding everything seen).
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    if (query.trim()) void run(query)
    setVisibleCount(PAGE_SIZE)
  }, [query, run])

  // Lift papers (for the host's staging detection + count) and loading state.
  useEffect(() => {
    onResults?.(resultPapers)
  }, [resultPapers, onResults])
  useEffect(() => {
    onLoadingChange?.(isStreaming || papersLoading)
  }, [isStreaming, papersLoading, onLoadingChange])

  // Listen for citation-chip clicks from the Catalyst summary panel and scroll
  // the matching paper card into view.
  useEffect(() => {
    const handler = (e: Event) => {
      const label = (e as CustomEvent<{ citeLabel: string }>).detail?.citeLabel
      if (!label) return
      const card = document.querySelector(`[data-cite-label="${label}"]`)
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    window.addEventListener('literature:scroll-to-citation', handler)
    return () => window.removeEventListener('literature:scroll-to-citation', handler)
  }, [])

  const loading = isStreaming || papersLoading
  const showSkeletons = loading && results.length === 0
  const displayed = openAccessFirst(applyAiFilters(results, filters))
  const visible = displayed.slice(0, visibleCount)
  // "Load more": first reveal already-buffered results, then fetch a fresh
  // continuation page (the hook excludes everything shown, so no repeats).
  const canRevealBuffer = visibleCount < displayed.length
  const showLoadMore = canRevealBuffer || hasMore
  const onLoadMore = () => {
    if (canRevealBuffer) {
      setVisibleCount((c) => c + PAGE_SIZE)
    } else if (hasMore) {
      setVisibleCount((c) => c + PAGE_SIZE)
      void loadMore()
    }
  }
  // Filter options grounded in the actual result set (not hardcoded).
  const journalChoices = journalOptions(results)
  const yearHint = yearBounds(results)
  // True until the search settles: summary still streaming, DB match running, or
  // any shown card's abstract still resolving.
  const processing = loading || displayed.some((r) => r.abstractPending)

  // Tracks the previous streaming state so we auto-open the sidebar exactly once
  // per search run (on false→true), and re-open on every fresh search.
  const wasStreamingRef = useRef(false)

  // Stream the AI summary (and its references) into the Catalyst sidebar, and
  // auto-open the sidebar the moment a search starts — so the summary shows up
  // there immediately and composes live. Follow-up questions continue in the
  // sidebar via the stream endpoint (the summary is in the co-pilot context).
  useEffect(() => {
    const q = query.trim()
    if (!q) return
    // Auto-open the sidebar once per SEARCH RUN (on the false→true streaming
    // transition), not once-per-query-string-forever. This way re-running the
    // same query after the user closed the panel re-opens it. (Previously a
    // module-level Set meant a repeated query never re-opened the sidebar.)
    if (isStreaming && !wasStreamingRef.current) {
      openCatalystPanel({ scope: 'literature' })
    }
    wasStreamingRef.current = isStreaming
    // Renumber citations by order of first appearance so the prose [N], the
    // references list, and the grounding manifest share one contiguous numbering
    // (the agent's raw arrival ids are sparse). Deterministic + prefix-stable, so
    // it's safe to re-run on every streaming tick.
    const knownLabels = new Set(results.map((r) => r.citeLabel))
    const { markdown: renumberedSummary, remap } = renumberCitations(summary, knownLabels)
    const hasCitations = remap.size > 0

    // Cited papers in new-number order. Before any citation has streamed we show
    // all results (arrival order) so sources are visible while the summary builds.
    const renumberedResults = results
      .filter((r) => remap.has(r.citeLabel))
      .map((r) => ({ ...r, citeLabel: remap.get(r.citeLabel)! }))
      .sort((a, b) => Number(a.citeLabel) - Number(b.citeLabel))
    const groundingInput = hasCitations ? renumberedResults : results

    const references: LiteratureRef[] = groundingInput.map((r) => ({
      n: r.citeLabel,
      title: decodeHtmlEntities(r.paper?.title || r.aiTitle || 'Untitled'),
      meta: refMeta(r),
      href: refHref(r),
    }))
    // Build the unified grounding structures so the sidebar renders [N] chips and
    // the "All citations" panel identically to agent answers.  Only computed when
    // results are available; re-computation on each tick is cheap (deterministic).
    const { resources, manifest } = groundingInput.length ? papersToGrounding(groundingInput) : { resources: [], manifest: { manifest: {} } }
    const context = results.length ? buildLiteratureSessionContext(q, results) : null
    setCatalystLiterature({ query: q, summary: renumberedSummary, streaming: isStreaming, references, resources, manifest, context })
  }, [query, summary, isStreaming, results])

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-transparent bg-background/80 px-0.5 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-2">
            {onFiltersChange && (
              <AiSearchFilters
                value={filters}
                onChange={onFiltersChange}
                triggerClassName="h-8 gap-1 px-2 text-xs"
                journals={journalChoices}
                yearHint={yearHint}
              />
            )}
            {processing ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Gathering papers…
              </span>
            ) : (
              <span className="text-xs text-muted-foreground tabular-nums">
                <span className="font-medium text-foreground">{displayed.length}</span>
                {displayed.length === results.length ? '' : ` / ${results.length}`}{' '}
                {displayed.length === 1 ? 'paper' : 'papers'}
              </span>
            )}
          </div>
        </div>
      )}

      {isStreaming && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.04] px-3.5 py-2.5 text-sm text-muted-foreground duration-300 animate-in fade-in">
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
          Composing the AI summary in the Catalyst sidebar — ask follow-up questions there anytime.
        </div>
      )}

      {showSkeletons && (
        <>
          <CardSkeleton delay={0} />
          <CardSkeleton delay={120} />
          <CardSkeleton delay={240} />
        </>
      )}

      {(() => {
        const renderCard = (r: (typeof displayed)[number], i: number) => (
          <div
            key={`${r.citeLabel}-${r.paper?.id ?? r.sourceUrl ?? r.aiTitle ?? ''}`}
            data-cite-label={r.citeLabel}
            className="rounded-xl duration-500 animate-in fade-in slide-in-from-bottom-3 fill-mode-both"
            style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
          >
            <AiPaperCard
              result={{ ...r, citeLabel: String(i + 1) }}
              projectId={projectId}
              query={query}
              initialSaved={savedKeysRef.current.has(r.citeLabel)}
              onSaved={() => savedKeysRef.current.add(r.citeLabel)}
              onStage={onStagePaper}
              onOpenStaged={onOpenStaged}
              isStaged={r.paper ? (isPaperStaged?.(r.paper.id) ?? false) : false}
              isStaging={r.paper ? (isPaperStaging?.(r.paper.id) ?? false) : false}
            />
          </div>
        )

        // Group by reranker tier when present ("related" is explicit; everything else
        // is treated as directly relevant). Falls back to a flat list when untiered.
        const hasTiers = visible.some((r) => r.paper?.relevanceTier)
        if (!hasTiers) return visible.map(renderCard)

        const related = visible.filter((r) => r.paper?.relevanceTier === 'related')
        const primary = visible.filter((r) => r.paper?.relevanceTier !== 'related')
        const header = (label: string) => (
          <p
            key={`hdr-${label}`}
            className="px-1 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground first:pt-0"
          >
            {label}
          </p>
        )
        return (
          <>
            {primary.length > 0 && header('Directly relevant')}
            {primary.map((r, i) => renderCard(r, i))}
            {related.length > 0 && header('Related work')}
            {related.map((r, i) => renderCard(r, primary.length + i))}
          </>
        )
      })()}

      {!loading && displayed.length > 0 && showLoadMore && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="glass-panel inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading more…
              </>
            ) : (
              'Load more'
            )}
          </button>
        </div>
      )}

      {!loading && results.length > 0 && displayed.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No results match your filters.
        </p>
      )}

      {!loading && results.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <Telescope className="mb-3 size-10 opacity-40" />
          <p>No papers found yet. Try rephrasing your question.</p>
        </div>
      )}
    </div>
  )
}
