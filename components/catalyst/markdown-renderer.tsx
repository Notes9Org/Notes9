'use client';

import * as React from 'react';
import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { markdownToHtml } from '@/lib/markdown-to-html';
import { sanitizeHtml } from '@/lib/sanitize-html';
import type { CitationsManifest } from '@/hooks/use-agent-stream';
import {
  buildHighlightUrl,
  dispatchDocumentHighlight,
  normalizeAgentSourceType,
  normalizeAgentRelevance0to1,
  type HighlightTarget,
} from '@/lib/document-highlight';
import { GroundingProvenanceBadge, type Grounding } from './grounding-provenance-badge';
import {
  CitationSourceViewer,
  type CitationSourceViewerSource,
} from './citation-source-viewer';
import '@/styles/html-content.css';

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

const PROSE_CSS_VARS = {
  '--tw-prose-body': 'var(--foreground)',
  '--tw-prose-headings': 'var(--foreground)',
  '--tw-prose-links': 'var(--primary)',
  '--tw-prose-bold': 'var(--foreground)',
  '--tw-prose-counters': 'var(--muted-foreground)',
  '--tw-prose-bullets': 'var(--muted-foreground)',
  '--tw-prose-hr': 'var(--border)',
  '--tw-prose-quotes': 'var(--muted-foreground)',
  '--tw-prose-quote-borders': 'var(--border)',
  '--tw-prose-captions': 'var(--muted-foreground)',
  '--tw-prose-code': 'var(--foreground)',
  '--tw-prose-pre-code': 'var(--foreground)',
  '--tw-prose-pre-bg': 'var(--muted)',
  '--tw-prose-th-borders': 'var(--border)',
  '--tw-prose-td-borders': 'var(--border)',
} as React.CSSProperties;

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
}

// `[N]` matcher used by the citation chip post-processor. Limited to 1-3 digit
// numerics so it does not eat bracketed text like [optional] or [Note]. Also
// matches hierarchical sub-citations `[3.2]` (ADR-0006): distinct statements of
// the same source. The chip displays the full label but resolves the manifest
// by its BASE (`3.2` -> source `3`).
const CITATION_BRACKET_RE = /\[(\d{1,3}(?:\.\d{1,3})?)\]/g;

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Post-process rendered HTML:
 * - Add target="_blank" rel="noopener noreferrer" to all <a> tags
 * - Wrap <table> elements in a scrollable container
 * - Wrap `[N]` markers as `<sup class="notes9-cite" data-cite-...>` chips so
 *   the AgentCitationsPanel can scroll-into-view / highlight on click and
 *   show source metadata on hover.
 */
