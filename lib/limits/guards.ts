/**
 * lib/limits/guards.ts
 *
 * Stateless limit guards for Notes9 API routes (Workstream C).
 *
 * Design constraints:
 *  - Edge-safe: no Node-only imports. Uses only Web-standard APIs.
 *  - No per-request I/O (no Redis, no DB, no auth.getUser).
 *  - Shadow-mode default: in 'shadow' the guard logs a structured line and
 *    returns null (request proceeds normally). Only in 'enforce' mode does
 *    it return a Response. Flag-off ('off') skips even the log.
 *
 * Usage pattern in a route handler:
 *
 *   // 1. Pre-parse body-bytes check
 *   const blocked = enforceLimits('chat', [checkBodyBytes(req)]);
 *   if (blocked) return blocked;
 *
 *   // 2. Post-parse field checks
 *   const body = await req.json();
 *   const blocked2 = enforceLimits('chat', [
 *     checkHistory(body.history),
 *     checkQueryChars(body.query),
 *   ]);
 *   if (blocked2) return blocked2;
 */

import {
  getLimitsMode,
  BODY_BYTES_MAX,
  HISTORY_ITEMS_MAX,
  QUERY_CHARS_MAX,
  MESSAGE_CONTENT_CHARS_MAX,
  ATTACHMENTS_ITEMS_MAX,
  ENTITY_ID_ITEMS_MAX,
  REGISTER_ITEMS_MAX,
} from './config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LimitVerdict {
  /** Machine-readable error code (e.g. 'body_too_large'). */
  code: string;
  /** HTTP status to return in enforce mode. */
  httpStatus: number;
  /** Human-readable detail for the problem+json body. */
  detail: string;
  /** The observed value that triggered this verdict. */
  observed: number;
  /** The limit that was exceeded. */
  limit: number;
  /** Field or scope the limit applies to. */
  scope: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build an RFC 9457 problem+json body. */
function problemBody(verdict: LimitVerdict, route: string): string {
  return JSON.stringify({
    type: `https://notes9.com/errors/${verdict.code}`,
    title: verdict.code.replace(/_/g, ' '),
    status: verdict.httpStatus,
    code: verdict.code,
    detail: verdict.detail,
    scope: verdict.scope,
    route,
  });
}

// ---------------------------------------------------------------------------
// Guard functions
// ---------------------------------------------------------------------------

/**
 * Check the Content-Length header against BODY_BYTES_MAX.
 * Returns null if the header is absent or unparseable — we cannot check
 * without buffering, so we do not block in that case.
 * Must be called BEFORE req.json() / req.formData().
 */
export function checkBodyBytes(req: Request): LimitVerdict | null {
  const raw = req.headers.get('content-length');
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;

  if (parsed > BODY_BYTES_MAX) {
    return {
      code: 'body_too_large',
      httpStatus: 413,
      detail: `Request body exceeds the ${BODY_BYTES_MAX} byte ceiling.`,
      observed: parsed,
      limit: BODY_BYTES_MAX,
      scope: 'body',
    };
  }
  return null;
}

/**
 * Check the number of items in a history/messages array.
 */
export function checkHistory(history: unknown[]): LimitVerdict | null {
  if (history.length > HISTORY_ITEMS_MAX) {
    return {
      code: 'history_too_long',
      httpStatus: 422,
      detail: `history array exceeds the ${HISTORY_ITEMS_MAX} item ceiling.`,
      observed: history.length,
      limit: HISTORY_ITEMS_MAX,
      scope: 'history',
    };
  }
  return null;
}

/**
 * Check the character length of a query / prompt string.
 */
export function checkQueryChars(query: string): LimitVerdict | null {
  if (query.length > QUERY_CHARS_MAX) {
    return {
      code: 'query_too_long',
      httpStatus: 422,
      detail: `query exceeds the ${QUERY_CHARS_MAX} character ceiling.`,
      observed: query.length,
      limit: QUERY_CHARS_MAX,
      scope: 'query',
    };
  }
  return null;
}

/**
 * Check the character length of a message content field.
 */
export function checkContentChars(content: string): LimitVerdict | null {
  if (content.length > MESSAGE_CONTENT_CHARS_MAX) {
    return {
      code: 'content_too_long',
      httpStatus: 422,
      detail: `content exceeds the ${MESSAGE_CONTENT_CHARS_MAX} character ceiling.`,
      observed: content.length,
      limit: MESSAGE_CONTENT_CHARS_MAX,
      scope: 'content',
    };
  }
  return null;
}

/**
 * Check the number of items in an attachments array.
 */
export function checkAttachments(attachments: unknown[]): LimitVerdict | null {
  if (attachments.length > ATTACHMENTS_ITEMS_MAX) {
    return {
      code: 'attachments_too_many',
      httpStatus: 422,
      detail: `attachments array exceeds the ${ATTACHMENTS_ITEMS_MAX} item ceiling.`,
      observed: attachments.length,
      limit: ATTACHMENTS_ITEMS_MAX,
      scope: 'attachments',
    };
  }
  return null;
}

/**
 * Check the number of entity IDs in a single request.
 */
export function checkEntityIds(ids: unknown[]): LimitVerdict | null {
  if (ids.length > ENTITY_ID_ITEMS_MAX) {
    return {
      code: 'entity_ids_too_many',
      httpStatus: 422,
      detail: `entity_ids array exceeds the ${ENTITY_ID_ITEMS_MAX} item ceiling.`,
      observed: ids.length,
      limit: ENTITY_ID_ITEMS_MAX,
      scope: 'entity_ids',
    };
  }
  return null;
}

/**
 * Check the number of items in a /files/register payload.
 */
export function checkRegisterItems(items: unknown[]): LimitVerdict | null {
  if (items.length > REGISTER_ITEMS_MAX) {
    return {
      code: 'register_items_too_many',
      httpStatus: 422,
      detail: `items array exceeds the ${REGISTER_ITEMS_MAX} item ceiling.`,
      observed: items.length,
      limit: REGISTER_ITEMS_MAX,
      scope: 'items',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Evaluate a list of pre-computed verdicts and return a Response or null.
 *
 * Finds the first non-null verdict, then:
 *   - mode 'off'     → null (no log, request proceeds)
 *   - mode 'shadow'  → logs structured JSON via console.warn, returns null
 *                       (request proceeds — behavior-preserving)
 *   - mode 'enforce' → returns RFC 9457 problem+json Response
 *
 * This is the ONLY place the mode flag is evaluated, so flipping
 * LIMITS_MODE=enforce is the single control to activate blocking.
 */
export function enforceLimits(
  route: string,
  checks: Array<LimitVerdict | null>
): Response | null {
  // Find the first triggered limit.
  const verdict = checks.find((c): c is LimitVerdict => c !== null) ?? null;
  if (!verdict) return null;

  const mode = getLimitsMode(route);

  if (mode === 'off') {
    return null;
  }

  if (mode === 'shadow') {
    // Log without PII — only counts, codes, and the route.
    console.warn(
      JSON.stringify({
        tag: 'limit_would_reject',
        route,
        code: verdict.code,
        observed: verdict.observed,
        limit: verdict.limit,
        scope: verdict.scope,
      })
    );
    // Shadow: request proceeds as if the guard wasn't there.
    return null;
  }

  // mode === 'enforce'
  return new Response(problemBody(verdict, route), {
    status: verdict.httpStatus,
    headers: {
      'Content-Type': 'application/problem+json',
      'Cache-Control': 'no-store',
    },
  });
}
