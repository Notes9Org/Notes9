/**
 * Next.js API Route — Biomni Agent Proxy
 * Path: /api/biomni
 *
 * Proxies requests from the Next.js client to the local Biomni server
 * running at localhost:3002 (biomni/server).
 *
 * Why a proxy instead of calling the Biomni server directly from the client?
 *   1. Keeps the Biomni server off the public internet — only accessible
 *      from within the Next.js server (same machine).
 *   2. Allows attaching the Supabase session for auth without exposing
 *      BIOMNI_API_KEY to the browser.
 *   3. Consistent with how the collaboration server is accessed.
 *
 * Supported paths (forwarded verbatim):
 *   POST /api/biomni/run       → POST localhost:3002/agent/run       (async)
 *   POST /api/biomni/run/sync  → POST localhost:3002/agent/run/sync  (sync)
 *   GET  /api/biomni/tasks/:id → GET  localhost:3002/tasks/:id
 *   GET  /api/biomni/health    → GET  localhost:3002/health
 */

import { createClient } from '@/lib/supabase/server';

export const maxDuration = 300; // Biomedical tasks can be long

const BIOMNI_SERVER_URL =
  process.env.BIOMNI_SERVER_URL?.replace(/\/$/, '') ?? 'http://localhost:3002';
const BIOMNI_API_KEY = process.env.BIOMNI_API_KEY;

// ---------------------------------------------------------------------------
// Shared proxy logic
// ---------------------------------------------------------------------------

async function proxyToBiomni(
  req: Request,
  upstreamPath: string
): Promise<Response> {
  // Require authenticated Supabase session
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = `${BIOMNI_SERVER_URL}${upstreamPath}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (BIOMNI_API_KEY) {
    headers['Authorization'] = `Bearer ${BIOMNI_API_KEY}`;
  }

  let body: string | undefined;
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    try {
      const json = await req.json();
      // Inject the authenticated user_id so the Biomni runner can track it
      body = JSON.stringify({ ...json, user_id: user.id });
    } catch {
      body = undefined;
    }
  }

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body,
    });

    const data = await upstream.json();
    return Response.json(data, { status: upstream.status });
  } catch (err) {
    console.error('[Biomni proxy] Failed to reach Biomni server:', err);
    return Response.json(
      {
        error:
          'Biomni server is unavailable. Make sure the biomni/server is running ' +
          '(`cd biomni/server && pnpm dev`) and the biomni_e1 conda env is active.',
      },
      { status: 503 }
    );
  }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/** POST /api/biomni — async task submission */
export async function POST(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const sync = searchParams.get('sync') === 'true';
  const upstreamPath = sync ? '/agent/run/sync' : '/agent/run';
  return proxyToBiomni(req, upstreamPath);
}

/** GET /api/biomni?taskId=xxx — poll task status */
export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');
  const health = searchParams.get('health') === 'true';

  if (health) {
    return proxyToBiomni(req, '/health');
  }

  if (!taskId) {
    return Response.json({ error: 'taskId query param required' }, { status: 400 });
  }

  return proxyToBiomni(req, `/tasks/${taskId}`);
}

/** DELETE /api/biomni?taskId=xxx — cancel a task */
export async function DELETE(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');

  if (!taskId) {
    return Response.json({ error: 'taskId query param required' }, { status: 400 });
  }

  return proxyToBiomni(req, `/agent/${taskId}/cancel`);
}
