/**
 * POST /notes9 request body (**`AgentRequest`**): **`query`**, **`session_id`**,
 * optional **`history`**, **`options`**, **`scope`**. Do not use OpenAI-style
 * **`messages`**; **`user_id`** in the body is ignored (identity is the JWT).
 *
 * **Zep vs `history`:** the backend builds the model's prior-turn context from
 * the body **`history`** (it appends the current **`query`** itself), so history
 * passthrough is ON by default. Set
 * **`NEXT_PUBLIC_NOTES9_AGENT_INCLUDE_HISTORY=false`** ONLY when a server-side
 * memory store (Zep) is actually running and owns the thread, to avoid sending
 * history twice. Leaving it unset (the normal case) preserves short-term memory.
 * The Notes9 API splits per-role content into multiple Zep thread messages when a
 * single message would exceed **4096** characters (Zep thread API limit).
 *
 * Use **`POST /chat`** ( **`content`**, not **`query`** ) for general assistant +
 * optional web search; use **`POST /notes9`** for SQL/RAG over lab data.
 */

import { getPreferredAiModel } from "@/lib/ai-model-preference";

import type { AllowedMimeType } from './attachment-types';
import type { PathEntity } from './entity-from-path';

export type Notes9AgentHistoryItem = { role: string; content: string };

/** Workspace entity the user explicitly tagged for this turn. Catalyst preflights
 * each attachment via fetch_full_records before the LLM loop runs, so tagged
 * records arrive in the LLM's context immediately.
 *
 * This union is the WIRE type, and it is the third of three copies of the same
 * set that must agree:
 *
 *   1. `ATTACHMENT_KINDS` in AI/catalyst/core/contracts/request.py - the backend
 *      allowlist. A kind absent there fails pydantic validation, and that is a
 *      422 for the ENTIRE request, not a dropped attachment.
 *   2. `CatalystMentionKind` in lib/catalyst-mention-types.ts - what the UI can
 *      tag. `tagsToAttachments()` in right-sidebar.tsx assigns objects typed by
 *      that union straight into this one, so (2) must be a subset of (3).
 *   3. this.
 *
 * Divergence here is silent in exactly the way that caused this feature to exist:
 * the backend supported `data_file` end to end (fetch_full_records, citations,
 * scope enforcement) while `ATTACHMENT_KINDS` omitted it, so it could never be
 * tagged. `__tests__/catalyst-mention-kinds.test.ts` now pins all three. */
export type Notes9AgentAttachment = {
  kind:
    | 'lab_note'
    | 'literature_review'
    | 'protocol'
    | 'experiment'
    | 'project'
    | 'sample'
    | 'report'
    | 'data_file';
  id: string;
  title?: string;
};

/** File the user uploaded via the chat input (image or PDF). Stored in Supabase
 * Storage by /api/files/upload; catalyst fetches the URL server-side, verifies
 * the bytes against the declared MIME via magic-byte sniff, then forwards as a
 * multi-modal content block to Anthropic. The signed URL is NEVER passed
 * through to the LLM provider. */
export type Notes9FileAttachment = {
  url: string;
  name: string;
  content_type: AllowedMimeType;
  size: number;
};

/** A transient paper passed inline for grounding + inline citation (no DB row).
 * Materialized into a citable source at preflight (agents/core/literature_preflight.py). */
export type Notes9LiteratureSource = {
  title: string;
  abstract?: string;
  doi?: string;
  pmid?: string;
  journal?: string;
  year?: number;
  url?: string;
  authors?: string[];
};

export type Notes9AgentRequestInput = {
  query: string;
  session_id: string;
  history?: Notes9AgentHistoryItem[];
  scope?: object | null;
  /** Top-level attachments, preflight-loaded by the backend. */
  attachments?: Notes9AgentAttachment[];
  /** User-uploaded files (images, PDFs) the LLM should consume this turn. */
  file_attachments?: Notes9FileAttachment[];
  /** Transient papers (title + abstract + ids) grounded + inline-cited without a
   * literature_review row, follow-up context / closed-access "Ask Catalyst". */
  literature_sources?: Notes9LiteratureSource[];
  /** What the user has open on screen (URL → entity). The backend grounds the
   * turn in it when no explicit @-tag is present (FocusEnvelope; consumed only
   * when NOTES9_FOCUS_ENVELOPE is on, so it is safe to always send). */
  focus?: PathEntity;
  options?: {
    debug?: boolean;
    max_retries?: number;
    /** When supported by upstream, enables web search tool alongside SQL/RAG. */
    web_search?: 'on' | 'off';
    /** Persisted internal-data permission: 'ask' (default) | 'always' | 'never'. */
    internal_data_permission?: 'ask' | 'always' | 'never';
    /** True after the user grants access to their private data this session. */
    internal_data_session_granted?: boolean;
  };
};

