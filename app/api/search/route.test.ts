/**
 * N9-5: `/api/search` used to splice `q` straight into a PostgREST `.or()`
 * filter string. `,` `.` `(` `"` `*` are all metacharacters PostgREST parses
 * inside that string, so a crafted `q` (e.g. `x%,id.not.is.null,x`) could
 * break out of the intended `ilike` value and append a sibling filter atom,
 * turning a substring search into an always-true OR branch — the endpoint
 * would return "any 5 rows" per table instead of genuine term matches.
 *
 * These tests assert the fix end-to-end: the filter string PostgREST
 * actually receives never contains a smuggled atom, and — more importantly —
 * a mock that would only return matches if the injection succeeded proves it
 * doesn't.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const currentUser = vi.fn(async (): Promise<{ id: string } | null> => ({ id: 'user-1' }));
vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUser: () => currentUser(),
}));

type QueryBuilder = {
  select: (...args: unknown[]) => QueryBuilder;
  eq: (...args: unknown[]) => QueryBuilder;
  or: (filter: string) => QueryBuilder;
  limit: (n: number) => Promise<{ data: unknown[]; error: null }>;
};

/**
 * A fake PostgREST table client. `resolveData(table, orFilter)` decides what
 * comes back — tests use it to simulate "injection succeeded" (rows returned
 * for a filter string containing the smuggled atom) vs. the fixed behaviour
 * (rows only for a clean, term-matched filter).
 */
function makeSupabaseMock(resolveData: (table: string, orFilter: string | undefined) => unknown[]) {
  const orFilters: Record<string, string[]> = {};

  const from = vi.fn((table: string) => {
    let lastOr: string | undefined;
    const builder: QueryBuilder = {
      select: () => builder,
      eq: () => builder,
      or: (filter: string) => {
        lastOr = filter;
        (orFilters[table] ??= []).push(filter);
        return builder;
      },
      limit: () => Promise.resolve({ data: resolveData(table, lastOr), error: null }),
    };
    return builder;
  });

  return { from, orFilters };
}

let supabaseMock: ReturnType<typeof makeSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: supabaseMock.from })),
}));

import { GET } from './route';
import type { NextRequest } from 'next/server';

function request(query: string): NextRequest {
  return { url: `http://localhost/api/search?${query}` } as unknown as NextRequest;
}

beforeEach(() => {
  currentUser.mockResolvedValue({ id: 'user-1' });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/search — PostgREST .or() injection (N9-5)', () => {
  it('a crafted q with an injected filter atom does not widen the result set', async () => {
    // Simulates the pre-fix bug: if the raw "id.not.is.null" atom survives
    // into the filter string PostgREST sees, this mock returns 5 spurious
    // rows per table (the "any 5 rows" failure mode). If sanitized, no table
    // gets a filter containing that atom, so every table returns [].
    supabaseMock = makeSupabaseMock((_table, orFilter) => {
      const injected = orFilter?.split(',').some((atom) => atom === 'id.not.is.null');
      if (!injected) return [];
      return [1, 2, 3, 4, 5].map((n) => ({ id: `leaked-${n}`, name: `leaked-${n}` }));
    });

    const res = await GET(request('q=' + encodeURIComponent('x%,id.not.is.null,x')));
    const body = (await res.json()) as { results: unknown[] };

    expect(body.results).toEqual([]);
  });

  it('strips PostgREST metacharacters from q before building the filter string', async () => {
    supabaseMock = makeSupabaseMock(() => []);

    await GET(request('q=' + encodeURIComponent('x%,id.not.is.null,x')));

    const projectFilters = supabaseMock.orFilters['projects'];
    expect(projectFilters).toBeDefined();
    for (const filter of projectFilters!) {
      // Every atom must be one of the two the route itself constructs —
      // no extra comma-separated atom can have been smuggled in.
      const atoms = filter.split(',');
      expect(atoms).toHaveLength(2);
      expect(atoms[0]).toMatch(/^name\.ilike\.%[^,()."*]*%$/);
      expect(atoms[1]).toMatch(/^description\.ilike\.%[^,()."*]*%$/);
      // The dangerous characters never appear anywhere in the filter value.
      expect(filter).not.toContain('id.not.is.null');
    }
  });

  it('rejects a q that is nothing but metacharacters without querying the database', async () => {
    supabaseMock = makeSupabaseMock(() => {
      throw new Error('should not query supabase when the sanitized term is too short');
    });

    const res = await GET(request('q=' + encodeURIComponent(',,..'))); // sanitizes to ''
    const body = (await res.json()) as { results: unknown[] };

    expect(body.results).toEqual([]);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('preserves legitimate substring search behavior', async () => {
    supabaseMock = makeSupabaseMock((table) => {
      if (table === 'projects') return [{ id: 'p1', name: 'Protein folding' }];
      return [];
    });

    const res = await GET(request('q=protein'));
    const body = (await res.json()) as {
      results: { id: string; type: string; title: string; href: string }[];
    };

    expect(body.results).toEqual([
      { id: 'p1', type: 'project', title: 'Protein folding', href: '/projects/p1' },
    ]);
    expect(supabaseMock.orFilters['projects']).toEqual([
      'name.ilike.%protein%,description.ilike.%protein%',
    ]);
  });

  it('still requires auth and short-circuits before any 401-bypassing side effect', async () => {
    currentUser.mockResolvedValue(null);
    supabaseMock = makeSupabaseMock(() => []);

    const res = await GET(request('q=' + encodeURIComponent('x%,id.not.is.null,x')));
    expect(res.status).toBe(401);
  });
});
