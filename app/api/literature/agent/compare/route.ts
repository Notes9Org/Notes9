import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyBearerToken } from "@/lib/verify-bearer-token"
import { compareAgentBaseUrl } from '@/lib/catalyst-client'

export const maxDuration = 60;

const UPSTREAM = compareAgentBaseUrl();

/**
 * SEC-006 pre-validation (defense-in-depth, CONTRACTS.md C1c / closes N9-9):
 * reject any `literature_review_ids` the caller can't see under RLS before
 * forwarding to the AI backend. The AI backend re-validates by calling back
 * to Notes9 with the caller's JWT (RLS is the ultimate gate), but a foreign
 * id should never cross the repo boundary in the first place.
 */
async function assertOwnsLiteratureReviews(
  token: string,
  ids: string[]
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, status: 500, error: 'Unable to validate literature_review_ids ownership' };
  }
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.from('literature_reviews').select('id').in('id', ids);
  if (error) {
    return { ok: false, status: 500, error: 'Unable to validate literature_review_ids ownership' };
  }
  const ownedIds = new Set((data ?? []).map((row: { id: string }) => row.id));
  const foreignIds = ids.filter((id) => !ownedIds.has(id));
  if (foreignIds.length > 0) {
    return { ok: false, status: 403, error: 'literature_review_ids includes ids you do not have access to' };
  }
  return { ok: true };
}

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
  const _verifiedUser = await verifyBearerToken(token)
  if (!_verifiedUser) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
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

  if (literature_review_ids.length > 0) {
    const ownership = await assertOwnsLiteratureReviews(token, literature_review_ids);
    if (!ownership.ok) {
      return NextResponse.json({ error: ownership.error }, { status: ownership.status });
    }
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
        'Literature compare agent is not connected yet. Set **NEXT_PUBLIC_NOTES9_API_URL** (paper analyzer is called at `/paper-analyzer`) or **LITERATURE_COMPARE_AGENT_URL** to the full `POST` URL. Request shape: `query`, `session_id`, `history[]`, `literature_review_ids[]`.',
      answer:
        'Literature compare agent is not connected yet. Set NEXT_PUBLIC_NOTES9_API_URL or LITERATURE_COMPARE_AGENT_URL.',
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

    let data: Record<string, unknown>;
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch (parseErr) {
      const rawText = await response.text().catch(() => '');
      console.error(JSON.stringify({ event: 'upstream_non_json', route: 'literature/agent/compare', status: response.status, snippet: rawText.slice(0, 500) }));
      return NextResponse.json({ error: 'Upstream returned non-JSON response', status: response.status }, { status: 502 });
    }
    if (!response.ok) {
      const detail = data.detail;
      const detailStr =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((d) => (typeof d === 'object' && d && 'msg' in d ? String((d as { msg: unknown }).msg) : JSON.stringify(d))).join('; ')
            : undefined;
      const message =
        (typeof data.error === 'string' && data.error) ||
        detailStr ||
        `Upstream error: ${response.status}`;
      return NextResponse.json(
        typeof data.error === 'string' ? data : { ...data, error: message },
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
