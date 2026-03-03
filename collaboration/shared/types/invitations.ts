/**
 * Invitation Types for Collaborative Editor
 * 
 * Used by the Next.js app for invitation management.
 * The collaboration server reads from document_access table
 * but doesn't handle invitations directly.
 */

import type { PermissionLevel } from './permissions.js';

/**
 * Invitation status
 */
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

/**
 * Invitation record from database
 */
export interface Invitation {
  id: string;
  document_id: string;
  email: string;
  invited_by: string;
  permission_level: PermissionLevel;
  token: string;
  status: InvitationStatus;
  expires_at: string;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
}

/**
 * Create invitation request (API input)
 */
export interface CreateInvitationRequest {
  documentId: string;
  email: string;
  permissionLevel: Exclude<PermissionLevel, 'owner'>;
}

/**
 * Accept invitation request (API input)
 */
export interface AcceptInvitationRequest {
  token: string;
}

/**
 * Invitation response (API output)
 */
export interface InvitationResponse {
  id: string;
  documentId: string;
  email: string;
  permissionLevel: PermissionLevel;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}

/**
 * Validate invitation token result
 */
export interface ValidatedInvitation {
  valid: boolean;
  invitation?: Invitation;
  error?: string;
}

/**
 * Default invitation expiration in hours
 */
export const DEFAULT_INVITATION_EXPIRY_HOURS = 168; // 7 days
