import { formatLiteratureAssistantMarkdown } from '@/lib/literature-agent-chat-format';
import { normalizeLiteratureAgentResponse } from '@/lib/literature-agent-types';

export type LiteratureLiveStreamPreview =
  | { kind: 'markdown'; markdown: string }
  | { kind: 'waiting_structured' }
  | { kind: 'empty' };

/**
 * Models often wrap paper-analyzer JSON in markdown fences (` ```json ... ``` `).
 * That is still plain text in `token` events, so it does not start with `{` until
 * after stripping — without this, MarkdownRenderer shows a dark code block.
 */
function stripOptionalMarkdownJsonFence(raw: string): { core: string; hadOpeningFence: boolean } {
  let s = raw.trimStart();
  const hadOpeningFence = /^```(?:json)?/i.test(s);
  if (hadOpeningFence) {
    s = s.replace(/^```(?:json)?\s*\r?\n?/i, '');
  }
  s = s.replace(/\r?\n```\s*$/,'').trim();
  return { core: s, hadOpeningFence };
}

/** Skip intro lines like "Here is the JSON:" before a fenced block. */
function sliceFromFirstCodeFence(raw: string): string {
  const m = raw.match(/```(?:json)?/i);
  if (m?.index == null) return raw;
  return raw.slice(m.index);
}

/** Closed ```…``` block; use last ``` so newlines inside JSON do not break the match. */
function extractClosedJsonFenceInner(raw: string): string | null {
  const openMatch = raw.match(/```(?:json)?\s*\r?\n?/i);
  if (!openMatch || openMatch.index === undefined) return null;
  const contentStart = openMatch.index + openMatch[0].length;
  const closeStart = raw.lastIndexOf('```');
  if (closeStart <= openMatch.index) return null;
  const inner = raw.slice(contentStart, closeStart).trim().replace(/^\uFEFF/, '');
  return inner.startsWith('{') ? inner : null;
}

/**
 * Map SSE `token` accumulation to UI: prose streams pass through; JSON-shaped streams
 * (paper-analyzer often emits the full object as tokens) show a placeholder until
 * parse succeeds, then the same markdown body as the saved message.
 */
export function previewFromLiteratureSseTokenBuffer(
  accumulated: string,
  endpoint: 'compare' | 'biomni'
): LiteratureLiveStreamPreview {
  if (!accumulated.trim()) return { kind: 'empty' };

  const closedInner = extractClosedJsonFenceInner(accumulated);
  if (closedInner) {
    try {
      const parsed = JSON.parse(closedInner) as Record<string, unknown>;
      const normalized = normalizeLiteratureAgentResponse(parsed);
      const md = formatLiteratureAssistantMarkdown(normalized, endpoint).trim();
      if (md) return { kind: 'markdown', markdown: md };
      return { kind: 'waiting_structured' };
    } catch {
      return { kind: 'waiting_structured' };
    }
  }

  const sliced = sliceFromFirstCodeFence(accumulated);
  const { core, hadOpeningFence } = stripOptionalMarkdownJsonFence(sliced);
  const jsonCandidate = core.trimStart().replace(/^\uFEFF/, '');

  if (jsonCandidate.startsWith('{')) {
    try {
      const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>;
      const normalized = normalizeLiteratureAgentResponse(parsed);
      const md = formatLiteratureAssistantMarkdown(normalized, endpoint).trim();
      if (md) return { kind: 'markdown', markdown: md };
      return { kind: 'waiting_structured' };
    } catch {
      return { kind: 'waiting_structured' };
    }
  }

  if (hadOpeningFence) {
    return { kind: 'waiting_structured' };
  }

  return { kind: 'markdown', markdown: accumulated };
}
