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

const titleByIdCache = new Map<string, string | null>();

/**
 * Resolve a record's real title/name from its id (the reverse of the by-name
 * lookup) so a citation that arrived without a usable title still shows the
 * actual document title. Cached per id; returns null when not resolvable.
 */
export async function resolveTitleFromId(
  sourceType: string,
  sourceId: string | null | undefined,
): Promise<string | null> {
  if (!sourceId) return null;
  const normalizedType = normalizeAgentSourceType(sourceType);
  const tc = tableColumnForType(normalizedType);
  if (!tc) return null;
  const cacheKey = `${normalizedType}|${sourceId}`;
  if (titleByIdCache.has(cacheKey)) return titleByIdCache.get(cacheKey) ?? null;
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from(tc.table)
      .select(tc.column)
      .eq('id', sourceId)
      .maybeSingle();
    const rec = data as Record<string, unknown> | null;
    const value =
      !error && rec && typeof rec[tc.column] === 'string'
        ? (rec[tc.column] as string).trim() || null
        : null;
    titleByIdCache.set(cacheKey, value);
    return value;
  } catch {
    titleByIdCache.set(cacheKey, null);
    return null;
  }
}
