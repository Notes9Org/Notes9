/**
 * lib/limits/guards.test.ts
 *
 * Unit tests for the stateless limit guards (Workstream C).
 * Runs with vitest in jsdom environment.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkBodyBytes,
  checkHistory,
  checkQueryChars,
  checkContentChars,
  checkAttachments,
  checkEntityIds,
  checkRegisterItems,
  enforceLimits,
} from './guards';
import {
  BODY_BYTES_MAX,
  HISTORY_ITEMS_MAX,
  QUERY_CHARS_MAX,
  MESSAGE_CONTENT_CHARS_MAX,
  ATTACHMENTS_ITEMS_MAX,
  ENTITY_ID_ITEMS_MAX,
  REGISTER_ITEMS_MAX,
} from './config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(contentLength?: number): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (contentLength !== undefined) {
    headers['content-length'] = String(contentLength);
  }
  return new Request('https://example.com/api/test', { method: 'POST', headers });
}

function makeArray(length: number): unknown[] {
  return Array.from({ length }, (_, i) => i);
}

function makeString(length: number): string {
  return 'a'.repeat(length);
}

// ---------------------------------------------------------------------------
// checkBodyBytes
// ---------------------------------------------------------------------------

describe('checkBodyBytes', () => {
  it('returns null when content-length header is absent', () => {
    expect(checkBodyBytes(makeRequest())).toBeNull();
  });

  it('returns null when content-length is exactly at the limit', () => {
    expect(checkBodyBytes(makeRequest(BODY_BYTES_MAX))).toBeNull();
  });

  it('returns null when content-length is below the limit', () => {
    expect(checkBodyBytes(makeRequest(1024))).toBeNull();
  });

  it('returns a verdict with 413 when content-length exceeds the limit', () => {
    const verdict = checkBodyBytes(makeRequest(BODY_BYTES_MAX + 1));
    expect(verdict).not.toBeNull();
    expect(verdict!.code).toBe('body_too_large');
    expect(verdict!.httpStatus).toBe(413);
    expect(verdict!.observed).toBe(BODY_BYTES_MAX + 1);
    expect(verdict!.limit).toBe(BODY_BYTES_MAX);
  });

  it('returns null for unparseable content-length', () => {
    const req = new Request('https://example.com/', {
      method: 'POST',
      headers: { 'content-length': 'abc' },
    });
    expect(checkBodyBytes(req)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkHistory
// ---------------------------------------------------------------------------

describe('checkHistory', () => {
  it('returns null when at the limit', () => {
    expect(checkHistory(makeArray(HISTORY_ITEMS_MAX))).toBeNull();
  });

  it('returns null when below the limit', () => {
    expect(checkHistory(makeArray(10))).toBeNull();
  });

  it('returns a verdict with 422 when over the limit', () => {
    const verdict = checkHistory(makeArray(HISTORY_ITEMS_MAX + 1));
    expect(verdict).not.toBeNull();
    expect(verdict!.code).toBe('history_too_long');
    expect(verdict!.httpStatus).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// checkQueryChars
// ---------------------------------------------------------------------------

describe('checkQueryChars', () => {
  it('returns null when at the limit', () => {
    expect(checkQueryChars(makeString(QUERY_CHARS_MAX))).toBeNull();
  });

  it('returns a verdict when over the limit', () => {
    const verdict = checkQueryChars(makeString(QUERY_CHARS_MAX + 1));
    expect(verdict).not.toBeNull();
    expect(verdict!.code).toBe('query_too_long');
    expect(verdict!.httpStatus).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// checkContentChars
// ---------------------------------------------------------------------------

describe('checkContentChars', () => {
  it('returns null when at the limit', () => {
    expect(checkContentChars(makeString(MESSAGE_CONTENT_CHARS_MAX))).toBeNull();
  });

  it('returns a verdict when over the limit', () => {
    const verdict = checkContentChars(makeString(MESSAGE_CONTENT_CHARS_MAX + 1));
    expect(verdict).not.toBeNull();
    expect(verdict!.code).toBe('content_too_long');
    expect(verdict!.httpStatus).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// checkAttachments
// ---------------------------------------------------------------------------

describe('checkAttachments', () => {
  it('returns null when at the limit', () => {
    expect(checkAttachments(makeArray(ATTACHMENTS_ITEMS_MAX))).toBeNull();
  });

  it('returns a verdict when over the limit', () => {
    const verdict = checkAttachments(makeArray(ATTACHMENTS_ITEMS_MAX + 1));
    expect(verdict).not.toBeNull();
    expect(verdict!.code).toBe('attachments_too_many');
    expect(verdict!.httpStatus).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// checkEntityIds
// ---------------------------------------------------------------------------

describe('checkEntityIds', () => {
  it('returns null when at the limit', () => {
    expect(checkEntityIds(makeArray(ENTITY_ID_ITEMS_MAX))).toBeNull();
  });

  it('returns a verdict when over the limit', () => {
    const verdict = checkEntityIds(makeArray(ENTITY_ID_ITEMS_MAX + 1));
    expect(verdict).not.toBeNull();
    expect(verdict!.code).toBe('entity_ids_too_many');
    expect(verdict!.httpStatus).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// checkRegisterItems
// ---------------------------------------------------------------------------

describe('checkRegisterItems', () => {
  it('returns null when at the limit', () => {
    expect(checkRegisterItems(makeArray(REGISTER_ITEMS_MAX))).toBeNull();
  });

  it('returns a verdict when over the limit', () => {
    const verdict = checkRegisterItems(makeArray(REGISTER_ITEMS_MAX + 1));
    expect(verdict).not.toBeNull();
    expect(verdict!.code).toBe('register_items_too_many');
    expect(verdict!.httpStatus).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// enforceLimits — mode behaviour
// ---------------------------------------------------------------------------

describe('enforceLimits', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Reset env before each test
    delete process.env.LIMITS_MODE;
    delete process.env.LIMITS_MODE_CHAT;
  });

  afterEach(() => {
    warnSpy.mockRestore();
    delete process.env.LIMITS_MODE;
    delete process.env.LIMITS_MODE_CHAT;
  });

  it('returns null when all checks pass', () => {
    process.env.LIMITS_MODE = 'enforce';
    const result = enforceLimits('chat', [null, null]);
    expect(result).toBeNull();
  });

  it('shadow mode (default): returns null even when a limit is exceeded', () => {
    // No LIMITS_MODE set → default is 'shadow'
    const verdict = checkHistory(makeArray(HISTORY_ITEMS_MAX + 1));
    const result = enforceLimits('chat', [verdict]);
    expect(result).toBeNull();
  });

  it('shadow mode: logs a structured limit_would_reject line', () => {
    process.env.LIMITS_MODE = 'shadow';
    const verdict = checkHistory(makeArray(HISTORY_ITEMS_MAX + 1));
    enforceLimits('chat', [verdict]);
    expect(warnSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(logged.tag).toBe('limit_would_reject');
    expect(logged.code).toBe('history_too_long');
    expect(logged.route).toBe('chat');
    expect(typeof logged.observed).toBe('number');
    expect(typeof logged.limit).toBe('number');
  });

  it('off mode: returns null and does NOT log', () => {
    process.env.LIMITS_MODE = 'off';
    const verdict = checkHistory(makeArray(HISTORY_ITEMS_MAX + 1));
    const result = enforceLimits('chat', [verdict]);
    expect(result).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('enforce mode: returns a Response with the correct status', async () => {
    process.env.LIMITS_MODE = 'enforce';
    const verdict = checkHistory(makeArray(HISTORY_ITEMS_MAX + 1));
    const result = enforceLimits('chat', [verdict]);
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(422);
    expect(result!.headers.get('content-type')).toBe('application/problem+json');
  });

  it('enforce mode: response body is valid problem+json', async () => {
    process.env.LIMITS_MODE = 'enforce';
    const verdict = checkBodyBytes(makeRequest(BODY_BYTES_MAX + 1));
    const result = enforceLimits('chat', [verdict]);
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(413);
    const body = await result!.json();
    expect(body.code).toBe('body_too_large');
    expect(body.status).toBe(413);
    expect(typeof body.type).toBe('string');
    expect(typeof body.title).toBe('string');
  });

  it('per-route env override takes precedence over global LIMITS_MODE', () => {
    process.env.LIMITS_MODE = 'enforce';
    process.env.LIMITS_MODE_CHAT = 'off';
    const verdict = checkHistory(makeArray(HISTORY_ITEMS_MAX + 1));
    const result = enforceLimits('chat', [verdict]);
    // Route override is 'off' → null despite global 'enforce'
    expect(result).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('missing content-length header → null (cannot check pre-parse)', () => {
    process.env.LIMITS_MODE = 'enforce';
    const verdict = checkBodyBytes(makeRequest()); // no content-length
    expect(verdict).toBeNull();
    const result = enforceLimits('chat', [verdict]);
    expect(result).toBeNull();
  });

  it('picks the first non-null verdict when multiple checks are provided', async () => {
    process.env.LIMITS_MODE = 'enforce';
    const result = enforceLimits('chat', [
      null,
      checkHistory(makeArray(HISTORY_ITEMS_MAX + 1)),
      checkQueryChars(makeString(QUERY_CHARS_MAX + 1)),
    ]);
    expect(result).toBeInstanceOf(Response);
    const body = await result!.json();
    expect(body.code).toBe('history_too_long');
  });

  it('unknown LIMITS_MODE value falls back to shadow (non-blocking, logs limit_would_reject)', () => {
    // A typo in the env var must never accidentally flip to enforce.
    process.env.LIMITS_MODE = 'typo';
    const verdict = checkHistory(makeArray(HISTORY_ITEMS_MAX + 1));
    const result = enforceLimits('chat', [verdict]);
    // Shadow fallback: request proceeds (null returned)
    expect(result).toBeNull();
    // Shadow fallback: the would-reject line is still logged
    expect(warnSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(logged.tag).toBe('limit_would_reject');
    expect(logged.code).toBe('history_too_long');
    // Restore handled by afterEach, but clean up the env var explicitly
    delete process.env.LIMITS_MODE;
  });
});
