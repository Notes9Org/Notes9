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
}

const HIGHLIGHT_PARAM = 'highlight';

export function encodeHighlightParam(target: HighlightTarget): string {
  const json = JSON.stringify({
    st: target.sourceType,
    sid: target.sourceId,
    ex: target.excerpt,
    ...(target.chunkId ? { cid: target.chunkId } : {}),
    ...(target.pageNumber != null ? { pg: target.pageNumber } : {}),
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
    return {
      sourceType,
      sourceId,
      excerpt,
      chunkId: typeof o.cid === 'string' ? o.cid : null,
      pageNumber: typeof o.pg === 'number' ? o.pg : null,
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
    case 'literature_review':
      return `/literature-reviews/${encodeURIComponent(target.sourceId)}?tab=pdf&${qs}`;

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

export { HIGHLIGHT_PARAM };
