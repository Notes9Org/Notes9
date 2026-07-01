'use client';

import { useMemo } from 'react';
import { Streamdown } from 'streamdown';
import { ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { GroundingProvenanceBadge } from './grounding-provenance-badge';

/**
 * The minimal slice of citation metadata the source-span viewer needs. Both the
 * markdown chip path (data-* on the DOM) and the citations panel
 * (AgentCitationPanelItem) can project into this shape.
 */
export interface CitationSourceViewerSource {
  /** Display label `[N]` / `[3.2]`. */
  label: string;
  sourceType: string;
  /** Record id, for SPA-aware "Open document" navigation. */
  sourceId?: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  /** The full source body when available (not currently on the wire — kept so
   * a future fetch endpoint can populate it). When absent we highlight inside
   * the excerpt instead. */
  sourceBody?: string | null;
  /** Generic preview/excerpt for the source. */
  excerpt: string | null;
  /** Exact per-claim supporting span (span-level grounding). */
  citedText: string | null;
  /** Advisory char offsets into the (stripped) source body. */
  charStart?: number | null;
  charEnd?: number | null;
  /** Deep-link into the in-app document (workspace records). */
  documentHref?: string | null;
  grounding?: 'native' | 'heuristic' | 'none' | null;
  matchKind?: string | null;
  supportStatus?: 'supported' | 'partial' | 'unsupported' | null;
}

/** A resolved highlight region inside whatever body text we end up rendering. */
interface ResolvedSpan {
  body: string;
  start: number;
  end: number;
  /** Where the highlight came from — drives a tiny note for transparency. */
  via: 'offsets' | 'search' | 'none';
}

/**
 * Resolve the highlight region.
 *
 * 1. Prefer the full `sourceBody` when present; otherwise fall back to the
 *    `excerpt`, and if even that's missing, render the cited span itself.
 * 2. If `charStart`/`charEnd` land inside the chosen body AND the slice equals
 *    `citedText` (or no citedText to verify against), use the offsets directly.
 * 3. Otherwise locate `citedText` by case-insensitive search within the body.
 * 4. If nothing resolves, return the body with no highlight.
 */
function resolveSpan(source: CitationSourceViewerSource): ResolvedSpan {
  const body =
    (source.sourceBody && source.sourceBody.trim()) ||
    (source.excerpt && source.excerpt.trim()) ||
    (source.citedText && source.citedText.trim()) ||
    '';
  const cited = source.citedText?.trim() ?? '';

  if (!body) return { body: '', start: 0, end: 0, via: 'none' };

  // (2) Trust offsets only when they're in range and — if we can verify —
  // actually point at the cited text. Offsets are advisory and computed against
  // the *stripped* source, so when we're highlighting inside a short excerpt the
  // raw offsets usually won't apply; the equality check guards against that.
  const cs = source.charStart;
  const ce = source.charEnd;
  if (
    typeof cs === 'number' &&
    typeof ce === 'number' &&
    cs >= 0 &&
    ce > cs &&
    ce <= body.length
  ) {
    const slice = body.slice(cs, ce);
    if (!cited || slice.trim() === cited) {
      return { body, start: cs, end: ce, via: 'offsets' };
    }
  }

  // (3) Search fallback — case-insensitive, first occurrence.
  if (cited) {
    const idx = body.toLowerCase().indexOf(cited.toLowerCase());
    if (idx >= 0) {
      return { body, start: idx, end: idx + cited.length, via: 'search' };
    }
  }

  return { body, start: 0, end: 0, via: 'none' };
}

function HighlightedBody({ span }: { span: ResolvedSpan }) {
  if (!span.body) {
    return (
      <p className="text-sm italic text-muted-foreground">
        No source text is available to display for this citation.
      </p>
    );
  }
  if (span.via === 'none' || span.end <= span.start) {
    // No active highlight span — safe to render as markdown (e.g. an
    // abstract with **bold**/lists reads better than escaped literal text).
    return (
      <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-relaxed text-foreground [&_p]:mb-2 last:[&_p]:mb-0">
        <Streamdown parseIncompleteMarkdown={false}>{span.body}</Streamdown>
      </div>
    );
  }
  // An exact highlight span is active — render as plain text, not markdown.
  // Correctness of the highlight (the `before`/`hit`/`after` char-offset
  // slice) beats markdown formatting here; running the body through a
  // markdown parser would re-flow/strip characters and could shift or break
  // the highlighted range.
  const before = span.body.slice(0, span.start);
  const hit = span.body.slice(span.start, span.end);
  const after = span.body.slice(span.end);
  return (
    <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-relaxed text-foreground">
      {before}
      <mark
        className="rounded-sm bg-primary/20 px-0.5 text-foreground ring-1 ring-primary/40"
        data-citation-span
      >
        {hit}
      </mark>
      {after}
    </p>
  );
}

export interface CitationSourceViewerProps {
  source: CitationSourceViewerSource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** SPA-aware "Open document" handler (lab-note resolution, chat docking). When
   * omitted, falls back to a plain link via `documentHref`. */
  onOpenDocument?: (source: CitationSourceViewerSource) => void;
}

/**
 * A modal source viewer (Radix Dialog → focus trap + escape-to-close for free)
 * that shows a citation's source text with the exact supporting span
 * highlighted. When the full source body isn't in the manifest, it gracefully
 * falls back to highlighting `cited_text` inside the excerpt.
 */
export function CitationSourceViewer({
  source,
  open,
  onOpenChange,
  onOpenDocument,
}: CitationSourceViewerProps) {
  const span = useMemo(
    () => (source ? resolveSpan(source) : { body: '', start: 0, end: 0, via: 'none' as const }),
    [source],
  );

  const isExcerptOnly = !source?.sourceBody && span.body.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dialogSize="md"
        overlayClassName="z-[130]"
        className="max-h-[min(85dvh,42rem)] gap-3 overflow-hidden [&>*]:min-w-0"
      >
        <DialogHeader className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground tabular-nums">
              [{source?.label ?? ''}]
            </span>
            <DialogTitle className="min-w-0 flex-1 truncate text-base">
              {source?.sourceName || source?.sourceType?.replace(/_/g, ' ') || 'Source'}
            </DialogTitle>
            <GroundingProvenanceBadge
              grounding={source?.grounding}
              matchKind={source?.matchKind}
              supportStatus={source?.supportStatus}
            />
          </div>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="capitalize">
              {source?.sourceType?.replace(/_/g, ' ') || 'source'}
            </span>
            {source?.sourceUrl && (
              <a
                href={source.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <span className="max-w-[18rem] truncate">{source.sourceUrl}</span>
                <ExternalLink className="size-3 shrink-0" aria-hidden />
              </a>
            )}
            {!source?.sourceUrl && (source?.documentHref || (onOpenDocument && source?.sourceId)) && (
              onOpenDocument && source ? (
                <button
                  type="button"
                  onClick={() => onOpenDocument(source)}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Open document
                  <ExternalLink className="size-3 shrink-0" aria-hidden />
                </button>
              ) : (
                <a
                  href={source!.documentHref!}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Open document
                  <ExternalLink className="size-3 shrink-0" aria-hidden />
                </a>
              )
            )}
          </DialogDescription>
        </DialogHeader>

        {/* A plain scroll container (not Radix ScrollArea, whose viewport sizes
            to content and let wide text overflow) so the source text wraps and
            stays inside the box. */}
        <div className="max-h-[min(60dvh,28rem)] w-full min-w-0 overflow-y-auto overflow-x-hidden rounded-md border border-border/60 bg-muted/10">
          <div className="w-full min-w-0 p-3">
            <HighlightedBody span={span} />
          </div>
        </div>

        <p
          className={cn(
            'text-2xs text-muted-foreground/80',
            span.via === 'none' && 'text-amber-600/80 dark:text-amber-500/80',
          )}
        >
          {span.via === 'offsets' && 'Highlighted using exact source offsets.'}
          {span.via === 'search' && 'Highlighted by locating the cited passage in the source text.'}
          {span.via === 'none' &&
            source?.citedText &&
            'Could not pinpoint the exact span — showing the available source text.'}
          {span.via === 'none' && !source?.citedText && ''}
          {isExcerptOnly && span.via !== 'none' && ' Showing the retrieved excerpt.'}
        </p>
      </DialogContent>
    </Dialog>
  );
}
