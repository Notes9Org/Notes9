/**
 * lib/limits/config.ts
 *
 * Static ceiling constants for the stateless limit guards (Workstream C).
 * These are abuse ceilings — generous backstops against malformed or malicious
 * payloads. They are NOT organic conversation caps; rolling summarization
 * handles conversational continuity separately.
 *
 * Edge-safe: no imports, no Node-only APIs.
 */

// ---------------------------------------------------------------------------
// Limit constants
// ---------------------------------------------------------------------------

/** Maximum raw body size in bytes (25 MB). Checked via Content-Length header
 *  before the body is buffered. Stops a 100 MB spray before req.json() runs. */
export const BODY_BYTES_MAX = 25 * 1024 * 1024;

/** Maximum number of items in a raw history array POSTed in a single request.
 *  This is a backstop against a malicious 100k-item array, not a conversation
 *  length limit — the real sliding window lives in the Redis / summarization layer. */
export const HISTORY_ITEMS_MAX = 400;

/** Maximum characters in the query / prompt string. */
export const QUERY_CHARS_MAX = 100_000;

/** Maximum characters in a single message content field. */
export const MESSAGE_CONTENT_CHARS_MAX = 200_000;

/** Maximum number of attachment objects in a single request. */
export const ATTACHMENTS_ITEMS_MAX = 50;

/** Maximum number of entity IDs in a single request. */
export const ENTITY_ID_ITEMS_MAX = 200;

/** Maximum number of file-register items in a single /files/register call. */
export const REGISTER_ITEMS_MAX = 20;

/** Maximum number of events in a single /api/telemetry/events POST. */
export const TELEMETRY_BATCH_MAX = 200;

// ---------------------------------------------------------------------------
// Mode resolution
// ---------------------------------------------------------------------------

export type LimitsMode = 'shadow' | 'enforce' | 'off';

const VALID_MODES = new Set<string>(['shadow', 'enforce', 'off']);

/**
 * Resolve the active limits mode.
 *
 * Reading order (first truthy value wins):
 *   1. LIMITS_MODE_<ROUTE> (uppercase route key, e.g. LIMITS_MODE_CHAT)
 *   2. LIMITS_MODE
 *   3. Default: 'shadow'
 *
 * Unknown values fall back to 'shadow' (fail-safe: non-blocking).
 *
 * @param route  Optional route key used to look up a per-route override env var.
 *               Pass the route string exactly as you'd key it (e.g. 'chat',
 *               'agent_stream'). The lookup uppercases it automatically.
 */
export function getLimitsMode(route?: string): LimitsMode {
  if (route) {
    const routeKey = route.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const routeOverride = process.env[`LIMITS_MODE_${routeKey}`];
    if (routeOverride && VALID_MODES.has(routeOverride)) {
      return routeOverride as LimitsMode;
    }
  }

  const global = process.env.LIMITS_MODE;
  if (global && VALID_MODES.has(global)) {
    return global as LimitsMode;
  }

  // Unknown value → 'shadow': never accidentally flip to enforce via a typo.
  return 'shadow';
}