function postProcessHtml(html: string, manifest?: CitationsManifest | null): string {
  // Links: open in new tab
  let processed = html.replace(
    /<a\s/g,
    '<a target="_blank" rel="noopener noreferrer" '
  );
  // Tables are already wrapped in a scrollable container by
  // ``markdownToHtml`` (``wrapTablesForScroll`` in lib/markdown-to-html.ts).
  // Don't double-wrap here — the previous duplicate replacement injected a
  // second <div> around each table, breaking direct-child CSS selectors
  // and adding spurious DOM nodes.
  // Citations: wrap [N] in a styleable chip. Only match brackets that sit
  // in TEXT nodes — never inside an HTML attribute value or a tag itself.
  // The earlier naive global replace could rewrite a `title="See [1]"` into
  // `title="See <sup ...>[1]</sup>"`, breaking the attribute. Splitting on
  // tag boundaries and only transforming text segments is the safe move.
  const segments = processed.split(/(<[^>]+>)/g);
  for (let i = 0; i < segments.length; i++) {
    // Even indices are text between tags; odd indices are the tags themselves.
    if (i % 2 !== 0) continue;
    segments[i] = segments[i].replace(CITATION_BRACKET_RE, (_full, nStr: string) => {
      const n = nStr;
      // The manifest is keyed by the full display label ("3" or "3.2", ADR-0006),
      // so a sub-citation resolves directly. Fall back to the base ("3.2"→"3")
      // for safety if only the document-level key is present.
      const entry =
        manifest && manifest.manifest
          ? manifest.manifest[n] ?? manifest.manifest[n.split('.')[0]]
          : undefined;
      const name = entry?.source_name || '';
      const token = entry?.token || '';
      const sType = entry?.source_type || '';
      const url = entry?.source_url || '';
      const sourceId = entry?.source_id || '';
      const matchKind = entry?.match_kind || '';
      const excerpt = entry?.excerpt || '';
      // Exact per-claim span (span-level grounding). Falls back to excerpt so
      // older manifests without cited_text still show a meaningful preview.
      const citedText = entry?.cited_text || excerpt || '';
      const supportStatus =
        entry?.support_status === 'supported' ||
        entry?.support_status === 'partial' ||
        entry?.support_status === 'unsupported'
          ? entry.support_status
          : entry?.grounding === 'none'
            ? 'unsupported'
            : null;
      // Span provenance: how the supporting span was located (native exact vs
      // heuristic approximate vs none). Drives the provenance badge (G5).
      const grounding =
        entry?.grounding === 'native' ||
        entry?.grounding === 'heuristic' ||
        entry?.grounding === 'none'
          ? entry.grounding
          : '';
      // Advisory char offsets for the cited span (G3 highlight precision).
      const charStart =
        typeof entry?.char_start === 'number' && Number.isFinite(entry.char_start)
          ? String(entry.char_start)
          : '';
      const charEnd =
        typeof entry?.char_end === 'number' && Number.isFinite(entry.char_end)
          ? String(entry.char_end)
          : '';
      const relevance =
        typeof entry?.relevance === 'number' && Number.isFinite(entry.relevance)
          ? String(entry.relevance)
          : '';
      // Provenance drives the subtle chip color-coding (web vs direct record
      // vs semantic match). Web wins when a URL is present.
      const provenance = url
        ? 'web'
        : matchKind === 'exact'
          ? 'exact'
          : matchKind
            ? 'semantic'
            : '';
      // Show the URL in the tooltip when present so the user can preview
      // where the chip points without opening it. Falls back to the source
      // name / type if there's no URL (workspace records).
      const tip = url || name || sType || '';
      // Screen-reader label so the chip announces its citation context.
      const ariaLabel = `Citation ${n}${name ? `: ${name}` : ''}`;
      // Shared data-* payload — read by the renderer's click + hover delegation.
      const dataAttrs =
        `data-cite-n="${escapeHtmlAttr(n)}" `
        + `data-cite-label="${escapeHtmlAttr(n)}" `
        + (token ? `data-cite-token="${escapeHtmlAttr(token)}" ` : '')
        + (sType ? `data-cite-type="${escapeHtmlAttr(sType)}" ` : '')
        + (name ? `data-cite-name="${escapeHtmlAttr(name)}" ` : '')
        + (sourceId ? `data-cite-id="${escapeHtmlAttr(sourceId)}" ` : '')
        + (matchKind ? `data-cite-match="${escapeHtmlAttr(matchKind)}" ` : '')
        + (relevance ? `data-cite-relevance="${escapeHtmlAttr(relevance)}" ` : '')
        + (excerpt ? `data-cite-excerpt="${escapeHtmlAttr(excerpt.slice(0, 500))}" ` : '')
        + (citedText ? `data-cite-snippet="${escapeHtmlAttr(citedText.slice(0, 500))}" ` : '')
        + (supportStatus != null ? `data-cite-support="${escapeHtmlAttr(supportStatus)}" ` : '')
        + (grounding ? `data-cite-grounding="${escapeHtmlAttr(grounding)}" ` : '')
        + (charStart ? `data-cite-char-start="${escapeHtmlAttr(charStart)}" ` : '')
        + (charEnd ? `data-cite-char-end="${escapeHtmlAttr(charEnd)}" ` : '')
        + (provenance ? `data-cite-provenance="${escapeHtmlAttr(provenance)}" ` : '');
      // External URL → render as a real anchor so clicking the chip opens
      // the source in a new tab. No URL → styleable <sup> chip; its click +
      // hover behavior is wired by the renderer container via delegation.
      if (url && /^https?:\/\//i.test(url)) {
        return (
          `<a class="notes9-cite notes9-cite--link" `
          + `href="${escapeHtmlAttr(url)}" `
          + `target="_blank" rel="noopener noreferrer" `
          + dataAttrs
          + `data-cite-url="${escapeHtmlAttr(url)}" `
          + `aria-label="${escapeHtmlAttr(ariaLabel)}" `
          + `title="${escapeHtmlAttr(tip)}"`
          + `>${n}</a>`
        );
      }
      return (
        `<sup class="notes9-cite" `
        + `role="button" tabindex="0" `
        + `aria-label="${escapeHtmlAttr(ariaLabel)}" `
        + dataAttrs
        + (tip ? `title="${escapeHtmlAttr(tip)}"` : '')
        + `>${n}</sup>`
      );
    });
  }
  processed = segments.join('');
  return processed;
}

