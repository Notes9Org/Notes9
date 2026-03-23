/**
 * POST /notes9 request body (**`AgentRequest`**): **`query`**, **`session_id`**,
 * optional **`history`**, **`options`**, **`scope`**. Do not use OpenAI-style
 * **`messages`**; **`user_id`** in the body is ignored (identity is the JWT).
 *
 * **Zep vs `history`:** With Zep on, body **`history`** is ignored; default here
 * is **`[]`** unless **`NEXT_PUBLIC_NOTES9_AGENT_INCLUDE_HISTORY=true`** (Zep off).
 *
 * Use **`POST /chat`** ( **`content`**, not **`query`** ) for general assistant +
 * optional web search; use **`POST /notes9`** for SQL/RAG over lab data.
 */

export type Notes9AgentHistoryItem = { role: string; content: string };

export type Notes9AgentRequestInput = {
  query: string;
  session_id: string;
  history?: Notes9AgentHistoryItem[];
  scope?: object | null;
  options?: { debug?: boolean; max_retries?: number };
};

export function notes9AgentIncludesBodyHistory(): boolean {
  return process.env.NEXT_PUBLIC_NOTES9_AGENT_INCLUDE_HISTORY === 'true';
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
  return body;
}
