'use client'

import { ArrowUpRight } from 'lucide-react'
import { MarkdownRenderer } from '@/components/catalyst/markdown-renderer'
import { cn } from '@/lib/utils'
import type { CatalystLiterature, LiteratureRef } from '@/lib/catalyst-literature'

/**
 * The literature search's AI summary, shown at the top of the Catalyst chat —
 * composed on the literature page (/api/chat) and streamed in here, with its
 * cited sources underneath. Deliberately borderless/box-free so it reads as a
 * premium, native answer rather than a card. Follow-ups continue in the chat.
 */
export function LiteratureSummaryPanel({ lit }: { lit: CatalystLiterature }) {
  const hasSummary = lit.summary.trim().length > 0

  return (
    <section className="space-y-4">
      {/* Header — no box; a live accent dot + label, with the query as the lead. */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2 shrink-0" aria-hidden>
            {lit.streaming && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--n9-accent)] opacity-60" />
            )}
            <span className="relative inline-flex size-2 rounded-full bg-[var(--n9-accent)]" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--n9-accent)]">
            AI summary
          </span>
          {lit.streaming && (
            <span className="text-[11px] font-medium text-muted-foreground animate-pulse">
              composing…
            </span>
          )}
        </div>
        {lit.query && (
          <h3 className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
            {lit.query}
          </h3>
        )}
      </div>

      {/* Summary prose — flows directly in the chat, no container. */}
      {hasSummary ? (
        <MarkdownRenderer
          content={lit.summary}
          showCursor={lit.streaming}
          className="text-[13.5px] leading-relaxed"
        />
      ) : (
        <div className="space-y-2.5" aria-label="Composing summary">
          <div className="n9-skeleton-shimmer h-3 w-[94%] rounded-full bg-muted/60" />
          <div className="n9-skeleton-shimmer h-3 w-[100%] rounded-full bg-muted/60" />
          <div className="n9-skeleton-shimmer h-3 w-[86%] rounded-full bg-muted/60" />
          <div className="n9-skeleton-shimmer h-3 w-[72%] rounded-full bg-muted/60" />
        </div>
      )}

      {/* Sources — a clean labelled set of hover cards, accent-numbered. */}
      {lit.references.length > 0 && (
        <div className="space-y-2 pt-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Sources
            </span>
            <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold tabular-nums text-muted-foreground">
              {lit.references.length}
            </span>
            <span className="h-px flex-1 bg-border/60" />
          </div>
          <ol className="grid gap-1">
            {lit.references.map((r) => (
              <SourceRow key={r.n} r={r} />
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}

function SourceRow({ r }: { r: LiteratureRef }) {
  const inner = (
    <>
      <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-md bg-[color:color-mix(in_oklab,var(--n9-accent)_14%,transparent)] text-[10px] font-bold tabular-nums text-[var(--n9-accent)]">
        {r.n}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-[13px] font-medium leading-snug text-foreground',
            r.href && 'group-hover:text-[var(--n9-accent)]',
          )}
        >
          {r.title}
        </span>
        {r.meta && (
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {r.meta}
          </span>
        )}
      </span>
      {r.href && (
        <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-[var(--n9-accent)]" />
      )}
    </>
  )

  if (r.href) {
    return (
      <li>
        <a
          href={r.href}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-start gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-accent/60"
        >
          {inner}
        </a>
      </li>
    )
  }

  return (
    <li>
      <div className="group flex items-start gap-2.5 rounded-xl px-2 py-1.5">{inner}</div>
    </li>
  )
}
