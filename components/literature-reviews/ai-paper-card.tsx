'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { BookOpen, Check, Database, ExternalLink, Loader2, MessageCircle, Unlock } from 'lucide-react'
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

export function AiPaperCard({
  result,
  projectId,
  onSaved,
  onStage,
  onOpenStaged,
  isStaged = false,
  isStaging = false,
}: {
  result: AiSearchResult
  projectId?: string | null
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
  const abstractRaw = result.paper?.abstract?.trim() || result.abstract?.trim() || ''
  const abstractPlain = abstractRaw ? formatLiteratureAbstractPlain(abstractRaw) : ''

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
  const isOpenAccess = !!(result.paper?.isOpenAccess || result.paper?.pdfUrl)

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
      if (!isOpenAccess) {
        toast.info('Not open access — download the PDF and upload it in its tab to read it in Notes9.')
      }
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

        {/* Abstract — always shown for every paper when one is available, with a
            smooth shimmer while it's being fetched so it fades in (no flash). */}
        {abstractPlain ? (
          <div className="mb-3 rounded-xl bg-muted/40 p-3.5 duration-300 animate-in fade-in">
            <p className="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Abstract
            </p>
            <p
              className={cn(
                'text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap',
                !showAbstract && 'line-clamp-4',
              )}
            >
              {abstractPlain}
            </p>
            {abstractPlain.length > 240 && (
              <button
                type="button"
                onClick={() => setShowAbstract((v) => !v)}
                className="mt-1.5 text-xs font-medium text-primary/80 transition-colors hover:text-primary"
              >
                {showAbstract ? 'Show less ↑' : 'Read more ↓'}
              </button>
            )}
          </div>
        ) : result.abstractPending ? (
          <div className="n9-skeleton-shimmer mb-3 rounded-xl bg-muted/40 p-3.5" aria-busy="true">
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
        ) : !result.snippet?.trim() ? (
          <p className="mb-3 text-sm italic text-muted-foreground/70">
            {href
              ? 'Abstract not available — open the source to read this paper.'
              : 'Abstract not available for this result.'}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          {href && (
            <Button variant="ghost" size="sm" asChild title="Open source in a new tab" className="rounded-lg text-muted-foreground hover:text-foreground">
              <a href={href} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                <ExternalLink className="size-3.5" />
                Source
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" onClick={(e) => handleAsk(e)} title="Ask Catalyst about this paper">
            <MessageCircle className="size-3.5" />
            Ask Catalyst
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="icon"
            onClick={handleSave}
            disabled={saving || saved}
            title="Save to repository"
            aria-label="Save to repository"
            className="rounded-lg"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : saved ? (
              <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Database className="size-3.5" />
            )}
          </Button>
          <Button
            variant="default"
            size="sm"
            className="gap-1.5 rounded-lg bg-primary shadow-sm transition-all hover:bg-[var(--n9-accent-hover)] hover:shadow-[0_6px_16px_-8px_var(--n9-accent-glow)]"
            onClick={handleRead}
            disabled={isStaging}
            title="Read in Notes9 (open-access loads the PDF; closed asks for upload)"
          >
            {isStaging ? <Loader2 className="size-3.5 animate-spin" /> : <BookOpen className="size-3.5" />}
            {isStaged ? 'Open' : 'Read'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
