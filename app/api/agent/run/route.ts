import { NextResponse } from 'next/server';
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
  console.log(
    'Agent Request Body:',
    JSON.stringify({ ...upstreamBody, supabaseToken: bodyToken ? '[REDACTED]' : undefined }, null, 2)
  );
  const token = headerToken || bodyToken;

  if (!token) {
    return NextResponse.json(
      { error: 'Authorization required. Provide Bearer token in header or supabaseToken in body.' },
      { status: 401 }
    );
  }

  if (!NOTES9_API_BASE) {
    return NextResponse.json(
      { error: 'Notes9 API URL not configured. Set NEXT_PUBLIC_NOTES9_API_URL or CHAT_API_URL.' },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(`${NOTES9_API_BASE}/notes9`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(upstreamBody),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        data?.error ? { error: data.error } : data,
        { status: response.status }
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error('Agent proxy error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Agent service unavailable' },
      { status: 502 }
    );
  }
}
