import type { DonePayload, GroundingResource } from '@/lib/agent-stream-types';
import type { CitationsManifest, AgentArtifact } from '@/hooks/use-agent-stream';
import {
  NOTES9_ARTIFACTS_MARKER,
  encodeStoredArtifacts,
  parseStoredArtifacts,
  type PersistedArtifact,
} from '@/lib/agent-artifacts';
import { renumberCitations, applyRemapToLabel } from '@/lib/citation-renumber';
import { escapeMarkdownLinkLabel } from '@/lib/chat-response-sources';
import type { LiteratureAgentDonePayload, PaperAnalyzerReference } from '@/lib/literature-agent-types';

/** Chat message rows use DB UUIDs once persisted. */
export function isPersistedChatMessageId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Em dashes in model prose read as machine-written, so they are normalized at
 * render time. Prompt instructions alone don't hold: models emit them anyway,
 * and the conversational prompt lives in the Catalyst backend, not this repo.
 *
 * Code fences and inline code are left verbatim: a dash inside a snippet or a
 * regex is data, not prose.
 *
 * ponytail: an unclosed fence mid-stream is treated as prose for that frame and
 * snaps back once the fence closes. Track fence state across chunks if the
 * transient ever shows up in practice.
 */
export function stripEmDashes(md: string): string {
  if (!md.includes('—')) return md;
  // split() with a capture group keeps the delimiters, at the odd indices.
  return md
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((seg, i) => (i % 2 ? seg : seg.replace(/ — /g, ', ').replace(/—/g, '-')))
    .join('');
}

/** Appended to saved assistant markdown; stripped for display, history, and parsing. */
export const NOTES9_GROUNDING_MARKER = '\n§§NOTES9_GROUNDING§§\n';

/** Appended after the grounding block; carries the base64 citations manifest so
 * restored sessions render identical inline `[N]` chips (with hover previews
 * and click navigation) instead of dead plain-text markers. */
export const NOTES9_MANIFEST_MARKER = '\n§§NOTES9_MANIFEST§§\n';

// Display labels only. Unknown keys fall through to the raw value at the
// usage site via `?? tool`, adding a new agent capability requires no
// change here.
const TOOL_USED_LABEL: Record<string, string> = {
  sql: 'From your records',
  rag: 'From your documents',
  hybrid: 'Records + documents',
  biomni: 'From Cat-Bio synthesis',
  cat_bio: 'From Cat-Bio synthesis',
  web: 'From the web',
  literature: 'From the literature',
  clarification: 'Awaiting your reply',
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
 * Optionally embeds artifact metadata (without short-lived signed URLs) so cards
 * can be re-rendered on reload and re-sign on demand.
 * UI parses {@link parseNotes9AssistantStoredContent} to show “All citations” with deep-links.
 */
export function formatNotes9AssistantMarkdown(
  donePayload: DonePayload,
  citationsManifest?: CitationsManifest | null,
  artifacts?: AgentArtifact[] | null,
): string {
  let refs =
    donePayload.resources?.length
      ? donePayload.resources
      : donePayload.citations ?? [];

  let body = stripTrailingPlainTextReferencesFromModel(donePayload.content ?? donePayload.answer ?? '');
  let manifestRecord: Record<string, unknown> | null =
    citationsManifest?.manifest && Object.keys(citationsManifest.manifest).length > 0
      ? citationsManifest.manifest
      : null;

  // Renumber inline [N] citations by order of first appearance so the prose, the
  // "All citations" list, and the manifest share one contiguous numbering (raw
  // agent cite labels are sparse/arrival-ordered). Mechanical + deterministic;
  // fail-open so a malformed payload never breaks the turn.
  try {
    const known = new Set<string>();
    for (const r of refs) if (r.cite_label) known.add(String(r.cite_label).split('.')[0]);
    if (manifestRecord) for (const k of Object.keys(manifestRecord)) known.add(k.split('.')[0]);
    if (known.size > 0) {
      const { markdown, remap } = renumberCitations(body, known);
      if (remap.size > 0) {
        body = markdown;
        refs = refs
          .map((r) => (r.cite_label ? { ...r, cite_label: applyRemapToLabel(String(r.cite_label), remap) } : r))
          .sort((a, b) => Number(a.cite_label ?? 0) - Number(b.cite_label ?? 0));
        if (manifestRecord) {
          const next: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(manifestRecord)) next[applyRemapToLabel(k, remap)] = v;
          manifestRecord = next;
        }
      }
    }
  } catch {
    // Leave body/refs/manifest untouched on any error, never break the turn.
  }

  let out = body + formatNotes9Footer(donePayload);

  if (refs.length > 0) {
    const payload = utf8ToBase64(JSON.stringify(refs));
    out += NOTES9_GROUNDING_MARKER + payload;
  }

  // Persist the manifest separately so restored sessions resolve the inline
  // `[N]` / `[3.2]` chips by cite_label exactly as the live stream did.
  if (manifestRecord && Object.keys(manifestRecord).length > 0) {
    const manifestPayload = utf8ToBase64(JSON.stringify(manifestRecord));
    out += NOTES9_MANIFEST_MARKER + manifestPayload;
  }

  // Persist artifact metadata (no signed_url, that expires in ~1 h).
  // The card re-signs on demand via /api/agent/artifacts/[dataId]/resign.
  if (artifacts && artifacts.length > 0) {
    out += NOTES9_ARTIFACTS_MARKER + encodeStoredArtifacts(artifacts);
  }

  return out;
}

