import { createClient } from '@/lib/supabase/client';
import { normalizeAgentSourceType } from '@/lib/document-highlight';

/** Table + display column holding the human title/name for each source type. */
function tableColumnForType(
  normalizedType: string,
): { table: string; column: string } | null {
  switch (normalizedType) {
    case 'literature_review':
      return { table: 'literature_reviews', column: 'title' };
    case 'lab_note':
      return { table: 'lab_notes', column: 'title' };
    case 'protocol':
      return { table: 'protocols', column: 'name' };
    case 'experiment':
      return { table: 'experiments', column: 'name' };
    case 'project':
      return { table: 'projects', column: 'name' };
    case 'report':
      return { table: 'reports', column: 'title' };
    default:
      return null;
  }
}

/**
 * True when a citation's title is missing or a generic placeholder (e.g.
 * "Untitled literature", or just the bare source-type label), so the caller
 * should look up the real one.
 */
export function isPlaceholderTitle(
  title: string | null | undefined,
  sourceType: string,
): boolean {
  const t = (title ?? '').trim().toLowerCase();
  if (!t) return true;
  if (/^untitled\b/.test(t)) return true;
  if (t === normalizeAgentSourceType(sourceType).replace(/_/g, ' ')) return true;
  if (t === 'literature' || t === 'source' || t === 'reference') return true;
  return false;
}

/**
 * Pick the best human title from a citation resource, checking the several
 * fields the backend may use and skipping generic placeholders ("Untitled …").
 * Returns the first real title, else the first non-empty value, else null.
 */
export function coalesceCitationTitle(
  row: Record<string, unknown>,
  sourceType: string,
): string | null {
  const fields = [
    'display_label',
    'source_name',
    'title',
    'name',
    'document_name',
    'paper_title',
    'article_title',
    'label',
  ];
  for (const f of fields) {
    const v = row[f];
    if (typeof v === 'string' && v.trim() && !isPlaceholderTitle(v, sourceType)) {
      return v.trim();
    }
  }
  for (const f of fields) {
    const v = row[f];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

const titleByIdCache = new Map<string, string | null>();

/**
 * Resolve a record's real title/name from its id (the reverse of the by-name
 * lookup) so a citation that arrived without a usable title still shows the
 * actual document title. Cached per id; returns null when not resolvable.
 */
function extractDoi(url: string): string | null {
  const m = url.match(/10\.\d{4,9}\/[^\s"'<>?#]+/i);
  return m ? m[0].replace(/[.,;]+$/, '') : null;
}

function extractPmid(url: string): string | null {
  const m =
    url.match(/(?:pubmed\.ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov\/pubmed)\/(\d+)/i) ||
    url.match(/[?&]pmid=(\d+)/i);
  return m ? m[1] : null;
}

export async function resolveTitleFromId(
  sourceType: string,
  sourceId: string | null | undefined,
  url?: string | null,
): Promise<string | null> {
  const normalizedType = normalizeAgentSourceType(sourceType);
  const tc = tableColumnForType(normalizedType);
  if (!tc) return null;
  if (!sourceId && !url) return null;
  const cacheKey = `${normalizedType}|${sourceId ?? ''}|${url ?? ''}`;
  if (titleByIdCache.has(cacheKey)) return titleByIdCache.get(cacheKey) ?? null;

  const supabase = createClient();
  const readBy = async (column: string, value: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from(tc.table)
        .select(tc.column)
        .eq(column, value)
        .limit(1)
        .maybeSingle();
      const rec = data as Record<string, unknown> | null;
      if (!error && rec && typeof rec[tc.column] === 'string') {
        return (rec[tc.column] as string).trim() || null;
      }
    } catch {
      /* ignore and fall through to the next strategy */
    }
    return null;
  };

  let resolved: string | null = null;
  if (sourceId) resolved = await readBy('id', sourceId);

  // Literature: when the id didn't resolve (e.g. a web/semantic match whose id
  // isn't the saved record's), match the saved paper by DOI / PMID / URL.
  if (!resolved && normalizedType === 'literature_review' && url) {
    const doi = extractDoi(url);
    const pmid = extractPmid(url);
    if (doi) resolved = await readBy('doi', doi);
    if (!resolved && pmid) resolved = await readBy('pmid', pmid);
    if (!resolved) resolved = await readBy('url', url);
  }

  titleByIdCache.set(cacheKey, resolved);
  return resolved;
}

const labNoteExperimentCache = new Map<string, string | null>();

/**
 * Resolve a lab note's parent experiment id so a citation can deep-link straight
 * to `/experiments/<exp>?tab=notes&noteId=…` via client-side navigation —
 * avoiding the `/lab-notes/<id>` server redirect (which re-SSRs the experiment
 * page). Cached per note id; null when not resolvable.
 */
export async function resolveLabNoteExperimentId(
  noteId: string | null | undefined,
): Promise<string | null> {
  if (!noteId) return null;
  if (labNoteExperimentCache.has(noteId)) return labNoteExperimentCache.get(noteId) ?? null;
  let expId: string | null = null;
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('lab_notes')
      .select('experiment_id')
      .eq('id', noteId)
      .limit(1)
      .maybeSingle();
    const rec = data as { experiment_id?: string | null } | null;
    if (!error && rec && typeof rec.experiment_id === 'string') {
      expId = rec.experiment_id.trim() || null;
    }
  } catch {
    /* ignore — caller falls back to the redirect route */
  }
  labNoteExperimentCache.set(noteId, expId);
  return expId;
}
