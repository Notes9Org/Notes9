/**
 * N9-13: the three cron routes each compared the caller-supplied secret with
 * `===` — a variable-time comparison that leaks how many leading bytes
 * matched via response latency. `isAuthorizedCron` is now the one place all
 * three routes route their auth through; these tests cover the failure
 * modes named in the slice brief plus the constant-time-comparison contract.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { isAuthorizedCron } from './cron-auth';

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/cron/whatever', { headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isAuthorizedCron', () => {
  it('fails closed when CRON_SECRET is unset, even with a correct-looking bearer', () => {
    vi.stubEnv('CRON_SECRET', '');
    const result = isAuthorizedCron(req({ authorization: 'Bearer anything' }));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not configured/);
  });

  it('rejects an absent bearer', () => {
    vi.stubEnv('CRON_SECRET', 'super-secret-value');
    const result = isAuthorizedCron(req());
    expect(result.ok).toBe(false);
  });

  it('rejects an empty bearer', () => {
    vi.stubEnv('CRON_SECRET', 'super-secret-value');
    const result = isAuthorizedCron(req({ authorization: 'Bearer ' }));
    expect(result.ok).toBe(false);
  });

  it('accepts a correct bearer', () => {
    vi.stubEnv('CRON_SECRET', 'super-secret-value');
    const result = isAuthorizedCron(req({ authorization: 'Bearer super-secret-value' }));
    expect(result.ok).toBe(true);
  });

  it('accepts a correct X-Admin-Secret header', () => {
    vi.stubEnv('CRON_SECRET', 'super-secret-value');
    const result = isAuthorizedCron(req({ 'x-admin-secret': 'super-secret-value' }));
    expect(result.ok).toBe(true);
  });

  it('rejects a wrong-length bearer without throwing', () => {
    vi.stubEnv('CRON_SECRET', 'super-secret-value');
    expect(() => isAuthorizedCron(req({ authorization: 'Bearer short' }))).not.toThrow();
    const result = isAuthorizedCron(req({ authorization: 'Bearer short' }));
    expect(result.ok).toBe(false);

    // Also check the "longer than expected" direction, and a header several
    // orders of magnitude longer (a plausible DoS/timing-probe shape).
    expect(() =>
      isAuthorizedCron(req({ authorization: `Bearer super-secret-value-and-then-some` })),
    ).not.toThrow();
    expect(() =>
      isAuthorizedCron(req({ authorization: `Bearer ${'a'.repeat(10_000)}` })),
    ).not.toThrow();
  });

  it('rejects a same-length bearer that differs only in the last byte', () => {
    vi.stubEnv('CRON_SECRET', 'super-secret-value');
    const result = isAuthorizedCron(req({ authorization: 'Bearer super-secret-valuX' }));
    expect(result.ok).toBe(false);
  });

  it('is case-sensitive / exact-match, not a prefix match', () => {
    vi.stubEnv('CRON_SECRET', 'super-secret-value');
    const result = isAuthorizedCron(req({ authorization: 'Bearer super-secret-value-extra' }));
    expect(result.ok).toBe(false);
  });
});
