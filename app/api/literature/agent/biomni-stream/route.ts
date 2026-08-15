import { createClient } from '@supabase/supabase-js';
import { verifyBearerToken } from "@/lib/verify-bearer-token"
import { biomniAgentStreamUrl } from '@/lib/catalyst-client'

/** Long Biomni design-mode runs can exceed 120s; 300s matches typical Vercel Pro serverless max (raise on Fluid/self-host if needed). */
export const maxDuration = 300;

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

/** Defaults aligned with `POST /biomni/literature/stream`. */
const DEFAULT_BIOMNI_OPTIONS = {
  debug: false,
  include_reasoning_trace: false,
  max_clarify_rounds: 2,
  skip_clarify: false,
} as const;

function mergeBiomniOptions(incoming: unknown): typeof DEFAULT_BIOMNI_OPTIONS & Record<string, unknown> {
  const merged: Record<string, unknown> = { ...DEFAULT_BIOMNI_OPTIONS };
  if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
    for (const [k, v] of Object.entries(incoming as Record<string, unknown>)) {
      if (v !== undefined) merged[k] = v;
    }
  }
  return merged as typeof DEFAULT_BIOMNI_OPTIONS & Record<string, unknown>;
}

type Body = {
  query?: string;
  session_id?: string;
  history?: unknown;
  literature_review_ids?: unknown;
  mode?: string;
  options?: unknown;
};

export async function POST(req: Request) {
  const headerToken = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ error: 'Bad Request: invalid JSON body' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const token = headerToken;

  if (!token) {
    return new Response(JSON.stringify({ error: 'Authorization required. Provide Bearer token.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Real JWT verification, `token` being non-empty is not authentication.
  const _verifiedUser = await verifyBearerToken(token);
  if (!_verifiedUser) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const query = typeof body.query === 'string' ? body.query : String(body.query ?? '');
  const session_id =
    typeof body.session_id === 'string' ? body.session_id : String(body.session_id ?? '');
  const literature_review_ids = Array.isArray(body.literature_review_ids)
    ? body.literature_review_ids.filter((id): id is string => typeof id === 'string')
    : [];

  if (!query.trim()) {
    return new Response(JSON.stringify({ error: 'query is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (literature_review_ids.length === 0) {
    return new Response(
      JSON.stringify({ error: 'literature_review_ids must include at least one id' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const ownership = await assertOwnsLiteratureReviews(token, literature_review_ids);
  if (!ownership.ok) {
    return new Response(JSON.stringify({ error: ownership.error }), {
      status: ownership.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const modeRaw = typeof body.mode === 'string' ? body.mode.trim() : '';
  const forwardBody = {
    query,
    session_id,
    history: Array.isArray(body.history) ? body.history : [],
    literature_review_ids,
    mode: (modeRaw || 'research_design') as string,
    options: mergeBiomniOptions(body.options),
  };

  const UPSTREAM = biomniAgentStreamUrl();

  if (!UPSTREAM) {
    return new Response(
      JSON.stringify({
        error:
          'Biomni literature stream is not configured. Set BIOMNI_FUNCTION_URL or LITERATURE_BIOMNI_STREAM_URL.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const _upstreamStart = Date.now();
    const response = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(forwardBody),
    });
    console.log(JSON.stringify({ event: 'ai_upstream_complete', route: 'literature/biomni-stream', duration_ms: Date.now() - _upstreamStart, status: response.status, sessionId: (forwardBody as { session_id?: string })?.session_id ?? null }));

    if (!response.ok) {
      const errText = await response.text();
      let message = errText || `Upstream error: ${response.status}`;
      try {
        const j = JSON.parse(errText) as { error?: string; message?: string };
        if (typeof j.error === 'string') message = j.error;
        else if (typeof j.message === 'string') message = j.message;
      } catch {
        /* plain text */
      }
      console.error('[biomni-stream] upstream failed', response.status, message.slice(0, 200));
      return new Response(JSON.stringify({ error: message }), {
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
    console.error('Biomni literature stream proxy error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Biomni literature stream unavailable',
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
