'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Telescope, Loader2, AlertCircle, RotateCcw } from 'lucide-react'
import { useAiLiteratureSearch } from '@/hooks/use-ai-literature-search'
import { MarkdownRenderer } from '@/components/catalyst/markdown-renderer'
import { AiPaperCard } from './ai-paper-card'
import { AiSearchFilters } from './ai-search-filters'
import { AnimatePresence, MotionResultCard } from './motion'
import { openCatalystPanel } from '@/lib/catalyst-launch'
import { setCatalystLiterature, type LiteratureRef } from '@/lib/catalyst-literature'
import { papersToGrounding, buildLiteratureSessionContext } from '@/lib/literature-citations'
import type { GroundingResource } from '@/lib/agent-stream-types'
import { renumberCitations } from '@/lib/citation-renumber'
import { applyAiFilters, DEFAULT_AI_FILTERS, journalOptions, yearBounds, type AiResultFilters } from '@/lib/ai-search-filters'
import { stripHtmlToText } from '@/lib/literature-abstract-display'
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

// Stable per-paper identity for saved-state tracking — never list position.
function savedKeyForResult(r: AiSearchResult): string {
  const p = r.paper
  return String(p?.id || p?.doi || p?.pmid || p?.title || r.citeLabel)
}

function refMeta(r: AiSearchResult): string {
  const authors = r.paper?.authors ?? []
  const lead = authors[0] ? `${stripHtmlToText(authors[0])}${authors.length > 1 ? ' et al.' : ''}` : ''
  const journal = r.paper?.journal ? stripHtmlToText(r.paper.journal) : ''
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
  registerStop,
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
  /** Hand the host a `stop()` so the search bar can offer a Stop button. */
  registerStop?: (fn: () => void) => void
}) {
  // The dedicated catalyst orchestrator (/api/literature/ai-search) returns the
  // papers AND streams the overall + per-paper summaries. The overall summary is
  // DISPLAYED in the Catalyst sidebar; this page shows the papers (cards).
  const {
    run,
    summary,
    manifest: serverManifest,
    results,
    papers: resultPapers,
    isStreaming,
    papersLoading,
    error,
    stop,
  } = useAiLiteratureSearch({ query })

  // Track saved papers by identity (id|doi|pmid|title) across re-renders so cards
  // don't revert on remount — never by list position, which leaks across queries.
  const savedKeysRef = useRef(new Set<string>())

  // Pagination: one deeply-ranked fetch; "Load more" reveals the rest of the
  // buffer client-side (PAGE_SIZE at a time). No network page-2.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    if (query.trim()) void run(query)
    setVisibleCount(PAGE_SIZE)
    savedKeysRef.current = new Set<string>()
  }, [query, run])

  // Reset the visible window when filters change so the reveal math stays sane.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [filters])

  // Lift papers (for the host's staging detection + count) and loading state.
  useEffect(() => {
    onResults?.(resultPapers)
  }, [resultPapers, onResults])
  useEffect(() => {
    onLoadingChange?.(isStreaming || papersLoading)
    return () => onLoadingChange?.(false)
  }, [isStreaming, papersLoading, onLoadingChange])
  useEffect(() => {
    registerStop?.(stop)
  }, [registerStop, stop])

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
  // Relevance order comes from the backend reranker (best-first). Keep it; only
  // re-sort when the user explicitly picks a sort mode (e.g. "Open access").
  // Memoized so streaming ticks that only change the summary don't re-filter.
  const displayed = useMemo(() => applyAiFilters(results, filters), [results, filters])
  const visible = useMemo(() => displayed.slice(0, visibleCount), [displayed, visibleCount])
  // "Load more" is a pure client-side reveal of the already-fetched, deeply
  // ranked set — no network page-2 (that path caused duplicates/latency).
  const showLoadMore = visibleCount < displayed.length
  const onLoadMore = useCallback(() => setVisibleCount((c) => c + PAGE_SIZE), [])
  // Filter options grounded in the actual result set (not hardcoded).
  const journalChoices = useMemo(() => journalOptions(results), [results])
  const yearHint = useMemo(() => yearBounds(results), [results])
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
    // Parity path: when the server emitted an authoritative citation manifest,
    // the summary is ALREADY renumbered by first-appearance server-side, so we do
    // NOT re-run the client renumber. Chips resolve against this manifest (the
    // same contract as the main Catalyst agent). References/resources are derived
    // from the manifest but enriched by joining each entry back to the rich client
    // paper so the "All citations" panel keeps authors/journal/year.
    if (serverManifest?.manifest && Object.keys(serverManifest.manifest).length > 0) {
      const byId = new Map(
        results.map((r) => [String(r.paper?.id ?? r.dedupeKey ?? ''), r]),
      )
      const ordered = Object.values(serverManifest.manifest)
        .slice()
        .sort(
          (a, b) =>
            Number(a.cite_label ?? a.index ?? 0) - Number(b.cite_label ?? b.index ?? 0),
        )
      const references: LiteratureRef[] = ordered.map((e) => {
        const r = byId.get(String(e.source_id ?? ''))
        return {
          n: String(e.cite_label ?? e.index ?? ''),
          title: stripHtmlToText(r?.paper?.title || r?.aiTitle || e.source_name || 'Untitled'),
          meta: r ? refMeta(r) : '',
          href: (r ? refHref(r) : null) ?? e.source_url ?? null,
        }
      })
      const resources = ordered.map((e) => ({
        source_type: e.source_type ?? 'literature',
        source_id: String(e.source_id ?? ''),
        display_label: String(e.cite_label ?? e.index ?? ''),
        source_name: e.source_name ?? '',
        ...(e.source_url ? { source_url: e.source_url } : {}),
        ...(e.excerpt ? { excerpt: e.excerpt } : {}),
        support_status: e.support_status ?? null,
      })) as GroundingResource[]
      const context = results.length ? buildLiteratureSessionContext(q, results) : null
      setCatalystLiterature({
        query: q,
        summary,
        streaming: isStreaming,
        references,
        resources,
        manifest: serverManifest,
        context,
      })
      return
    }

    const groundingInput = hasCitations ? renumberedResults : results

    const references: LiteratureRef[] = groundingInput.map((r) => ({
      n: r.citeLabel,
      title: stripHtmlToText(r.paper?.title || r.aiTitle || 'Untitled'),
      meta: refMeta(r),
      href: refHref(r),
    }))
    // Build the unified grounding structures so the sidebar renders [N] chips and
    // the "All citations" panel identically to agent answers.  Only computed when
    // results are available; re-computation on each tick is cheap (deterministic).
    const { resources, manifest } = groundingInput.length ? papersToGrounding(groundingInput) : { resources: [], manifest: { manifest: {} } }
    const context = results.length ? buildLiteratureSessionContext(q, results) : null
    setCatalystLiterature({ query: q, summary: renumberedSummary, streaming: isStreaming, references, resources, manifest, context })
  }, [query, summary, serverManifest, isStreaming, results])

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <span className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            {error}
          </span>
          <button
            type="button"
            onClick={() => void run(query ?? '')}
            className="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-xs font-medium hover:bg-destructive/10 transition-colors"
          >
            <RotateCcw className="size-3" />
            Try again
          </button>
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

      {/* Inline AI summary — the summary streams here in the pane (primary
          surface) as well as into the Catalyst sidebar, so results are readable
          even when the sidebar isn't open. */}
      {(summary || isStreaming) && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] px-3.5 py-3 duration-300 animate-in fade-in">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-primary">
            {isStreaming ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Telescope className="size-3.5 shrink-0" aria-hidden />
            )}
            AI summary
          </div>
          {summary ? (
            <MarkdownRenderer
              content={summary}
              citationsManifest={serverManifest ?? null}
              showCursor={isStreaming}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Composing the AI summary…</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground/80">
            Continue the conversation in the Catalyst sidebar — ask follow-up questions anytime.
          </p>
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
          <MotionResultCard
            key={`${r.paper?.id ?? r.sourceUrl ?? r.aiTitle ?? r.citeLabel}`}
            data-cite-label={r.citeLabel}
            className="rounded-xl"
            delay={Math.min(i, 8) * 0.05}
          >
            <AiPaperCard
              result={{ ...r, citeLabel: String(i + 1) }}
              projectId={projectId}
              query={query}
              // Seed "saved" from the host's persisted library membership (source of
              // truth, shared with the detail view) UNIONed with optimistic
              // in-session saves — so an already-saved paper never shows "Save to
              // library" on the card while the detail shows "Saved to library".
              initialSaved={
                (r.paper ? (isPaperStaged?.(r.paper.id) ?? false) : false) ||
                savedKeysRef.current.has(savedKeyForResult(r))
              }
              onSaved={() => savedKeysRef.current.add(savedKeyForResult(r))}
              onStage={onStagePaper}
              onOpenStaged={onOpenStaged}
              isStaged={r.paper ? (isPaperStaged?.(r.paper.id) ?? false) : false}
              isStaging={r.paper ? (isPaperStaging?.(r.paper.id) ?? false) : false}
            />
          </MotionResultCard>
        )

        // Group by reranker tier when present ("related" is explicit; everything else
        // is treated as directly relevant). Falls back to a flat list when untiered.
        const hasTiers = visible.some((r) => r.paper?.relevanceTier)
        if (!hasTiers) {
          return <AnimatePresence initial={false}>{visible.map(renderCard)}</AnimatePresence>
        }

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
          <AnimatePresence initial={false}>
            {primary.length > 0 && header('Directly relevant')}
            {primary.map((r, i) => renderCard(r, i))}
            {related.length > 0 && header('Related work')}
            {related.map((r, i) => renderCard(r, primary.length + i))}
          </AnimatePresence>
        )
      })()}

      {!loading && displayed.length > 0 && showLoadMore && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={onLoadMore}
            className="glass-panel inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30"
          >
            Load more
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
