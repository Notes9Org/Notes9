import { verifyBearerToken } from '@/lib/verify-bearer-token';

// Returns the recipe (matplotlib code or tool-input spec) + version chain behind
// an artifact, powering the card's "View code" / "Edit" affordances. The backend
// scopes the source to the owning user (and, for committed artifacts, the owning
// experiment) — the data_id alone never authorizes. Node runtime: a tiny JSON
// round-trip, no streaming.
export const runtime = 'nodejs';

const NOTES9_API_BASE = process.env.CHAT_API_URL?.replace(/\/$/, '') || '';

export async function GET(
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

  let upstream: Response;
  try {
    upstream = await fetch(
      `${NOTES9_API_BASE}/notes9/artifacts/${encodeURIComponent(dataId)}/source`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch {
    return Response.json({ error: 'Agent backend unreachable' }, { status: 502 });
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' },
  });
}
