/**
 * N9-S5: literature-ownership pre-validation (SEC-006, CONTRACTS.md C1c).
 *
 * Before this route forwards `literature_review_ids` to the AI backend it
 * must verify the caller owns every id under RLS. These tests assert the
 * guarantee the route is FOR: a foreign id is rejected with 403 and never
 * reaches the upstream `fetch`, while a request made only of owned ids is
 * forwarded unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const verifyBearerTokenMock = vi.fn(async (_token?: string | null) => ({ id: 'user-1' }) as { id: string } | null);
vi.mock('@/lib/verify-bearer-token', () => ({
  verifyBearerToken: (token: string | null | undefined) => verifyBearerTokenMock(token),
}));

vi.mock('@/lib/catalyst-client', () => ({
  biomniAgentJsonUrl: () => 'https://ai.example.com/biomni/literature',
}));

type QueryResult = { data: { id: string }[] | null; error: { message: string } | null };
const inMock = vi.fn(async (): Promise<QueryResult> => ({ data: [], error: null }));
const selectMock = vi.fn(() => ({ in: inMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));
const createClientMock = vi.fn((_url: string, _key: string, _opts: unknown) => ({ from: fromMock }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string, opts: unknown) => createClientMock(url, key, opts),
}));

import { POST } from './route';

function req(body: unknown, token = 'caller-jwt') {
  return new Request('https://notes9.test/api/literature/agent/biomni', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyBearerTokenMock.mockResolvedValue({ id: 'user-1' });
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ role: 'assistant', content: 'ok' }),
  })) as unknown as typeof fetch;
});

describe('POST /api/literature/agent/biomni — ownership pre-validation', () => {
  it('rejects (403) a request containing an id the caller cannot see under RLS, and never forwards it', async () => {
    // RLS-scoped select only returns the id the caller legitimately owns.
    inMock.mockResolvedValue({ data: [{ id: 'owned-1' }], error: null });

    const res = await POST(
      req({ query: 'q', session_id: 's1', literature_review_ids: ['owned-1', 'foreign-2'] })
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/do not have access/i);
    expect(global.fetch).not.toHaveBeenCalled();
    // The RLS-scoped client was built with the caller's own bearer token.
    expect(createClientMock).toHaveBeenCalledWith(
      'https://proj.supabase.co',
      'anon-key',
      expect.objectContaining({ global: { headers: { Authorization: 'Bearer caller-jwt' } } })
    );
    expect(fromMock).toHaveBeenCalledWith('literature_reviews');
    expect(inMock).toHaveBeenCalledWith('id', ['owned-1', 'foreign-2']);
  });

  it('forwards a request made only of owned ids, unchanged', async () => {
    inMock.mockResolvedValue({ data: [{ id: 'owned-1' }, { id: 'owned-2' }], error: null });

    const res = await POST(
      req({ query: 'q', session_id: 's1', literature_review_ids: ['owned-1', 'owned-2'] })
    );

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const forwarded = JSON.parse(init.body as string);
    expect(forwarded.literature_review_ids).toEqual(['owned-1', 'owned-2']);
  });

  it('boundaries: a request referencing another tenant literature_review_id is rejected, never forwarded', async () => {
    // The caller's RLS-scoped query returns nothing for another tenant's id.
    inMock.mockResolvedValue({ data: [], error: null });

    const res = await POST(
      req({ query: 'q', session_id: 's1', literature_review_ids: ['other-tenant-id'] })
    );

    expect(res.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fails closed (500, not forwarded) when the ownership check itself errors', async () => {
    inMock.mockResolvedValue({ data: null, error: { message: 'db unavailable' } });

    const res = await POST(req({ query: 'q', session_id: 's1', literature_review_ids: ['id-1'] }));

    expect(res.status).toBe(500);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('preserves existing behavior: unauthenticated caller still gets 401 before any ownership check', async () => {
    verifyBearerTokenMock.mockResolvedValue(null);

    const res = await POST(req({ query: 'q', session_id: 's1', literature_review_ids: ['id-1'] }));

    expect(res.status).toBe(401);
    expect(createClientMock).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('preserves existing behavior: empty literature_review_ids still 400s before any ownership check', async () => {
    const res = await POST(req({ query: 'q', session_id: 's1', literature_review_ids: [] }));

    expect(res.status).toBe(400);
    expect(createClientMock).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
