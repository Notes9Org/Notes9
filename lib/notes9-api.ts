import { buildNotes9AgentRequestBody } from '@/lib/notes9-agent-request';
import {
  buildGeneralChatNotes9UpstreamBody,
  type GeneralChatHistoryItem,
} from '@/lib/general-chat-request';

const API_BASE = process.env.NEXT_PUBLIC_NOTES9_API_URL || '';

/** Use server proxy to avoid CORS when calling from browser. */
const AGENT_PROXY = '/api/agent/run';

/** POST /notes9 — same top-level keys as chat plus agent fields. */
export interface AgentResponse {
  role: string;
  content: string;
  resources?: {
    display_label?: string;
    source_type: string;
    source_name?: string | null;
    relevance: number;
    excerpt?: string | null;
  }[];
  confidence?: number;
  tool_used?: 'sql' | 'rag' | 'hybrid' | 'none';
}

export interface ChatResponse {
  content: string;
  role: string;
}

export interface HistoryMessage {
  role: string;
  content: string;
}

async function fetchWithAuth(
  path: string,
  options: RequestInit,
  token: string
): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  return res;
}

export class Notes9ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'Notes9ApiError';
  }
}

async function fetchJsonWithAuth<T>(
  path: string,
  options: RequestInit,
  token: string
): Promise<T> {
  const res = await fetchWithAuth(path, options, token);
  if (!res.ok) {
    const errText = await res.text();
    throw new Notes9ApiError(
      errText || `Request failed: ${res.status}`,
      res.status
    );
  }
  return res.json();
}

export async function runAgent(
  params: {
    query: string;
    session_id: string;
    history?: HistoryMessage[];
    options?: { debug?: boolean; max_retries?: number };
    scope?: object | null;
  },
  token: string
): Promise<AgentResponse> {
  const res = await fetch(AGENT_PROXY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(buildNotes9AgentRequestBody(params)),
  });
  if (!res.ok) {
    const errText = await res.text();
    let errData: { error?: string } = {};
    try {
      errData = JSON.parse(errText);
    } catch {
      /* ignore */
    }
    throw new Notes9ApiError(
      errData.error || errText || `Request failed: ${res.status}`,
      res.status
    );
  }
  return res.json();
}

export async function chat(
  params: {
    content: string;
    session_id: string;
    history?: HistoryMessage[];
    web_search?: 'on' | 'off';
    response_format?: 'text' | 'json';
  },
  token: string
): Promise<ChatResponse> {
  return fetchJsonWithAuth<ChatResponse>(
    '/chat',
    {
      method: 'POST',
      body: JSON.stringify(
        buildGeneralChatNotes9UpstreamBody({
          content: params.content,
          session_id: params.session_id,
          history: (params.history ?? []) as GeneralChatHistoryItem[],
          web_search: params.web_search ?? 'off',
          response_format: params.response_format,
        })
      ),
    },
    token
  );
}
