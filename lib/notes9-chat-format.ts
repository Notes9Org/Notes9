import type { DonePayload, GroundingResource } from '@/lib/agent-stream-types';

/** Chat message rows use DB UUIDs once persisted. */
export function isPersistedChatMessageId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** Appended to saved assistant markdown; stripped for display, history, and parsing. */
export const NOTES9_GROUNDING_MARKER = '\n§§NOTES9_GROUNDING§§\n';

const TOOL_USED_LABEL: Record<string, string> = {
  sql: 'From database',
  rag: 'From your documents',
  hybrid: 'Database + documents',
  none: '',
};

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Remove model-echoed reference lists from the answer body before we attach structured grounding. */
function stripTrailingPlainTextReferencesFromModel(body: string): string {
  let s = body.trimEnd();
  s = s.replace(/\n\n\*\*References:\*\*\n[\s\S]*$/i, '');
  s = s.replace(/\n\nReferences:\s*[^\n]*\n[\s\S]*$/i, '');
  return s.trimEnd();
}

function stripLegacyMarkdownReferencesSection(md: string): string {
  const boldRef = /\n\n\*\*References:\*\*/;
  const boldMatch = boldRef.exec(md);
  if (boldMatch && boldMatch.index != null) {
    const start = boldMatch.index;
    const tail = md.slice(start);
    const hr = tail.indexOf('\n\n---\n\n');
    if (hr !== -1) return md.slice(0, start) + tail.slice(hr);
    return md.slice(0, start).trimEnd();
  }
  const plainRef = /\n\nReferences:/i;
  const pm = plainRef.exec(md);
  if (pm && pm.index != null) {
    const start = pm.index;
    const tail = md.slice(start);
    const hr = tail.indexOf('\n\n---\n\n');
    if (hr !== -1) return md.slice(0, start) + tail.slice(hr);
    return md.slice(0, start).trimEnd();
  }
  return md;
}

function formatNotes9Footer(donePayload: DonePayload): string {
  const parts: string[] = [];
  const tool = donePayload.tool_used;
  if (tool && tool !== 'none') {
    const t = TOOL_USED_LABEL[tool] ?? tool;
    if (t) parts.push(t);
  }
  if (!parts.length) return '';
  return `\n\n---\n\n*${parts.join(' · ')}*\n`;
}

/**
 * Persist assistant turn: answer markdown + footer + opaque grounding payload (like literature agent).
 * UI parses {@link parseNotes9AssistantStoredContent} to show “All citations” with deep-links.
 */
export function formatNotes9AssistantMarkdown(donePayload: DonePayload): string {
  const refs =
    donePayload.resources?.length
      ? donePayload.resources
      : donePayload.citations ?? [];

  let body = stripTrailingPlainTextReferencesFromModel(donePayload.content ?? donePayload.answer ?? '');
  let out = body + formatNotes9Footer(donePayload);

  if (refs.length > 0) {
    const payload = utf8ToBase64(JSON.stringify(refs));
    out += NOTES9_GROUNDING_MARKER + payload;
  }

  return out;
}

/**
 * Split stored assistant markdown into display body and structured resources for {@link AgentCitationsPanel}.
 */
export function parseNotes9AssistantStoredContent(stored: string): {
  bodyMarkdown: string;
  resources: GroundingResource[];
} {
  const i = stored.lastIndexOf(NOTES9_GROUNDING_MARKER);
  if (i === -1) {
    return {
      bodyMarkdown: stripLegacyMarkdownReferencesSection(stored),
      resources: [],
    };
  }

  const bodyMarkdown = stored.slice(0, i);
  const b64 = stored.slice(i + NOTES9_GROUNDING_MARKER.length).trim();

  try {
    const json = base64ToUtf8(b64);
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) {
      return { bodyMarkdown, resources: [] };
    }
    const resources = parsed as GroundingResource[];
    return { bodyMarkdown, resources };
  } catch {
    return { bodyMarkdown: stored.slice(0, i), resources: [] };
  }
}

/** Strip grounding appendix before sending assistant turns in Notes9 API history. */
export function notes9PlainTextForApiHistory(full: string, role: string): string {
  if (role !== 'assistant') return full;
  return parseNotes9AssistantStoredContent(full).bodyMarkdown;
}