/** Field caps mirrored from the backend contract (AI/catalyst/agents/contracts/request.py
 * LiteratureSource + MAX_LITERATURE_SOURCES_PER_REQUEST). Pydantic REJECTS the whole
 * request (422) when any cap is exceeded, so the client must truncate, never reject
 * before sending. Keep these in sync with the backend. */
const LITERATURE_SOURCE_CAPS = {
  maxSources: 12,
  title: 1024,
  abstract: 20_000,
  doi: 256,
  pmid: 64,
  journal: 512,
  url: 2048,
  maxAuthors: 64,
  author: 512,
  yearMin: 0,
  yearMax: 3000,
} as const;

function truncated(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/** Deterministically clamp literature sources to the backend pydantic caps.
 * Drops entries without a usable title (required upstream); truncates every
 * string field; coerces/drops out-of-range years. Pure data transform. */
export function sanitizeLiteratureSources(input: unknown): Notes9LiteratureSource[] {
  if (!Array.isArray(input)) return [];
  const out: Notes9LiteratureSource[] = [];
  for (const item of input) {
    if (out.length >= LITERATURE_SOURCE_CAPS.maxSources) break;
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const title = truncated(raw.title, LITERATURE_SOURCE_CAPS.title);
    if (!title) continue;
    const source: Notes9LiteratureSource = { title };
    const abstract = truncated(raw.abstract, LITERATURE_SOURCE_CAPS.abstract);
    if (abstract) source.abstract = abstract;
    const doi = truncated(raw.doi, LITERATURE_SOURCE_CAPS.doi);
    if (doi) source.doi = doi;
    const pmid = truncated(raw.pmid, LITERATURE_SOURCE_CAPS.pmid);
    if (pmid) source.pmid = pmid;
    const journal = truncated(raw.journal, LITERATURE_SOURCE_CAPS.journal);
    if (journal) source.journal = journal;
    const url = truncated(raw.url, LITERATURE_SOURCE_CAPS.url);
    if (url) source.url = url;
    if (typeof raw.year === 'number' && Number.isFinite(raw.year)) {
      const year = Math.trunc(raw.year);
      if (year >= LITERATURE_SOURCE_CAPS.yearMin && year <= LITERATURE_SOURCE_CAPS.yearMax) {
        source.year = year;
      }
    }
    if (Array.isArray(raw.authors)) {
      const authors = raw.authors
        .map((a) => truncated(a, LITERATURE_SOURCE_CAPS.author))
        .filter((a): a is string => Boolean(a))
        .slice(0, LITERATURE_SOURCE_CAPS.maxAuthors);
      if (authors.length > 0) source.authors = authors;
    }
    out.push(source);
  }
  return out;
}

export function notes9AgentIncludesBodyHistory(): boolean {
  // Opt-OUT: history passthrough is ON unless explicitly disabled. Previously
  // this was opt-in (`=== 'true'`) for a Zep integration that was never wired
  // up, so the flag stayed unset and EVERY turn shipped `history: []`, the
  // agent saw only the current message and lost all short-term memory. Disable
  // only when a real server-side memory store owns the thread.
  return process.env.NEXT_PUBLIC_NOTES9_AGENT_INCLUDE_HISTORY !== 'false';
}

/** Shape forwarded to `POST /notes9` (and `/api/agent/run`). Never sends `user_id` from the client. */
export function buildNotes9AgentRequestBody(params: Notes9AgentRequestInput): Record<string, unknown> {
  const includeHistory = notes9AgentIncludesBodyHistory();
  const body: Record<string, unknown> = {
    query: params.query,
    session_id: params.session_id,
    history: includeHistory && params.history?.length ? params.history : [],
  };
  // Settings → AI model: abstract key ("haiku"|"sonnet"|"opus"); omitted =
  // server default. One insertion point covers every agent request path.
  const preferredModel = getPreferredAiModel();
  if (preferredModel) {
    body.model = preferredModel;
  }
  if (params.options !== undefined) {
    body.options = params.options;
  }
  if (params.scope !== undefined && params.scope !== null) {
    body.scope = params.scope;
  }
  // Top-level attachments, the backend reads request.attachments to
  // preflight the corresponding records.
  if (params.attachments && params.attachments.length > 0) {
    body.attachments = params.attachments;
  }
  // User-uploaded files (images, PDFs). Forwarded to catalyst, which
  // fetches the URL server-side and base64-encodes the bytes for the
  // Anthropic multi-modal content block. The URL itself never reaches
  // the LLM provider.
  if (params.file_attachments && params.file_attachments.length > 0) {
    body.file_attachments = params.file_attachments;
  }
  if (params.literature_sources && params.literature_sources.length > 0) {
    const literatureSources = sanitizeLiteratureSources(params.literature_sources);
    if (literatureSources.length > 0) {
      body.literature_sources = literatureSources;
    }
  }
  // What the user has open on screen. Precedence (@-tags > focus > recency) is
  // enforced server-side; inert when NOTES9_FOCUS_ENVELOPE is off.
  if (params.focus) {
    body.focus = params.focus;
  }
  return body;
}
