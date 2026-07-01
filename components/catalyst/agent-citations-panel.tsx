'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Streamdown } from 'streamdown';
import { BookOpen, Calendar, ChevronDown, FolderOpen, Globe, MapPin, ScanSearch, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { createClient } from '@/lib/supabase/client';
import { useSourceNavigation } from '@/hooks/use-source-navigation';
import { cn } from '@/lib/utils';
import {
  buildHighlightTargetFromResource,
  buildHighlightUrl,
  buildHighlightUrlFromResource,
  coalesceAgentExcerpt,
  coalesceAgentSourceId,
  coalesceAgentSourceIdForType,
  dispatchDocumentHighlight,
  normalizeAgentRelevance0to1,
  normalizeAgentSourceType,
  sourceTypeLabel,
  type HighlightTarget,
} from '@/lib/document-highlight';
import type { GroundingResource, RagChunk } from '@/lib/agent-stream-types';
import { parseCitationMeta, correctAcademicType } from '@/lib/citation-meta';
import { resolveTitleFromId, isPlaceholderTitle, coalesceCitationTitle } from '@/lib/citation-title';
import { GroundingProvenanceBadge } from './grounding-provenance-badge';
import {
  CitationSourceViewer,
  type CitationSourceViewerSource,
} from './citation-source-viewer';

const EXCERPT_PREVIEW = 320;

/** Opens the span-level source viewer for a citation item (G3). Provided by
 * AgentCitationsPanel; null when no opener is wired (e.g. single-item render). */
const CitationViewerContext = createContext<
  ((item: AgentCitationPanelItem) => void) | null
>(null);

/** Project a panel item into the source-viewer's source shape. */
function panelItemToViewerSource(
  item: AgentCitationPanelItem,
): CitationSourceViewerSource {
  return {
    label: item.citeLabel,
    sourceType: item.sourceType,
    sourceId: item.sourceId ?? null,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    sourceBody: null,
    excerpt: item.excerpt || null,
    citedText: item.citedText ?? null,
    charStart: item.charStart ?? null,
    charEnd: item.charEnd ?? null,
    documentHref: item.documentHref,
    grounding: item.grounding ?? null,
    matchKind: item.matchKind ?? null,
    supportStatus: item.supportStatus ?? null,
  };
}

/** Small "View source" affordance that opens the span viewer (G3). Renders
 * nothing when there's no opener in context or no text to show. */
function ViewSourceButton({
  item,
  className,
}: {
  item: AgentCitationPanelItem;
  className?: string;
}) {
  const open = useContext(CitationViewerContext);
  if (!open || !(item.citedText || item.excerpt)) return null;
  return (
    <button
      type="button"
      onClick={() => open(item)}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm text-2xs font-medium text-primary/80 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <ScanSearch className="size-3 shrink-0" aria-hidden />
      View source
    </button>
  );
}
const sourceIdFallbackCache = new Map<string, string | null>();

/** Derive the grounding verdict from the wire fields. `support_status` wins;
 * `grounding === 'none'` degrades to 'unsupported'. Returns null → no badge. */
function deriveSupportStatus(
  c: Pick<GroundingResource, 'support_status' | 'grounding'>,
): 'supported' | 'partial' | 'unsupported' | null {
  const s = c.support_status;
  if (s === 'supported' || s === 'partial' || s === 'unsupported') return s;
  if (c.grounding === 'none') return 'unsupported';
  return null;
}

/** Subtle grounding signal — confidence cues, NOT correctness verdicts. */
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
  status: 'supported' | 'partial' | 'unsupported' | null | undefined;
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
      title={b.label}
    >
      <span aria-hidden className="leading-none">
        {b.symbol}
      </span>
      {b.label}
    </span>
  );
}

function getCitationRoute(citation: { source_type: string; source_id?: string | null }): string {
  const id =
    coalesceAgentSourceId(citation as unknown as Record<string, unknown>) ??
    (citation.source_id != null ? String(citation.source_id).trim() : '');
  if (!id) return '';
  switch (normalizeAgentSourceType(citation.source_type)) {
    case 'literature_review':
      return `/literature-reviews/${id}`;
    case 'protocol':
      return `/protocols/${id}`;
    case 'project':
      return `/projects/${id}`;
    case 'experiment':
      return `/experiments/${id}`;
    case 'lab_note':
      return `/lab-notes/${id}`;
    case 'report':
      return `/reports/${id}`;
    case 'sample':
      return `/samples/${id}`;
    case 'equipment':
      return `/equipment/${id}`;
    default:
      // Source types without a dedicated detail page (e.g. data_file,
      // cat_bio_synthesis) intentionally return '' so the caller renders the
      // citation as plain text rather than linking to a non-existent route.
      return '';
  }
}

function lookupNameForSourceType(sourceType: string, rawLabel: string | null | undefined): string | null {
  const label = rawLabel?.trim();
  if (!label) return null;
  switch (normalizeAgentSourceType(sourceType)) {
    case 'literature_review':
      return label.replace(/^literature(?:\s+review)?\s*[:\u00b7-]\s*/i, '').trim();
    case 'lab_note':
      return label.replace(/^lab\s+note\s*[:\u00b7-]\s*/i, '').trim();
    case 'protocol':
      return label.replace(/^protocol\s*[:\u00b7-]\s*/i, '').trim();
    case 'experiment':
      return label.replace(/^experiment\s*[:\u00b7-]\s*/i, '').trim();
    case 'project':
      return label.replace(/^project\s*[:\u00b7-]\s*/i, '').trim();
    default:
      return label;
  }
}

