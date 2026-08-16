/**
 * Platform persistence for shortcut display (ADR-020).
 *
 * The server cannot know the user's OS, but it has to render `⌘` or `Ctrl` into
 * the HTML. Detecting during render is a hydration mismatch; detecting in an
 * effect flashes the wrong spelling on every load. So the client records the
 * platform in a cookie once, and every later server render reads it back and is
 * simply correct from the first byte.
 *
 * Pure and server-safe: no `window`, no `document`.
 */

export const PLATFORM_COOKIE = 'n9-platform'

/** A year — the platform of a given browser does not change. */
export const PLATFORM_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export const PLATFORM_MAC = 'mac'
export const PLATFORM_OTHER = 'other'

/**
 * Read `isMac` out of a cookie value.
 *
 * Only the two literals count. Anything else — absent, empty, a stale value from
 * an older release, or garbage — reads as `false`, which is the same state as a
 * first visit and degrades to the effect correcting it after mount. Accepting
 * only known-good values is what makes a stale cookie a non-event.
 */
export function readPlatformCookie(raw: string | undefined | null): boolean {
  return raw === PLATFORM_MAC
}

/** The value to persist for a detected platform. */
export function platformCookieValue(isMac: boolean): string {
  return isMac ? PLATFORM_MAC : PLATFORM_OTHER
}
