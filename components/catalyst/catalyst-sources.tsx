'use client'

import Link from 'next/link'
import { ArrowUpRight, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildHighlightUrl } from '@/lib/document-highlight'
import type { PaperAnalyzerReference } from '@/lib/literature-agent-types'

export interface CatalystSourceItem {
  n: string | number
  title: string
  meta?: string | null
  href?: string | null
}

const isExternal = (href: string) => /^https?:\/\//i.test(href)

/**
 * The shared, modern "Sources" block used under every literature AI answer —
 * the streamed summary and the agent follow-ups alike. Borderless, accent-
 * numbered hover cards. Title/meta always truncate so nothing overflows the
 * chat width. The label is "Sources" everywhere, by design (consistency).
 */
export function CatalystSources({
  items,
  className,
}: {
  items: CatalystSourceItem[]
  className?: string
}) {
  if (!items.length) return null
  return (
    <div className={cn('min-w-0 space-y-2', className)}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Sources
        </span>
        <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold tabular-nums text-muted-foreground">
          {items.length}
        </span>
        <span className="h-px flex-1 bg-border/60" />
      </div>
      <ol className="grid min-w-0 gap-1">
        {items.map((r, i) => (
          <SourceRow key={`${r.n}-${i}`} r={r} />
        ))}
      </ol>
    </div>
  )
}

function SourceRow({ r }: { r: CatalystSourceItem }) {
  const badge = (
    <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-md bg-[color:color-mix(in_oklab,var(--n9-accent)_14%,transparent)] text-[10px] font-bold tabular-nums text-[var(--n9-accent)]">
      {r.n}
    </span>
  )
  const body = (linked: boolean) => (
    <span className="min-w-0 flex-1">
      <span
        className={cn(
          'block truncate text-[13px] font-medium leading-snug text-foreground',
          linked && 'group-hover:text-[var(--n9-accent)]',
        )}
      >
        {r.title}
      </span>
      {r.meta && (
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{r.meta}</span>
      )}
    </span>
  )

  const rowClass =
    'group flex min-w-0 items-start gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-accent/60'

  if (!r.href) {
    return (
      <li>
        <div className="flex min-w-0 items-start gap-2.5 rounded-xl px-2 py-1.5">
          {badge}
          {body(false)}
        </div>
      </li>
    )
  }

  if (isExternal(r.href)) {
    return (
      <li>
        <a href={r.href} target="_blank" rel="noopener noreferrer" className={rowClass}>
          {badge}
          {body(true)}
          <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-[var(--n9-accent)]" />
        </a>
      </li>
    )
  }

  return (
    <li>
      <Link href={r.href} className={rowClass}>
        {badge}
        {body(true)}
        <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-[var(--n9-accent)]" />
      </Link>
    </li>
  )
}

/** Map literature-agent references onto the shared source-item shape. */
export function litRefsToSourceItems(refs: PaperAnalyzerReference[]): CatalystSourceItem[] {
  return [...refs]
    .sort((a, b) => a.index - b.index)
    .map((r) => {
      const id = r.literature_review_id?.trim()
      const sentences = r.supporting_sentences?.filter(Boolean) ?? []
      const doi = r.doi?.trim()
      const pmid = r.pmid?.trim()
      let href: string | null = null
      if (id) {
        href =
          sentences.length > 0
            ? buildHighlightUrl({
                sourceType: 'literature_review',
                sourceId: id,
                excerpt: sentences[0],
              })
            : `/literature-reviews/${encodeURIComponent(id)}`
      } else if (doi) {
        href = `https://doi.org/${encodeURIComponent(doi.replace(/^https?:\/\/doi\.org\//i, ''))}`
      } else if (pmid) {
        href = `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pmid)}/`
      }
      const meta = doi
        ? `doi:${doi.replace(/^https?:\/\/doi\.org\//i, '')}`
        : pmid
          ? `PMID ${pmid}`
          : null
      return {
        n: r.index,
        title: r.title?.trim() || 'Untitled reference',
        meta,
        href,
      }
    })
}
