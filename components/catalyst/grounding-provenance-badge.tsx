'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Provenance of a span-level citation — how the supporting span was located.
 *
 * - `native`    → the model emitted the citation itself (Anthropic Citations).
 *                 Highest fidelity: the quote is verbatim from the source.
 * - `heuristic` → we matched the claim to a span after the fact (fuzzy/keyword).
 *                 Approximate: a best-effort pointer, not a guaranteed quote.
 * - `none`      → no span could be located; the chip points at the source only.
 */
export type Grounding = 'native' | 'heuristic' | 'none' | null | undefined;

interface BadgeStyle {
  short: string;
  full: string;
  description: string;
  className: string;
}

const GROUNDING_STYLE: Record<'native' | 'heuristic' | 'none', BadgeStyle> = {
  native: {
    short: 'Exact',
    full: 'Exact match',
    description:
      'High-fidelity citation — the supporting quote was emitted by the model directly from the source text.',
    className:
      'bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-400',
  },
  heuristic: {
    short: 'Approx',
    full: 'Approximate match',
    description:
      'Best-effort grounding — the supporting passage was located by matching the claim against the source after the fact.',
    className: 'bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-400',
  },
  none: {
    short: 'Source',
    full: 'Source only',
    description:
      'No exact supporting passage was pinpointed — this points at the cited source as a whole.',
    className: 'bg-muted text-muted-foreground ring-border/50',
  },
};

const MATCH_KIND_LABEL: Record<string, string> = {
  exact: 'exact text',
  semantic: 'semantic similarity',
  keyword: 'keyword overlap',
};

export interface GroundingProvenanceBadgeProps {
  grounding: Grounding;
  /** Optional retrieval match kind (exact / semantic / keyword). */
  matchKind?: string | null;
  supportStatus?: 'supported' | 'partial' | 'unsupported' | null;
  className?: string;
  /** When true, render only the symbol/short label (for the inline chip row). */
  compact?: boolean;
}

/**
 * A single compact, color-coded badge that distinguishes native (exact) from
 * heuristic (approximate) from none (source-only) grounding, with a tooltip
 * explaining the distinction. Renders nothing when grounding is absent so it
 * never clutters citations that carry no provenance signal.
 */
export function GroundingProvenanceBadge({
  grounding,
  matchKind,
  supportStatus,
  className,
  compact = false,
}: GroundingProvenanceBadgeProps) {
  const key: 'native' | 'heuristic' | 'none' | null =
    grounding === 'native' || grounding === 'heuristic' || grounding === 'none'
      ? grounding
      : null;
  if (!key) return null;

  const style = GROUNDING_STYLE[key];
  const matchLabel =
    matchKind && MATCH_KIND_LABEL[matchKind] ? MATCH_KIND_LABEL[matchKind] : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex select-none items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-medium ring-1 ring-inset',
            style.className,
            className,
          )}
          aria-label={`Citation provenance: ${style.full}`}
        >
          {style.short}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[15rem] text-xs leading-snug">
        <p className="font-medium">{style.full}</p>
        <p className="mt-1 text-muted-foreground">{style.description}</p>
        {matchLabel && (
          <p className="mt-1 text-muted-foreground">
            Located via <span className="font-medium">{matchLabel}</span>.
          </p>
        )}
        {supportStatus && (
          <p className="mt-1 text-muted-foreground">
            Claim support:{' '}
            <span className="font-medium capitalize">{supportStatus}</span>.
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
