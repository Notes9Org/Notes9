const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function looksLikeUuid(s: string): boolean {
  return UUID_RE.test(s)
}

/**
 * Mirrors the backend's `resolve_source_name` choke-point
 * (`AI/catalyst/agents/core/citations.py`) for literature rows: never returns
 * "", never returns a raw UUID, falls back to a human label.
 */
export function resolveLiteratureTitle(row: { title?: string | null } | null | undefined): string {
  const title = (row?.title ?? "").trim()
  if (title && !looksLikeUuid(title)) return title
  return "Untitled literature review"
}
