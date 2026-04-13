/**
 * Shared types and utilities for navigating to and highlighting
 * specific text chunks inside documents (lab notes, protocols, literature PDFs).
 */

export interface HighlightTarget {
  sourceType: string;
  sourceId: string;
  excerpt: string;
  chunkId?: string | null;
  pageNumber?: number | null;
  /** For literature: jump to Overview abstract vs PDF full text. */
  contentSurface?: 'abstract' | 'pdf' | null;
}

const HIGHLIGHT_PARAM = 'highlight';
const DOCUMENT_HIGHLIGHT_EVENT = 'notes9:document-highlight';

export function encodeHighlightParam(target: HighlightTarget): string {
  const json = JSON.stringify({
    st: target.sourceType,
    sid: target.sourceId,
    ex: target.excerpt,
    ...(target.chunkId ? { cid: target.chunkId } : {}),
    ...(target.pageNumber != null ? { pg: target.pageNumber } : {}),
    ...(target.contentSurface ? { sf: target.contentSurface } : {}),
  });
  if (typeof window !== 'undefined') {
    return btoa(unescape(encodeURIComponent(json)));
  }
  return Buffer.from(json, 'utf-8').toString('base64');
}

export function decodeHighlightParam(param: string): HighlightTarget | null {
  try {
    let json: string;
    if (typeof window !== 'undefined') {
      json = decodeURIComponent(escape(atob(param)));
    } else {
      json = Buffer.from(param, 'base64').toString('utf-8');
    }
    const o = JSON.parse(json) as Record<string, unknown>;
    const sourceType = typeof o.st === 'string' ? o.st : '';
    const sourceId = typeof o.sid === 'string' ? o.sid : '';
    const excerpt = typeof o.ex === 'string' ? o.ex : '';
    if (!sourceType || !sourceId || !excerpt) return null;
    const sf = o.sf;
    const contentSurface =
      sf === 'abstract' || sf === 'pdf' ? sf : null;
    return {
      sourceType,
      sourceId,
      excerpt,
      chunkId: typeof o.cid === 'string' ? o.cid : null,
      pageNumber: typeof o.pg === 'number' ? o.pg : null,
      contentSurface,
    };
  } catch {
    return null;
  }
}

/**
 * Build a URL that deep-links into the source document with highlight context.
 * For lab notes the caller must resolve `experimentId` beforehand (or use the
 * `/lab-notes/[id]` redirect route).
 */
export function buildHighlightUrl(
  target: HighlightTarget,
  extra?: { experimentId?: string },
): string {
  const encoded = encodeHighlightParam(target);
  const qs = `${HIGHLIGHT_PARAM}=${encodeURIComponent(encoded)}`;

  switch (target.sourceType) {
    case 'literature_review': {
      const tab =
        target.contentSurface === 'abstract' ? 'overview' : 'pdf';
      return `/literature-reviews/${encodeURIComponent(target.sourceId)}?tab=${tab}&${qs}`;
    }

    case 'protocol':
      return `/protocols/${encodeURIComponent(target.sourceId)}?${qs}`;

    case 'lab_note':
      if (extra?.experimentId) {
        return `/experiments/${encodeURIComponent(extra.experimentId)}?tab=notes&noteId=${encodeURIComponent(target.sourceId)}&${qs}`;
      }
      return `/lab-notes/${encodeURIComponent(target.sourceId)}?${qs}`;

    default:
      return '';
  }
}

/** Source types that support opening the document with a fuzzy text highlight. */
const HIGHLIGHTABLE_SOURCE_TYPES = new Set(['literature_review', 'protocol', 'lab_note']);

/**
 * Normalize agent / RAG `source_type` strings (e.g. "Literature", "Lab note") to canonical keys.
 */
export function normalizeAgentSourceType(raw: string): string {
  const t = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  switch (t) {
    case 'literature':
    case 'literature_review':
    case 'paper':
    case 'papers':
      return 'literature_review';
    case 'lab_note':
    case 'labnote':
    case 'note':
    case 'notes':
      return 'lab_note';
    case 'protocol':
    case 'protocols':
      return 'protocol';
    case 'experiment':
    case 'experiments':
    case 'exp':
      return 'experiment';
    case 'project':
    case 'projects':
      return 'project';
    default:
      return t;
  }
}

/**
 * Resolve document id from RAG / grounding payloads (APIs may use `id`, `literature_id`, etc.).
 */