/**
 * Split stored assistant markdown into display body, structured resources,
 * the citations manifest, and any persisted artifact metadata.
 *
 * Block order in a fully-encoded message (trailing the visible body):
 *   §§NOTES9_GROUNDING§§   <base64 resources>
 *   §§NOTES9_MANIFEST§§    <base64 citations manifest>
 *   §§NOTES9_ARTIFACTS§§   <base64 artifact array>
 */
export function parseNotes9AssistantStoredContent(stored: string): {
  bodyMarkdown: string;
  resources: GroundingResource[];
  citationsManifest: CitationsManifest | null;
  artifacts: PersistedArtifact[];
} {
  let working = stored;

  // 1. Peel off artifact block (always last).
  let artifacts: PersistedArtifact[] = [];
  const ai = working.lastIndexOf(NOTES9_ARTIFACTS_MARKER);
  if (ai !== -1) {
    const artifactsB64 = working.slice(ai + NOTES9_ARTIFACTS_MARKER.length).trim();
    working = working.slice(0, ai);
    artifacts = parseStoredArtifacts(artifactsB64);
  }

  // 2. Peel off the manifest block.
  let citationsManifest: CitationsManifest | null = null;
  const mi = working.lastIndexOf(NOTES9_MANIFEST_MARKER);
  if (mi !== -1) {
    const manifestB64 = working.slice(mi + NOTES9_MANIFEST_MARKER.length).trim();
    working = working.slice(0, mi);
    try {
      const json = base64ToUtf8(manifestB64);
      const parsed = JSON.parse(json) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        citationsManifest = { manifest: parsed as CitationsManifest['manifest'] };
      }
    } catch {
      citationsManifest = null;
    }
  }

  // 3. Peel off the grounding block.
  const i = working.lastIndexOf(NOTES9_GROUNDING_MARKER);
  if (i === -1) {
    return {
      bodyMarkdown: stripLegacyMarkdownReferencesSection(working),
      resources: [],
      citationsManifest,
      artifacts,
    };
  }

  const bodyMarkdown = working.slice(0, i);
  const b64 = working.slice(i + NOTES9_GROUNDING_MARKER.length).trim();

  try {
    const json = base64ToUtf8(b64);
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) {
      return { bodyMarkdown, resources: [], citationsManifest, artifacts };
    }
    const resources = parsed as GroundingResource[];
    return { bodyMarkdown, resources, citationsManifest, artifacts };
  } catch {
    return { bodyMarkdown: working.slice(0, i), resources: [], citationsManifest, artifacts };
  }
}

// Re-export so chat surfaces that only import from notes9-chat-format can
// still access the low-level artifact helpers without a second import.
export { parseStoredArtifacts, encodeStoredArtifacts, type PersistedArtifact };

/** Strip grounding appendix before sending assistant turns in Notes9 API history. */
export function notes9PlainTextForApiHistory(full: string, role: string): string {
  if (role !== 'assistant') return full;
  return parseNotes9AssistantStoredContent(full).bodyMarkdown;
}

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
