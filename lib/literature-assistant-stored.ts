import type { PaperAnalyzerReference } from '@/lib/literature-agent-types';

/** Appended to saved assistant markdown; stripped for display and model history. */
const MARKER = '\n§§NOTES9_LITERATURE_REFS§§\n';

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function serializeLiteratureAssistantStoredContent(
  bodyMarkdown: string,
  refs: PaperAnalyzerReference[]
): string {
  const body = bodyMarkdown.trimEnd();
  if (!refs.length) return body;
  const payload = utf8ToBase64(JSON.stringify(refs));
  return `${body}${MARKER}${payload}`;
}

export function parseLiteratureAssistantStoredContent(stored: string): {
  bodyMarkdown: string;
  refs: PaperAnalyzerReference[];
} {
  const i = stored.lastIndexOf(MARKER);
  if (i === -1) {
    return { bodyMarkdown: stored, refs: [] };
  }
  const bodyMarkdown = stored.slice(0, i);
  const b64 = stored.slice(i + MARKER.length).trim();
  try {
    const json = base64ToUtf8(b64);
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) {
      return { bodyMarkdown: stored, refs: [] };
    }
    const refs: PaperAnalyzerReference[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const idx = typeof o.index === 'number' ? o.index : Number(o.index);
      if (!Number.isFinite(idx)) continue;
      refs.push({
        index: idx,
        literature_review_id:
          typeof o.literature_review_id === 'string' ? o.literature_review_id : undefined,
        title: typeof o.title === 'string' ? o.title : o.title === null ? null : undefined,
        doi: typeof o.doi === 'string' ? o.doi : o.doi === null ? null : undefined,
        pmid: typeof o.pmid === 'string' ? o.pmid : o.pmid === null ? null : undefined,
        supporting_sentences: Array.isArray(o.supporting_sentences)
          ? o.supporting_sentences.filter((s): s is string => typeof s === 'string')
          : undefined,
        note: typeof o.note === 'string' ? o.note : o.note === null ? null : undefined,
      });
    }
    return { bodyMarkdown, refs };
  } catch {
    return { bodyMarkdown: stored.slice(0, i), refs: [] };
  }
}
