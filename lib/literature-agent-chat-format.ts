import { escapeMarkdownLinkLabel } from '@/lib/chat-response-sources';
import { renumberCitations } from '@/lib/citation-renumber';
import type { LiteratureAgentDonePayload, PaperAnalyzerReference } from '@/lib/literature-agent-types';

type FormatLiteratureAssistantMarkdownOptions = {
  renumberCitations?: boolean;
};

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
  _endpoint: 'compare' | 'biomni',
  options: FormatLiteratureAssistantMarkdownOptions = {}
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

  let refs = payload.structured?.references ?? [];
  let body = (payload.content || payload.answer || '').trim();

  const knownLabels = new Set(
    refs
      .map((r) => (Number.isFinite(r.index) ? String(r.index) : null))
      .filter((v): v is string => Boolean(v))
  );

  if ((options.renumberCitations ?? true) && knownLabels.size > 0) {
    const { markdown, remap } = renumberCitations(body, knownLabels);
    if (remap.size > 0) {
      body = markdown;
      refs = refs
        .map((r) => {
          const next = remap.get(String(r.index));
          return next ? { ...r, index: Number(next) } : r;
        })
        .sort((a, b) => a.index - b.index);
    }
  }

  const indexMap = buildReferenceIndexMap(refs);

  if (indexMap.size) {
    body = linkifyNumericCitations(body, indexMap);
  }

  return body.trim();
}
