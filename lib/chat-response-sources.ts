/**
 * Notes9 POST /chat can return `sources: [{ url, title }]` and `searched_web` when
 * web search is used, plus `resources` / `citations` in other modes.
 */

/** Prefer `content`; with `response_format: "json"`, upstream may put the main payload in `result`. */
export function assistantContentFromNotes9ChatPayload(data: Record<string, unknown>): string {
  const c = data.content;
  if (typeof c === 'string' && c.trim() !== '') return c;
  if (c != null && typeof c !== 'string') {
    return typeof c === 'object' ? JSON.stringify(c, null, 2) : String(c);
  }
  const r = data.result;
  if (r != null) {
    return typeof r === 'string' ? r : JSON.stringify(r, null, 2);
  }
  return '';
}

export type ChatSourceRow = Record<string, unknown>;

function pickString(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/** Avoid breaking `[label](url)` when titles contain `[` or `]`. */
export function escapeMarkdownLinkLabel(label: string): string {
  return label.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

function normalizeSourceItem(raw: unknown, index: number): { label: string; url?: string; excerpt?: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const url = pickString(o, ['url', 'source_url', 'link', 'href']);
  const label =
    pickString(o, ['display_label', 'source_name', 'title', 'name']) ??
    url ??
    `Source ${index + 1}`;
  const excerpt = pickString(o, ['excerpt', 'snippet', 'summary', 'description']);
  return { label: escapeMarkdownLinkLabel(label), url: url || undefined, excerpt };
}

/**
 * Prefer `sources` (web search shape: `{ url, title }[]`) first, then other keys.
 * Does not merge multiple arrays — first non-empty wins.
 */
export function extractSourceListFromChatPayload(data: Record<string, unknown>): unknown[] {
  for (const key of ['sources', 'resources', 'citations', 'references', 'search_results']) {
    const v = data[key];
    if (Array.isArray(v) && v.length > 0) return v;
  }
  return [];
}

export type AppendSourcesOptions = {
  /** From API `searched_web`; if there are no usable links, still adds a Sources stub. */
  searchedWeb?: boolean;
};

const MAX_SOURCES_IN_APPEND = 20;

/** Append a markdown Sources section so existing chat UIs show links without new message parts. */
export function appendSourcesMarkdownSection(
  content: string,
  items: unknown[],
  options?: AppendSourcesOptions
): string {
  if (!items.length) {
    if (options?.searchedWeb === true) {
      return `${content.trimEnd()}\n\n---\n\n### Sources\n\n*This reply used web search.*\n`;
    }
    return content;
  }
  const slice = items.slice(0, MAX_SOURCES_IN_APPEND);
  const bodyLines: string[] = [];
  slice.forEach((raw, i) => {
    const s = normalizeSourceItem(raw, i);
    if (!s) return;
    const n = bodyLines.length + 1;
    let line = s.url ? `[${n}] [${s.label}](${s.url})` : `[${n}] ${s.label}`;
    if (s.excerpt) {
      const ex = s.excerpt.length > 220 ? `${s.excerpt.slice(0, 217)}…` : s.excerpt;
      line += ` — ${ex}`;
    }
    bodyLines.push(line);
  });
  if (!bodyLines.length) {
    if (options?.searchedWeb === true) {
      return `${content.trimEnd()}\n\n---\n\n### Sources\n\n*This reply used web search.*\n`;
    }
    return content;
  }

  const lines: string[] = ['', '---', '', '### Sources', '', ...bodyLines];
  if (items.length > MAX_SOURCES_IN_APPEND) {
    lines.push('', `*Showing ${MAX_SOURCES_IN_APPEND} of ${items.length} links.*`);
  }
  return content.trimEnd() + '\n' + lines.join('\n');
}
