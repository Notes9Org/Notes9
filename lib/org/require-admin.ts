/**
 * Org admin authorization helpers.
 *
 * The `org_members → org_roles` relationship is to-one, but Supabase's generated
 * types model the embedded `org_roles(...)` selection as an array. The previous
 * call-sites worked around this with `(membership.org_roles as any)?.is_system_role`,
 * which is both unsafe (the cast hides shape changes) and fragile (it breaks if the
 * join ever returns the array form). `isSystemAdminRow` normalizes both shapes —
 * object or array — so the check is correct regardless of cardinality, and the
 * logic lives in exactly one place.
 */

type SystemRoleRow = { is_system_role?: boolean | null } | null

/**
 * True when the embedded `org_roles` relation from an `org_members` row marks the
 * member's role as a system (admin) role. Accepts the object form, the array form,
 * or null/undefined — all of which Supabase can return depending on typing.
 */
export function isSystemAdminRow(orgRoles: unknown): boolean {
  const rows = Array.isArray(orgRoles) ? orgRoles : orgRoles ? [orgRoles] : []
  return rows.some((row) => (row as SystemRoleRow)?.is_system_role === true)
}
