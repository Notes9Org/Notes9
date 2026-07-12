'use client'

import { useState } from 'react'
import { Sparkles, ChevronDown } from 'lucide-react'
import { MarkdownRenderer } from '@/components/catalyst/markdown-renderer'
import { CatalystSources } from '@/components/catalyst/catalyst-sources'
import type { CatalystLiterature } from '@/lib/catalyst-literature'

/**
 * Inline "AI Overview" for the literature search (Google-style): a clamped teaser of
 * the streamed summary with Show more / Show less, and a "Dive deeper with Catalyst"
 * action that hands off to the chat sidebar. Nothing here creates a chat session —
 * that only happens once the user dives (see the sidebar's C3 effect).
 */
export function LiteratureAiOverview({
  lit,
  onDive,
}: {
  lit: CatalystLiterature
  onDive: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const hasSummary = !!lit.summary?.trim()
  if (!hasSummary && !lit.streaming) return null

  return (
    <section className="rounded-xl border border-border border-l-2 border-l-[var(--n9-accent)] bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-[var(--n9-accent)]" aria-hidden />
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--n9-accent)]">
          AI Overview
        </span>
        {lit.streaming && (
          <span className="text-[11px] text-muted-foreground">summarizing…</span>
        )}
      </div>

      <div
        className={
          !expanded && !lit.streaming
            ? 'relative max-h-[4.5rem] overflow-hidden'
            : undefined
        }
      >
        <MarkdownRenderer
          content={lit.summary}
          showCursor={lit.streaming}
          className="w-full min-w-0 text-[13.5px] leading-relaxed break-words"
          onCitationClick={(label) => {
            window.dispatchEvent(
              new CustomEvent('literature:scroll-to-citation', {
                detail: { citeLabel: label },
              })
            )
            return true
          }}
        />
        {!expanded && !lit.streaming && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card to-transparent" />
        )}
      </div>

      {!lit.streaming && hasSummary && (
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            {expanded ? 'Show less' : 'Show more'}
            <ChevronDown
              className={`size-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
          <button
            type="button"
            onClick={onDive}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--n9-accent)] px-3 py-1 text-xs font-medium text-white hover:opacity-90 transition-opacity"
          >
            <Sparkles className="size-3" aria-hidden />
            Dive deeper with Catalyst
          </button>
        </div>
      )}

      {expanded && lit.references?.length ? (
        <CatalystSources items={lit.references} />
      ) : null}
    </section>
  )
}
