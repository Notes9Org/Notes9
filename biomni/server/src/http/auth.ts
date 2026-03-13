import { timingSafeEqual } from 'crypto';

function toBuffer(value: string): Buffer {
  return Buffer.from(value, 'utf8');
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = toBuffer(a);
  const bBuf = toBuffer(b);

  if (aBuf.length !== bBuf.length) {
    return false;
  }

  return timingSafeEqual(aBuf, bBuf);
}

export function getAuthHeaderValue(
  header: string | string[] | undefined
): string | undefined {
  if (!header) return undefined;
  if (Array.isArray(header)) return header[0];
  return header;
}

export function extractBearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader) return undefined;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return undefined;

  const token = match[1]?.trim();
  return token || undefined;
}

export function isBearerAuthorized(
  authHeader: string | undefined,
  expectedApiKey: string | undefined
): boolean {
  if (!expectedApiKey) return true;

  const token = extractBearerToken(authHeader);
  if (!token) return false;

  return timingSafeStringEqual(token, expectedApiKey);
}
