import type { PaperAnalyzerReference } from '@/lib/literature-agent-types';
import type { CitationsManifest } from '@/hooks/use-agent-stream';

/** Appended to saved assistant markdown; stripped for display and model history. */
const MARKER = '\n§§NOTES9_LITERATURE_REFS§§\n';

/** Appended after the refs block; carries the base64 citations manifest so restored
 * literature sessions render identical interactive inline `[N]` chips (mirrors the
 * mechanism in lib/notes9-chat-format.ts). */
const MANIFEST_MARKER = '\n§§NOTES9_MANIFEST§§\n';

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
  refs: PaperAnalyzerReference[],
  citationsManifest?: CitationsManifest | null
): string {
  let out = bodyMarkdown.trimEnd();
  if (refs.length) {
    out += `${MARKER}${utf8ToBase64(JSON.stringify(refs))}`;
  }
  // Persist the manifest separately so restored sessions resolve the inline
  // `[N]` chips by cite_label exactly as the live stream did.
  if (citationsManifest?.manifest && Object.keys(citationsManifest.manifest).length > 0) {
    out += `${MANIFEST_MARKER}${utf8ToBase64(JSON.stringify(citationsManifest.manifest))}`;
  }
  return out;
}

export function parseLiteratureAssistantStoredContent(stored: string): {
  bodyMarkdown: string;
  refs: PaperAnalyzerReference[];
  citationsManifest: CitationsManifest | null;
} {
  // Peel off the manifest block first (it always trails the refs block).
  let working = stored;
  let citationsManifest: CitationsManifest | null = null;
  const mi = working.lastIndexOf(MANIFEST_MARKER);
  if (mi !== -1) {
    const manifestB64 = working.slice(mi + MANIFEST_MARKER.length).trim();
    working = working.slice(0, mi);
    try {
      const json = base64ToUtf8(manifestB64);
      const parsed = JSON.parse(json) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        citationsManifest = { manifest: parsed as CitationsManifest['manifest'] };
      }
    } catch {
      citationsManifest = null;
    }
  }

  const i = working.lastIndexOf(MARKER);
  if (i === -1) {
    return { bodyMarkdown: working, refs: [], citationsManifest };
  }
  const bodyMarkdown = working.slice(0, i);
  const b64 = working.slice(i + MARKER.length).trim();
  try {
    const json = base64ToUtf8(b64);
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) {
      return { bodyMarkdown: working, refs: [], citationsManifest };
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
    return { bodyMarkdown, refs, citationsManifest };
  } catch {
    return { bodyMarkdown: working.slice(0, i), refs: [], citationsManifest };
  }
}
