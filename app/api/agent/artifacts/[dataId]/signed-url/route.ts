import { verifyBearerToken } from '@/lib/verify-bearer-token';

// Re-signs a persisted draft artifact's URL. Persisted chat artifacts keep their
// metadata but not the ~1h signed URL, so the artifact card calls this by data_id
// on load / before download to get a fresh live URL. The backend scopes the draft
// to the owning user — the data_id alone never authorizes. Node runtime: a tiny
// JSON round-trip, no streaming.
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
      `${NOTES9_API_BASE}/notes9/artifacts/${encodeURIComponent(dataId)}/signed-url`,
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
