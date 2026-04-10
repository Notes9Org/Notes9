/**
 * Upstream **`POST /chat`** body (general Catalyst → `/api/chat` → Notes9 `/chat`).
 *
 * **Zep vs `history`:** With Zep on, the server loads the thread from memory for
 * `(session_id, JWT user)` and ignores body **`history`**. Send **`history: []`**
 * (default here unless **`NEXT_PUBLIC_GENERAL_CHAT_INCLUDE_HISTORY=true`**).
 * Long turns are split server-side so each Zep thread message stays within **4096**
 * characters.
 *
 * Fields match **`ChatRequest`**: **`content`**, **`session_id`**, optional
 * **`history`**, **`web_search`** (`'on' | 'off'`), optional **`response_format`**
 * (`'text'` | `'json'`).
 */

export type GeneralChatHistoryItem = { role: 'user' | 'assistant'; content: string };

export function generalChatIncludesBodyHistory(): boolean {
  return process.env.NEXT_PUBLIC_GENERAL_CHAT_INCLUDE_HISTORY === 'true';
}

/** Notes9 AI service: `web_search` must be `'on' | 'off'`; optional `response_format`. */
export function buildGeneralChatNotes9UpstreamBody(params: {
  content: string;
  session_id: string;
  history: GeneralChatHistoryItem[];
  web_search: 'on' | 'off';
  response_format?: 'text' | 'json';
}): Record<string, unknown> {
  const includeHistory = generalChatIncludesBodyHistory();
  const body: Record<string, unknown> = {
    content: params.content,
    session_id: params.session_id,
    history: includeHistory && params.history.length ? params.history : [],
    web_search: params.web_search,
  };
  if (params.response_format !== undefined) {
    body.response_format = params.response_format;
  }
  return body;
}

/** Legacy AI service: optional boolean `web_search`. */
export function buildGeneralChatLegacyUpstreamBody(params: {
  content: string;
  session_id: string;
  history: GeneralChatHistoryItem[];
  webSearchOn: boolean;
}): Record<string, unknown> {
  const includeHistory = generalChatIncludesBodyHistory();
  const body: Record<string, unknown> = {
    content: params.content,
    session_id: params.session_id,
    history: includeHistory && params.history.length ? params.history : [],
  };
  if (params.webSearchOn) {
    body.web_search = true;
  }
  return body;
}

/** Notes9 `POST /chat/stream` body: `content`, `session_id`, optional `history`, `web_search`. */
export function buildGeneralChatStreamNotes9UpstreamBody(params: {
  content: string;
  session_id: string;
  history: GeneralChatHistoryItem[];
  web_search: 'on' | 'off';
  skip_clarify?: boolean;
}): Record<string, unknown> {
  const includeHistory = generalChatIncludesBodyHistory();
  const body: Record<string, unknown> = {
    content: params.content,
    session_id: params.session_id,
    history: includeHistory && params.history.length ? params.history : [],
    web_search: params.web_search,
  };
  if (params.skip_clarify === true) {
    body.options = { skip_clarify: true };
  }
  return body;
}
