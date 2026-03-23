import type { DonePayload, GroundingResource } from '@/lib/agent-stream-types';
import { escapeMarkdownLinkLabel } from '@/lib/chat-response-sources';

/** Chat message rows use DB UUIDs once persisted. */
export function isPersistedChatMessageId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

const EXCERPT_MAX = 320;

const TOOL_USED_LABEL: Record<string, string> = {
  sql: 'From database',
  rag: 'From your documents',
  hybrid: 'Database + documents',
  none: '',
};

function resolveNotes9ResourceRoute(c: GroundingResource): string {
  const id = c.source_id;
  if (id == null || String(id).trim() === '') return '';
  switch (c.source_type) {
    case 'literature_review':
      return `/literature-reviews/${id}`;
    case 'protocol':
      return `/protocols/${id}`;
    case 'project':
      return `/projects/${id}`;
    case 'experiment':
      return `/experiments/${id}`;
    case 'lab_note':
    case 'report':
    default:
      return '';
  }
}

/** Single reference line for POST /notes9 `resources[]` (RAG/SQL grounding). */
function formatNotes9ResourceLine(citation: GroundingResource, index: number): string {
  const n = index + 1;
  const route = resolveNotes9ResourceRoute(citation);
  const title =
    citation.display_label?.trim() ||
    citation.source_name?.trim() ||
    citation.source_type.replace(/_/g, ' ');
  const safeTitle = escapeMarkdownLinkLabel(title);

  let line = route
    ? `[${n}] [${safeTitle}](${route})`
    : `[${n}] **${safeTitle}**`;

  const excerpt = citation.excerpt?.trim();
  if (excerpt) {
    const clipped = excerpt.length > EXCERPT_MAX ? `${excerpt.slice(0, EXCERPT_MAX - 1)}…` : excerpt;
    line += ` — ${clipped}`;
  }

  if (typeof citation.relevance === 'number' && citation.relevance >= 0 && citation.relevance <= 1) {
    line += ` *(${Math.round(citation.relevance * 100)}% match)*`;
  }

  return line;
}

function formatNotes9Footer(donePayload: DonePayload): string {
  const parts: string[] = [];
  if (donePayload.confidence != null && donePayload.confidence >= 0 && donePayload.confidence <= 1) {
    parts.push(`Confidence ${Math.round(donePayload.confidence * 100)}%`);
  }
  const tool = donePayload.tool_used;
  if (tool && tool !== 'none') {
    const t = TOOL_USED_LABEL[tool] ?? tool;
    if (t) parts.push(t);
  }
  if (!parts.length) return '';
  return `\n\n---\n\n*${parts.join(' · ')}*\n`;
}

/**
 * Turn POST /notes9 assistant payload into markdown for chat history:
 * main `content`, then **References** from `resources` / `citations`, then optional tool/confidence footnote.
 */
export function formatNotes9AssistantMarkdown(donePayload: DonePayload): string {
  const refs =
    donePayload.resources?.length
      ? donePayload.resources
      : donePayload.citations ?? [];
  let formattedAnswer = donePayload.content ?? donePayload.answer ?? '';

  if (refs.length > 0) {
    formattedAnswer += '\n\n**References:**\n';
    formattedAnswer += refs.map((citation, index) => formatNotes9ResourceLine(citation, index)).join('\n');
  }

  formattedAnswer += formatNotes9Footer(donePayload);
  return formattedAnswer;
}
