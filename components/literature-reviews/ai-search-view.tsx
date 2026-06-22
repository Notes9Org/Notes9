'use client'

import { useEffect, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Telescope, ScrollText, AlertCircle, MessagesSquare, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAiLiteratureSearch } from '@/hooks/use-ai-literature-search'
import type { CitationsManifest, CitationsManifestEntry } from '@/hooks/use-agent-stream'
import { AiPaperCard } from './ai-paper-card'
import { AiSearchFilters } from './ai-search-filters'
import { flyToCatalyst } from '@/lib/fly-to-catalyst'
import { MarkdownRenderer } from '@/components/catalyst/markdown-renderer'
import { Notes9ChatLoader } from '@/components/catalyst/notes9-chat-loader'
import { openCatalystPanel, attachToCatalyst } from '@/lib/catalyst-launch'
import { useResizable } from '@/hooks/use-resizable'
import { applyAiFilters, DEFAULT_AI_FILTERS, type AiResultFilters } from '@/lib/ai-search-filters'
import { decodeHtmlEntities } from '@/lib/literature-abstract-display'
import type { SearchPaper } from '@/types/paper-search'
import type { AiSearchResult } from '@/types/ai-search'
import { toast } from 'sonner'

/** Nearest scrollable ancestor, so we scroll a column on its own instead of the
 * whole page. Returns null when nothing scrolls (let the browser handle it). */
function getScrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement
  while (node) {
    const oy = getComputedStyle(node).overflowY
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}

