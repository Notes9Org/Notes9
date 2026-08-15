/**
 * Wiring smoke test: confirms this route's GET actually gates on the shared
 * `isAuthorizedCron` (N9-13) rather than a local re-implementation, and never
 * touches the service-role client on an unauthorized request. Exhaustive
 * comparison-logic coverage lives in `../_lib/cron-auth.test.ts`.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const createServiceRoleClient = vi.fn();
vi.mock('@/lib/supabase-service-role', () => ({
  createServiceRoleClient: () => createServiceRoleClient(),
}));

import { GET } from './route';

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/cron/cleanup-agent-drafts', { headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('GET /api/cron/cleanup-agent-drafts — auth wiring', () => {
  it('401s on an absent bearer and never touches the service-role client', async () => {
    vi.stubEnv('CRON_SECRET', 'super-secret-value');
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it('401s without throwing on a wrong-length bearer', async () => {
    vi.stubEnv('CRON_SECRET', 'super-secret-value');
    await expect(GET(req({ authorization: 'Bearer short' }))).resolves.toMatchObject({
      status: 401,
    });
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it('401s when CRON_SECRET is unset even if a bearer is sent', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await GET(req({ authorization: 'Bearer whatever' }));
    expect(res.status).toBe(401);
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });
});
