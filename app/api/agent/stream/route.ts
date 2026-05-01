import {
  buildNotes9AgentRequestBody,
  type Notes9AgentHistoryItem,
} from '@/lib/notes9-agent-request';

export const maxDuration = 60;

const NOTES9_API_BASE =
  process.env.NEXT_PUBLIC_NOTES9_API_URL?.replace(/\/$/, '') ||
  process.env.CHAT_API_URL?.replace(/\/$/, '') ||
  '';

export async function POST(req: Request) {
  const headerToken = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  const body = await req.json().catch(() => ({}));
  const { supabaseToken: bodyToken, ...rest } = body;
  const upstreamBody = buildNotes9AgentRequestBody({
    query: typeof rest.query === 'string' ? rest.query : String(rest.query ?? ''),
    session_id:
      typeof rest.session_id === 'string' ? rest.session_id : String(rest.session_id ?? ''),
    history: Array.isArray(rest.history) ? (rest.history as Notes9AgentHistoryItem[]) : undefined,
    options:
      rest.options && typeof rest.options === 'object' && !Array.isArray(rest.options)
        ? (rest.options as { debug?: boolean; max_retries?: number })
        : undefined,
    scope: rest.scope && typeof rest.scope === 'object' ? rest.scope : undefined,
  });
  const token = headerToken || bodyToken;

  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Authorization required. Provide Bearer token in header or supabaseToken in body.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!NOTES9_API_BASE) {
    return new Response(
      JSON.stringify({
        error: 'Notes9 API URL not configured. Set NEXT_PUBLIC_NOTES9_API_URL or CHAT_API_URL.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const response = await fetch(`${NOTES9_API_BASE}/notes9/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(upstreamBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      let body: { error?: string; details?: unknown } = { error: errText || `Upstream error: ${response.status}` };
      try {
        const parsed = JSON.parse(errText) as { error?: string; details?: unknown };
        if (parsed && typeof parsed.error === 'string') body = { error: parsed.error, details: parsed.details };
      } catch {
        /* use body as-is */
      }
      return new Response(JSON.stringify(body), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const contentType = response.headers.get('Content-Type') || 'text/event-stream';
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Agent stream proxy error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Agent stream service unavailable',
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
