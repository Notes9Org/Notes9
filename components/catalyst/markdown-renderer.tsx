'use client';

import * as React from 'react';
import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Streamdown, defaultRehypePlugins } from 'streamdown';
import type { PluggableList } from 'unified';
import { createMathPlugin } from '@streamdown/math';
import { code as codePlugin } from '@streamdown/code';
import { cn } from '@/lib/utils';
import rehypeCitations from '@/lib/rehype-citations';
import { parseCitationMeta, correctAcademicType } from '@/lib/citation-meta';
import { resolveTitleFromId, isPlaceholderTitle } from '@/lib/citation-title';
import { useSourceNavigation } from '@/hooks/use-source-navigation';
import { Calendar, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { CitationsManifest } from '@/hooks/use-agent-stream';
import {
  buildHighlightUrl,
  dispatchDocumentHighlight,
  normalizeAgentSourceType,
  normalizeAgentRelevance0to1,
  sourceTypeLabel,
  type HighlightTarget,
} from '@/lib/document-highlight';
import { GroundingProvenanceBadge, type Grounding } from './grounding-provenance-badge';
import {
  CitationSourceViewer,
  type CitationSourceViewerSource,
} from './citation-source-viewer';
import '@/styles/html-content.css';

// Stable across renders (no props/state dependency) — defined once at module
// scope so Streamdown doesn't see a new `plugins` object identity every
// render. `singleDollarTextMath: true` lets AI answers use `$E=mc^2$` inline
// math, not just `$$...$$` block math (the common case in chat answers).
const STREAMDOWN_PLUGINS = {
  math: createMathPlugin({ singleDollarTextMath: true }),
  code: codePlugin,
};

/** Citation chip metadata read off the clicked/hovered DOM element's data-*. */
interface ChipData {
  label: string;
  sourceType: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  matchKind: string;
  relevance: number | null;
  excerpt: string;
  /** Exact per-claim supporting span (span-level grounding). Preferred over
   * `excerpt` for the hover preview and for the click highlight target. */
  citedText: string;
  /** Grounding verdict for this specific claim — drives the support badge. */
  supportStatus: 'supported' | 'partial' | 'unsupported' | null;
  provenance: string;
  /** How the span was located (native / heuristic / none) — drives the
   * provenance badge in the hover card and the source viewer. */
  grounding: Grounding;
  /** Advisory char offsets into the stripped source for the cited span. */
  charStart: number | null;
  charEnd: number | null;
}

function parseGrounding(raw: string | undefined): Grounding {
  return raw === 'native' || raw === 'heuristic' || raw === 'none' ? raw : null;
}

function parseSupportStatus(
  raw: string | undefined,
): 'supported' | 'partial' | 'unsupported' | null {
  return raw === 'supported' || raw === 'partial' || raw === 'unsupported' ? raw : null;
}

function readChipData(el: HTMLElement): ChipData {
  const ds = el.dataset;
  const rel = ds.citeRelevance ? Number(ds.citeRelevance) : NaN;
  const cs = ds.citeCharStart ? Number(ds.citeCharStart) : NaN;
  const ce = ds.citeCharEnd ? Number(ds.citeCharEnd) : NaN;
  return {
    label: ds.citeLabel || ds.citeN || '',
    sourceType: ds.citeType || '',
    sourceId: ds.citeId || '',
    sourceName: ds.citeName || '',
    sourceUrl: ds.citeUrl || '',
    matchKind: ds.citeMatch || '',
    relevance: Number.isFinite(rel) ? normalizeAgentRelevance0to1(rel) : null,
    excerpt: ds.citeExcerpt || '',
    citedText: ds.citeSnippet || '',
    supportStatus: parseSupportStatus(ds.citeSupport),
    provenance: ds.citeProvenance || '',
    grounding: parseGrounding(ds.citeGrounding),
    charStart: Number.isFinite(cs) ? cs : null,
    charEnd: Number.isFinite(ce) ? ce : null,
  };
}

/** Subtle grounding signal shown in the hover card. These are confidence
 * cues, NOT correctness verdicts — phrasing avoids reading as "wrong". */
const SUPPORT_BADGE: Record<
  'supported' | 'partial' | 'unsupported',
  { label: string; symbol: string; className: string }
> = {
  supported: {
    label: 'Directly quoted',
    symbol: '✓',
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  partial: {
    label: 'Closely matched',
    symbol: '•',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  unsupported: {
    label: 'Inferred from source',
    symbol: '–',
    className: 'bg-muted text-muted-foreground',
  },
};

function SupportBadge({
  status,
  className,
}: {
  status: 'supported' | 'partial' | 'unsupported' | null;
  className?: string;
}) {
  if (!status) return null;
  const b = SUPPORT_BADGE[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-medium',
        b.className,
        className,
      )}
    >
      <span aria-hidden className="leading-none">
        {b.symbol}
      </span>
      {b.label}
    </span>
  );
}

/** Internal route for a workspace source kind + id (mirrors AgentCitationsPanel). */
function workspaceRoute(sourceType: string, sourceId: string): string {
  if (!sourceId) return '';
  switch (normalizeAgentSourceType(sourceType)) {
    case 'literature_review':
      return `/literature-reviews/${sourceId}`;
    case 'protocol':
      return `/protocols/${sourceId}`;
    case 'project':
      return `/projects/${sourceId}`;
    case 'experiment':
      return `/experiments/${sourceId}`;
    case 'lab_note':
      return `/lab-notes/${sourceId}`;
    case 'report':
      return `/reports/${sourceId}`;
    case 'sample':
      return `/samples/${sourceId}`;
    case 'equipment':
      return `/equipment/${sourceId}`;
    default:
      return '';
  }
}

function provenanceLabel(chip: ChipData): string {
  if (chip.provenance === 'web' || chip.sourceUrl) {
    try {
      return new URL(chip.sourceUrl).hostname.replace(/^www\./, '') || 'Web';
    } catch {
      return 'Web';
    }
  }
  if (chip.matchKind === 'exact') return 'Direct record';
  if (chip.relevance != null) return `${Math.round(chip.relevance * 100)}% match`;
  return chip.sourceType.replace(/_/g, ' ');
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** @deprecated Citations render via AgentCitationsPanel */
  citations?: Array<{ number: number; data: unknown }>;
  /** @deprecated */
  enableInlineCitations?: boolean;
  /** When true, shows a blinking cursor after the last line via CSS ::after */
  showCursor?: boolean;
  /** Citations manifest from the agent stream. When present, `[N]` markers
   * in the answer are wrapped as clickable superscript chips with source
   * metadata in data-* attributes (`data-cite-n`, `data-cite-token`,
   * `data-cite-name`). When absent, `[N]` renders as plain text. */
  citationsManifest?: CitationsManifest | null;
  /**
   * When provided, clicking an inline `[N]` citation calls this with the label
   * instead of opening the source viewer/deep-link, and hover previews are
   * suppressed. Return `false` to fall through to the default behavior. Used by
   * the literature search to scroll the matching result card into view.
   */
  onCitationClick?: (label: string) => boolean | void;
}

/** Hover preview card anchored to a citation chip. */
function CitationHoverCard({
  chip,
  anchor,
  containerRect,
  onMouseEnter,
  onMouseLeave,
  onViewSource,
  onOpenPage,
}: {
  chip: ChipData;
  anchor: DOMRect;
  containerRect: DOMRect;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onViewSource?: () => void;
  onOpenPage?: () => void;
}) {
  // Position relative to the renderer container (which is `relative`). The card
  // width tracks the container so it's never clipped on a narrow sidebar and
  // grows when the sidebar widens — capped so it stays a tooltip, not a panel.
  const PAD = 8;
  const cardWidth = Math.max(180, Math.min(320, containerRect.width - PAD * 2));
  const half = cardWidth / 2;
  const top = anchor.bottom - containerRect.top + 6;
  const rawCenter = anchor.left - containerRect.left + anchor.width / 2;
  // Keep the (center-anchored) card fully inside the container horizontally.
  const left = Math.max(half + PAD, Math.min(rawCenter, containerRect.width - half - PAD));
  // Prefer the exact per-claim span; fall back to the document excerpt.
  const snippetSource = chip.citedText || chip.excerpt;
  const excerpt =
    snippetSource.length > 180 ? `${snippetSource.slice(0, 179)}…` : snippetSource;

  // Cross-link to the actual citation page: a web source opens its URL in a new
  // tab; a workspace record routes to its detail page (/lab-notes/<id>, etc.).
  const isWebSource = !!chip.sourceUrl && /^https?:\/\//i.test(chip.sourceUrl);
  const pageHref = isWebSource
    ? chip.sourceUrl
    : workspaceRoute(chip.sourceType, chip.sourceId);

  // Correct backend mislabels (e.g. a paper tagged as a lab note) using the URL.
  const correctedType = correctAcademicType(
    normalizeAgentSourceType(chip.sourceType),
    chip.sourceUrl,
  );
  const typeLabel = sourceTypeLabel(correctedType) || 'Source';
  // Resolve the real document title when the citation came with a placeholder
  // ("Untitled literature"), so the hover card shows the actual article title.
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const canResolve = !!(chip.sourceId || chip.sourceUrl);
    if (!canResolve || !isPlaceholderTitle(chip.sourceName, chip.sourceType)) {
      setResolvedName(null);
      return () => {
        cancelled = true;
      };
    }
    resolveTitleFromId(chip.sourceType, chip.sourceId, chip.sourceUrl).then((t) => {
      if (!cancelled) setResolvedName(t);
    });
    return () => {
      cancelled = true;
    };
  }, [chip.sourceId, chip.sourceUrl, chip.sourceName, chip.sourceType]);
  const effectiveName = resolvedName?.trim() || chip.sourceName;
  // Best-effort author/year from the source name (no structured fields exist on
  // the wire). Only attempted for papers / web sources.
  const isAcademic = correctedType === 'literature_review' || chip.provenance === 'web';
  const meta = parseCitationMeta(effectiveName);
  const displayTitle = isAcademic ? meta.title || effectiveName : effectiveName;

  return (
    <div
      className={cn(
        'absolute z-50 -translate-x-1/2 rounded-lg border border-border bg-popover p-2.5 text-popover-foreground shadow-lg',
        'animate-in fade-in-0 zoom-in-95 duration-150'
      )}
      style={{ top, left, width: cardWidth }}
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {typeLabel}
        </span>
        {isAcademic && meta.author && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-2xs font-medium border border-primary/20">
            <User className="size-2.5 shrink-0" aria-hidden />
            {meta.author}
          </span>
        )}
        {isAcademic && meta.year && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
            <Calendar className="size-2.5 shrink-0" aria-hidden />
            {meta.year}
          </span>
        )}
        <span className="font-mono text-2xs text-muted-foreground tabular-nums ml-auto">
          {chip.label}
        </span>
        <GroundingProvenanceBadge
          grounding={chip.grounding}
          matchKind={chip.matchKind}
          supportStatus={chip.supportStatus}
          className="ml-auto"
        />
      </div>
      {displayTitle && (
        <p className="mt-1.5 line-clamp-2 text-xs font-medium text-foreground">
          {displayTitle}
        </p>
      )}
      {chip.supportStatus && (
        <div className="mt-1.5">
          <SupportBadge status={chip.supportStatus} />
        </div>
      )}
      {excerpt && (
        <p className="mt-1.5 line-clamp-3 text-xs leading-snug text-muted-foreground">
          “{excerpt}”
        </p>
      )}
      <div className="mt-1.5 flex items-center justify-between gap-2 text-2xs text-muted-foreground/80">
        <span className="min-w-0 truncate">{provenanceLabel(chip)}</span>
        <span className="flex shrink-0 items-center gap-2.5">
          {pageHref &&
            (isWebSource ? (
              <a
                href={pageHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Open
                <span aria-hidden>↗</span>
              </a>
            ) : onOpenPage ? (
              // Internal source → SPA navigation (keeps the AI sidebar open).
              <button
                type="button"
                onClick={onOpenPage}
                className="inline-flex items-center gap-0.5 rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Open
                <span aria-hidden>↗</span>
              </button>
            ) : null)}
        </span>
      </div>
    </div>
  );
}

