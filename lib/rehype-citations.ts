import type { Element, ElementContent, Root, Text } from 'hast';
import { visit } from 'unist-util-visit';
import { CITATION_GROUP_RE } from './citation-renumber';
import { normalizeAgentSourceType } from './document-highlight';
import type { CitationsManifest, CitationsManifestEntry } from '@/hooks/use-agent-stream';

/**
 * rehype-citations
 *
 * Ports `postProcessHtml`'s citation-chip logic (formerly in
 * components/catalyst/markdown-renderer.tsx, back when markdown was rendered
 * via `marked` + a manual `[N]` regex pass over the resulting HTML string) to
 * a rehype plugin that runs over the hast tree Streamdown produces.
 *
 * Wraps `[N]` / `[N.M]` / grouped `[a, b, c]` markers in TEXT nodes with a
 * chip element carrying the SAME `data-cite-*` payload the renderer's event
 * delegation (`readChipData` in markdown-renderer.tsx) already knows how to
 * read: `<sup class="notes9-cite" role="button" tabindex="0" data-cite-...>`
 * for workspace sources, `<a class="notes9-cite notes9-cite--link" ...>` for
 * URL-backed (web) sources. Unlike the old regex-over-HTML-string approach,
 * this operates on hast nodes directly, so there's no risk of matching text
 * inside an attribute value or a tag (the old code needed a manual
 * tag/text-segment split to avoid that; here, only `text` nodes are ever
 * visited, which categorically can't include tag markup or attributes).
 *
 * IMPORTANT: this plugin must run AFTER rehype-sanitize/rehype-harden in the
 * pipeline. Those two strip attributes/elements against an allowlist that
 * has no knowledge of `data-cite-*`; running this plugin last means the chip
 * nodes it creates are appended to the tree post-sanitization, so they're
 * never seen (and thus never stripped) by the security passes. See the
 * `rehypePlugins` wiring in markdown-renderer.tsx.
 */

export interface RehypeCitationsOptions {
  manifest?: CitationsManifest | null;
}

/** Identity key for cross-provider duplicate-paper detection (e.g. the same
 * article showing up once via PubMed and once via PMC/OpenAlex): the source's
 * type + a normalized title. Only applied to papers/web sources that agree
 * on the source name; returns null for non-paper/web entries or titles too
 * short/generic to be a reliable identity. */
