import { NextRequest, NextResponse } from 'next/server';

interface BiomniRequest {
  task: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  session_id?: string;
  user_id?: string;
  timeout?: number;
}

interface BiomniResponse {
  task_id?: string;
  status?: string;
  result?: string;
  answer?: string;
  error?: string;
}

function parsePositiveInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function getBiomniBaseUrl(): string | null {
  const raw = (process.env.BIOMNI_API_BASE_URL ?? process.env.BIOMNI_API_URL ?? '').trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  return raw.replace(/\/$/, '');
}

export async function POST(request: NextRequest) {
  const baseUrl = getBiomniBaseUrl();
  const bearerToken = process.env.BIOMNI_API_BEARER_TOKEN ?? process.env.BIOMNI_API_KEY;
  const upstreamTimeoutMs = parsePositiveInt(
    process.env.BIOMNI_API_TIMEOUT_MS,
    120_000,
    1_000,
    600_000
  );

  if (!baseUrl) {
    return NextResponse.json(
      { error: 'Valid BIOMNI_API_BASE_URL is not configured' },
      { status: 500 }
    );
  }

  let body: BiomniRequest;
  try {
    body = (await request.json()) as BiomniRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.task || typeof body.task !== 'string' || !body.task.trim()) {
    return NextResponse.json({ error: 'task is required' }, { status: 400 });
  }
  if (body.task.length > 20_000) {
    return NextResponse.json({ error: 'task is too long' }, { status: 400 });
  }
  if (body.timeout !== undefined && (!Number.isInteger(body.timeout) || body.timeout <= 0 || body.timeout > 3600)) {
    return NextResponse.json({ error: 'timeout must be a positive integer <= 3600' }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${baseUrl}/agent/run/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      },
      signal: AbortSignal.timeout(upstreamTimeoutMs),
      cache: 'no-store',
      body: JSON.stringify({
        task: body.task.trim(),
        history: Array.isArray(body.history) ? body.history : [],
        session_id: body.session_id,
        user_id: body.user_id,
        timeout: body.timeout,
      }),
    });

    const text = await upstream.text();
    let data: BiomniResponse = {};

    try {
      data = text ? (JSON.parse(text) as BiomniResponse) : {};
    } catch {
      if (!upstream.ok) {
        return NextResponse.json(
          { error: `Biomni upstream error (${upstream.status})` },
          { status: upstream.status }
        );
      }

      return NextResponse.json(
        { result: text, status: 'completed' },
        { status: 200 }
      );
    }

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error:
            typeof data.error === 'string'
              ? data.error
              : `Biomni upstream error (${upstream.status})`,
        },
        { status: upstream.status }
      );
    }

    return NextResponse.json(
      {
        task_id: data.task_id,
        status: data.status ?? 'completed',
        result:
          typeof data.result === 'string'
            ? data.result
            : typeof data.answer === 'string'
              ? data.answer
              : '',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Biomni proxy error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Biomni service unavailable',
      },
      { status: 502 }
    );
  }
}