/** Project the DOM chip metadata into the source-viewer's source shape. */
function chipToViewerSource(chip: ChipData): CitationSourceViewerSource {
  const documentHref =
    !chip.sourceUrl && chip.sourceId
      ? workspaceRoute(chip.sourceType, chip.sourceId) || null
      : null;
  return {
    label: chip.label,
    sourceType: chip.sourceType,
    sourceId: chip.sourceId || null,
    sourceName: chip.sourceName || null,
    sourceUrl: chip.sourceUrl || null,
    sourceBody: null,
    excerpt: chip.excerpt || null,
    citedText: chip.citedText || null,
    charStart: chip.charStart,
    charEnd: chip.charEnd,
    documentHref,
    grounding: chip.grounding,
    matchKind: chip.matchKind || null,
    supportStatus: chip.supportStatus,
  };
}
function MarkdownRendererImpl({
  content,
  className,
  showCursor = false,
  citationsManifest,
  onCitationClick,
}: MarkdownRendererProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ chip: ChipData; anchor: DOMRect } | null>(null);
  // Span-level source viewer (G3): the cited source's text with the exact
  // supporting span highlighted. null → closed.
  const [viewerSource, setViewerSource] = useState<CitationSourceViewerSource | null>(null);
  // Deferred dismiss: lets the pointer travel from the chip into the card
  // (so the user can read / click "Open") without the card vanishing.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHoverClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  const scheduleHoverClose = useCallback(() => {
    cancelHoverClose();
    closeTimer.current = setTimeout(() => setHover(null), 120);
  }, [cancelHoverClose]);

  const hasManifest = Boolean(
    citationsManifest?.manifest && Object.keys(citationsManifest.manifest).length > 0
  );

  // Streamdown's own `parseIncompleteMarkdown` handles the "everything went
  // bold" streaming problem (auto-closing dangling `**`/`` ` ``/fences) that
  // `completePartialMarkdown` used to paper over by hand — see the
  // `parseIncompleteMarkdown={showCursor}` prop below.
  //
  // Security: providing a custom `rehypePlugins` array REPLACES Streamdown's
  // default pipeline rather than extending it, so `raw`/`sanitize`/`harden`
  // must be re-included explicitly (in this order) or model-supplied HTML
  // would render unsanitized. `rehypeCitations` runs LAST, after `harden` —
  // it creates the `.notes9-cite` chip nodes on the ALREADY-sanitized tree,
  // so sanitize/harden never see (and thus never strip) their `data-cite-*`
  // attributes. `harden` is also what adds target="_blank" +
  // rel="noopener noreferrer" to markdown-authored links (matching the old
  // `postProcessHtml`'s `<a target="_blank">` rewrite); the citation plugin
  // sets those explicitly on its own `<a class="notes9-cite--link">` nodes
  // since they're created after harden runs.
  const rehypePlugins = useMemo<PluggableList>(
    () => [
      defaultRehypePlugins.raw,
      defaultRehypePlugins.sanitize,
      defaultRehypePlugins.harden,
      [rehypeCitations, { manifest: citationsManifest }],
    ],
    [citationsManifest],
  );

  /** Open the source a chip points at: web → new tab; workspace → highlight
   * deep-link via dispatchDocumentHighlight (no fragile title lookup — the
   * manifest now carries source_id). */
  // The one place workspace-source / citation navigation lives (shared with the
  // Sources panel) — SPA nav, chat docking, lab-note experiment resolution.
  const navigateToSource = useSourceNavigation();

  const openChip = useCallback(
    (chip: ChipData) => {
      navigateToSource({
        sourceType: chip.sourceType,
        sourceId: chip.sourceId,
        sourceUrl: chip.sourceUrl,
        // Prefer the exact per-claim span so [3.1] and [3.2] (same document,
        // different cited_text) scroll to DIFFERENT sentences.
        excerpt: chip.citedText || chip.excerpt,
        charStart: chip.charStart,
        charEnd: chip.charEnd,
      });
    },
    [navigateToSource],
  );

  /** Open the in-app span viewer for a chip (G3). Dismiss any hover card so it
   * doesn't float over the modal. */
  const openViewer = useCallback(
    (chip: ChipData) => {
      cancelHoverClose();
      setHover(null);
      setViewerSource(chipToViewerSource(chip));
    },
    [cancelHoverClose]
  );

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const chipEl = (e.target as HTMLElement).closest<HTMLElement>('.notes9-cite');
      if (!chipEl) return;
      // Anchor variants are real links — let the browser handle them.
      if (chipEl.tagName === 'A') return;
      e.preventDefault();
      const chip = readChipData(chipEl);
      // Host override (e.g. literature search scrolls to the result card).
      if (onCitationClick && onCitationClick(chip.label) !== false) return;
      // When we have a supporting span/excerpt, open the source viewer so the
      // user can read the exact passage highlighted in context (G3). Otherwise
      // fall back to the legacy deep-link navigation.
      if (chip.citedText || chip.excerpt) {
        openViewer(chip);
      } else {
        openChip(chip);
      }
    },
    [openChip, openViewer, onCitationClick]
  );

  const onMouseOver = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // When the host owns clicks AND there's no manifest to preview, skip the
      // hover card. With a manifest (e.g. literature search), still show it.
      if (onCitationClick && !hasManifest) return;
      const chipEl = (e.target as HTMLElement).closest<HTMLElement>('.notes9-cite');
      if (!chipEl) {
        // Not over a chip: defer dismissal so the pointer can reach the card.
        scheduleHoverClose();
        return;
      }
      cancelHoverClose();
      setHover({ chip: readChipData(chipEl), anchor: chipEl.getBoundingClientRect() });
    },
    [cancelHoverClose, scheduleHoverClose, onCitationClick, hasManifest]
  );

  // Scroll invalidates the anchored position → dismiss so the card never floats
  // stale over unrelated content.
  const onScroll = useCallback(() => {
    cancelHoverClose();
    setHover(null);
  }, [cancelHoverClose]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const chipEl = (e.target as HTMLElement).closest<HTMLElement>('.notes9-cite');
      if (!chipEl || chipEl.tagName === 'A') return;
      e.preventDefault();
      const chip = readChipData(chipEl);
      // Honor the host override (literature summary scrolls to the result card)
      // so keyboard activation matches a mouse click.
      if (onCitationClick && onCitationClick(chip.label) !== false) return;
      if (chip.citedText || chip.excerpt) {
        openViewer(chip);
      } else {
        openChip(chip);
      }
    },
    [openChip, openViewer, onCitationClick]
  );

  // Clear the preview when the content changes (e.g. live streaming updates).
  useEffect(() => {
    setHover(null);
  }, [content]);

  // Leak-free: drop any pending dismiss timer on unmount.
  useEffect(() => () => cancelHoverClose(), [cancelHoverClose]);

  if (!content) return null;

  return (
    <div className={cn('relative min-w-0', hasManifest && 'min-w-0')}>
      <div
        ref={containerRef}
        className={cn(
          'html-content text-[17px] leading-[1.7] text-foreground overflow-x-hidden break-words',
          '[&_p]:mb-6 first:[&_p]:mt-0 last:[&_p]:mb-0',
          '[&_h1]:!text-3xl [&_h1]:!font-semibold [&_h1]:!leading-snug [&_h1]:!mt-10 [&_h1]:!mb-6 first:[&_h1]:!mt-0',
          '[&_h2]:!text-2xl [&_h2]:!font-semibold [&_h2]:!leading-snug [&_h2]:!mt-10 [&_h2]:!mb-6 first:[&_h2]:!mt-0',
          '[&_h3]:!text-xl [&_h3]:!font-semibold [&_h3]:!leading-snug [&_h3]:!mt-8 [&_h3]:!mb-4',
          '[&_h4]:!text-lg [&_h4]:!font-medium [&_h4]:!text-muted-foreground [&_h4]:mt-8 [&_h4]:mb-4',
          '[&_pre]:overflow-x-auto [&_pre]:max-w-full',
          '[&_code]:break-words',
          '[&_a]:break-words [&_a]:overflow-wrap-anywhere',
          '[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg',
          '[&_p]:break-words [&_p]:overflow-wrap-anywhere',
          // Each line break gets a small gap below it so multi-line answers
          // breathe instead of stacking flush.
          '[&_br]:block [&_br]:content-[""] [&_br]:mb-[0.5em]',
          // Lists, quotes, rules and tables — consistent, readable rhythm.
          '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6',
          '[&_li]:my-1.5 [&_li]:leading-[1.65] [&_li]:marker:text-muted-foreground/70',
          '[&_li>ul]:my-1.5 [&_li>ol]:my-1.5',
          '[&_blockquote]:my-5 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/30 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
          '[&_hr]:my-8 [&_hr]:border-border/60',
          '[&_thead_th]:px-3 [&_thead_th]:py-2 [&_thead_th]:text-left [&_tbody_td]:px-3 [&_tbody_td]:py-2',
          showCursor && 'notes9-md--streaming',
          className
        )}
        onClick={hasManifest ? onClick : undefined}
        onMouseOver={hasManifest ? onMouseOver : undefined}
        onMouseLeave={hasManifest ? scheduleHoverClose : undefined}
        onScroll={hasManifest ? onScroll : undefined}
        onKeyDown={hasManifest ? onKeyDown : undefined}
      >
        <Streamdown
          parseIncompleteMarkdown={showCursor}
          mode={showCursor ? 'streaming' : 'static'}
          rehypePlugins={rehypePlugins}
          plugins={STREAMDOWN_PLUGINS}
        >
          {content}
        </Streamdown>
      </div>
      {hover && containerRef.current && (
        <CitationHoverCard
          chip={hover.chip}
          anchor={hover.anchor}
          containerRect={containerRef.current.getBoundingClientRect()}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
          // In the literature summary (host owns citation clicks → onCitationClick
          // set) the in-app span viewer is not useful, so the "View source" button
          // is suppressed; clicking the chip scrolls the left results panel instead.
          onViewSource={onCitationClick ? undefined : () => openViewer(hover.chip)}
          onOpenPage={() => openChip(hover.chip)}
        />
      )}
      <CitationSourceViewer
        source={viewerSource}
        open={viewerSource !== null}
        onOpenChange={(o) => {
          if (!o) setViewerSource(null);
        }}
        onOpenDocument={(s) => {
          // Close the modal, then route to the document via the shared SPA-aware
          // navigator (lab-note experiment resolution, chat docking, dedup).
          setViewerSource(null);
          navigateToSource({
            sourceType: s.sourceType,
            sourceId: s.sourceId,
            sourceUrl: s.sourceUrl,
            excerpt: s.citedText || s.excerpt,
            charStart: s.charStart,
            charEnd: s.charEnd,
          });
        }}
      />
    </div>
  );
}

// Memoized so an unrelated streaming-state update (e.g. a token flush elsewhere)
// does not re-parse/re-sanitize settled messages whose props are unchanged. The
// live streaming message still re-renders because `content` changes each flush.
export const MarkdownRenderer = React.memo(MarkdownRendererImpl);
MarkdownRenderer.displayName = 'MarkdownRenderer';
