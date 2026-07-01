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

export type Notes9AgentHistoryItem = { role: string; content: string };

/** Workspace entity the user explicitly tagged for this turn. Catalyst preflights
 * each attachment via fetch_full_records before the LLM loop runs, so tagged
 * records arrive in the LLM's context immediately. */
export type Notes9AgentAttachment = {
  kind:
    | 'lab_note'
    | 'literature_review'
    | 'protocol'
    | 'experiment'
    | 'project'
    | 'sample'
    | 'report';
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
  content_type:
    | 'image/jpeg'
    | 'image/png'
    | 'image/gif'
    | 'image/webp'
    | 'application/pdf'
    | 'text/csv'
    | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
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
  /** Top-level attachments — preflight-loaded by the backend. */
  attachments?: Notes9AgentAttachment[];
  /** User-uploaded files (images, PDFs) the LLM should consume this turn. */
  file_attachments?: Notes9FileAttachment[];
  /** Transient papers (title + abstract + ids) grounded + inline-cited without a
   * literature_review row — follow-up context / closed-access "Ask Catalyst". */
  literature_sources?: Notes9LiteratureSource[];
  options?: {
    debug?: boolean;
    max_retries?: number;
    /** When supported by upstream, enables web search tool alongside SQL/RAG. */
    web_search?: 'on' | 'off';
  };
};

export function notes9AgentIncludesBodyHistory(): boolean {
  // Opt-OUT: history passthrough is ON unless explicitly disabled. Previously
  // this was opt-in (`=== 'true'`) for a Zep integration that was never wired
  // up, so the flag stayed unset and EVERY turn shipped `history: []` — the
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
  if (params.options !== undefined) {
    body.options = params.options;
  }
  if (params.scope !== undefined && params.scope !== null) {
    body.scope = params.scope;
  }
  // Top-level attachments — the backend reads request.attachments to
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
    body.literature_sources = params.literature_sources;
  }
  return body;
}
