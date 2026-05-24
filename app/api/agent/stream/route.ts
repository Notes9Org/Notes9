import {
  buildNotes9AgentRequestBody,
  type Notes9AgentHistoryItem,
} from '@/lib/notes9-agent-request';
import { verifyBearerToken } from "@/lib/verify-bearer-token";

export const maxDuration = 300;
// Node runtime buffers a passed-through ReadableStream until a flush threshold
// is hit, which is why SSE tokens were arriving in one burst at the end.
// Edge runtime pipes chunks immediately, so true token-by-token streaming
// reaches the browser. The route does no Node-only work (only fetch +
// stream pipe), so Edge is safe here.
export const runtime = 'edge';

const NOTES9_API_BASE = process.env.CHAT_API_URL?.replace(/\/$/, '') || '';

export async function POST(req: Request) {
  const headerToken = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  const body = await req.json().catch(() => ({}));
  const { supabaseToken: _bodyToken, ...rest } = body;
  const upstreamBody = buildNotes9AgentRequestBody({
    query: typeof rest.query === 'string' ? rest.query : String(rest.query ?? ''),
    session_id:
      typeof rest.session_id === 'string' ? rest.session_id : String(rest.session_id ?? ''),
    history: Array.isArray(rest.history) ? (rest.history as Notes9AgentHistoryItem[]) : undefined,
    options:
      rest.options && typeof rest.options === 'object' && !Array.isArray(rest.options)
        ? (rest.options as {
            debug?: boolean;
            max_retries?: number;
            tags?: Array<{ kind: string; id: string; title: string }>;
            web_search?: 'on' | 'off';
          })
        : undefined,
    scope: rest.scope && typeof rest.scope === 'object' ? rest.scope : undefined,
  });
  const token = headerToken;

  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Authorization required. Provide Bearer token in header or supabaseToken in body.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const _verifiedUser = await verifyBearerToken(token)
  if (!_verifiedUser) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }


  if (!NOTES9_API_BASE) {
    return new Response(
      JSON.stringify({
        error: 'Notes9 API URL not configured. Set CHAT_API_URL.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 90s timeout applies ONLY to the initial fetch (headers received). It is
    // cleared in `finally` so it cannot abort the streaming body afterward.
    const _ctrl = new AbortController();
    const _timeout = setTimeout(() => _ctrl.abort(), 90_000);
    const _upstreamStart = Date.now();
    let response: Response;
    try {
      response = await fetch(`${NOTES9_API_BASE}/notes9/stream`, {
        method: 'POST',
        signal: _ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(upstreamBody),
      });
    } finally {
      clearTimeout(_timeout);
    }
    console.log(JSON.stringify({ event: 'ai_upstream_complete', route: 'agent/stream', duration_ms: Date.now() - _upstreamStart, status: response.status, sessionId: (upstreamBody as { session_id?: string })?.session_id ?? null }));

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

    if (!response.body) {
      return new Response(JSON.stringify({ error: 'Empty upstream body' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Active push pump: an async loop inside `start()` reads upstream chunks
    // as fast as they arrive and enqueues them immediately. `pull(controller)`
    // (the alternative we tried first) only reads when downstream asks for
    // more, and on Node runtime that demand can arrive in coalesced batches
    // — which is why SSE events were piling up at the upstream side and
    // dumping at the end. With `start`, every Anthropic text_delta crosses
    // the proxy the moment it lands.
    const upstreamReader = response.body.getReader();
    const passThrough = new ReadableStream<Uint8Array>({
      start(controller) {
        (async () => {
          try {
            while (true) {
              const { done, value } = await upstreamReader.read();
              if (done) break;
              if (value) controller.enqueue(value);
            }
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        })();
      },
      cancel(reason) {
        upstreamReader.cancel(reason).catch(() => {});
      },
    });

    const contentType = response.headers.get('Content-Type') || 'text/event-stream';
    return new Response(passThrough, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        // Identity = no gzip/brotli, which would buffer chunks until the
        // compressor flushes a block. Critical for SSE on platforms that
        // would otherwise compress text/event-stream by default.
        'Content-Encoding': 'identity',
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
