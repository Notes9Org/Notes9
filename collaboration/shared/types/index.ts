/**
 * Shared Types for Collaborative Editor
 * 
 * These types are used by both the Next.js app and
 * the collaboration server. Keep them in sync with
 * your Supabase database schema.
 */

export * from './permissions.js';
export * from './invitations.js';
export * from './audit.js';

/**
 * WebSocket message types for collaboration server
 */
export type WebSocketMessageType =
  | 'auth'
  | 'auth_success'
  | 'auth_error'
  | 'sync'
  | 'sync_update'
  | 'awareness'
  | 'awareness_update'
  | 'permission_revoked'
  | 'error'
  | 'pong';

/**
 * WebSocket message structure
 */
export interface WebSocketMessage {
  type: WebSocketMessageType;
  payload?: unknown;
  timestamp?: number;
}

/**
 * Auth message payload (client → server)
 */
export interface AuthMessagePayload {
  token: string;
  documentId: string;
}

/**
 * Document state stored in Postgres
 */
export interface YjsState {
  document_id: string;
  state: Uint8Array;
  updated_at: string;
}

/**
 * User awareness state (cursor, selection, etc.)
 */
export interface AwarenessState {
  user: {
    id: string;
    name: string;
    email: string;
    color: string;
    avatar?: string;
  };
  cursor?: {
    anchor: number;
    head: number;
  };
  selection?: unknown;
  lastActive: number;
}

/**
 * Error codes for the collaboration server
 */
export enum CollabErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  DOCUMENT_NOT_FOUND = 'DOCUMENT_NOT_FOUND',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  PERMISSION_REVOKED = 'PERMISSION_REVOKED',
  SERVER_ERROR = 'SERVER_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
}

/**
 * Error response structure
 */
export interface CollabError {
  code: CollabErrorCode;
  message: string;
  details?: unknown;
}

/**
 * Document (lab note) metadata from database
 */
export interface DocumentMetadata {
  id: string;
  title?: string;
  created_by: string;
  created_at?: string;
  updated_at?: string;
}