export function coalesceAgentSourceId(c: Record<string, unknown>): string | null {
  const keys = [
    'source_id',
    'id',
    'source_record_id',
    'record_id',
    'resource_id',
    'entity_id',
    'row_id',
    'literature_id',
    'literature_review_id',
    'paper_id',
    'protocol_id',
    'lab_note_id',
    'note_id',
    'project_id',
    'experiment_id',
    'document_id',
  ] as const;
  for (const k of keys) {
    const v = c[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

/** Match / RAG payloads may label the passage `text`, `snippet`, etc. */
export function coalesceAgentExcerpt(c: Record<string, unknown>): string | null {
  const keys = [
    'excerpt',
    'text',
    'snippet',
    'chunk_text',
    'content',
    'body',
    'passage',
  ] as const;
  for (const k of keys) {
    const v = c[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
}

/** Map API relevance / score to 0–1 for UI (% match). */
export function normalizeAgentRelevance0to1(r: number): number {
  if (!Number.isFinite(r)) return 0;
  if (r > 1 && r <= 100) return Math.min(1, r / 100);
  if (r > 100) return 1;
  if (r < 0) return 0;
  return r;
}

function inferLiteratureContentSurface(
  c: { content_surface?: string | null; source_type: string },
): 'abstract' | 'pdf' | undefined {
  if (normalizeAgentSourceType(c.source_type) !== 'literature_review') return undefined;
  const s = (c.content_surface ?? '').trim().toLowerCase();
  if (
    s.includes('abstract') ||
    s === 'metadata' ||
    s === 'overview' ||
    s === 'summary'
  ) {
    return 'abstract';
  }
  if (s.includes('pdf') || s.includes('fulltext') || s === 'body' || s === 'full_text') {
    return 'pdf';
  }
  return 'abstract';
}

/**
 * Build a deep-link with `?highlight=` when the backend sent an excerpt (RAG / grounding).
 * Used by Notes9 agent UI, persisted reference markdown, and RAG chunk rows.
 */
export function buildHighlightUrlFromResource(
  c: {
    source_type: string;
    source_id?: string | null;
    excerpt?: string | null;
    chunk_id?: string | null;
    content_surface?: string | null;
  },
  extra?: { experimentId?: string },
): string | null {
  const target = buildHighlightTargetFromResource(c);
  if (!target) return null;
  const url = buildHighlightUrl(target, extra);
  return url || null;
}

export function buildHighlightTargetFromResource(
  c: {
    source_type: string;
    source_id?: string | null;
    excerpt?: string | null;
    chunk_id?: string | null;
    content_surface?: string | null;
    page_number?: number | null;
  },
): HighlightTarget | null {
  const obj = c as Record<string, unknown>;
  const id =
    coalesceAgentSourceId(obj) ??
    (c.source_id != null && String(c.source_id).trim() !== ''
      ? String(c.source_id).trim()
      : null);
  const excerpt = coalesceAgentExcerpt(obj) ?? c.excerpt?.trim() ?? null;
  if (!id || !excerpt) return null;
  const sourceType = normalizeAgentSourceType(c.source_type);
  if (!HIGHLIGHTABLE_SOURCE_TYPES.has(sourceType)) return null;
  const rawPageNumber = obj.page_number;
  const pageNumber =
    typeof rawPageNumber === 'number' && Number.isFinite(rawPageNumber)
      ? rawPageNumber
      : typeof rawPageNumber === 'string' && rawPageNumber.trim() !== '' && Number.isFinite(Number(rawPageNumber))
        ? Number(rawPageNumber)
        : null;
  const contentSurface =
    sourceType === 'literature_review'
      ? inferLiteratureContentSurface(c) ?? 'abstract'
      : undefined;

  return {
    sourceType,
    sourceId: String(id).trim(),
    excerpt,
    chunkId: c.chunk_id ?? null,
    pageNumber,
    contentSurface: contentSurface ?? null,
  };
}

export function dispatchDocumentHighlight(target: HighlightTarget): boolean {
  if (typeof window === 'undefined') return false;
  const event = new CustomEvent<HighlightTarget>(DOCUMENT_HIGHLIGHT_EVENT, {
    detail: target,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

export { HIGHLIGHT_PARAM };
export { DOCUMENT_HIGHLIGHT_EVENT };
