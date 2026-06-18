import { NextResponse } from 'next/server';
import {
  buildNotes9AgentRequestBody,
  type Notes9AgentHistoryItem,
} from '@/lib/notes9-agent-request';
import { verifyBearerToken } from "@/lib/verify-bearer-token";
import { enforceLimits, checkBodyBytes, checkHistory, checkQueryChars, checkAttachments } from '@/lib/limits/guards';

export const maxDuration = 300;

const NOTES9_API_BASE = process.env.CHAT_API_URL?.replace(/\/$/, '') || '';

export async function POST(req: Request) {
  // Pre-parse: Content-Length ceiling before the body is buffered.
  const preParseBlocked = enforceLimits('agent_run', [checkBodyBytes(req)]);
  if (preParseBlocked) return preParseBlocked;

  const headerToken = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  const body = await req.json().catch(() => ({}));

  // Post-parse: field-level checks.
  const postParseBlocked = enforceLimits('agent_run', [
    Array.isArray(body.history) ? checkHistory(body.history) : null,
    typeof body.query === 'string' ? checkQueryChars(body.query) : null,
    Array.isArray(body.attachments) ? checkAttachments(body.attachments) : null,
    Array.isArray(body.file_attachments) ? checkAttachments(body.file_attachments) : null,
  ]);
  if (postParseBlocked) return postParseBlocked;
  const { supabaseToken: _bodyToken, ...rest } = body;
  const upstreamBody = buildNotes9AgentRequestBody({
    query: typeof rest.query === 'string' ? rest.query : String(rest.query ?? ''),
    session_id:
      typeof rest.session_id === 'string' ? rest.session_id : String(rest.session_id ?? ''),
    history: Array.isArray(rest.history) ? (rest.history as Notes9AgentHistoryItem[]) : undefined,
    options:
      rest.options && typeof rest.options === 'object' && !Array.isArray(rest.options)
        ? (rest.options as { debug?: boolean; max_retries?: number })
        : undefined,
    scope: rest.scope && typeof rest.scope === 'object' ? rest.scope : undefined,
    // Forward uploaded files + tagged records to the agent (were silently
    // dropped here, so attachments never reached the backend).
    file_attachments: Array.isArray(rest.file_attachments) ? rest.file_attachments : undefined,
    attachments: Array.isArray(rest.attachments) ? rest.attachments : undefined,
  });
  const token = headerToken;

  if (!token) {
    return NextResponse.json(
      { error: 'Authorization required. Provide Bearer token in header or supabaseToken in body.' },
      { status: 401 }
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
    return NextResponse.json(
      { error: 'Notes9 API URL not configured. Set CHAT_API_URL.' },
      { status: 503 }
    );
  }

  try {
    const _ctrl = new AbortController();
    const _timeout = setTimeout(() => _ctrl.abort(), 30_000);
    let response: Response;
    try {
      response = await fetch(`${NOTES9_API_BASE}/notes9`, {
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

    let data: unknown;
    try {
      data = await response.json();
    } catch (parseErr) {
      const rawText = await response.text().catch(() => '');
      console.error(JSON.stringify({ event: 'upstream_non_json', route: 'agent/run', status: response.status, parseError: parseErr instanceof Error ? parseErr.message : String(parseErr), snippet: rawText.slice(0, 500), rawTextLength: rawText.length }));
      return NextResponse.json({ error: 'Upstream returned non-JSON response', status: response.status }, { status: 502 });
    }
    const dataObj = data as Record<string, unknown>;
    if (!response.ok) {
      return NextResponse.json(
        dataObj?.error ? { error: dataObj.error } : dataObj,
        { status: response.status }
      );
    }
    return NextResponse.json(dataObj);
  } catch (error) {
    console.error('Agent proxy error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Agent service unavailable' },
      { status: 502 }
    );
  }
}
