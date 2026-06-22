'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { BookOpen, Check, Database, ExternalLink, Globe, Loader2, MessageCircle } from 'lucide-react'
import { decodeHtmlEntities, formatLiteratureAbstractPlain } from '@/lib/literature-abstract-display'
import { cn } from '@/lib/utils'
import { savePaperToRepository } from '@/app/(app)/literature-reviews/actions'
import { openCatalystPanel } from '@/lib/catalyst-launch'
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

const MATCH_HINT: Record<AiSearchResult['matchKind'], string> = {
  doi: 'Matched by DOI',
  pmid: 'Matched by PMID',
  title: 'Matched by title',
  url: 'Matched by link',
  none: 'From AI web search',
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
  const isWeb = result.matchKind === 'none'
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

  const handleAsk = () => {
    // Open-access PDF → load it into Catalyst so the AI can read the full paper.
    const pdfUrl = result.paper?.pdfUrl
    const attachments =
      pdfUrl && /^https?:\/\//i.test(pdfUrl)
        ? [{ url: pdfUrl, name: `${title.slice(0, 100)}.pdf`, contentType: 'application/pdf' }]
        : undefined
    const ctx = !attachments && href ? ` (${href})` : ''
    openCatalystPanel({
      scope: 'literature',
      webSearch: !attachments,
      query: `About the paper "${title}"${ctx}: `,
      attachments,
      autoSend: false,
    })
  }

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs font-mono tabular-nums">
            [{result.citeLabel}]
          </Badge>
          <Badge
            variant="outline"
            className={`gap-1 text-2xs ${
              isWeb
                ? 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300'
                : 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300'
            }`}
          >
            {isWeb ? <Globe className="size-3" /> : <BookOpen className="size-3" />}
            {MATCH_HINT[result.matchKind]}
          </Badge>
          {journalYear && <span className="text-xs text-muted-foreground">{journalYear}</span>}
        </div>

        <h3 className="mb-1 text-base font-semibold leading-tight text-foreground">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline underline-offset-2 decoration-foreground/40"
            >
              {title}
            </a>
          ) : (
            title
          )}
        </h3>
        {authors && <p className="mb-2 text-sm text-muted-foreground">{authors}</p>}

        {/* Relevant excerpt — the AI's direct quote from the paper, when present. */}
        {result.snippet?.trim() && (
          <div className="mb-3 rounded-md border border-primary/15 bg-primary/[0.04] p-3">
            <p className="mb-1 text-2xs font-semibold uppercase tracking-wider text-primary/70">
              Relevant excerpt
            </p>
            <p className="text-sm leading-relaxed text-foreground/90 italic whitespace-pre-wrap">
              “{result.snippet.trim()}”
            </p>
          </div>
        )}

        {/* Abstract — always shown for every paper when one is available. */}
        {abstractPlain ? (
          <div className="mb-3 rounded-md bg-muted/40 p-3">
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
                className="mt-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {showAbstract ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        ) : !result.snippet?.trim() ? (
          <p className="mb-3 text-sm italic text-muted-foreground/70">
            {href
              ? 'Abstract not available — open the source to read this paper.'
              : 'Abstract not available for this result.'}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          {href && (
            <Button variant="ghost" size="sm" asChild title="Open source in a new tab">
              <a href={href} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                <ExternalLink className="size-3.5" />
                Source
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleAsk} title="Ask Catalyst about this paper">
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
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : saved ? (
              <Check className="size-3.5" />
            ) : (
              <Database className="size-3.5" />
            )}
          </Button>
          <Button
            variant="default"
            size="sm"
            className="gap-1.5"
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