function manifestSourceKey(entry: CitationsManifestEntry): string | null {
  const isWeb = !!entry.source_url && /^https?:\/\//i.test(entry.source_url);
  const isPaper = normalizeAgentSourceType(entry.source_type) === 'literature_review';
  if (!isPaper && !isWeb) return null;
  const norm = (entry.source_name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (norm.length < 12 || norm.split(' ').length < 3) return null;
  return norm;
}

/** Map of duplicate citation labels -> the canonical (lowest-numbered) label
 * for the SAME underlying paper, so a PubMed [5] that is the same article as
 * PMC [2] renders as [2] everywhere. Sub-citation labels ("3.2") are
 * excluded so multi-span groups are preserved. Purely presentational. */
function buildCanonicalLabelMap(manifest: CitationsManifest): Record<string, string> {
  const groups = new Map<string, string[]>();
  for (const [label, entry] of Object.entries(manifest.manifest)) {
    if (label.includes('.')) continue;
    const key = manifestSourceKey(entry);
    if (!key) continue;
    const arr = groups.get(key);
    if (arr) arr.push(label);
    else groups.set(key, [label]);
  }
  const map: Record<string, string> = {};
  for (const labels of groups.values()) {
    if (labels.length < 2) continue;
    const canonical = labels.slice().sort((a, b) => parseFloat(a) - parseFloat(b))[0];
    for (const l of labels) if (l !== canonical) map[l] = canonical;
  }
  return map;
}

/** Build the chip hast node for a single citation label (never a group -
 * the caller has already split `[4, 5, 6]` into individual tokens). Mirrors
 * `postProcessHtml`'s per-label `<sup>`/`<a>` branch field-for-field; hast
 * `properties` are plain JS values (no manual HTML-attribute escaping - the
 * hast->JSX/HTML serializer downstream handles that). */
function buildChipNode(
  nStr: string,
  manifest: CitationsManifest | null | undefined,
  canonicalMap: Record<string, string>,
): Element {
  // Remap cross-provider duplicates to their canonical label so the SAME
  // paper always renders as the same number. Sub-citations ("3.2") are
  // untouched.
  const n = canonicalMap[nStr] ?? nStr;
  // The manifest is keyed by the full display label ("3" or "3.2", ADR-0006),
  // so a sub-citation resolves directly. Fall back to the base ("3.2"->"3")
  // for safety if only the document-level key is present.
  const entry: CitationsManifestEntry | undefined =
    manifest && manifest.manifest ? manifest.manifest[n] ?? manifest.manifest[n.split('.')[0]] : undefined;

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
    entry?.grounding === 'native' || entry?.grounding === 'heuristic' || entry?.grounding === 'none'
      ? entry.grounding
      : '';
  // Advisory char offsets for the cited span (G3 highlight precision).
  const charStart =
    typeof entry?.char_start === 'number' && Number.isFinite(entry.char_start) ? String(entry.char_start) : '';
  const charEnd =
    typeof entry?.char_end === 'number' && Number.isFinite(entry.char_end) ? String(entry.char_end) : '';
  const relevance =
    typeof entry?.relevance === 'number' && Number.isFinite(entry.relevance) ? String(entry.relevance) : '';
  // Provenance drives the subtle chip color-coding (web vs direct record vs
  // semantic match). Web wins when a URL is present.
  const provenance = url ? 'web' : matchKind === 'exact' ? 'exact' : matchKind ? 'semantic' : '';
  // Show the URL in the tooltip when present so the user can preview where
  // the chip points without opening it. Falls back to the source name / type
  // if there's no URL (workspace records).
  const tip = url || name || sType || '';
  // Screen-reader label so the chip announces its citation context.
  const ariaLabel = `Citation ${n}${name ? `: ${name}` : ''}`;

  // Shared data-* payload - read by the renderer's click + hover delegation
  // (readChipData in markdown-renderer.tsx) via `element.dataset.cite*`.
  const properties: Record<string, string | number> = {
    dataCiteN: n,
    dataCiteLabel: n,
  };
  if (token) properties.dataCiteToken = token;
  if (sType) properties.dataCiteType = sType;
  if (name) properties.dataCiteName = name;
  if (sourceId) properties.dataCiteId = sourceId;
  if (matchKind) properties.dataCiteMatch = matchKind;
  if (relevance) properties.dataCiteRelevance = relevance;
  if (excerpt) properties.dataCiteExcerpt = excerpt.slice(0, 500);
  if (citedText) properties.dataCiteSnippet = citedText.slice(0, 500);
  if (supportStatus != null) properties.dataCiteSupport = supportStatus;
  if (grounding) properties.dataCiteGrounding = grounding;
  if (charStart) properties.dataCiteCharStart = charStart;
  if (charEnd) properties.dataCiteCharEnd = charEnd;
  if (provenance) properties.dataCiteProvenance = provenance;
  properties.ariaLabel = ariaLabel;

  const children: ElementContent[] = [{ type: 'text', value: n }];

  // External URL -> render as a real anchor so clicking the chip opens the
  // source in a new tab. No URL -> styleable <sup> chip; its click + hover
  // behavior is wired by the renderer container via delegation.
  if (url && /^https?:\/\//i.test(url)) {
    return {
      type: 'element',
      tagName: 'a',
      properties: {
        className: 'notes9-cite notes9-cite--link',
        href: url,
        target: '_blank',
        rel: 'noopener noreferrer',
        ...properties,
        dataCiteUrl: url,
        title: tip,
      },
      children,
    };
  }
  return {
    type: 'element',
    tagName: 'sup',
    properties: {
      className: 'notes9-cite',
      role: 'button',
      tabIndex: 0,
      ...properties,
      ...(tip ? { title: tip } : {}),
    },
    children,
  };
}

/** Split a single regex match's inner text ("5" or "4, 5, 6") into one chip
 * node per label, exactly like `postProcessHtml`'s `.split(',').map(...)`. */
function buildChipNodes(
  inner: string,
  manifest: CitationsManifest | null | undefined,
  canonicalMap: Record<string, string>,
): Element[] {
  return inner
    .split(',')
    .map((tok) => tok.trim())
    .filter(Boolean)
    .map((nStr) => buildChipNode(nStr, manifest, canonicalMap));
}

export default function rehypeCitations(options: RehypeCitationsOptions = {}) {
  return (tree: Root) => {
    const manifest = options.manifest;
    // No manifest -> no-op, matching the old behavior: `[N]` renders as
    // plain text when there's nothing to look it up against.
    if (!manifest?.manifest) return;
    const canonicalMap = buildCanonicalLabelMap(manifest);

    visit(tree, 'text', (node: Text, index, parent) => {
      if (index == null || !parent) return;
      CITATION_GROUP_RE.lastIndex = 0;
      if (!CITATION_GROUP_RE.test(node.value)) return;
      CITATION_GROUP_RE.lastIndex = 0;

      const replacement: ElementContent[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      // eslint-disable-next-line no-cond-assign
      while ((match = CITATION_GROUP_RE.exec(node.value))) {
        const [full, inner] = match;
        if (match.index > lastIndex) {
          replacement.push({ type: 'text', value: node.value.slice(lastIndex, match.index) });
        }
        replacement.push(...buildChipNodes(inner, manifest, canonicalMap));
        lastIndex = match.index + full.length;
        // A zero-length match would loop forever; CITATION_GROUP_RE always
        // matches at least `[x]` so this shouldn't happen, but guard anyway.
        if (full.length === 0) CITATION_GROUP_RE.lastIndex += 1;
      }
      if (lastIndex < node.value.length) {
        replacement.push({ type: 'text', value: node.value.slice(lastIndex) });
      }

      parent.children.splice(index, 1, ...replacement);
      // Resume the walk right after the nodes we just inserted.
      return index + replacement.length;
    });
  };
}
