'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronDown, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  buildHighlightTargetFromResource,
  buildHighlightUrl,
  buildHighlightUrlFromResource,
  coalesceAgentExcerpt,
  coalesceAgentSourceId,
  dispatchDocumentHighlight,
  normalizeAgentRelevance0to1,
  normalizeAgentSourceType,
  type HighlightTarget,
} from '@/lib/document-highlight';
import type { GroundingResource, RagChunk } from '@/lib/agent-stream-types';

const EXCERPT_PREVIEW = 320;
const sourceIdFallbackCache = new Map<string, string | null>();

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
    default:
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
  title: string;
  sourceType: string;
  sourceTypeLabel: string;
  sourceId: string | null;
  sourceName: string | null;
  chunkId?: string | null;
  pageNumber?: number | null;
  contentSurface?: 'abstract' | 'pdf' | null;
  relevance?: number;
  excerpt: string;
  documentHref: string | null;
  highlightTarget: HighlightTarget | null;
  highlightHref: string | null;
};

function fingerprintCitationItem(item: AgentCitationPanelItem): string {
  const ex = item.excerpt.slice(0, 200);
  return `${item.highlightHref ?? ''}|${item.documentHref ?? ''}|${ex}`;
}

function useResolvedCitationItem(item: AgentCitationPanelItem): AgentCitationPanelItem {
  const [resolvedSourceId, setResolvedSourceId] = useState<string | null>(item.sourceId);

  useEffect(() => {
    let cancelled = false;
    if (item.sourceId) {
      setResolvedSourceId(item.sourceId);
      return () => {
        cancelled = true;
      };
    }
    if (!item.sourceName) {
      setResolvedSourceId(null);
      return () => {
        cancelled = true;
      };
    }

    resolveSourceIdFromName(item.sourceType, item.sourceName).then((id) => {
      if (!cancelled) setResolvedSourceId(id);
    });

    return () => {
      cancelled = true;
    };
  }, [item.sourceId, item.sourceName, item.sourceType]);

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

  return {
    ...item,
    sourceId,
    highlightTarget,
    documentHref,
    highlightHref,
  };
}

/**
 * Final `resources` from the done event plus streaming RAG chunks, deduped so
 * chunks stay clickable when the API omits fields on `resources` only.
 */
export function mergeGroundingAndRagItems(
  resources: GroundingResource[],
  ragChunks: RagChunk[] | null | undefined,
): AgentCitationPanelItem[] {
  const base = resources.map((c, i) => groundingResourceToPanelItem(c, i));
  if (!ragChunks?.length) {
    return base.map((item, i) => ({ ...item, index: i + 1 }));
  }
  const seen = new Set(base.map(fingerprintCitationItem));
  const extras: AgentCitationPanelItem[] = [];
  for (const ch of ragChunks) {
    const item = ragChunkToPanelItem(ch, base.length + extras.length);
    const fp = fingerprintCitationItem(item);
    if (!seen.has(fp)) {
      seen.add(fp);
      extras.push(item);
    }
  }
  const merged = [...base, ...extras];
  return merged.map((item, i) => ({ ...item, index: i + 1 }));
}

export function groundingResourceToPanelItem(
  c: GroundingResource,
  index: number,
): AgentCitationPanelItem {
  const row = c as unknown as Record<string, unknown>;
  const sourceType = normalizeAgentSourceType(c.source_type);
  const sourceId = coalesceAgentSourceId(row);
  const sourceName =
    c.source_name?.trim() ||
    lookupNameForSourceType(sourceType, c.display_label) ||
    null;
  const title =
    c.display_label?.trim() ||
    c.source_name?.trim() ||
    c.source_type.replace(/_/g, ' ');
  const highlightTarget = buildHighlightTargetFromResource(c);
  const highlightHref = buildHighlightUrlFromResource(c);
  const documentHref =
    getCitationRoute({ source_type: sourceType, source_id: sourceId ?? c.source_id }) || null;
  const excerpt = coalesceAgentExcerpt(row) ?? (c.excerpt ?? '').trim();
  const relevance =
    typeof c.relevance === 'number' ? normalizeAgentRelevance0to1(c.relevance) : undefined;
  return {
    index: index + 1,
    title,
    sourceType,
    sourceTypeLabel: c.source_type.replace(/_/g, ' '),
    sourceId,
    sourceName,
    chunkId: c.chunk_id ?? null,
    pageNumber: c.page_number ?? null,
    contentSurface: c.content_surface === 'abstract' || c.content_surface === 'pdf'
      ? c.content_surface
      : null,
    relevance,
    excerpt,
    documentHref,
    highlightTarget,
    highlightHref,
  };
}

