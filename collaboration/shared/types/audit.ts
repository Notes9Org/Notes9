/**
 * Audit Log Types for Collaborative Editor
 * 
 * All permission changes are logged for compliance.
 * Next.js app writes audit logs, collaboration server reads
 * them to verify access state.
 */

import type { PermissionLevel } from './permissions.js';

/**
 * Types of audit events
 */
export type AuditEventType = 
  | 'invitation_created'
  | 'invitation_accepted'
  | 'invitation_revoked'
  | 'access_granted'
  | 'access_revoked'
  | 'permission_changed'
  | 'document_deleted';

/**
 * Audit log record from database
 */
export interface AuditLog {
  id: string;
  document_id: string;
  event_type: AuditEventType;
  performed_by: string;
  target_user: string | null;
  previous_value: PermissionLevel | null;
  new_value: PermissionLevel | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Create audit log entry (API input)
 */
export interface CreateAuditLogRequest {
  documentId: string;
  eventType: AuditEventType;
  targetUser?: string;
  previousValue?: PermissionLevel;
  newValue?: PermissionLevel;
  metadata?: Record<string, unknown>;
}

/**
 * Audit log query parameters
 */
export interface AuditLogQuery {
  documentId?: string;
  eventType?: AuditEventType;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * Audit log response with pagination
 */
export interface AuditLogResponse {
  logs: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Build audit description for display
 */
export function buildAuditDescription(log: AuditLog): string {
  switch (log.event_type) {
    case 'invitation_created':
      return `Invited ${log.target_user} as ${log.new_value}`;
    case 'invitation_accepted':
      return `${log.target_user} accepted invitation`;
    case 'invitation_revoked':
      return `Revoked invitation for ${log.target_user}`;
    case 'access_granted':
      return `Granted ${log.target_user} ${log.new_value} access`;
    case 'access_revoked':
      return `Revoked access for ${log.target_user}`;
    case 'permission_changed':
      return `Changed ${log.target_user} from ${log.previous_value} to ${log.new_value}`;
    case 'document_deleted':
      return 'Document deleted';
    default:
      return 'Unknown event';
  }
}
