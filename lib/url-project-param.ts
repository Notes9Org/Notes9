/** Loose UUID v4/v? validation for `?project=` deep links (must still be allowlisted against known project ids). */
export function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  )
}

export function resolveInitialProjectIdParam(
  raw: string | string[] | undefined,
  allowedProjectIds: string[]
): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (!v || !isLikelyUuid(v)) return null
  return allowedProjectIds.includes(v) ? v : null
}
