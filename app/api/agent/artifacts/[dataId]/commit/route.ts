import { verifyBearerToken } from '@/lib/verify-bearer-token';

// Proxies "Save to Data files" to the agent backend's commit endpoint. The
// backend re-checks the chosen experiment against the user's AccessScope, so the
// draft id alone never authorizes a write. Node runtime: a tiny JSON round-trip,
// no streaming.
export const runtime = 'nodejs';

const NOTES9_API_BASE = process.env.CHAT_API_URL?.replace(/\/$/, '') || '';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ dataId: string }> },
) {
  const { dataId } = await ctx.params;
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

  let body: { experiment_id?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const experimentId = (body.experiment_id || '').trim();
  if (!experimentId) {
    return Response.json({ error: 'experiment_id is required' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${NOTES9_API_BASE}/notes9/artifacts/${encodeURIComponent(dataId)}/commit`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ experiment_id: experimentId }),
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
