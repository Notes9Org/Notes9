/**
 * Permission Store
 * 
 * Manages permission checks against Supabase database.
 * Caches permissions briefly for performance but always
 * validates critical operations with the database.
 * 
 * Also subscribes to realtime changes to detect revocations.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { serverConfig } from '../config.js';
import type {
  PermissionLevel,
  PermissionCheck,
  DocumentAccess
} from '../shared/types/index.js';
import { canRead, canWrite, canManage } from '../shared/types/index.js';

let supabaseAdmin: SupabaseClient | null = null;

// In-memory cache for active permissions (brief TTL for revocation detection)
interface CachedPermission {
  access: DocumentAccess | null;
  expiresAt: number;
}

const permissionCache = new Map<string, CachedPermission>();
const PERMISSION_CACHE_TTL = 5000; // 5 seconds - short for quick revocation detection

// Map of documentId -> Set of callback functions for revoke notifications
const revokeListeners = new Map<string, Set<(userId: string) => void>>();

export function initPermissionStore(): void {
  supabaseAdmin = createClient(
    serverConfig.supabaseUrl,
    serverConfig.supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  // Subscribe to realtime changes on document_access table
  subscribeToPermissionChanges();

  console.log('[Permissions] Permission store initialized with realtime subscription');
}

/**
 * Get cache key for permission lookup
 */
function getCacheKey(documentId: string, userId: string): string {
  return `${documentId}:${userId}`;
}

/**
 * Check user permission for a document
 * 
 * Always checks database for critical operations.
 * Uses brief caching for performance on frequent checks.
 */
export async function checkPermission(
  documentId: string,
  userId: string
): Promise<PermissionCheck> {
  const cacheKey = getCacheKey(documentId, userId);
  const now = Date.now();

  // Check cache first
  const cached = permissionCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    const permissionLevel = cached.access?.permission_level ?? null;
    return {
      canRead: canRead(permissionLevel),
      canWrite: canWrite(permissionLevel),
      canManage: canManage(permissionLevel),
      permissionLevel,
    };
  }

  // Fetch from database
  const access = await fetchPermissionFromDb(documentId, userId);

  // Update cache
  permissionCache.set(cacheKey, {
    access,
    expiresAt: now + PERMISSION_CACHE_TTL,
  });

  const permissionLevel = access?.permission_level ?? null;
  return {
    canRead: canRead(permissionLevel),
    canWrite: canWrite(permissionLevel),
    canManage: canManage(permissionLevel),
    permissionLevel,
  };
}

/**
 * Fetch permission directly from database (bypass cache)
 */
async function fetchPermissionFromDb(
  documentId: string,
  userId: string
): Promise<DocumentAccess | null> {
  if (!supabaseAdmin) {
    throw new Error('Permission store not initialized');
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('lab_note_access')
      .select('*')
      .eq('lab_note_id', documentId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - no access
        return null;
      }
      console.error('[Permissions] Database error:', error);
      return null;
    }

    return data as DocumentAccess;
  } catch (err) {
    console.error('[Permissions] Error fetching permission:', err);
    return null;
  }
}

/**
 * Verify user has required permission level
 * Throws error if not permitted
 */
export async function requirePermission(
  documentId: string,
  userId: string,
  requiredLevel: 'read' | 'write' | 'manage'
): Promise<PermissionLevel> {
  const check = await checkPermission(documentId, userId);

  let hasPermission = false;
  switch (requiredLevel) {
    case 'read':
      hasPermission = check.canRead;
      break;
    case 'write':
      hasPermission = check.canWrite;
      break;
    case 'manage':
      hasPermission = check.canManage;
      break;
  }

  if (!hasPermission) {
    throw new PermissionDeniedError(
      `User ${userId} does not have ${requiredLevel} permission for document ${documentId}`,
      check.permissionLevel
    );
  }

  return check.permissionLevel!;
}

/**
 * Invalidate cache entry for a user/document
 */
export function invalidatePermissionCache(documentId: string, userId: string): void {
  const cacheKey = getCacheKey(documentId, userId);
  permissionCache.delete(cacheKey);

  // Notify listeners about potential revocation
  const listeners = revokeListeners.get(documentId);
  if (listeners) {
    listeners.forEach(callback => callback(userId));
  }
}

/**
 * Register a callback for permission revocation on a document
 */
export function onPermissionRevoked(
  documentId: string,
  callback: (userId: string) => void
): () => void {
  if (!revokeListeners.has(documentId)) {
    revokeListeners.set(documentId, new Set());
  }
  revokeListeners.get(documentId)!.add(callback);

  // Return unsubscribe function
  return () => {
    revokeListeners.get(documentId)?.delete(callback);
  };
}

/**
 * Subscribe to realtime permission changes from Supabase
 */
function subscribeToPermissionChanges(): void {
  if (!supabaseAdmin) return;

  // Subscribe and keep reference (used by Supabase internally)
  void supabaseAdmin
    .channel('lab_note_access_changes')
    .on(
      'postgres_changes',
      {
        event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
        schema: 'public',
        table: 'lab_note_access',
      },
      (payload) => {
        console.log('[Permissions] Realtime change detected:', payload.eventType);

        const oldRecord = payload.old as DocumentAccess | undefined;
        const newRecord = payload.new as DocumentAccess | undefined;

        // Handle deletion (access revoked)
        if (payload.eventType === 'DELETE' && oldRecord) {
          invalidatePermissionCache(oldRecord.lab_note_id, oldRecord.user_id);
        }

        // Handle update (permission level changed)
        if (payload.eventType === 'UPDATE' && newRecord) {
          invalidatePermissionCache(newRecord.lab_note_id, newRecord.user_id);
        }
      }
    )
    .subscribe((status) => {
      console.log('[Permissions] Realtime subscription status:', status);
    });
}

/**
 * Custom error for permission violations
 */
export class PermissionDeniedError extends Error {
  constructor(
    message: string,
    public readonly currentLevel: PermissionLevel | null
  ) {
    super(message);
    this.name = 'PermissionDeniedError';
  }
}