export function ragChunkToPanelItem(chunk: RagChunk, i: number): AgentCitationPanelItem {
  const row = chunk as unknown as Record<string, unknown>;
  const sourceType = normalizeAgentSourceType(chunk.source_type);
  const sourceId = coalesceAgentSourceId(row);
  const sourceName = chunk.source_name?.trim() || null;
  const title = chunk.source_name?.trim() || chunk.source_type.replace(/_/g, ' ');
  const highlightTarget = buildHighlightTargetFromResource(chunk);
  const highlightHref = buildHighlightUrlFromResource(chunk);
  const documentHref =
    getCitationRoute({ source_type: sourceType, source_id: sourceId ?? chunk.source_id }) ||
    null;
  const excerpt = coalesceAgentExcerpt(row) ?? chunk.excerpt?.trim() ?? '';
  const relevance =
    typeof chunk.relevance === 'number' && Number.isFinite(chunk.relevance)
      ? normalizeAgentRelevance0to1(chunk.relevance)
      : undefined;
  return {
    index: i + 1,
    title,
    sourceType,
    sourceTypeLabel: chunk.source_type.replace(/_/g, ' '),
    sourceId,
    sourceName,
    chunkId: chunk.chunk_id ?? null,
    pageNumber: chunk.page_number ?? null,
    contentSurface: chunk.content_surface === 'abstract' || chunk.content_surface === 'pdf'
      ? chunk.content_surface
      : null,
    relevance,
    excerpt,
    documentHref,
    highlightTarget,
    highlightHref,
  };
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
  return (
    <div
      className={cn(
        'space-y-1 border-l-2 border-muted pl-2',
        !skipTopMargin && 'mt-2',
        listClassName
      )}
    >
      {excerptLinkHref ? (
        <SmartCitationLink
          href={excerptLinkHref}
          highlightTarget={item.highlightTarget}
          title="Open source document and scroll to this passage"
          className="group -mx-1 block rounded-sm px-1 py-0.5 transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground group-hover:text-primary">
            Retrieved text
          </p>
          <span className="mt-1 flex items-start gap-1.5 text-xs leading-snug text-primary underline underline-offset-2 decoration-primary/50 group-hover:decoration-primary">
            {item.highlightHref && (
              <MapPin className="size-3 mt-0.5 shrink-0 text-primary" aria-hidden />
            )}
            <span className="font-medium">{excerptPreview}</span>
          </span>
        </SmartCitationLink>
      ) : (
        <>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Retrieved text
          </p>
          <p className="text-xs leading-snug text-muted-foreground">{excerptPreview}</p>
        </>
      )}
    </div>
  );
}

