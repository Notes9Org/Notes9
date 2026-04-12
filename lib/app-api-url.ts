/**
 * Build an absolute URL to this app's API. Some browsers/dev setups fail
 * `fetch("/api/...")` with "Failed to fetch" while same-origin absolute URLs work.
 */
export function appApiUrl(path: string): string {
  if (typeof window === "undefined") return path
  if (path.startsWith("http://") || path.startsWith("https://")) return path
  const base = window.location.origin
  return new URL(path.startsWith("/") ? path : `/${path}`, base).href
}
