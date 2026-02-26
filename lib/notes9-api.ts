const API_BASE = process.env.NEXT_PUBLIC_NOTES9_API_URL || '';

/** Use server proxy to avoid CORS when calling from browser. */
const AGENT_PROXY = '/api/agent/run';

export interface AgentResponse {
  answer: string;
  citations: {
    source_type: string;
    source_id: string;
    relevance: number;
    excerpt?: string;
  }[];
  confidence: number;
  tool_used: 'sql' | 'rag' | 'hybrid';
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
    user_id?: string;
    history?: HistoryMessage[];
  },
  token: string
): Promise<AgentResponse> {
  const res = await fetch(AGENT_PROXY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
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
  },
  token: string
): Promise<ChatResponse> {
  return fetchJsonWithAuth<ChatResponse>(
    '/chat',
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
    token
  );
}
