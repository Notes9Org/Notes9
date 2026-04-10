export const maxDuration = 120;

/** Full POST URL to SSE biomni literature endpoint (`…/biomni/literature/stream`). */
function literatureBiomniStreamUrl(): string {
  const explicit = process.env.LITERATURE_BIOMNI_STREAM_URL?.replace(/\/$/, '').trim();
  if (explicit) return explicit;
  const base = process.env.BIOMNI_FUNCTION_URL?.replace(/\/$/, '').trim();
  if (base) return `${base}/biomni/literature/stream`;
  return '';
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
  const body = (await req.json().catch(() => ({}))) as Body;
  const token = headerToken;

  if (!token) {
    return new Response(JSON.stringify({ error: 'Authorization required. Provide Bearer token.' }), {
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

  const modeRaw = typeof body.mode === 'string' ? body.mode.trim() : '';
  const forwardBody = {
    query,
    session_id,
    history: Array.isArray(body.history) ? body.history : [],
    literature_review_ids,
    mode: (modeRaw || 'research_design') as string,
    options: mergeBiomniOptions(body.options),
  };

  const UPSTREAM = literatureBiomniStreamUrl();

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
    const response = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(forwardBody),
    });

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