async function resolveSourceIdFromName(
  sourceType: string,
  sourceName: string | null | undefined,
): Promise<string | null> {
  const normalizedType = normalizeAgentSourceType(sourceType);
  const lookupName = lookupNameForSourceType(normalizedType, sourceName);
  if (!lookupName) return null;
  const cacheKey = `${normalizedType}|${lookupName.toLowerCase()}`;
  if (sourceIdFallbackCache.has(cacheKey)) {
    return sourceIdFallbackCache.get(cacheKey) ?? null;
  }

  const supabase = createClient();
  let table = '';
  let column = '';
  switch (normalizedType) {
    case 'literature_review':
      table = 'literature_reviews';
      column = 'title';
      break;
    case 'lab_note':
      table = 'lab_notes';
      column = 'title';
      break;
    case 'protocol':
      table = 'protocols';
      column = 'name';
      break;
    case 'experiment':
      table = 'experiments';
      column = 'name';
      break;
    case 'project':
      table = 'projects';
      column = 'name';
      break;
    default:
      return null;
  }

  const { data, error } = await supabase
    .from(table)
    .select('id')
    .ilike(column, lookupName)
    .limit(1);

  const resolvedId =
    !error &&
    Array.isArray(data) &&
    data.length > 0 &&
    typeof data[0]?.id === 'string' &&
    data[0].id.trim() !== ''
      ? data[0].id
      : null;

  sourceIdFallbackCache.set(cacheKey, resolvedId);
  return resolvedId;
}

export type AgentCitationPanelItem = {
  index: number;
  /** Full display label from the manifest (e.g. "3" or the hierarchical
   * "3.2"). Drives the prose-matching `[label]` shown in the panel. Falls back
   * to `String(index)` when the backend sent no cite_label. */
  citeLabel: string;
  title: string;
  sourceType: string;
  sourceTypeLabel: string;
  sourceId: string | null;
  sourceName: string | null;
  resultRank?: number | null;
  chunkId?: string | null;
  pageNumber?: number | null;
  contentSurface?: 'abstract' | 'pdf' | null;
  relevance?: number;
  /** Provenance: 'exact' records are direct fetches/SQL rows (no similarity
   * score → no "% match" label); 'semantic' carries a real relevance score. */
  matchKind?: string | null;
  excerpt: string;
  /** Exact per-claim supporting span (span-level grounding). Preferred over
   * `excerpt` for the source-viewer highlight. */
  citedText?: string | null;
  /** Advisory char offsets into the stripped source for the cited span. */
  charStart?: number | null;
  charEnd?: number | null;
  /** How the span was located (native exact / heuristic approx / none). Drives
   * the provenance badge (G5). */
  grounding?: 'native' | 'heuristic' | 'none' | null;
  /** Grounding verdict for this specific claim↔span pairing. Drives the
   * subtle support badge. null/undefined → no badge. */
  supportStatus?: 'supported' | 'partial' | 'unsupported' | null;
  documentHref: string | null;
  highlightTarget: HighlightTarget | null;
  highlightHref: string | null;
  /** External URL for web citations (or signed PDF URL for some lit refs).
   * When set, used as the chip's `titleHref` instead of the internal
   * `documentHref` so clicking opens the actual source. */
  sourceUrl: string | null;
  /** Other inline labels that resolve to the SAME underlying source — e.g. one
   * paper surfaced via both PubMed and PMC. Populated by the panel's
   * same-source dedupe so a single row stands in for every [N] that cited it. */
  aliasLabels?: string[];
};

function fingerprintCitationItem(item: AgentCitationPanelItem): string {
  const ex = item.excerpt.slice(0, 200);
  return `${item.highlightHref ?? ''}|${item.documentHref ?? ''}|${ex}`;
}

