import { escapeMarkdownLinkLabel } from '@/lib/chat-response-sources';
import type { LiteratureAgentDonePayload, PaperAnalyzerReference } from '@/lib/literature-agent-types';

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

/**
 * Literature agent reply body: markdown with linked `[n]` when `structured.references` maps indices.
 * Citation detail is stored separately (see `serializeLiteratureAssistantStoredContent`) and shown in the Sources dropdown.
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

  return body.trim();
}
