import { NextResponse } from 'next/server';

export const maxDuration = 60;

/** Full POST URL to JSON biomni literature endpoint (e.g. `…/biomni/literature`). */
function literatureBiomniJsonUrl(): string {
  const explicit = process.env.LITERATURE_BIOMNI_AGENT_URL?.replace(/\/$/, '').trim();
  if (explicit) return explicit;
  const base = process.env.BIOMNI_FUNCTION_URL?.replace(/\/$/, '').trim();
  if (base) return `${base}/biomni/literature`;
  return '';
}

function upstreamErrorMessage(
  status: number,
  data: Record<string, unknown>,
  rawText: string
): string {
  const detail = data.detail;
  const detailStr =
    typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
        ? detail
            .map((d) =>
              typeof d === 'object' && d && 'msg' in d
                ? String((d as { msg: unknown }).msg)
                : JSON.stringify(d)
            )
            .join('; ')
        : undefined;
  const fromJson =
    (typeof data.error === 'string' && data.error) ||
    detailStr ||
    (typeof data.message === 'string' && data.message);
  if (fromJson) return fromJson;
  const snippet = rawText.trim().slice(0, 500);
  if (snippet) return `Upstream (${status}): ${snippet}`;
  return `Upstream error: ${status}`;
}

/** Defaults aligned with `POST /biomni/literature` when the client omits `options`. */
const DEFAULT_BIOMNI_OPTIONS = {
  debug: false,
  include_reasoning_trace: false,
  max_clarify_rounds: 2,
  skip_clarify: false,
} as const;

function mergeBiomniOptions(incoming: unknown): typeof DEFAULT_BIOMNI_OPTIONS & Record<string, unknown> {
  const merged: Record<string, unknown> = { ...DEFAULT_BIOMNI_OPTIONS };
  if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
    for (const [k, v] of Object.entries(incoming as Record<string, unknown>)) {
      if (v !== undefined) merged[k] = v;
    }
  }
  return merged as typeof DEFAULT_BIOMNI_OPTIONS & Record<string, unknown>;
}

type Body = {
  query?: string;
  session_id?: string;
  history?: unknown;
  literature_review_ids?: unknown;
  mode?: string;
  options?: unknown;
};

export async function POST(req: Request) {
  const headerToken = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  const body = (await req.json().catch(() => ({}))) as Body;
  const token = headerToken;

  if (!token) {
    return NextResponse.json(
      { error: 'Authorization required. Provide Bearer token.' },
      { status: 401 }
    );
  }

  const query = typeof body.query === 'string' ? body.query : String(body.query ?? '');
  const session_id =
    typeof body.session_id === 'string' ? body.session_id : String(body.session_id ?? '');
  const literature_review_ids = Array.isArray(body.literature_review_ids)
    ? body.literature_review_ids.filter((id): id is string => typeof id === 'string')
    : [];

  if (!query.trim()) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 });
  }

  if (literature_review_ids.length === 0) {
    return NextResponse.json(
      { error: 'literature_review_ids must include at least one id' },
      { status: 400 }
    );
  }

  const modeRaw = typeof body.mode === 'string' ? body.mode.trim() : '';
  const forwardBody = {
    query,
    session_id,
    history: Array.isArray(body.history) ? body.history : [],
    literature_review_ids,
    mode: (modeRaw || 'research_design') as string,
    options: mergeBiomniOptions(body.options),
  };

  const UPSTREAM = literatureBiomniJsonUrl();

  if (!UPSTREAM) {
    return NextResponse.json({
      role: 'assistant',
      content:
        'Biomni research-design agent is not connected yet. Set **BIOMNI_FUNCTION_URL** (Lambda base URL; UI calls `…/biomni/literature`) or **LITERATURE_BIOMNI_AGENT_URL** to the full `POST` URL.',
      answer:
        'Biomni research-design agent is not connected yet. Set BIOMNI_FUNCTION_URL or LITERATURE_BIOMNI_AGENT_URL.',
    });
  }

  try {
    const response = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(forwardBody),
    });

    const rawText = await response.text();
    let data: Record<string, unknown> = {};
    if (rawText) {
      try {
        data = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        /* non-JSON body */
      }
    }

    if (!response.ok) {
      const message = upstreamErrorMessage(response.status, data, rawText);
      console.error(
        '[biomni proxy] upstream failed',
        response.status,
        UPSTREAM.replace(/\?.*$/, ''),
        message.slice(0, 200)
      );
      return NextResponse.json(
        { ...data, error: message },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Biomni literature proxy error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Biomni agent service unavailable' },
      { status: 502 }
    );
  }
}
