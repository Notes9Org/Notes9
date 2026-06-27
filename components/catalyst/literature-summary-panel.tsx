'use client'

import { MarkdownRenderer } from '@/components/catalyst/markdown-renderer'
import { CatalystSources } from '@/components/catalyst/catalyst-sources'
import type { CatalystLiterature } from '@/lib/catalyst-literature'

/**
 * The literature search's AI summary, shown at the top of the Catalyst chat —
 * composed on the literature page (/api/chat) and streamed in here, with its
 * cited sources underneath. Deliberately borderless/box-free so it reads as a
 * premium, native answer rather than a card. Follow-ups continue in the chat.
 */
export function LiteratureSummaryPanel({ lit }: { lit: CatalystLiterature }) {
  const hasSummary = lit.summary.trim().length > 0

  return (
    <section className="w-full min-w-0 space-y-4">
      {/* Header — no box; a live accent dot + label, with the query as the lead. */}
      <div className="min-w-0 space-y-1.5">
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
          <h3 className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-foreground [overflow-wrap:anywhere]">
            {lit.query}
          </h3>
        )}
      </div>

      {/* Summary prose — flows directly in the chat, no container; always wraps. */}
      {hasSummary ? (
        <MarkdownRenderer
          content={lit.summary}
          showCursor={lit.streaming}
          className="w-full min-w-0 text-[13.5px] leading-relaxed"
          onCitationClick={(label) => {
            window.dispatchEvent(
              new CustomEvent('literature:scroll-to-citation', { detail: { citeLabel: label } })
            )
            return true
          }}
        />
      ) : (
        <div className="space-y-2.5" aria-label="Composing summary">
          <div className="n9-skeleton-shimmer h-3 w-[94%] rounded-full bg-muted/60" />
          <div className="n9-skeleton-shimmer h-3 w-[100%] rounded-full bg-muted/60" />
          <div className="n9-skeleton-shimmer h-3 w-[86%] rounded-full bg-muted/60" />
          <div className="n9-skeleton-shimmer h-3 w-[72%] rounded-full bg-muted/60" />
        </div>
      )}

      {/* Sources — the shared modern block, identical to agent answers. */}
      <CatalystSources items={lit.references} className="pt-0.5" />
    </section>
  )
}