/** Hover preview card anchored to a citation chip. */
function CitationHoverCard({
  chip,
  anchor,
  containerRect,
  onMouseEnter,
  onMouseLeave,
  onViewSource,
}: {
  chip: ChipData;
  anchor: DOMRect;
  containerRect: DOMRect;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onViewSource?: () => void;
}) {
  // Position relative to the renderer container (which is `relative`).
  const top = anchor.bottom - containerRect.top + 6;
  const rawLeft = anchor.left - containerRect.left + anchor.width / 2;
  const left = Math.max(8, Math.min(rawLeft, containerRect.width - 8));
  // Prefer the exact per-claim span; fall back to the document excerpt.
  const snippetSource = chip.citedText || chip.excerpt;
  const excerpt =
    snippetSource.length > 180 ? `${snippetSource.slice(0, 179)}…` : snippetSource;

  // Extract Author et al and Year from sourceName if it matches typical formats
  // e.g., "Smith et al. (2023) - Something" or "Smith et al., 2023"
  let authorYearMatch = null;
  let displayTitle = chip.sourceName;
  if (chip.sourceType === 'literature_review' || chip.provenance === 'web') {
    const match = chip.sourceName.match(/^([A-Za-z\s]+(?:et al\.?))\s*\(?(\d{4})\)?\s*[-:]?\s*(.*)$/i);
    if (match) {
      authorYearMatch = `${match[1].trim()}, ${match[2]}`;
      displayTitle = match[3].trim() || displayTitle;
    }
  }

  return (
    <div
      className={cn(
        'absolute z-50 w-72 -translate-x-1/2 rounded-lg border border-border bg-popover p-2.5 text-popover-foreground shadow-lg',
        'animate-in fade-in-0 zoom-in-95 duration-150'
      )}
      style={{ top, left }}
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {chip.sourceType ? chip.sourceType.replace(/_/g, ' ') : 'Source'}
        </span>
        {authorYearMatch && (
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-2xs font-medium border border-primary/20">
            {authorYearMatch}
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
        <span>{provenanceLabel(chip)}</span>
        {(chip.citedText || chip.excerpt) && onViewSource && (
          <button
            type="button"
            onClick={onViewSource}
            className="rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View source
          </button>
        )}
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
/* ─── References footer ─────────────────────────────────────────────────────
 * Builds a Nature-style numbered reference list from the CitationsManifest so
 * readers see the full bibliography at the end of each response, not only the
 * inline superscript chips.                                                  */

function ReferencesFooter({
  manifest,
}: {
  manifest: CitationsManifest;
}) {
  const entries = Object.entries(manifest.manifest);
  if (entries.length === 0) return null;

  // Sort by numeric label so the list is stable: "1", "2", "3.1", "3.2", …
  const sorted = entries.sort(([a], [b]) => {
    const aN = parseFloat(a);
    const bN = parseFloat(b);
    if (!Number.isNaN(aN) && !Number.isNaN(bN)) return aN - bN;
    return a.localeCompare(b);
  });

  return (
    <div className="mt-8 border-t border-border/40 pt-4">
      <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        References
      </p>
      <ol className="space-y-1.5 list-none m-0 p-0">
        {sorted.map(([label, entry]) => {
          const name = entry.source_name || '';
          const url = entry.source_url || '';
          const sType = entry.source_type?.replace(/_/g, ' ') || '';
          const isWeb = url && /^https?:\/\//i.test(url);
          let domain = '';
          if (isWeb) {
            try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
          }

          return (
            <li key={label} className="flex items-baseline gap-2 text-sm leading-snug">
              <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                [{label}]
              </span>
              <span className="min-w-0">
                {isWeb ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-words"
                  >
                    {name || domain || url}
                  </a>
                ) : (
                  <span className="text-foreground/90 break-words">{name || `Source ${label}`}</span>
                )}
                {sType && (
                  <span className="ml-1.5 text-muted-foreground/60 capitalize">
                    ({sType})
                  </span>
                )}
                {isWeb && domain && name && (
                  <span className="ml-1.5 text-muted-foreground/50 text-xs">
                    {domain}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function MarkdownRenderer({
  content,
  className,
  showCursor = false,
  citationsManifest,
}: MarkdownRendererProps) {
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

  const html = useMemo(() => {
    const raw = markdownToHtml(content);
    if (!raw) return '';
    // `marked` v15+ ships without a built-in sanitizer, so raw HTML inside the
    // model's markdown response (e.g. <script>, <iframe>, onerror handlers
    // smuggled in via a malicious literature abstract or RAG chunk) would
    // execute verbatim under the user's session. Run DOMPurify before the
    // dangerouslySetInnerHTML sink. sanitizeHtml is a no-op on SSR; the
    // client useMemo re-runs on hydration so the live render is always safe.
    const processed = postProcessHtml(raw, citationsManifest);
    return sanitizeHtml(processed);
  }, [content, citationsManifest]);

  /** Open the source a chip points at: web → new tab; workspace → highlight
   * deep-link via dispatchDocumentHighlight (no fragile title lookup — the
   * manifest now carries source_id). */
  const openChip = useCallback((chip: ChipData) => {
    if (chip.sourceUrl && /^https?:\/\//i.test(chip.sourceUrl)) {
      window.open(chip.sourceUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!chip.sourceId) return;
    // Prefer the exact per-claim span so [3.1] and [3.2] (same document,
    // different cited_text) scroll to and highlight DIFFERENT sentences.
    const spanText = chip.citedText || chip.excerpt;
    const target: HighlightTarget = {
      sourceType: normalizeAgentSourceType(chip.sourceType),
      sourceId: chip.sourceId,
      excerpt: spanText,
      contentSurface:
        normalizeAgentSourceType(chip.sourceType) === 'literature_review' ? 'abstract' : null,
    };
    // Prefer in-app highlight dispatch (same-page doc viewers listen for it).
    if (spanText && dispatchDocumentHighlight(target)) return;
    const href = spanText
      ? buildHighlightUrl(target) || workspaceRoute(chip.sourceType, chip.sourceId)
      : workspaceRoute(chip.sourceType, chip.sourceId);
    if (href) window.location.assign(href);
  }, []);

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
      // When we have a supporting span/excerpt, open the source viewer so the
      // user can read the exact passage highlighted in context (G3). Otherwise
      // fall back to the legacy deep-link navigation.
      if (chip.citedText || chip.excerpt) {
        openViewer(chip);
      } else {
        openChip(chip);
      }
    },
    [openChip, openViewer]
  );

  const onMouseOver = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const chipEl = (e.target as HTMLElement).closest<HTMLElement>('.notes9-cite');
      if (!chipEl) {
        // Not over a chip: defer dismissal so the pointer can reach the card.
        scheduleHoverClose();
        return;
      }
      cancelHoverClose();
      setHover({ chip: readChipData(chipEl), anchor: chipEl.getBoundingClientRect() });
    },
    [cancelHoverClose, scheduleHoverClose]
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
      if (chip.citedText || chip.excerpt) {
        openViewer(chip);
      } else {
        openChip(chip);
      }
    },
    [openChip, openViewer]
  );

  // Clear the preview when the content changes (e.g. live streaming updates).
  useEffect(() => {
    setHover(null);
  }, [html]);

  // Leak-free: drop any pending dismiss timer on unmount.
  useEffect(() => () => cancelHoverClose(), [cancelHoverClose]);

  if (!html) return null;

  return (
    <div className={cn('relative min-w-0', hasManifest && 'min-w-0')}>
      <div
        ref={containerRef}
        className={cn(
          'prose dark:prose-invert max-w-none html-content text-[17px] leading-[1.7] text-foreground overflow-x-hidden break-words',
          '[&_p]:mb-6 first:[&_p]:mt-0 last:[&_p]:mb-0',
          '[&_h1]:!text-3xl [&_h1]:!font-semibold [&_h1]:!leading-snug [&_h1]:!mt-10 [&_h1]:!mb-6 first:[&_h1]:!mt-0',
          '[&_h2]:!text-2xl [&_h2]:!font-semibold [&_h2]:!leading-snug [&_h2]:!mt-10 [&_h2]:!mb-6 first:[&_h2]:!mt-0',
          '[&_h3]:!text-xl [&_h3]:!font-semibold [&_h3]:!leading-snug [&_h3]:!mt-8 [&_h3]:!mb-4',
          '[&_h4]:!text-lg [&_h4]:!font-medium [&_h4]:!text-muted-foreground [&_h4]:mt-8 [&_h4]:mb-4',
          '[&_pre]:overflow-x-auto [&_pre]:max-w-full',
          '[&_a]:break-words [&_a]:overflow-wrap-anywhere',
          '[&_table]:table-fixed [&_table]:w-full',
          '[&_p]:break-words [&_p]:overflow-wrap-anywhere',
          showCursor && 'notes9-md--streaming',
          className
        )}
        style={PROSE_CSS_VARS}
        onClick={hasManifest ? onClick : undefined}
        onMouseOver={hasManifest ? onMouseOver : undefined}
        onMouseLeave={hasManifest ? scheduleHoverClose : undefined}
        onScroll={hasManifest ? onScroll : undefined}
        onKeyDown={hasManifest ? onKeyDown : undefined}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {/* Numbered references footer when citations manifest is available */}
      {hasManifest && citationsManifest && !showCursor && (
        <ReferencesFooter manifest={citationsManifest} />
      )}
      {hover && containerRef.current && (
        <CitationHoverCard
          chip={hover.chip}
          anchor={hover.anchor}
          containerRect={containerRef.current.getBoundingClientRect()}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
          onViewSource={() => openViewer(hover.chip)}
        />
      )}
      <CitationSourceViewer
        source={viewerSource}
        open={viewerSource !== null}
        onOpenChange={(o) => {
          if (!o) setViewerSource(null);
        }}
      />
    </div>
  );
}
