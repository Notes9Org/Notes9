import { escapeMarkdownLinkLabel } from '@/lib/chat-response-sources';
import type { LiteratureAgentDonePayload, PaperAnalyzerReference } from '@/lib/literature-agent-types';

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
 * Literature agent reply: markdown `content` with linked `[n]` when `structured.references` maps indices,
 * then **Citation detail** (identifiers, note, supporting sentences). Top-level `sources` from the API is ignored here to avoid duplicating citation blocks.
 * Biomni clarification: `needs_clarification` / `clarify_question` / `clarify_options`.
 */
export function formatLiteratureAssistantMarkdown(
  payload: LiteratureAgentDonePayload,
  _endpoint: 'compare' | 'biomni'
): string {
  if (payload.needs_clarification) {
    const q = payload.clarify_question?.trim();
    const opts = payload.clarify_options ?? [];
    if (q) {
      let md = `### Clarification needed\n\n${q}`;
      if (opts.length) {
        md += '\n\n';
        md += opts
          .map((o) => (typeof o === 'string' && o.trim() ? `- ${escapeMarkdownLinkLabel(o.trim())}` : ''))
          .filter(Boolean)
          .join('\n');
      }
      return md.trim();
    }
  }

  const refs = payload.structured?.references ?? [];
  const indexMap = buildReferenceIndexMap(refs);
  let body = (payload.content || payload.answer || '').trim();

  if (indexMap.size) {
    body = linkifyNumericCitations(body, indexMap);
  }

  const parts: string[] = [body];

  if (refs.length > 0) {
    parts.push('\n\n---\n\n### Citation detail\n\n');
    const sorted = [...refs].sort((a, b) => a.index - b.index);
    parts.push(sorted.map(formatReferenceDetail).join('\n'));
  }

  return parts.join('').trim();
}
