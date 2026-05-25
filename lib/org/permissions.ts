export const RESOURCES = [
  "projects",
  "experiments",
  "samples",
  "equipment",
  "protocols",
  "lab_notes",
  "reports",
] as const

export const ACTIONS = ["view", "create", "edit", "delete"] as const

export type Resource = (typeof RESOURCES)[number]
export type Action = (typeof ACTIONS)[number]
export type PermissionKey = `${Resource}.${Action}`

export interface OrgMemberRole {
  is_system_role: boolean
  name: string
}

export interface OrgMember {
  user_id: string
  role_id: string | null
  is_active: boolean
  role: OrgMemberRole | null
}

export function hasPermission(
  userPermissions: PermissionKey[],
  resource: Resource,
  action: Action
): boolean {
  const key: PermissionKey = `${resource}.${action}`
  return userPermissions.includes(key)
}

export function isOrgAdmin(
  orgMembers: OrgMember[],
  userId: string
): boolean {
  const member = orgMembers.find(
    (m) => m.user_id === userId && m.is_active
  )
  if (!member || !member.role) return false
  return member.role.is_system_role && member.role.name === "Admin"
}
