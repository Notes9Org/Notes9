import { escapeMarkdownLinkLabel } from '@/lib/chat-response-sources';
import type {
  LiteratureAgentDonePayload,
  PaperAnalyzerReference,
  PaperAnalyzerSource,
} from '@/lib/literature-agent-types';

const ABSTRACT_MAX = 360;
const SENTENCE_MAX = 2000;

function literatureReviewPath(id: string): string {
  return `/literature-reviews/${encodeURIComponent(id)}`;
}

/** Turn `[n]` (not already `[n](url)`) into links to the literature review when index is known. */
function linkifyNumericCitations(
  markdown: string,
  indexToId: Map<number, string>
): string {
  if (!indexToId.size) return markdown;
  return markdown.replace(/\[(\d+)\](?!\()/g, (_, num: string) => {
    const n = Number(num);
    const id = indexToId.get(n);
    if (!id) return `[${num}]`;
    return `[${num}](${literatureReviewPath(id)})`;
  });
}

function buildReferenceIndexMap(refs: PaperAnalyzerReference[]): Map<number, string> {
  const m = new Map<number, string>();
  for (const r of refs) {
    const id = r.literature_review_id?.trim();
    if (Number.isFinite(r.index) && id) m.set(r.index, id);
  }
  return m;
}

function doiUrl(doi: string): string {
  const d = doi.trim().replace(/^https?:\/\/doi\.org\//i, '');
  return `https://doi.org/${encodeURIComponent(d)}`;
}

function pmidUrl(pmid: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pmid.trim())}/`;
}

function formatSourceBlock(s: PaperAnalyzerSource, listIndex: number): string {
  const id = s.literature_review_id?.trim();
  const path = id ? literatureReviewPath(id) : '';
  const titleSafe = s.title?.trim()
    ? escapeMarkdownLinkLabel(s.title.trim())
    : '';

  let block: string;
  if (path && titleSafe) {
    block = `${listIndex}. **[${titleSafe}](${path})**`;
  } else if (path) {
    block = `${listIndex}. [View in library](${path})`;
  } else if (titleSafe) {
    block = `${listIndex}. **${titleSafe}**`;
  } else {
    block = `${listIndex}. _Source_`;
  }
  block += `  \n`;

  const meta: string[] = [];
  if (s.authors?.trim()) {
    meta.push(`*${escapeMarkdownLinkLabel(s.authors.trim())}*`);
  }
  const jour = [s.journal?.trim(), s.publication_year != null ? String(s.publication_year) : '']
    .filter(Boolean)
    .join(', ');
  if (jour) meta.push(`_${escapeMarkdownLinkLabel(jour)}_`);

  if (s.catalog_placement?.trim()) {
    meta.push(`\`${s.catalog_placement.trim()}\``);
  }

  if (meta.length) {
    block += `   ${meta.join(' · ')}\n`;
  }

  if (s.doi?.trim()) {
    const d = s.doi.trim();
    block += `   · DOI: [${escapeMarkdownLinkLabel(d)}](${doiUrl(d)})\n`;
  }
  if (s.pmid?.trim()) {
    const p = s.pmid.trim();
    block += `   · PMID: [${escapeMarkdownLinkLabel(p)}](${pmidUrl(p)})\n`;
  }

  if (s.abstract?.trim()) {
    let abs = s.abstract.trim();
    if (abs.length > ABSTRACT_MAX) abs = `${abs.slice(0, ABSTRACT_MAX - 1)}…`;
    block += `\n   *Abstract:* ${abs}\n`;
  }

  const hints: string[] = [];
  if (s.has_extracted_text && typeof s.extracted_text_char_count === 'number') {
    hints.push(`full text ≈ ${s.extracted_text_char_count.toLocaleString()} chars indexed`);
  }
  if (s.context_sent_to_model_was_truncated) {
    hints.push('context to model was truncated');
  }
  if (hints.length) {
    block += `\n   _${hints.join(' · ')}_\n`;
  }

  return block;
}

function formatReferenceDetail(ref: PaperAnalyzerReference): string {
  const id = ref.literature_review_id?.trim();
  const path = id ? literatureReviewPath(id) : '';
  const title =
    ref.title?.trim() ||
    `Untitled reference`;
  const safeTitle = escapeMarkdownLinkLabel(title);

  let block = path
    ? `**[${ref.index}].** [${safeTitle}](${path})\n\n`
    : `**[${ref.index}].** ${safeTitle}\n\n`;

  const ids: string[] = [];
  if (ref.doi?.trim()) {
    const d = ref.doi.trim();
    ids.push(`DOI [${escapeMarkdownLinkLabel(d)}](${doiUrl(d)})`);
  }
  if (ref.pmid?.trim()) {
    const p = ref.pmid.trim();
    ids.push(`PMID [${escapeMarkdownLinkLabel(p)}](${pmidUrl(p)})`);
  }
  if (ids.length) {
    block += `**Identifiers:** ${ids.join(' · ')}\n\n`;
  }

  if (ref.note?.trim()) {
    block += `**Note:** *${escapeMarkdownLinkLabel(ref.note.trim())}*\n\n`;
  }

  const sentences = ref.supporting_sentences?.filter(Boolean) ?? [];
  if (sentences.length) {
    block += '**Supporting sentences**\n\n';
    for (const s of sentences) {
      let line = s.trim();
      if (line.length > SENTENCE_MAX) line = `${line.slice(0, SENTENCE_MAX - 1)}…`;
      const quoted = line
        .split(/\n+/)
        .map((ln) => `> ${ln}`)
        .join('\n');
      block += `${quoted}\n\n`;
    }
  }

  return block.trimEnd() + '\n';
}

/**
 * Compare mode (non–research-design): markdown answer with linked [n] citations,
 * then **Sources** (clickable IDs + metadata), then **Citation detail** from `structured.references`.
 */
export function formatLiteratureAssistantMarkdown(
  payload: LiteratureAgentDonePayload,
  endpoint: 'compare' | 'biomni'
): string {
  if (endpoint === 'biomni') {
    return (payload.content || payload.answer || '').trim();
  }

  const refs = payload.structured?.references ?? [];
  const indexMap = buildReferenceIndexMap(refs);
  let body = (payload.content || payload.answer || '').trim();

  if (indexMap.size) {
    body = linkifyNumericCitations(body, indexMap);
  }

  const parts: string[] = [body];

  const sources = payload.sources ?? [];
  if (sources.length > 0) {
    parts.push('\n\n---\n\n### Sources\n\n');
    parts.push(
      sources.map((s, i) => formatSourceBlock(s, i + 1)).join('\n')
    );
  }

  if (refs.length > 0) {
    parts.push('\n\n---\n\n### Citation detail\n\n');
    const sorted = [...refs].sort((a, b) => a.index - b.index);
    parts.push(sorted.map(formatReferenceDetail).join('\n'));
  }

  return parts.join('').trim();
}