function useResolvedCitationItem(
  item: AgentCitationPanelItem,
): AgentCitationPanelItem & { isResolving: boolean } {
  const [resolvedSourceId, setResolvedSourceId] = useState<string | null>(item.sourceId);
  // True only while we're waiting on the title-lookup fallback. When the
  // manifest/resource already carries source_id (the common case now that the
  // backend sends it on the wire) we never enter the resolving state.
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Prefer source_id straight from the manifest/resource — no Supabase query.
    if (item.sourceId) {
      setResolvedSourceId(item.sourceId);
      setIsResolving(false);
      return () => {
        cancelled = true;
      };
    }
    if (!item.sourceName) {
      setResolvedSourceId(null);
      setIsResolving(false);
      return () => {
        cancelled = true;
      };
    }

    // Only here — when source_id is truly absent — do we fall back to the
    // by-title `.ilike()` lookup.
    setIsResolving(true);
    resolveSourceIdFromName(item.sourceType, item.sourceName).then((id) => {
      if (!cancelled) {
        setResolvedSourceId(id);
        setIsResolving(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [item.sourceId, item.sourceName, item.sourceType]);

  // Resolve the real document title when the citation arrived with a missing or
  // placeholder one ("Untitled literature"), so the reference shows the article.
  const [resolvedTitle, setResolvedTitle] = useState<string | null>(null);
  const titleSourceId = item.sourceId ?? resolvedSourceId;
  useEffect(() => {
    let cancelled = false;
    const canResolve = !!(titleSourceId || item.sourceUrl);
    if (!canResolve || !isPlaceholderTitle(item.title, item.sourceType)) {
      setResolvedTitle(null);
      return () => {
        cancelled = true;
      };
    }
    resolveTitleFromId(item.sourceType, titleSourceId, item.sourceUrl).then((t) => {
      if (!cancelled) setResolvedTitle(t);
    });
    return () => {
      cancelled = true;
    };
  }, [titleSourceId, item.sourceUrl, item.title, item.sourceType]);

  const sourceId = item.sourceId ?? resolvedSourceId;
  const fallbackHighlightTarget =
    !item.highlightTarget && sourceId && item.excerpt.trim()
      ? {
          sourceType: item.sourceType,
          sourceId,
          excerpt: item.excerpt,
          chunkId: item.chunkId ?? null,
          pageNumber: item.pageNumber ?? null,
          contentSurface:
            item.contentSurface ??
            (item.sourceType === 'literature_review' ? 'abstract' : null),
        }
      : null;
  const highlightTarget = item.highlightTarget ?? fallbackHighlightTarget;
  const documentHref =
    item.documentHref ??
    (sourceId
      ? getCitationRoute({ source_type: item.sourceType, source_id: sourceId }) || null
      : null);
  const highlightHref =
    item.highlightHref ??
    (highlightTarget ? buildHighlightUrl(highlightTarget) : null);

  const finalTitle = resolvedTitle?.trim() || item.title;
  return {
    ...item,
    title: finalTitle,
    sourceName: resolvedTitle?.trim() || item.sourceName,
    sourceId,
    highlightTarget,
    documentHref,
    highlightHref,
    isResolving,
  };
}

/**
 * Filter out SQL/workspace citations that aren't useful for scientists.
 */
function shouldShowCitation(item: AgentCitationPanelItem): boolean {
  // Show EVERY grounded source the backend returned — including workspace /
  // sql-derived records (samples, reports, data files, experiments, lab notes).
  // The previous version dropped entire `sql`/`workspace` source-type families,
  // which silently shrank the panel and was a primary cause of the
  // "citations not showing the full list" complaint.
  //
  // The only things dropped are truly empty placeholders: no title, no excerpt,
  // and no source id to link to.
  const title = item.title?.trim().toLowerCase() ?? '';
  const hasTitle = title.length > 0 && title !== 'workspace data';
  const hasExcerpt = !!item.excerpt && item.excerpt.trim().length > 0;
  const hasId = !!item.sourceId;
  return hasTitle || hasExcerpt || hasId;
}

/**
 * Final `resources` from the done event plus streaming RAG chunks, deduped so
 * chunks stay clickable when the API omits fields on `resources` only.
 * Filters out SQL/workspace citations.
 */
export function mergeGroundingAndRagItems(
  resources: GroundingResource[],
  ragChunks: RagChunk[] | null | undefined,
): AgentCitationPanelItem[] {
  // Preserve each item's backend-assigned display index (groundingResource-
  // ToPanelItem set it from the resource's position, which matches the inline
  // [N] markers and the citations manifest). Do NOT re-number after filtering —
  // that misaligned panel rows from the [N] chips in the answer text.
  const base = resources.map((c, i) => groundingResourceToPanelItem(c, i)).filter(shouldShowCitation);
  if (!ragChunks?.length) {
    return base;
  }
  const seen = new Set(base.map(fingerprintCitationItem));
  const extras: AgentCitationPanelItem[] = [];
  for (const ch of ragChunks) {
    const item = ragChunkToPanelItem(ch, base.length + extras.length);
    if (!shouldShowCitation(item)) {
      continue; // Skip SQL citations
    }
    const fp = fingerprintCitationItem(item);
    if (!seen.has(fp)) {
      seen.add(fp);
      extras.push(item);
    }
  }
  // Keep backend indices on `base`; RAG `extras` were numbered after base.
  return [...base, ...extras];
}

/** Part-wise numeric sort key for a cite_label like "3" or "3.10".
 * Returns NaN for non-numeric labels so callers can fall back to position. */
function citeLabelSortKey(label: string): number {
  const [major, minor] = label.split('.');
  const m = Number(major);
  const s = Number(minor);
  if (!Number.isFinite(m)) return NaN;
  return m + (Number.isFinite(s) ? s / 10000 : 0);
}

export function groundingResourceToPanelItem(
  c: GroundingResource,
  index: number,
): AgentCitationPanelItem {
  const row = c as unknown as Record<string, unknown>;
  // External URL: actual article link for web/paper citations.
  const sourceUrl = typeof c.source_url === 'string' && c.source_url.trim()
    ? c.source_url.trim()
    : null;
  const resultRank = Number.isFinite(c.result_rank) ? c.result_rank : null;
  // Correct backend mislabels (e.g. a paper tagged as a lab note) when the URL
  // is clearly an academic publisher/aggregator.
  const sourceType = correctAcademicType(normalizeAgentSourceType(c.source_type), sourceUrl);
  // Type-aware id so semantic/approx matches on a project/experiment resolve to
  // the parent record's page (not a chunk's generic id, which 404s).
  const sourceId = coalesceAgentSourceIdForType(row, sourceType);
  // Pick the real title from whichever field the backend used, skipping
  // "Untitled …" placeholders (the by-id lookup in useResolvedCitationItem is
  // the final fallback when every field is a placeholder).
  const titleField = coalesceCitationTitle(row, sourceType);
  const sourceName =
    titleField ?? lookupNameForSourceType(sourceType, c.display_label) ?? null;
  const title = titleField ?? c.source_type.replace(/_/g, ' ');
  const highlightTarget = buildHighlightTargetFromResource(c);
  const highlightHref = buildHighlightUrlFromResource(c);
  const documentHref =
    getCitationRoute({ source_type: sourceType, source_id: sourceId ?? c.source_id }) || null;
  const excerpt = coalesceAgentExcerpt(row) ?? (c.excerpt ?? '').trim();
  const relevance =
    typeof c.relevance === 'number' ? normalizeAgentRelevance0to1(c.relevance) : undefined;
  // Number from the backend-assigned cite_label when present so the panel row
  // matches the inline `[N]`/`[3.2]` marker exactly (ADR-0006). Fall back to
  // the array position only when no label was sent.
  const citeLabelRaw =
    typeof c.cite_label === 'string' && c.cite_label.trim() ? c.cite_label.trim() : '';
  const citeLabel = citeLabelRaw || String(index + 1);
  // Sort key: part-wise numeric ("3.10" must sort after "3.2"). A plain
  // parseFloat collides — parseFloat("3.10") === parseFloat("3.1") === 3.1.
  // Fall back to array position when the label is non-numeric.
  const labelNumeric = citeLabelSortKey(citeLabel);
  return {
    index: Number.isFinite(labelNumeric) ? labelNumeric : index + 1,
    citeLabel,
    title,
    sourceType,
    sourceTypeLabel: sourceTypeLabel(sourceType),
    sourceId,
    sourceName,
    chunkId: c.chunk_id ?? null,
    pageNumber: c.page_number ?? null,
    contentSurface: c.content_surface === 'abstract' || c.content_surface === 'pdf'
      ? c.content_surface
      : null,
    relevance,
    matchKind: typeof c.match_kind === 'string' ? c.match_kind : null,
    excerpt,
    citedText: typeof c.cited_text === 'string' ? c.cited_text : null,
    charStart: typeof c.char_start === 'number' ? c.char_start : null,
    charEnd: typeof c.char_end === 'number' ? c.char_end : null,
    grounding:
      c.grounding === 'native' || c.grounding === 'heuristic' || c.grounding === 'none'
        ? c.grounding
        : null,
    supportStatus: deriveSupportStatus(c),
    documentHref,
    highlightTarget,
    highlightHref,
    resultRank,
    sourceUrl,
  };
}

export function ragChunkToPanelItem(chunk: RagChunk, i: number): AgentCitationPanelItem {
  const row = chunk as unknown as Record<string, unknown>;
  const sourceType = normalizeAgentSourceType(chunk.source_type);
  const sourceId = coalesceAgentSourceIdForType(row, sourceType);
  const titleField = coalesceCitationTitle(row, sourceType);
  const sourceName = titleField ?? null;
  const title = titleField ?? chunk.source_type.replace(/_/g, ' ');
  const highlightTarget = buildHighlightTargetFromResource(chunk);
  const highlightHref = buildHighlightUrlFromResource(chunk);
  const documentHref =
    getCitationRoute({ source_type: sourceType, source_id: sourceId ?? chunk.source_id }) ||
    null;
  // A RagChunk's supporting passage lives on `excerpt`. Don't route through
  // coalesceAgentExcerpt — it now prefers `cited_text`, a field a RagChunk
  // doesn't legitimately carry, so read the chunk's own field directly.
  const excerpt = chunk.excerpt?.trim() ?? '';
  const relevance =
    typeof chunk.relevance === 'number' && Number.isFinite(chunk.relevance)
      ? normalizeAgentRelevance0to1(chunk.relevance)
      : undefined;
  const chunkRow = chunk as { source_url?: string | null };
  const sourceUrl =
    typeof chunkRow.source_url === 'string' && chunkRow.source_url.trim()
      ? chunkRow.source_url.trim()
      : null;
  return {
    index: i + 1,
    citeLabel: String(i + 1),
    title,
    sourceType,
    sourceTypeLabel: sourceTypeLabel(chunk.source_type),
    sourceId,
    sourceName,
    chunkId: chunk.chunk_id ?? null,
    pageNumber: chunk.page_number ?? null,
    contentSurface: chunk.content_surface === 'abstract' || chunk.content_surface === 'pdf'
      ? chunk.content_surface
      : null,
    relevance,
    // RAG chunks are vector retrievals by definition → semantic.
    matchKind: 'semantic',
    excerpt,
    documentHref,
    highlightTarget,
    highlightHref,
    sourceUrl,
  };
}

/** Heuristic for an external URL. We treat anything that starts with
 * http(s):// as off-platform and route it through a plain anchor with
 * target="_blank"; everything else goes through Next's `<Link>` for
 * client-side navigation. Notes9-internal routes are relative paths
 * (`/lab-notes/<uuid>`) so this matches them correctly. */
function isExternalUrl(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function SmartCitationLink({
  href,
  highlightTarget,
  title,
  className,
  children,
}: {
  href: string;
  highlightTarget?: HighlightTarget | null;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  if (isExternalUrl(href)) {
    // External link — open in new tab, no SPA navigation, no highlight
    // dispatch (which only makes sense for in-app document anchors).
    return (
      <a
        href={href}
        title={title}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }
  return (
    <Link
      href={href}
      title={title}
      className={className}
      onClick={(event) => {
        if (!highlightTarget) return;
        if (dispatchDocumentHighlight(highlightTarget)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </Link>
  );
}

function RetrievedTextBlock({
  item,
  excerptPreview,
  excerptLinkHref,
  listClassName,
  skipTopMargin,
}: {
  item: AgentCitationPanelItem;
  excerptPreview: string;
  excerptLinkHref: string | null;
  listClassName?: string;
  /** When the parent already uses flex `gap-*`, omit extra top margin. */
  skipTopMargin?: boolean;
}) {
  // Honest label: a real per-claim grounded span (cited_text + grounding) is the
  // EXACT text the claim is tied to → "Cited passage". A generic preview (no
  // span — grounding fell through to the source body) stays "Retrieved text" so
  // we never imply a claim↔source link that grounding didn't actually establish.
  const isGroundedSpan = !!item.citedText && item.grounding !== 'none';
  const blockLabel = isGroundedSpan ? 'Cited passage' : 'Retrieved text';
  return (
    <div
      className={cn(
        'relative bg-muted/30 border border-border/50 rounded-lg p-3 mt-3',
        listClassName
      )}
    >
      {excerptLinkHref ? (
        <SmartCitationLink
          href={excerptLinkHref}
          highlightTarget={item.highlightTarget}
          title="Open source document and scroll to this passage"
          className="group block transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-1 h-3 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
            <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-primary transition-colors">
              {blockLabel}
            </p>
          </div>
          <span className="flex items-start gap-2 text-xs leading-relaxed text-foreground/90 group-hover:text-foreground">
            {item.highlightHref && (
              <MapPin className="size-3.5 mt-0.5 shrink-0 text-primary/70 group-hover:text-primary transition-colors" aria-hidden />
            )}
            <span className="italic">
              “<Streamdown parseIncompleteMarkdown={false} components={{ p: 'span' }}>{excerptPreview}</Streamdown>”
            </span>
          </span>
        </SmartCitationLink>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-1 h-3 rounded-full bg-muted-foreground/40" />
            <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              {blockLabel}
            </p>
          </div>
          <div className="text-xs leading-relaxed text-foreground/80 italic pl-3">
            “<Streamdown parseIncompleteMarkdown={false} components={{ p: 'span' }}>{excerptPreview}</Streamdown>”
          </div>
        </>
      )}
    </div>
  );
}

/** Author + year chips parsed (best-effort) from a paper/web title. The wire
 * format carries no structured author/year fields, so these only appear when
 * the title contains them. */
function CiteMeta({ author, year }: { author: string | null; year: string | null }) {
  if (!author && !year) return null;
  return (
    <>
      {author && (
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary">
          <User className="size-2.5 shrink-0" aria-hidden />
          {author}
        </span>
      )}
      {year && (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">
          <Calendar className="size-2.5 shrink-0" aria-hidden />
          {year}
        </span>
      )}
    </>
  );
}

/** Provenance kind metadata — drives the per-row "Internal / Paper / Web" tag so
 * the source's origin is unmistakable even outside the grouped sections. */
const PROVENANCE_META: Record<
  CitationGroupKey,
  { label: string; Icon: typeof Globe; className: string }
> = {
  workspace: {
    label: 'Internal',
    Icon: FolderOpen,
    className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  },
  papers: {
    label: 'Paper',
    Icon: BookOpen,
    className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
  web: {
    label: 'Web',
    Icon: Globe,
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
};

function ProvenanceTag({
  item,
  className,
}: {
  item: AgentCitationPanelItem;
  className?: string;
}) {
  const meta = PROVENANCE_META[citationGroup(item)];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-medium',
        meta.className,
        className,
      )}
    >
      <meta.Icon className="size-3 shrink-0" aria-hidden />
      {meta.label}
    </span>
  );
}

function CitationBlock({ item, isStreaming }: { item: AgentCitationPanelItem; isStreaming?: boolean }) {
  const resolvedItem = useResolvedCitationItem(item);
  // Prefer external sourceUrl (web pages, signed PDF links) → highlightHref
  // (deep-link into a doc viewer) → documentHref (internal route).
  // Without sourceUrl falling back, a `web` citation had no clickable title
  // because documentHref is null for off-platform sources.
  const titleHref =
    resolvedItem.sourceUrl || resolvedItem.highlightHref || resolvedItem.documentHref;
  const excerpt = resolvedItem.excerpt;
  const excerptPreview =
    excerpt.length > EXCERPT_PREVIEW ? `${excerpt.slice(0, EXCERPT_PREVIEW - 1)}…` : excerpt;

  const excerptLinkHref =
    resolvedItem.sourceUrl ||
    resolvedItem.highlightHref ||
    (resolvedItem.documentHref && excerpt ? resolvedItem.documentHref : null);

  // Show the bare URL beneath the title for external/web citations so the
  // user can see where the link will take them without hovering. Workspace
  // routes (/lab-notes/…) are intentionally NOT displayed — those go
  // through SPA navigation and the title alone reads better.
  const displayUrl = resolvedItem.sourceUrl;

  const isAcademic =
    resolvedItem.sourceType === 'literature_review' || citationGroup(resolvedItem) === 'web';
  const meta = parseCitationMeta(resolvedItem.title);
  const displayTitle = isAcademic ? meta.title : resolvedItem.title;

  return (
    <li
      className={cn(
        'px-3 py-2.5 text-sm',
        isStreaming && 'animate-in fade-in-0 slide-in-from-bottom-2 duration-300'
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-mono text-xs text-muted-foreground tabular-nums">[{resolvedItem.citeLabel}]</span>
        {resolvedItem.isResolving && (
          <span className="size-3 shrink-0 animate-spin self-center rounded-full border border-muted-foreground/40 border-t-transparent" aria-hidden />
        )}
        {isAcademic && <CiteMeta author={meta.author} year={meta.year} />}
        {titleHref ? (
          <SmartCitationLink
            href={titleHref}
            highlightTarget={resolvedItem.highlightTarget}
            className="min-w-0 flex-1 font-medium text-primary hover:underline inline-flex items-baseline gap-1"
          >
            {resolvedItem.highlightHref && (
              <MapPin className="size-3 shrink-0 self-center text-primary/70" aria-hidden />
            )}
            {displayTitle}
          </SmartCitationLink>
        ) : (
          <span className="min-w-0 flex-1 font-medium">{displayTitle}</span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <ProvenanceTag item={resolvedItem} />
        <p className="text-xs text-muted-foreground">
          {resolvedItem.sourceTypeLabel}
          {resolvedItem.matchKind === 'exact' ? (
            <span> · Direct record</span>
          ) : (
            resolvedItem.relevance != null &&
            resolvedItem.relevance >= 0 &&
            resolvedItem.relevance <= 1 && (
              <span> · {Math.round(resolvedItem.relevance * 100)}% match</span>
            )
          )}
        </p>
        <GroundingProvenanceBadge
          grounding={resolvedItem.grounding}
          matchKind={resolvedItem.matchKind}
          supportStatus={resolvedItem.supportStatus}
        />
        <SupportBadge status={resolvedItem.supportStatus} />
        <ViewSourceButton item={resolvedItem} className="ml-auto" />
      </div>
      {displayUrl && (
        <a
          href={displayUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 block truncate text-2xs text-primary/80 hover:text-primary hover:underline"
          title={displayUrl}
        >
          {displayUrl}
        </a>
      )}
      {excerpt && (
        <RetrievedTextBlock
          item={resolvedItem}
          excerptPreview={excerptPreview}
          excerptLinkHref={excerptLinkHref}
        />
      )}
    </li>
  );
}

/**
 * One sub-citation row under a parent document. Renders its own [3.1] label,
 * its own exact supporting span (`excerpt`, which already prefers cited_text),
 * its own support badge, and is independently clickable to its own highlight.
 */
function SubCitationRow({ item }: { item: AgentCitationPanelItem }) {
  const resolvedItem = useResolvedCitationItem(item);
  const excerpt = resolvedItem.excerpt;
  const excerptPreview =
    excerpt.length > EXCERPT_PREVIEW ? `${excerpt.slice(0, EXCERPT_PREVIEW - 1)}…` : excerpt;
  const excerptLinkHref =
    resolvedItem.sourceUrl ||
    resolvedItem.highlightHref ||
    (resolvedItem.documentHref && excerpt ? resolvedItem.documentHref : null);

  const labelEl = (
    <span className="font-mono text-xs text-muted-foreground tabular-nums">
      [{resolvedItem.citeLabel}]
    </span>
  );

  return (
    <li className="py-1.5">
      <div className="flex items-center gap-1.5">
        {labelEl}
        <GroundingProvenanceBadge
          grounding={resolvedItem.grounding}
          matchKind={resolvedItem.matchKind}
          supportStatus={resolvedItem.supportStatus}
        />
        <SupportBadge status={resolvedItem.supportStatus} />
        {resolvedItem.isResolving && (
          <span className="size-3 shrink-0 animate-spin self-center rounded-full border border-muted-foreground/40 border-t-transparent" aria-hidden />
        )}
        <ViewSourceButton item={resolvedItem} className="ml-auto" />
      </div>
      {excerpt &&
        (excerptLinkHref ? (
          <SmartCitationLink
            href={excerptLinkHref}
            highlightTarget={resolvedItem.highlightTarget}
            title="Open source document and scroll to this exact passage"
            className="group mt-0.5 -mx-1 block rounded-sm px-1 py-0.5 transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex items-start gap-1.5 text-xs leading-snug text-primary underline underline-offset-2 decoration-primary/40 group-hover:decoration-primary">
              {resolvedItem.highlightHref && (
                <MapPin className="size-3 mt-0.5 shrink-0 text-primary/70" aria-hidden />
              )}
              <span>
                “<Streamdown parseIncompleteMarkdown={false} components={{ p: 'span' }}>{excerptPreview}</Streamdown>”
              </span>
            </span>
          </SmartCitationLink>
        ) : (
          <div className="mt-0.5 text-xs leading-snug text-muted-foreground">
            “<Streamdown parseIncompleteMarkdown={false} components={{ p: 'span' }}>{excerptPreview}</Streamdown>”
          </div>
        ))}
    </li>
  );
}

/**
 * A parent document with multiple sub-citations: shows the document header once
 * (with a link/highlight to the first span) then lists each distinct supporting
 * span as an indented, independently-clickable [3.1]/[3.2] sub-entry.
 * Single-span groups defer to the flat {@link CitationBlock} for visual parity.
 */
function SubCitationGroupBlock({
  group,
  isStreaming,
}: {
  group: SubCitationGroup;
  isStreaming?: boolean;
}) {
  if (!group.hasMultiple) {
    return <CitationBlock item={group.items[0]} isStreaming={isStreaming} />;
  }
  return <MultiSpanGroupBlock group={group} isStreaming={isStreaming} />;
}

function MultiSpanGroupBlock({
  group,
  isStreaming,
}: {
  group: SubCitationGroup;
  isStreaming?: boolean;
}) {
  const head = useResolvedCitationItem(group.items[0]);
  // Match CitationBlock precedence: external sourceUrl → highlightHref (deep
  // link to the passage) → documentHref. Putting highlightHref before
  // documentHref makes the header deep-link to the span, not just the doc top.
  const titleHref = head.sourceUrl || head.highlightHref || head.documentHref;
  return (
    <li
      className={cn(
        'px-3 py-2.5 text-sm',
        isStreaming && 'animate-in fade-in-0 slide-in-from-bottom-2 duration-300'
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-mono text-xs text-muted-foreground tabular-nums">[{group.baseLabel}]</span>
        {titleHref ? (
          <SmartCitationLink
            href={titleHref}
            highlightTarget={head.highlightTarget}
            className="min-w-0 flex-1 font-medium text-primary hover:underline"
          >
            {group.title}
          </SmartCitationLink>
        ) : (
          <span className="min-w-0 flex-1 font-medium">{group.title}</span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {group.sourceTypeLabel} · {group.items.length} supporting passages
      </p>
      <ul className="mt-1.5 space-y-0 border-l-2 border-muted pl-3">
        {group.items.map((sub) => (
          <SubCitationRow key={`${sub.citeLabel}-${sub.excerpt.slice(0, 24)}`} item={sub} />
        ))}
      </ul>
    </li>
  );
}

function SingleCitationPanel({
  item,
  className,
}: {
  item: AgentCitationPanelItem;
  className?: string;
}) {
  const resolvedItem = useResolvedCitationItem(item);
  // Same precedence as CitationBlock — external sourceUrl first so web
  // citations actually link out instead of failing silently to a null
  // internal route.
  const titleHref =
    resolvedItem.sourceUrl || resolvedItem.highlightHref || resolvedItem.documentHref;
  const excerpt = resolvedItem.excerpt;
  const excerptPreview =
    excerpt.length > EXCERPT_PREVIEW ? `${excerpt.slice(0, EXCERPT_PREVIEW - 1)}…` : excerpt;
  const excerptLinkHref =
    resolvedItem.sourceUrl ||
    resolvedItem.highlightHref ||
    (resolvedItem.documentHref && excerpt ? resolvedItem.documentHref : null);
  const displayUrl = resolvedItem.sourceUrl;
  const isAcademic =
    resolvedItem.sourceType === 'literature_review' || citationGroup(resolvedItem) === 'web';
  const meta = parseCitationMeta(resolvedItem.title);
  const displayTitle = isAcademic ? meta.title : resolvedItem.title;

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-lg border border-border/60 bg-muted/10 px-3 py-2',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <BookOpen className="size-3.5 shrink-0" aria-hidden />
        <span className="font-mono tabular-nums text-muted-foreground">[{resolvedItem.citeLabel}]</span>
        {resolvedItem.isResolving && (
          <span className="size-3 shrink-0 animate-spin self-center rounded-full border border-muted-foreground/40 border-t-transparent" aria-hidden />
        )}
        {isAcademic && <CiteMeta author={meta.author} year={meta.year} />}
        {titleHref ? (
          <SmartCitationLink
            href={titleHref}
            highlightTarget={resolvedItem.highlightTarget}
            className="font-medium text-primary hover:underline inline-flex items-center gap-1"
          >
            {resolvedItem.highlightHref && <MapPin className="size-3 shrink-0 text-primary/70" />}
            {displayTitle}
          </SmartCitationLink>
        ) : (
          <span className="font-medium text-foreground">{displayTitle}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-6">
        <ProvenanceTag item={resolvedItem} />
        {resolvedItem.matchKind === 'exact' ? (
          <p className="text-micro text-muted-foreground">
            {resolvedItem.sourceTypeLabel} · Direct record
          </p>
        ) : (
          resolvedItem.relevance != null &&
          resolvedItem.relevance >= 0 &&
          resolvedItem.relevance <= 1 && (
            <p className="text-micro text-muted-foreground">
              {resolvedItem.sourceTypeLabel}
              {resolvedItem.resultRank ? ` · Result #${resolvedItem.resultRank}` : ''}
              {' · '}
              {Math.round(resolvedItem.relevance * 100)}% match
            </p>
          )
        )}
        <GroundingProvenanceBadge
          grounding={resolvedItem.grounding}
          matchKind={resolvedItem.matchKind}
          supportStatus={resolvedItem.supportStatus}
        />
        <SupportBadge status={resolvedItem.supportStatus} />
        <ViewSourceButton item={resolvedItem} className="ml-auto" />
      </div>
      {displayUrl && (
        <a
          href={displayUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="pl-6 truncate text-2xs text-primary/80 hover:text-primary hover:underline"
          title={displayUrl}
        >
          {displayUrl}
        </a>
      )}
      {excerpt && (
        <RetrievedTextBlock
          item={resolvedItem}
          excerptPreview={excerptPreview}
          excerptLinkHref={excerptLinkHref}
          listClassName="ml-6"
          skipTopMargin
        />
      )}
    </div>
  );
}

/** The base (document-level) part of a cite label: "3.2" → "3", "5" → "5". */
function citeLabelBase(label: string): string {
  return label.split('.')[0];
}

/** A parent document with one-or-more sub-citations ([3.1], [3.2], …). */
interface SubCitationGroup {
  /** Stable key: base label + source identity (avoids merging unrelated docs). */
  key: string;
  /** Document-level label ("3"). */
  baseLabel: string;
  /** Shared parent document title. */
  title: string;
  sourceTypeLabel: string;
  /** True when more than one distinct supporting span backs this document. */
  hasMultiple: boolean;
  items: AgentCitationPanelItem[];
}

/**
 * Collapse a flat list into parent-document groups. Items that share the same
 * base cite label AND the same source identity become sub-citations under one
 * parent header. This is the span-level USP surface: one document, multiple
 * distinct supporting sentences, each its own clickable [3.1]/[3.2] row.
 */
function groupBySubCitation(items: AgentCitationPanelItem[]): SubCitationGroup[] {
  const order: string[] = [];
  const byKey = new Map<string, SubCitationGroup>();
  for (const item of items) {
    // Only merge items into one sub-citation group when they share the SAME
    // base label AND a non-empty STABLE identity. Prefer sourceId; the [N]
    // label is itself a stable per-document identity from the backend manifest
    // (ADR-0006: real sub-citations of one doc share a base, e.g. [3.1]/[3.2],
    // while two distinct docs get distinct bases [3] and [4]), so the base
    // label backstops a missing sourceId. We deliberately do NOT fall back to
    // sourceName/title — two DIFFERENT documents that happen to share a title
    // but lack a sourceId must never collapse into one group.
    const base = citeLabelBase(item.citeLabel);
    const identity = item.sourceId ?? '';
    const key = `${base}|${identity}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        baseLabel: base,
        title: item.title,
        sourceTypeLabel: item.sourceTypeLabel,
        hasMultiple: false,
        items: [],
      };
      byKey.set(key, group);
      order.push(key);
    }
    group.items.push(item);
  }
  for (const g of byKey.values()) {
    g.hasMultiple = g.items.length > 1;
    g.items.sort((a, b) => a.index - b.index);
  }
  return order.map((k) => byKey.get(k)!);
}

/** Coarse provenance buckets for the panel section dividers. */
type CitationGroupKey = 'workspace' | 'papers' | 'web';

const GROUP_ORDER: CitationGroupKey[] = ['workspace', 'papers', 'web'];
const GROUP_LABELS: Record<CitationGroupKey, string> = {
  workspace: 'Workspace records',
  papers: 'Papers',
  web: 'Web',
};

function citationGroup(item: AgentCitationPanelItem): CitationGroupKey {
  // Papers first so an academic paper with a publisher URL groups under Papers
  // (not Web). Plain web links fall through to Web; everything else is internal.
  if (normalizeAgentSourceType(item.sourceType) === 'literature_review') return 'papers';
  if (item.sourceUrl && /^https?:\/\//i.test(item.sourceUrl)) return 'web';
  return 'workspace';
}

/** Normalized title key used to detect the SAME paper surfaced by different
 * providers (PubMed vs PMC vs publisher). Returns null for sources we must
 * never merge by title — workspace records (lab notes, experiments) keep their
 * own stable identity, and titles too short/generic to be reliable are skipped. */
function sameSourceKey(item: AgentCitationPanelItem): string | null {
  const type = normalizeAgentSourceType(item.sourceType);
  const isWeb = !!item.sourceUrl && /^https?:\/\//i.test(item.sourceUrl);
  // Only collapse academic papers / web articles by title.
  if (type !== 'literature_review' && !isWeb) return null;
  const raw = (item.sourceName || item.title || '').toLowerCase();
  const norm = raw.replace(/[^a-z0-9]+/g, ' ').trim();
  // Guard: avoid merging short/generic titles ("home", "results").
  if (norm.length < 12 || norm.split(' ').length < 3) return null;
  return norm;
}

/** Collapse citations that point at the SAME underlying source but arrived via
 * different providers (PubMed/PMC/publisher) into a single row. The canonical
 * row keeps the lowest-numbered label; the rest become `aliasLabels` so the one
 * row still answers every inline [N] marker that referenced the paper. Purely
 * presentational — the manifest and inline chips are left untouched. */
function dedupeSameSource(items: AgentCitationPanelItem[]): AgentCitationPanelItem[] {
  const byKey = new Map<string, AgentCitationPanelItem>();
  const out: AgentCitationPanelItem[] = [];
  for (const item of items) {
    const key = sameSourceKey(item);
    // Skip sub-citations ("3.1"/"3.2") — those are distinct spans of ONE
    // document handled by groupBySubCitation, not cross-provider duplicates.
    if (!key || item.citeLabel.includes('.')) {
      out.push(item);
      continue;
    }
    const existing = byKey.get(key);
    if (!existing) {
      const clone: AgentCitationPanelItem = {
        ...item,
        aliasLabels: item.aliasLabels ? [...item.aliasLabels] : [],
      };
      byKey.set(key, clone);
      out.push(clone);
      continue;
    }
    // A shared backend id means the SAME document (e.g. multi-span), not a
    // cross-provider duplicate — keep it as its own row.
    if (existing.sourceId && item.sourceId && existing.sourceId === item.sourceId) {
      out.push(item);
      continue;
    }
    // Record this label as an alias of the canonical row, and backfill any
    // detail (excerpt / url / span) the canonical row happened to be missing.
    if (
      item.citeLabel &&
      item.citeLabel !== existing.citeLabel &&
      !existing.aliasLabels!.includes(item.citeLabel)
    ) {
      existing.aliasLabels!.push(item.citeLabel);
    }
    if (!existing.excerpt && item.excerpt) existing.excerpt = item.excerpt;
    if (!existing.sourceUrl && item.sourceUrl) existing.sourceUrl = item.sourceUrl;
    if (!existing.citedText && item.citedText) existing.citedText = item.citedText;
  }
  for (const it of byKey.values()) {
    it.aliasLabels?.sort((a, b) => {
      const ak = citeLabelSortKey(a);
      const bk = citeLabelSortKey(b);
      return (Number.isFinite(ak) ? ak : 0) - (Number.isFinite(bk) ? bk : 0);
    });
  }
  return out;
}

export interface AgentCitationsPanelProps {
  items: AgentCitationPanelItem[];
  /** Collapsible trigger label, e.g. "All citations" or "Retrieved chunks" */
  triggerLabel: string;
  className?: string;
  defaultOpen?: boolean;
  /** Enable streaming mode with progressive fade-in animations */
  isStreaming?: boolean;
  /** When true, render a muted "no sources" note instead of nothing when the
   * answer used no workspace sources. */
  showEmptyState?: boolean;
}

/**
 * Grouped sources panel. One compact row when there is a single item; otherwise
 * a "Grounded in N sources" header that expands to a list grouped by source
 * kind (Workspace records / Papers / Web). Numbers match the prose via
 * `citeLabel`; provenance is shown honestly (Direct record / N% match / domain).
 */
export function AgentCitationsPanel({
  items,
  triggerLabel,
  className,
  defaultOpen = true,
  isStreaming = false,
  showEmptyState = false,
}: AgentCitationsPanelProps) {
  // Hooks must run unconditionally on every render — declare before any early
  // return. During streaming the item count grows 0→1→2, so a useState placed
  // after the length checks below changed the hook call order and crashed the
  // panel (Rules of Hooks violation).
  const [open, setOpen] = useState(defaultOpen);
  const navigateToSource = useSourceNavigation();
  // Span-level source viewer (G3). null → closed.
  const [viewerSource, setViewerSource] = useState<CitationSourceViewerSource | null>(null);
  // Stable identity so the CitationViewerContext value doesn't change every
  // render (which would re-render every CitationBlock/SubCitationRow consumer
  // as the panel re-renders during streaming).
  const openViewer = useCallback(
    (item: AgentCitationPanelItem) => setViewerSource(panelItemToViewerSource(item)),
    [],
  );
  // Sort by inline order, then collapse the same paper surfaced by different
  // providers (PubMed/PMC/publisher) into one row so it isn't listed twice.
  const sorted = dedupeSameSource([...items].sort((a, b) => a.index - b.index));

  const viewer = (
    <CitationSourceViewer
      source={viewerSource}
      open={viewerSource !== null}
      onOpenChange={(o) => {
        if (!o) setViewerSource(null);
      }}
      onOpenDocument={(s) => {
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
  );

  if (sorted.length === 0) {
    if (!showEmptyState) return null;
    return (
      <p className={cn('text-xs text-muted-foreground/80', className)}>
        Answered from general knowledge — no workspace sources cited.
      </p>
    );
  }

  if (sorted.length === 1) {
    return (
      <CitationViewerContext.Provider value={openViewer}>
        <div className={cn(isStreaming && 'animate-in fade-in-0 slide-in-from-bottom-2 duration-300')}>
          <SingleCitationPanel item={sorted[0]} className={className} />
        </div>
        {viewer}
      </CitationViewerContext.Provider>
    );
  }

  // Bucket into ordered groups, preserving sorted order within each.
  const groups = GROUP_ORDER.map((key) => ({
    key,
    label: GROUP_LABELS[key],
    items: sorted.filter((it) => citationGroup(it) === key),
  })).filter((g) => g.items.length > 0);

  return (
    <CitationViewerContext.Provider value={openViewer}>
    <Collapsible open={open} onOpenChange={setOpen} className={cn('min-w-0 max-w-full', className)}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={open}
          className={cn(
            'h-8 gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground',
            isStreaming && 'animate-in fade-in-0 slide-in-from-bottom-2 duration-300'
          )}
        >
          <BookOpen className="size-3.5 shrink-0" aria-hidden />
          {/* "Sources" is the consistent label across every AI answer; only an
              explicit custom label (e.g. debug "Retrieved chunks") overrides it. */}
          {triggerLabel === 'All citations' || triggerLabel === 'Sources'
            ? 'Sources'
            : triggerLabel}
          <span className="tabular-nums text-muted-foreground">({sorted.length})</span>
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 opacity-70 transition-transform duration-200',
              open && 'rotate-180'
            )}
            aria-hidden
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          'mt-2 overflow-hidden rounded-xl border border-border/60 bg-muted/20 shadow-sm',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0'
        )}
      >
        <div className="max-h-[min(22rem,55vh)] overflow-y-auto">
          {groups.map((group, gi) => {
            const HeaderIcon = PROVENANCE_META[group.key].Icon;
            return (
            <div key={group.key}>
              {/* Section header with a provenance icon + count so internal
                  documents vs papers vs web are clearly demarcated. */}
              {groups.length > 1 && (
                <div
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground/80',
                    'bg-muted/30',
                    gi > 0 && 'border-t border-border/60'
                  )}
                >
                  <HeaderIcon className="size-3 shrink-0" aria-hidden />
                  {group.label}
                  <span className="ml-1 font-normal tabular-nums text-muted-foreground/50">
                    ({group.items.length})
                  </span>
                </div>
              )}
              <ul className="divide-y divide-border/60">
                {groupBySubCitation(group.items).map((subGroup) => (
                  <SubCitationGroupBlock
                    key={subGroup.key}
                    group={subGroup}
                    isStreaming={isStreaming}
                  />
                ))}
              </ul>
            </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
    {viewer}
    </CitationViewerContext.Provider>
  );
}
