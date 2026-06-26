'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { BookOpen, BookmarkCheck, BookmarkPlus, ExternalLink, FileText, Loader2, MessageCircle, Quote, ScrollText, Unlock } from 'lucide-react'
import { decodeHtmlEntities, formatLiteratureAbstractPlain } from '@/lib/literature-abstract-display'
import { cn } from '@/lib/utils'
import { savePaperToRepository } from '@/app/(app)/literature-reviews/actions'
import { openCatalystPanel, attachToCatalyst } from '@/lib/catalyst-launch'
import { flyToCatalyst } from '@/lib/fly-to-catalyst'
import { citationToSearchPaper } from '@/lib/ai-search-match'
import type { AiSearchResult } from '@/types/ai-search'
import type { SearchPaper } from '@/types/paper-search'
import { toast } from 'sonner'

function readUrl(r: AiSearchResult): string | null {
  const p = r.paper
  if (p?.articlePageUrl && /^https?:\/\//i.test(p.articlePageUrl)) return p.articlePageUrl
  if (p?.pdfUrl && /^https?:\/\//i.test(p.pdfUrl)) return p.pdfUrl
  const doi = p?.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim()
  if (doi) return `https://doi.org/${doi}`
  if (p?.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`
  if (r.sourceUrl && /^https?:\/\//i.test(r.sourceUrl)) return r.sourceUrl
  return null
}

/**
 * Same-origin proxy URL for an open-access PMC paper, so a "Read" with no host
 * stage handler streams the PDF through our server (which uses non-gated mirrors)
 * instead of navigating the browser straight to NLM's Proof-of-Work page.
 * Returns null when the paper has no PMC/PMID id to resolve.
 */
function oaProxyUrl(p: SearchPaper | null | undefined): string | null {
  if (!p?.isOpenAccess) return null
  const pmcMatch = p.pdfUrl?.match(/PMC(\d+)/i)
  const params = new URLSearchParams()
  if (pmcMatch?.[1]) params.set('pmc', pmcMatch[1])
  if (p.pmid) params.set('pmid', p.pmid)
  const qs = params.toString()
  return qs ? `/api/literature/oa-pdf?${qs}` : null
}

/** Render a (already paragraph-broken) abstract as spaced paragraphs, bolding a
 *  leading structured-section label ("Background:", "Methods:", …). */
function renderAbstractParagraphs(text: string) {
  return text.split(/\n{2,}/).map((para, i) => {
    const trimmed = para.trim()
    const colon = trimmed.indexOf(':')
    const label = colon > 0 && colon <= 40 ? trimmed.slice(0, colon).trim() : ''
    const isLabel = !!label && /^[A-Za-z][A-Za-z /&-]+$/.test(label)
    return (
      <p key={i} className="text-sm leading-relaxed text-foreground/80">
        {isLabel ? (
          <>
            <span className="font-semibold text-foreground/90">{label}:</span>{' '}
            {trimmed.slice(colon + 1).trim()}
          </>
        ) : (
          trimmed
        )}
      </p>
    )
  })
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'with', 'that', 'this', 'from', 'have', 'has',
  'how', 'does', 'what', 'why', 'which', 'who', 'into', 'using', 'use', 'used', 'can', 'their',
  'its', 'they', 'them', 'these', 'those', 'than', 'then', 'when', 'where', 'will', 'would',
  'about', 'between', 'during', 'effect', 'effects', 'study', 'studies', 'paper', 'research',
])

/** Split prose into sentences without breaking on genus initials ("S. cerevisiae")
 *  or common abbreviations. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<![A-Z])(?<!\bet al)(?<!\be\.g)(?<!\bi\.e)[.!?]+\s+(?=[A-Z(["'])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Pick the passage of a paper's text most relevant to the user's query, by
 * scoring each sentence on how many query keywords it contains. Returns the
 * single best sentence (plus its immediate neighbor when that's also on-topic),
 * in original order — a real, paper-specific snippet rather than a shared blurb.
 */
function bestSnippetForQuery(text: string, query: string): string {
  if (!text || !query) return ''
  const terms = new Set(
    (query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((t) => !STOPWORDS.has(t)),
  )
  if (terms.size === 0) return ''
  const sentences = splitSentences(text)
  if (sentences.length === 0) return ''
  const scores = sentences.map((s) => {
    const words = s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []
    let hits = 0
    for (const w of words) if (terms.has(w)) hits++
    return hits
  })
  let bestIdx = -1
  let bestScore = 0
  scores.forEach((sc, i) => {
    if (sc > bestScore) {
      bestScore = sc
      bestIdx = i
    }
  })
  // No keyword overlap → fall back to the opening sentence (usually the paper's
  // main claim) so the card still shows a real passage.
  if (bestIdx < 0) {
    const lead = sentences[0]
    return /[.!?]$/.test(lead) ? lead : `${lead}.`
  }
  const out = [sentences[bestIdx]]
  // Add the following sentence if it's also clearly on-topic (richer context).
  if (bestIdx + 1 < sentences.length && scores[bestIdx + 1] >= 2) out.push(sentences[bestIdx + 1])
  const joined = out.join(' ')
  return /[.!?]$/.test(joined) ? joined : `${joined}.`
}

export function AiPaperCard({
  result,
  projectId,
  query = '',
  summaryLoading = false,
  relevanceSummary,
  onSaved,
  onStage,
  onOpenStaged,
  isStaged = false,
  isStaging = false,
}: {
  result: AiSearchResult
  projectId?: string | null
  /** The user's search query — used to pull the most query-relevant passage out
   *  of this paper's text. */
  query?: string
  /** True while the overall AI summary is still streaming — the per-paper "Why
   *  it matters" note shows a loading state until it settles. */
  summaryLoading?: boolean
  /** The AI's own sentences (from the overall summary) about why this paper
   *  answers the user's query — shown in the per-paper "AI summary" tab. */
  relevanceSummary?: string
  onSaved?: () => void
  /** Same stage action the database card uses — stages + opens a reader tab. */
  onStage?: (paper: SearchPaper) => void | Promise<void>
  onOpenStaged?: (paper: SearchPaper) => void
  isStaged?: boolean
  isStaging?: boolean
}) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showAbstract, setShowAbstract] = useState(false)
  const [tab, setTab] = useState<'ai' | 'abstract'>('ai')
  const abstractRaw = result.paper?.abstract?.trim() || result.abstract?.trim() || ''
  const abstractPlain = abstractRaw ? formatLiteratureAbstractPlain(abstractRaw) : ''
  // Prefer the backend per-paper AI summary (/literature/ai-search); fall back to
  // the legacy "why it matters" sentences derived from the overall summary.
  const relevance = (result.aiSummary || relevanceSummary)?.trim() || ''
  // The backend is still generating this paper's summary, or the legacy overall
  // summary is still streaming — either way, show the shimmer.
  const relevanceLoading = result.summaryPending || summaryLoading
  // The exact passage relevant to the query: prefer a backend-cited quote; else
  // extract the most query-relevant sentence(s) from this paper's own abstract —
  // so every card shows a real, paper-specific snippet (never a shared blurb).
  const backendSnippet = result.snippet?.trim() || ''
  const queryExcerpt = useMemo(() => bestSnippetForQuery(abstractRaw, query), [abstractRaw, query])
  const exactPassage = backendSnippet || queryExcerpt
  // Where the passage came from: the abstract, the open-access full text, or the
  // cited source — so the user knows what grounds it.
  const passageSource = (() => {
    if (!exactPassage) return ''
    if (exactPassage === queryExcerpt) return 'From the abstract'
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const nAbs = norm(abstractRaw)
    const nSnip = norm(exactPassage)
    if (nAbs && nSnip.length > 20 && nAbs.includes(nSnip.slice(0, 60))) return 'From the abstract'
    if (result.paper?.pdfUrl || result.paper?.isOpenAccess) return 'From the full text'
    return 'From the cited source'
  })()

  const paper: SearchPaper =
    result.paper ??
    citationToSearchPaper({ title: result.aiTitle, url: result.sourceUrl, snippet: result.snippet })

  const title = decodeHtmlEntities(result.paper?.title || result.aiTitle || 'Untitled result')
  const authors = result.paper?.authors?.length
    ? result.paper.authors.map(decodeHtmlEntities).join(', ')
    : null
  const journalYear = [result.paper?.journal && decodeHtmlEntities(result.paper.journal), result.paper?.year || null]
    .filter(Boolean)
    .join(' • ')
  const href = readUrl(result)
  // The green badge reflects *true* open access only. A `pdfUrl` just means a PDF
  // link exists (e.g. Europe PMC full text) — that's not the same as open access,
  // so it drives inline-read behavior (`canReadInline`) but never the badge.
  const isOpenAccess = !!result.paper?.isOpenAccess
  const canReadInline = !!(result.paper?.isOpenAccess || result.paper?.pdfUrl)
  const citationCount =
    typeof result.paper?.citedByCount === 'number' ? result.paper.citedByCount : null

  // "Read" does the same job as the database "Stage" button: stage the paper
  // (open-access → PDF fetched into a reader tab beside Search; closed → prompt
  // to upload), and open that tab. Falls back to the external source if no host
  // stage handler is wired.
  const handleRead = () => {
    if (isStaged && onOpenStaged) {
      onOpenStaged(paper)
      return
    }
    if (onStage) {
      void onStage(paper)
      if (!canReadInline) {
        toast.info('Not open access — download the PDF and upload it in its tab to read it in Notes9.')
      }
      return
    }
    // No host stage handler: for an open-access PMC paper, read via our same-origin
    // proxy (server fetches a non-gated mirror) rather than sending the browser to
    // NLM's bot/verification page. Otherwise fall back to the external source.
    const proxied = oaProxyUrl(result.paper)
    if (proxied) {
      window.open(proxied, '_blank', 'noopener,noreferrer')
      return
    }
    if (href) window.open(href, '_blank', 'noopener,noreferrer')
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await savePaperToRepository(paper, { projectId: projectId ?? undefined })
      if (res.success) {
        setSaved(true)
        toast.success('Saved to repository' + ('warning' in res && res.warning ? ` (${res.warning})` : ''))
        onSaved?.()
      } else {
        toast.error(res.error || 'Could not save paper')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save paper')
    } finally {
      setSaving(false)
    }
  }

  const handleAsk = (e?: React.MouseEvent<HTMLElement>) => {
    // Open-access PDF → load it into Catalyst so the AI can read the full paper.
    const pdfUrl = result.paper?.pdfUrl
    const hasPdf = !!(pdfUrl && /^https?:\/\//i.test(pdfUrl))
    // Open the panel first (empty composer = landing pad). The query stays clean —
    // no raw URL pasted into the chat (which renders as an ugly text link).
    openCatalystPanel({
      scope: 'literature',
      webSearch: !hasPdf, // no full text to read → let the AI search the web
      query: `About the paper "${title}": `,
      autoSend: false,
    })
    if (hasPdf) {
      // Fly the paper in and reveal the PDF pill once it lands in the chat bar.
      const attachments = [
        { url: pdfUrl!, name: `${title.slice(0, 100)}.pdf`, contentType: 'application/pdf' },
      ]
      flyToCatalyst(e?.currentTarget ?? null, { onLand: () => attachToCatalyst(attachments) })
    } else {
      // No open-access PDF to attach — don't fly a paper that won't land as a
      // pill. Prompt the user to bring the full text in themselves.
      toast.info('No open-access PDF for this paper. Download it from the source, then upload it in Catalyst to analyze the full text.')
    }
  }

  return (
    <Card className="group/card overflow-hidden rounded-2xl border-border/60 bg-card/70 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_16px_40px_-20px_var(--n9-accent-glow)]">
      <CardContent className="p-4 sm:p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge className="gap-1 rounded-full border-primary/20 bg-primary/10 font-mono text-xs tabular-nums text-primary">
            {result.citeLabel}
          </Badge>
          {isOpenAccess && (
            <Badge
              variant="outline"
              className="gap-1 text-2xs bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              <Unlock className="size-3" />
              Open access
            </Badge>
          )}
          {journalYear && <span className="text-xs text-muted-foreground">{journalYear}</span>}
          {citationCount != null && (
            <span
              className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground"
              title={`Cited by ${citationCount.toLocaleString()}`}
            >
              <Quote className="size-3 opacity-70" />
              {citationCount.toLocaleString()}
              {citationCount === 1 ? ' citation' : ' citations'}
            </span>
          )}
        </div>

        <h3 className="mb-1 text-[15px] font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover/card:text-primary">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline decoration-primary/40"
            >
              {title}
            </a>
          ) : (
            title
          )}
        </h3>
        {authors && <p className="mb-3 text-sm text-muted-foreground">{authors}</p>}

        {/* Tabs — a pill segmented control so the active view (AI summary vs the
            abstract) reads at a glance: solid fill + icon for the selected tab. */}
        <div className="mb-3 inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/40 p-0.5">
          <button
            type="button"
            onClick={() => setTab('ai')}
            aria-pressed={tab === 'ai'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all',
              tab === 'ai'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <ScrollText className="size-3.5" />
            AI summary
          </button>
          <button
            type="button"
            onClick={() => setTab('abstract')}
            aria-pressed={tab === 'abstract'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all',
              tab === 'abstract'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <FileText className="size-3.5" />
            Abstract
            {!abstractPlain && result.abstractPending && <Loader2 className="size-3 animate-spin" />}
          </button>
        </div>

        {tab === 'ai' ? (
          <div className="mb-3 space-y-3 duration-300 animate-in fade-in">
            {exactPassage ? (
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Quote className="size-3" />
                  Most relevant to your query
                </p>
                <blockquote className="rounded-r-lg rounded-l-md border-l-2 border-primary/45 bg-primary/[0.04] px-3 py-2 text-sm italic leading-relaxed text-foreground/85">
                  “{exactPassage}”
                  {passageSource && (
                    <span className="mt-1.5 block text-2xs font-medium not-italic text-muted-foreground">
                      ↳ {passageSource}
                    </span>
                  )}
                </blockquote>
              </div>
            ) : result.abstractPending ? (
              <div className="n9-skeleton-shimmer rounded-lg bg-muted/40 p-3" aria-busy="true">
                <div className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Finding the most relevant passage…
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 w-full rounded bg-foreground/10" />
                  <div className="h-3 w-[88%] rounded bg-foreground/10" />
                </div>
              </div>
            ) : null}
            {relevance ? (
              <div>
                <p className="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Why it matters
                </p>
                <p className="text-sm leading-relaxed text-foreground/90">{relevance}</p>
              </div>
            ) : relevanceLoading ? (
              <div aria-busy="true">
                <p className="mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Analyzing relevance…
                </p>
                <div className="n9-skeleton-shimmer space-y-1.5 rounded">
                  <div className="h-3 w-full rounded bg-foreground/10" />
                  <div className="h-3 w-[80%] rounded bg-foreground/10" />
                </div>
              </div>
            ) : null}
            {!exactPassage && !relevance && !result.abstractPending && !relevanceLoading && (
              <p className="text-sm italic text-muted-foreground/70">
                No grounded summary available for this paper — open it to read more.
              </p>
            )}
          </div>
        ) : (
          <div className="mb-3 duration-300 animate-in fade-in">
            {abstractPlain ? (
              <>
                {showAbstract ? (
                  <div className="space-y-2">{renderAbstractParagraphs(abstractPlain)}</div>
                ) : (
                  <p className="line-clamp-6 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                    {abstractPlain}
                  </p>
                )}
                {abstractPlain.length > 280 && (
                  <button
                    type="button"
                    onClick={() => setShowAbstract((v) => !v)}
                    className="mt-2 text-xs font-medium text-primary/80 transition-colors hover:text-primary"
                  >
                    {showAbstract ? 'Show less ↑' : 'Read more ↓'}
                  </button>
                )}
              </>
            ) : result.abstractPending ? (
              <div className="n9-skeleton-shimmer rounded-lg bg-muted/40 p-3" aria-busy="true">
                <div className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Loading abstract
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 w-full rounded bg-foreground/10" />
                  <div className="h-3 w-[94%] rounded bg-foreground/10" />
                  <div className="h-3 w-[82%] rounded bg-foreground/10" />
                </div>
              </div>
            ) : (
              <p className="text-sm italic text-muted-foreground/70">
                {href
                  ? 'Abstract not available — open the source to read this paper.'
                  : 'Abstract not available for this result.'}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          {href && (
            <Button variant="ghost" size="sm" asChild title="Open the original source in a new tab" className="rounded-lg text-muted-foreground hover:text-foreground">
              <a href={href} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                <ExternalLink className="size-3.5" />
                Source
              </a>
            </Button>
          )}
          <Button variant="ghost" size="sm" className="gap-1.5 rounded-lg text-muted-foreground hover:text-foreground" onClick={(e) => handleAsk(e)} title="Ask Catalyst AI about this paper">
            <MessageCircle className="size-3.5" />
            Ask Catalyst
          </Button>
          <div className="flex-1" />
          {/* Step 2 — keep it: add to your library. */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={saving || saved}
            title="Save this paper to your library so you can find it later"
            className="gap-1.5 rounded-lg"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : saved ? (
              <BookmarkCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <BookmarkPlus className="size-3.5" />
            )}
            {saved ? 'Saved to library' : 'Save to library'}
          </Button>
          {/* Step 1 — read it: open the full text (open-access loads the PDF). */}
          <Button
            variant="default"
            size="sm"
            className="gap-1.5 rounded-lg bg-primary shadow-sm transition-all hover:bg-[var(--n9-accent-hover)] hover:shadow-[0_6px_16px_-8px_var(--n9-accent-glow)]"
            onClick={handleRead}
            disabled={isStaging}
            title={
              isStaged
                ? 'Open this paper in your reader'
                : 'Open to read the full paper — the PDF loads inline for open-access papers'
            }
          >
            {isStaging ? <Loader2 className="size-3.5 animate-spin" /> : <BookOpen className="size-3.5" />}
            {isStaged ? 'Open' : 'Read paper'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
