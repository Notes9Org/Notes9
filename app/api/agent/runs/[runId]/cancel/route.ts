import { verifyBearerToken } from '@/lib/verify-bearer-token';

// Proxies the "Stop" button to the agent backend's run-cancel endpoint. The
// backend flips an idempotent cancel flag on the in-flight run (only effective
// when NOTES9_AGENT_HITL is enabled); calling it more than once is safe. Node
// runtime: a tiny JSON round-trip, no streaming.
export const runtime = 'nodejs';

const NOTES9_API_BASE = process.env.CHAT_API_URL?.replace(/\/$/, '') || '';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  const { runId } = await ctx.params;
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return Response.json({ error: 'Authorization required' }, { status: 401 });
  }
  const user = await verifyBearerToken(token);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!NOTES9_API_BASE) {
    return Response.json({ error: 'Agent backend not configured' }, { status: 500 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${NOTES9_API_BASE}/notes9/runs/${encodeURIComponent(runId)}/cancel`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
    );
  } catch {
    return Response.json({ error: 'Could not reach the agent backend' }, { status: 502 });
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' },
  });
}
