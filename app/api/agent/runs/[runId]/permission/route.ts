import { verifyBearerToken } from '@/lib/verify-bearer-token';
import { tryCatalystBaseUrl } from '@/lib/catalyst-client';

// Proxies a tool-permission decision (allow / always / deny) to the agent
// backend's permission endpoint. The backend records the choice and wakes the
// paused run (only effective when NOTES9_TOOL_PERMISSIONS is enabled). Node
// runtime: a tiny JSON round-trip, no streaming.
export const runtime = 'nodejs';

const NOTES9_API_BASE = tryCatalystBaseUrl();

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

  let decision = '';
  try {
    const body = (await req.json()) as { decision?: string };
    decision = String(body?.decision || '').trim().toLowerCase();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!['allow', 'always', 'deny'].includes(decision)) {
    return Response.json({ error: 'decision must be allow|always|deny' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${NOTES9_API_BASE}/notes9/runs/${encodeURIComponent(runId)}/permission`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ decision }),
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
