/**
 * Shared auth gate for every `app/api/cron/**` route.
 *
 * N9-13: the three cron routes each compared the caller-supplied secret with
 * `===`, a variable-time comparison — an attacker measuring response latency
 * across many guesses can recover `CRON_SECRET` byte-by-byte. Fixed at the
 * root (one shared gate all routes import) rather than patched per route, so
 * no future cron route can reintroduce the `===` bug by copy-paste.
 *
 * `crypto.timingSafeEqual` requires equal-length buffers (it throws
 * otherwise), so we check length first — a length mismatch is already a
 * guaranteed non-match and leaks nothing sensitive by returning `false` early.
 */
import crypto from "node:crypto";

function timingSafeEqualStr(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export type CronAuthResult = { ok: boolean; reason?: string };

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. `X-Admin-Secret` is
 * also accepted so the same endpoints are callable manually (e.g. incident
 * response) with the same secret. Fails closed: an unset `CRON_SECRET` never
 * authorizes any request, regardless of what the caller sends.
 */
export function isAuthorizedCron(request: Request): CronAuthResult {
  const expected = process.env.CRON_SECRET;
  if (!expected) return { ok: false, reason: "CRON_SECRET not configured" };

  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const admin = request.headers.get("x-admin-secret") ?? "";

  if (bearer && timingSafeEqualStr(bearer, expected)) return { ok: true };
  if (admin && timingSafeEqualStr(admin, expected)) return { ok: true };
  return { ok: false, reason: "invalid cron credential" };
}
