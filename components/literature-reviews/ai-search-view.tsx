'use client'

import { useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Wand2, AlertCircle, MessagesSquare, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAiLiteratureSearch } from '@/hooks/use-ai-literature-search'
import { AiPaperCard } from './ai-paper-card'
import { MarkdownRenderer } from '@/components/catalyst/markdown-renderer'
import { Notes9ChatLoader } from '@/components/catalyst/notes9-chat-loader'
import { openCatalystPanel } from '@/lib/catalyst-launch'
import { useResizable } from '@/hooks/use-resizable'
import { applyAiFilters, DEFAULT_AI_FILTERS, type AiResultFilters } from '@/lib/ai-search-filters'
import { decodeHtmlEntities } from '@/lib/literature-abstract-display'
import type { SearchPaper } from '@/types/paper-search'
import type { AiSearchResult } from '@/types/ai-search'

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

function CardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="mb-2 h-5 w-3/4 animate-pulse rounded bg-muted" />
        <div className="mb-3 h-16 w-full animate-pulse rounded bg-muted/60" />
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  )
}

export function AiSearchView({
  query,
  projectId,
  papers,
  filters = DEFAULT_AI_FILTERS,
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

  const discussAllInCatalyst = () => {
    const attachments = displayed
      .map((r) => r.paper)
      .filter((p): p is SearchPaper => !!(p && p.pdfUrl && /^https?:\/\//i.test(p.pdfUrl)))
      .slice(0, 6)
      .map((p) => ({ url: p.pdfUrl as string, name: `${p.title.slice(0, 100)}.pdf`, contentType: 'application/pdf' }))
    openCatalystPanel({
      scope: 'literature',
      webSearch: attachments.length === 0,
      query: `About these papers on "${query}": `,
      attachments: attachments.length ? attachments : undefined,
      autoSend: false,
    })
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Center — papers the AI cited, with the query-relevant snippet */}
      <div className="min-w-0 flex-1 space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        {results.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {displayed.length}
              {displayed.length === results.length ? '' : ` / ${results.length}`}{' '}
              {displayed.length === 1 ? 'paper' : 'papers'}
            </span>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={discussAllInCatalyst}>
              <MessagesSquare className="size-3.5" />
              Discuss these in Catalyst
            </Button>
          </div>
        )}

        {showSkeletons && (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        )}

        {displayed.map((r) => (
          <AiPaperCard
            key={`${r.citeLabel}-${r.paper?.id ?? r.sourceUrl ?? r.aiTitle ?? ''}`}
            result={r}
            projectId={projectId}
            onStage={onStagePaper}
            onOpenStaged={onOpenStaged}
            isStaged={r.paper ? (isPaperStaged?.(r.paper.id) ?? false) : false}
            isStaging={r.paper ? (isPaperStaging?.(r.paper.id) ?? false) : false}
          />
        ))}

        {!loading && results.length > 0 && displayed.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No results match your filters.
          </p>
        )}

        {!loading && results.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Wand2 className="mb-3 size-10 opacity-40" />
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
          'hidden w-3 shrink-0 cursor-col-resize select-none items-center justify-center rounded-full transition-colors lg:flex',
          summaryResize.isResizing ? 'bg-primary/20' : 'hover:bg-muted',
        )}
      >
        <GripVertical className="size-4 text-muted-foreground/50" aria-hidden />
      </div>

      {/* Right — streaming AI summary (resizable) */}
      <aside
        className="w-full shrink-0 lg:sticky lg:top-4 lg:self-start lg:w-[var(--ai-sum-w,360px)]"
        style={{ ['--ai-sum-w' as string]: `${summaryResize.width}px` } as React.CSSProperties}
      >
        <Card className="border-primary/20 bg-gradient-to-b from-primary/[0.03] to-transparent">
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2">
              {isStreaming ? (
                <Notes9ChatLoader size={20} />
              ) : (
                <Wand2 className="size-4 text-primary" />
              )}
              <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                AI summary
              </h3>
            </div>
            {summary ? (
              <MarkdownRenderer content={summary} showCursor={isStreaming} className="text-sm" />
            ) : (
              <p className="text-sm italic text-muted-foreground">
                {isStreaming ? 'Searching the web and reading papers…' : 'Ask a question to get an AI summary.'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* References — our own deduped, sequentially-numbered list (no model
            duplicates). Shows a loading shimmer until the results resolve. */}
        {(loading || displayed.length > 0) && (
          <Card className="mt-4">
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground">
                References
              </h3>
              {displayed.length === 0 ? (
                <div className="space-y-3" aria-busy="true">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-2">
                      <div className="mt-0.5 h-3 w-5 shrink-0 animate-pulse rounded bg-foreground/10" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="h-3 w-[90%] animate-pulse rounded bg-foreground/10" />
                        <div className="h-3 w-1/2 animate-pulse rounded bg-foreground/10" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <ol className="space-y-2.5">
                  {displayed.map((r) => {
                    const href = refHref(r)
                    const title = decodeHtmlEntities(r.paper?.title || r.aiTitle || 'Untitled')
                    const meta = refMeta(r)
                    return (
                      <li
                        key={`${r.citeLabel}-${r.dedupeKey}`}
                        className="flex gap-2 text-sm duration-300 animate-in fade-in"
                      >
                        <span className="mt-0.5 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                          [{r.citeLabel}]
                        </span>
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
