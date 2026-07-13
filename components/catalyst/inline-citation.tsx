'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { AgentCitationPanelItem } from './agent-citations-panel';

export interface InlineCitationProps {
  number: number;
  citation: AgentCitationPanelItem | null;
  onNavigate?: () => void;
  className?: string;
}

/**
 * Inline [n] citation chip. The hover excerpt tooltip was removed (it
 * rendered glitchy — user request, 2026-07): the chip is now purely a
 * click-through to the source, with the title announced via aria-label.
 */
export function InlineCitation({ number, citation, onNavigate, className }: InlineCitationProps) {
  const href = citation?.highlightHref || citation?.documentHref;
  const isLoading = !citation;

  const chipContent = (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded px-1 py-0.5 font-mono text-[0.8em] font-medium transition-all',
        isLoading
          ? 'cursor-wait bg-muted text-muted-foreground opacity-60'
          : href
            ? 'cursor-pointer bg-primary/10 text-primary ring-1 ring-primary/30 hover:bg-primary/20 hover:ring-primary/50'
            : 'bg-muted/80 text-muted-foreground ring-1 ring-border/40',
        className
      )}
      // No explicit role: on the href path the wrapping <Link> already provides
      // link semantics, and a non-focusable role="link" span misleads screen
      // readers. The aria-label still announces the citation.
      aria-label={citation ? `Citation ${number}: ${citation.title}` : `Citation ${number} loading`}
    >
      [{number}]
    </span>
  );

  if (!href) {
    return <span className="relative inline-block">{chipContent}</span>;
  }

  return (
    <span className="relative inline-block">
      <Link
        href={href}
        onClick={(e) => {
          if (onNavigate) {
            e.preventDefault();
            onNavigate();
          }
        }}
        className="no-underline"
      >
        {chipContent}
      </Link>
    </span>
  );
}
