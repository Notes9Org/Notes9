import { verifyBearerToken } from '@/lib/verify-bearer-token';
import { tryCatalystBaseUrl } from '@/lib/catalyst-client';

// Regenerate an artifact into a new draft version. The backend may do an LLM
// patch call plus a sandbox render (and one auto-repair round), so this can take
// up to ~60s, give the route headroom.
export const runtime = 'nodejs';
export const maxDuration = 90;

const NOTES9_API_BASE = tryCatalystBaseUrl();

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

  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${NOTES9_API_BASE}/notes9/artifacts/${encodeURIComponent(dataId)}/regenerate`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: bodyText,
      },
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