/** Best external link for a reference (matched metadata first, then the cited URL). */
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
  papers,
  filters = DEFAULT_AI_FILTERS,
  onFiltersChange,
  onStagePaper,
  onOpenStaged,
  isPaperStaged,
  isPaperStaging,
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
}) {
  const { run, summary, results, isStreaming, papersLoading, error } = useAiLiteratureSearch({ papers, query })

  // Resizable AI summary width (persisted).
  const summaryResize = useResizable({
    initialWidth: 540,
    minWidth: 340,
    maxWidth: 820,
    direction: 'right',
    // `:v2` resets any width saved against the old (narrower) default.
    persistKey: 'notes9:ai-summary-width:v2',
  })

  useEffect(() => {
    if (query.trim()) void run(query)
  }, [query, run])

  const loading = isStreaming || papersLoading
  const showSkeletons = loading && results.length === 0
  const displayed = applyAiFilters(results, filters)

  // Labels the AI actually cited inline in its summary (e.g. "[3]", "[3, 5]").
  // The References list shows ONLY these — not every fetched paper.
  const citedLabels = useMemo(() => {
    const set = new Set<string>()
    for (const m of summary.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
      for (const n of m[1].split(',')) set.add(n.trim())
    }
    return set
  }, [summary])

  // Until the summary streams in, fall back to all displayed results so the
  // References list isn't empty mid-stream. Always rendered ascending by number
  // (1, 2, 3, …) so the list reads in citation order.
  const citedRefs = (citedLabels.size
    ? displayed.filter((r) => citedLabels.has(r.citeLabel))
    : displayed
  )
    .slice()
    .sort((a, b) => Number(a.citeLabel) - Number(b.citeLabel))

  // Hover-card metadata for the inline citation chips (Catalyst-style). No
  // `source_url` is set on purpose, so a chip stays a clickable <sup> whose
  // click scrolls to the matching card instead of navigating away.
  const citationsManifest = useMemo<CitationsManifest>(() => {
    const manifest: Record<string, CitationsManifestEntry> = {}
    for (const r of results) {
      const title = decodeHtmlEntities(r.paper?.title || r.aiTitle || 'Untitled')
      const meta = refMeta(r)
      manifest[r.citeLabel] = {
        cite_label: r.citeLabel,
        source_type: 'literature_review',
        source_name: title,
        excerpt: [meta, r.snippet?.trim() || r.abstract?.trim() || ''].filter(Boolean).join(' — '),
        cited_text: r.snippet?.trim() || '',
      }
    }
    return { manifest }
  }, [results])

  /** Center an element within its own scroll container (so we don't yank the
   * whole page), then briefly flash it. */
  const centerAndFlash = (el: HTMLElement) => {
    const container = getScrollParent(el)
    if (container) {
      const cRect = container.getBoundingClientRect()
      const eRect = el.getBoundingClientRect()
      const delta = eRect.top - cRect.top - (container.clientHeight - el.offsetHeight) / 2
      container.scrollTo({ top: container.scrollTop + delta, behavior: 'smooth' })
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    el.classList.remove('n9-cite-target')
    void el.offsetWidth // restart the flash animation
    el.classList.add('n9-cite-target')
    window.setTimeout(() => el.classList.remove('n9-cite-target'), 1400)
  }

  /** Click an inline citation (or a reference) → center the matching paper card
   * AND the matching reference entry, each within its own pane, and flash both.
   * Returns false when neither exists (e.g. filtered out) so the renderer can
   * fall back to its default behavior. */
  const scrollToCitation = (label: string): boolean => {
    if (typeof document === 'undefined') return false
    const card = document.getElementById(`ai-paper-${label}`)
    const ref = document.getElementById(`ai-ref-${label}`)
    if (card) centerAndFlash(card)
    if (ref) centerAndFlash(ref)
    return !!(card || ref)
  }

  const discussAllInCatalyst = (e?: React.MouseEvent<HTMLElement>) => {
    const attachments = displayed
      .map((r) => r.paper)
      .filter((p): p is SearchPaper => !!(p && p.pdfUrl && /^https?:\/\//i.test(p.pdfUrl)))
      .slice(0, 6)
      .map((p) => ({ url: p.pdfUrl as string, name: `${p.title.slice(0, 100)}.pdf`, contentType: 'application/pdf' }))
    // Open the panel first (empty composer = landing pad). Query stays clean —
    // no raw URLs pasted into the chat.
    openCatalystPanel({
      scope: 'literature',
      webSearch: attachments.length === 0,
      query: `About these papers on "${query}": `,
      autoSend: false,
    })
    if (attachments.length) {
      // Fly the papers in and reveal the pills once they land in the chat bar.
      flyToCatalyst(e?.currentTarget ?? null, { onLand: () => attachToCatalyst(attachments) })
    } else {
      toast.info('None of these papers have open-access PDFs. Download and upload them in Catalyst to analyze their full text.')
    }
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Center — papers the AI cited. Scrolls on its own (desktop) so the
          summary pane stays put while you browse results. */}
      <div className="min-w-0 flex-1 space-y-4 lg:max-h-[calc(100vh-9.5rem)] lg:overflow-y-auto lg:pr-2 lg:[scrollbar-gutter:stable]">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        {results.length > 0 && (
          <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-transparent bg-background/80 px-1 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center gap-2">
              {onFiltersChange && (
                <AiSearchFilters
                  value={filters}
                  onChange={onFiltersChange}
                  triggerClassName="h-8 px-2.5 text-xs"
                />
              )}
              <span className="text-xs text-muted-foreground tabular-nums">
                <span className="font-medium text-foreground">{displayed.length}</span>
                {displayed.length === results.length ? '' : ` / ${results.length}`}{' '}
                {displayed.length === 1 ? 'paper' : 'papers'}
              </span>
            </div>
            <Button
              size="sm"
              className="gap-1.5 rounded-lg bg-primary text-primary-foreground shadow-sm transition-all hover:bg-[var(--n9-accent-hover)] hover:shadow-[0_6px_16px_-8px_var(--n9-accent-glow)]"
              onClick={discussAllInCatalyst}
            >
              <MessagesSquare className="size-3.5" />
              Discuss in Catalyst
            </Button>
          </div>
        )}

        {showSkeletons && (
          <>
            <CardSkeleton delay={0} />
            <CardSkeleton delay={120} />
            <CardSkeleton delay={240} />
          </>
        )}

        {displayed.map((r, i) => (
          <div
            key={`${r.citeLabel}-${r.paper?.id ?? r.sourceUrl ?? r.aiTitle ?? ''}`}
            id={`ai-paper-${r.citeLabel}`}
            className="scroll-mt-20 rounded-xl duration-500 animate-in fade-in slide-in-from-bottom-3 fill-mode-both"
            style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
          >
            <AiPaperCard
              result={r}
              projectId={projectId}
              onStage={onStagePaper}
              onOpenStaged={onOpenStaged}
              isStaged={r.paper ? (isPaperStaged?.(r.paper.id) ?? false) : false}
              isStaging={r.paper ? (isPaperStaging?.(r.paper.id) ?? false) : false}
            />
          </div>
        ))}

        {!loading && results.length > 0 && displayed.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No results match your filters.
          </p>
        )}

        {!loading && results.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Telescope className="mb-3 size-10 opacity-40" />
            <p>No cited papers yet. Try rephrasing your question.</p>
          </div>
        )}
      </div>

      {/* Drag handle to resize the AI summary (desktop only) */}
      <div
        onMouseDown={summaryResize.handleMouseDown}
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize the AI summary"
        className={cn(
          'hidden w-3 shrink-0 cursor-col-resize select-none items-center justify-center rounded-full transition-colors lg:flex lg:self-stretch',
          summaryResize.isResizing ? 'bg-primary/20' : 'hover:bg-muted',
        )}
      >
        <GripVertical className="size-4 text-muted-foreground/50" aria-hidden />
      </div>

      {/* Right — streaming AI summary (resizable). Independently scrollable so it
          doesn't move the results pane. */}
      <aside
        className="w-full shrink-0 lg:max-h-[calc(100vh-9.5rem)] lg:w-[var(--ai-sum-w,360px)] lg:overflow-y-auto lg:pr-1"
        style={{ ['--ai-sum-w' as string]: `${summaryResize.width}px` } as React.CSSProperties}
      >
        <Card className="overflow-hidden rounded-2xl border-primary/15 bg-primary/[0.03] shadow-sm backdrop-blur-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2.5">
              {isStreaming ? (
                <Notes9ChatLoader size={22} />
              ) : (
                <span className="flex size-7 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <ScrollText className="size-4" />
                </span>
              )}
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                AI summary
              </h3>
              {isStreaming && (
                <span className="ml-auto text-2xs font-medium uppercase tracking-wider text-primary/70">
                  Thinking…
                </span>
              )}
            </div>
            {summary ? (
              <MarkdownRenderer
                content={summary}
                showCursor={isStreaming}
                className="text-sm"
                citationsManifest={citationsManifest}
                onCitationClick={scrollToCitation}
              />
            ) : (
              <p className="text-sm italic text-muted-foreground">
                {isStreaming ? 'Searching the web and reading papers…' : 'Ask a question to get an AI summary.'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* References — only the papers the AI actually cited inline, deduped and
            in the summary's citation order. Shows a loading shimmer until results
            resolve. */}
        {(loading || citedRefs.length > 0) && (
          <Card className="mt-4 rounded-2xl border-border/60 bg-card/70 shadow-sm backdrop-blur-sm">
            <CardContent className="p-4 sm:p-5">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground">
                References
                {citedRefs.length > 0 && (
                  <span className="ml-auto rounded-full bg-muted px-1.5 text-2xs font-medium tabular-nums text-muted-foreground">
                    {citedRefs.length}
                  </span>
                )}
              </h3>
              {citedRefs.length === 0 ? (
                <div className="space-y-3" aria-busy="true">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="n9-skeleton-shimmer flex gap-2 rounded">
                      <div className="mt-0.5 h-3 w-5 shrink-0 rounded bg-foreground/10" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="h-3 w-[90%] rounded bg-foreground/10" />
                        <div className="h-3 w-1/2 rounded bg-foreground/10" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <ol className="space-y-2.5">
                  {citedRefs.map((r) => {
                    const href = refHref(r)
                    const title = decodeHtmlEntities(r.paper?.title || r.aiTitle || 'Untitled')
                    const meta = refMeta(r)
                    return (
                      <li
                        key={`${r.citeLabel}-${r.dedupeKey}`}
                        id={`ai-ref-${r.citeLabel}`}
                        className="flex scroll-mt-4 gap-2 rounded-lg px-1.5 py-1 text-sm duration-300 animate-in fade-in"
                      >
                        <button
                          type="button"
                          onClick={() => scrollToCitation(r.citeLabel)}
                          title="Jump to this paper"
                          className="mt-0.5 shrink-0 font-mono text-xs tabular-nums text-primary/80 hover:text-primary"
                        >
                          [{r.citeLabel}]
                        </button>
                        <span className="min-w-0">
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium leading-snug text-foreground underline-offset-2 hover:underline"
                            >
                              {title}
                            </a>
                          ) : (
                            <span className="font-medium leading-snug text-foreground">{title}</span>
                          )}
                          {meta && <span className="mt-0.5 block text-xs text-muted-foreground">{meta}</span>}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        )}
      </aside>
    </div>
  )
}
