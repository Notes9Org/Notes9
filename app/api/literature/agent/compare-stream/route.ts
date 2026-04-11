/** Paper-analyzer SSE can run long on large batches; align with Vercel Pro max unless you use Fluid. */
export const maxDuration = 300;

const NOTES9_BASE = process.env.NEXT_PUBLIC_NOTES9_API_URL?.replace(/\/$/, '') ?? '';
const DEFAULT_PAPER_ANALYZER = NOTES9_BASE ? `${NOTES9_BASE}/paper-analyzer` : '';

/** Upstream `POST …/paper-analyzer/stream` (same request body as `POST …/paper-analyzer`). */
function paperAnalyzerStreamUrl(): string {
  const explicit = process.env.LITERATURE_COMPARE_STREAM_URL?.replace(/\/$/, '').trim();
  if (explicit) return explicit;
  const compareBase =
    process.env.LITERATURE_COMPARE_AGENT_URL?.replace(/\/$/, '').trim() || DEFAULT_PAPER_ANALYZER;
  if (!compareBase) return '';
  return `${compareBase}/stream`;
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

  const UPSTREAM = paperAnalyzerStreamUrl();

  if (!UPSTREAM) {
    return new Response(
      JSON.stringify({
        error:
          'Literature paper-analyzer stream is not configured. Set NEXT_PUBLIC_NOTES9_API_URL (uses …/paper-analyzer/stream) or LITERATURE_COMPARE_AGENT_URL / LITERATURE_COMPARE_STREAM_URL.',
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
        const j = JSON.parse(errText) as { error?: string; message?: string; detail?: unknown };
        if (typeof j.error === 'string') message = j.error;
        else if (typeof j.message === 'string') message = j.message;
      } catch {
        /* plain text */
      }
      console.error('[compare-stream] upstream failed', response.status, message.slice(0, 200));
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
    console.error('Literature compare stream proxy error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Literature paper-analyzer stream unavailable',
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
