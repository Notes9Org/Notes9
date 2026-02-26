/**
 * Permission Types for Collaborative Editor
 * 
 * These types define the access control model used across
 * both the Next.js app and the collaboration server.
 */

/**
 * Permission levels for document access
 * - owner: Full control, can delete document, manage all permissions
 * - editor: Can edit content, cannot manage permissions
 * - viewer: Read-only access
 */
export type PermissionLevel = 'owner' | 'editor' | 'viewer';

/**
 * Document access record from database
 */
export interface DocumentAccess {
  id: string;
  lab_note_id: string;
  user_id: string;
  permission_level: PermissionLevel;
  granted_by: string;
  granted_at: string;
  updated_at: string;
}

/**
 * Permission check result
 */
export interface PermissionCheck {
  canRead: boolean;
  canWrite: boolean;
  canManage: boolean;
  permissionLevel: PermissionLevel | null;
}

/**
 * User session with permissions for a specific document
 */
export interface DocumentSession {
  userId: string;
  email: string;
  documentId: string;
  permissionLevel: PermissionLevel;
  connectedAt: Date;
}

/**
 * Check if a permission level allows writing
 */
export function canWrite(permission: PermissionLevel | null | undefined): boolean {
  return permission === 'owner' || permission === 'editor';
}

/**
 * Check if a permission level allows managing permissions
 */
export function canManage(permission: PermissionLevel | null | undefined): boolean {
  return permission === 'owner';
}

/**
 * Check if a permission level allows reading
 */
export function canRead(permission: PermissionLevel | null | undefined): boolean {
  return permission === 'owner' || permission === 'editor' || permission === 'viewer';
}

/**
 * Permission hierarchy for comparison
 */
const PERMISSION_HIERARCHY: Record<PermissionLevel, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
};

/**
 * Compare two permission levels
 * Returns positive if a > b, negative if a < b, 0 if equal
 */
export function comparePermissions(
  a: PermissionLevel | null | undefined,
  b: PermissionLevel | null | undefined
): number {
  const levelA = a ? PERMISSION_HIERARCHY[a] : 0;
  const levelB = b ? PERMISSION_HIERARCHY[b] : 0;
  return levelA - levelB;
}
