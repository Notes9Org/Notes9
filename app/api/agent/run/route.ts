import { NextResponse } from 'next/server';

export const maxDuration = 60;

const NOTES9_API_BASE = process.env.NEXT_PUBLIC_NOTES9_API_URL?.replace(/\/$/, '') || '';

export async function POST(req: Request) {
  const headerToken = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  const body = await req.json().catch(() => ({}));
  const { supabaseToken: bodyToken, ...params } = body;
  console.log('Agent Request Body:', JSON.stringify({ ...params, supabaseToken: bodyToken ? '[REDACTED]' : undefined }, null, 2));
  const token = headerToken || bodyToken;

  if (!token) {
    return NextResponse.json(
      { error: 'Authorization required. Provide Bearer token in header or supabaseToken in body.' },
      { status: 401 }
    );
  }

  if (!NOTES9_API_BASE) {
    return NextResponse.json(
      { error: 'Notes9 API URL not configured.' },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(`${NOTES9_API_BASE}/agent/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
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