function CitationBlock({ item }: { item: AgentCitationPanelItem }) {
  const resolvedItem = useResolvedCitationItem(item);
  const titleHref = resolvedItem.highlightHref || resolvedItem.documentHref;
  const excerpt = resolvedItem.excerpt;
  const excerptPreview =
    excerpt.length > EXCERPT_PREVIEW ? `${excerpt.slice(0, EXCERPT_PREVIEW - 1)}…` : excerpt;

  const excerptLinkHref =
    resolvedItem.highlightHref ||
    (resolvedItem.documentHref && excerpt ? resolvedItem.documentHref : null);

  return (
    <li className="px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-mono text-xs text-muted-foreground tabular-nums">[{resolvedItem.index}]</span>
        {titleHref ? (
          <SmartCitationLink
            href={titleHref}
            highlightTarget={resolvedItem.highlightTarget}
            className="min-w-0 flex-1 font-medium text-primary hover:underline inline-flex items-baseline gap-1"
          >
            {resolvedItem.highlightHref && (
              <MapPin className="size-3 shrink-0 self-center text-primary/70" aria-hidden />
            )}
            {resolvedItem.title}
          </SmartCitationLink>
        ) : (
          <span className="min-w-0 flex-1 font-medium">{resolvedItem.title}</span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {resolvedItem.sourceTypeLabel}
        {resolvedItem.relevance != null &&
          resolvedItem.relevance >= 0 &&
          resolvedItem.relevance <= 1 && (
            <span> · {Math.round(resolvedItem.relevance * 100)}% match</span>
        )}
      </p>
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

function SingleCitationPanel({
  item,
  className,
}: {
  item: AgentCitationPanelItem;
  className?: string;
}) {
  const resolvedItem = useResolvedCitationItem(item);
  const titleHref = resolvedItem.highlightHref || resolvedItem.documentHref;
  const excerpt = resolvedItem.excerpt;
  const excerptPreview =
    excerpt.length > EXCERPT_PREVIEW ? `${excerpt.slice(0, EXCERPT_PREVIEW - 1)}…` : excerpt;
  const excerptLinkHref =
    resolvedItem.highlightHref ||
    (resolvedItem.documentHref && excerpt ? resolvedItem.documentHref : null);

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-lg border border-border/60 bg-muted/10 px-3 py-2',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <BookOpen className="size-3.5 shrink-0" aria-hidden />
        <span className="font-mono tabular-nums text-muted-foreground/80">[{resolvedItem.index}]</span>
        {titleHref ? (
          <SmartCitationLink
            href={titleHref}
            highlightTarget={resolvedItem.highlightTarget}
            className="font-medium text-primary hover:underline inline-flex items-center gap-1"
          >
            {resolvedItem.highlightHref && <MapPin className="size-3 shrink-0 text-primary/70" />}
            {resolvedItem.title}
          </SmartCitationLink>
        ) : (
          <span className="font-medium text-foreground">{resolvedItem.title}</span>
        )}
      </div>
      {resolvedItem.relevance != null &&
        resolvedItem.relevance >= 0 &&
        resolvedItem.relevance <= 1 && (
          <p className="text-[11px] text-muted-foreground pl-6">
            {resolvedItem.sourceTypeLabel} · {Math.round(resolvedItem.relevance * 100)}% match
          </p>
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

export interface AgentCitationsPanelProps {
  items: AgentCitationPanelItem[];
  /** Collapsible trigger label, e.g. "All citations" or "Retrieved chunks" */
  triggerLabel: string;
  className?: string;
  defaultOpen?: boolean;
}

/**
 * Literature-mode style: one compact row when there is a single item; otherwise
 * collapsible "All citations" with bordered list (matches {@link LiteratureSourcesDropdown}).
 */
export function AgentCitationsPanel({
  items,
  triggerLabel,
  className,
  defaultOpen = false,
}: AgentCitationsPanelProps) {
  const sorted = [...items].sort((a, b) => a.index - b.index);
  if (sorted.length === 0) return null;

  if (sorted.length === 1) {
    return <SingleCitationPanel item={sorted[0]} className={className} />;
  }

  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn('min-w-0 max-w-full', className)}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={open}
          className="h-8 gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <BookOpen className="size-3.5 shrink-0" aria-hidden />
          {triggerLabel}
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
          'mt-2 overflow-hidden rounded-lg border border-border/60 bg-muted/20',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0'
        )}
      >
        <ul className="max-h-[min(22rem,55vh)] divide-y divide-border/60 overflow-y-auto">
          {sorted.map((item) => (
            <CitationBlock key={`${item.index}-${item.title}-${item.excerpt.slice(0, 24)}`} item={item} />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
