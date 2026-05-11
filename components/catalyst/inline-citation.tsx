'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { AgentCitationPanelItem } from './agent-citations-panel';

export interface InlineCitationProps {
  number: number;
  citation: AgentCitationPanelItem | null;
  onNavigate?: () => void;
  className?: string;
}

const TOOLTIP_EXCERPT_LENGTH = 120;

export function InlineCitation({ number, citation, onNavigate, className }: InlineCitationProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const href = citation?.highlightHref || citation?.documentHref;
  const isLoading = !citation;
  const hasExcerpt = citation?.excerpt && citation.excerpt.trim().length > 0;
  const tooltipExcerpt = hasExcerpt
    ? citation.excerpt.length > TOOLTIP_EXCERPT_LENGTH
      ? `${citation.excerpt.slice(0, TOOLTIP_EXCERPT_LENGTH - 1)}…`
      : citation.excerpt
    : null;

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
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      role={href ? 'link' : 'note'}
      aria-label={citation ? `Citation ${number}: ${citation.title}` : `Citation ${number} loading`}
    >
      [{number}]
    </span>
  );

  if (!href) {
    return (
      <span className="relative inline-block">
        {chipContent}
        {showTooltip && tooltipExcerpt && (
          <span
            className={cn(
              'absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-normal',
              'w-64 rounded-lg border border-border bg-popover p-2 text-xs leading-snug text-popover-foreground shadow-lg',
              'animate-in fade-in-0 zoom-in-95 duration-150'
            )}
            role="tooltip"
          >
            <p className="font-medium text-foreground">{citation?.title}</p>
            {tooltipExcerpt && (
              <p className="mt-1 text-muted-foreground">{tooltipExcerpt}</p>
            )}
          </span>
        )}
      </span>
    );
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
      {showTooltip && tooltipExcerpt && (
        <span
          className={cn(
            'pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-normal',
            'w-64 rounded-lg border border-border bg-popover p-2 text-xs leading-snug text-popover-foreground shadow-lg',
            'animate-in fade-in-0 zoom-in-95 duration-150'
          )}
          role="tooltip"
        >
          <p className="font-medium text-foreground">{citation?.title}</p>
          {tooltipExcerpt && (
            <p className="mt-1 text-muted-foreground">{tooltipExcerpt}</p>
          )}
        </span>
      )}
    </span>
  );
}
