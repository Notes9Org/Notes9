import { NextResponse } from 'next/server';

export const maxDuration = 60;

const UPSTREAM = process.env.LITERATURE_COMPARE_AGENT_URL?.replace(/\/$/, '') ?? '';

type Body = {
  query?: string;
  session_id?: string;
  history?: unknown;
  literature_review_ids?: unknown;
  options?: unknown;
};

export async function POST(req: Request) {
  const headerToken = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  const body = (await req.json().catch(() => ({}))) as Body;
  const token = headerToken;

  if (!token) {
    return NextResponse.json(
      { error: 'Authorization required. Provide Bearer token.' },
      { status: 401 }
    );
  }

  const query = typeof body.query === 'string' ? body.query : String(body.query ?? '');
  const session_id =
    typeof body.session_id === 'string' ? body.session_id : String(body.session_id ?? '');
  const literature_review_ids = Array.isArray(body.literature_review_ids)
    ? body.literature_review_ids.filter((id): id is string => typeof id === 'string')
    : [];

  if (!query.trim()) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 });
  }

  const forwardBody = {
    query,
    session_id,
    history: Array.isArray(body.history) ? body.history : [],
    literature_review_ids,
    options:
      body.options && typeof body.options === 'object' && !Array.isArray(body.options)
        ? body.options
        : undefined,
  };

  if (!UPSTREAM) {
    return NextResponse.json({
      role: 'assistant',
      content:
        'Literature compare agent is not connected yet. Set **LITERATURE_COMPARE_AGENT_URL** to your HTTP endpoint. Request shape: `query`, `session_id`, `history[]`, `literature_review_ids[]`.',
      answer:
        'Literature compare agent is not connected yet. Set LITERATURE_COMPARE_AGENT_URL to your HTTP endpoint.',
    });
  }

  try {
    const response = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(forwardBody),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        typeof data === 'object' && data && 'error' in data
          ? data
          : { error: `Upstream error: ${response.status}` },
        { status: response.status }
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error('Literature compare proxy error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Literature compare service unavailable' },
      { status: 502 }
    );
  }
}
