'use client'

import { ScrollText, Loader2, BookText } from 'lucide-react'
import { MarkdownRenderer } from '@/components/catalyst/markdown-renderer'
import type { CatalystLiterature } from '@/lib/catalyst-literature'

/**
 * The literature search's AI summary, shown at the top of the Catalyst chat —
 * composed on the literature page (/api/chat) and streamed in here, with its
 * cited references underneath. Follow-up questions continue in the chat below.
 */
export function LiteratureSummaryPanel({ lit }: { lit: CatalystLiterature }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.03] shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-primary/15 px-4 py-2.5">
        {lit.streaming ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
        ) : (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ScrollText className="size-3.5" />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-wider text-primary/80">AI summary</p>
          {lit.query && (
            <p className="truncate text-xs text-muted-foreground" title={lit.query}>
              “{lit.query}”
            </p>
          )}
        </div>
      </div>

      <div className="px-4 py-3">
        {lit.summary.trim() ? (
          <MarkdownRenderer content={lit.summary} showCursor={lit.streaming} className="text-sm" />
        ) : (
          <p className="text-sm italic text-muted-foreground">Reading the papers and composing a cited summary…</p>
        )}

        {lit.references.length > 0 && (
          <div className="mt-3 border-t border-border/50 pt-3">
            <p className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              <BookText className="size-3.5 text-primary/70" aria-hidden />
              References
              <span className="ml-auto rounded-full bg-muted px-1.5 text-2xs font-medium tabular-nums text-muted-foreground">
                {lit.references.length}
              </span>
            </p>
            <ol className="space-y-2">
              {lit.references.map((r) => (
                <li key={r.n} className="flex gap-2 text-sm">
                  <span className="mt-0.5 shrink-0 font-mono text-xs tabular-nums text-primary/80">[{r.n}]</span>
                  <span className="min-w-0">
                    {r.href ? (
                      <a
                        href={r.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium leading-snug text-foreground underline-offset-2 hover:underline"
                      >
                        {r.title}
                      </a>
                    ) : (
                      <span className="font-medium leading-snug text-foreground">{r.title}</span>
                    )}
                    {r.meta && <span className="mt-0.5 block text-xs text-muted-foreground">{r.meta}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  )
}
