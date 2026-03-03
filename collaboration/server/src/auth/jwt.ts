/**
 * JWT Authentication
 * 
 * Validates Supabase JWT tokens on WebSocket connections.
 * Uses Supabase service role to verify tokens without making API calls.
 */

import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { serverConfig } from '../config.js';
import type { CollabErrorCode } from '../shared/types/index.js';

// Service role client for token validation
let supabaseAdmin: SupabaseClient | null = null;

export function initAuth(): void {
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
  console.log('[Auth] JWT validator initialized');
}

export interface TokenValidationResult {
  valid: boolean;
  user?: User;
  error?: {
    code: CollabErrorCode;
    message: string;
  };
}

/**
 * Validate a Supabase JWT token
 * 
 * This uses the service role to verify the token locally
 * without making a network request to Supabase Auth API.
 */
export async function validateToken(token: string): Promise<TokenValidationResult> {
  if (!supabaseAdmin) {
    return {
      valid: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Auth system not initialized',
      },
    };
  }

  if (!token || token.length < 10) {
    return {
      valid: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Token is missing or invalid',
      },
    };
  }

  try {
    // Create a temporary client with the token to validate it
    const tempClient = createClient(
      serverConfig.supabaseUrl,
      serverConfig.supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    const { data: { user }, error } = await tempClient.auth.getUser();

    if (error || !user) {
      // Check if token is expired
      const isExpired = error?.message?.toLowerCase().includes('expired') ?? false;
      return {
        valid: false,
        error: {
          code: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
          message: error?.message || 'Invalid token',
        },
      };
    }

    return {
      valid: true,
      user,
    };
  } catch (err) {
    console.error('[Auth] Token validation error:', err);
    return {
      valid: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to validate token',
      },
    };
  }
}

/**
 * Extract user info from validated token
 */
export function getUserInfo(user: User): {
  id: string;
  email: string;
  name: string;
  avatar?: string;
} {
  return {
    id: user.id,
    email: user.email || '',
    name: user.user_metadata?.full_name || 
          user.user_metadata?.name || 
          user.email?.split('@')[0] || 
          'Anonymous',
    avatar: user.user_metadata?.avatar_url,
  };
}

/**
 * Generate a random color for user cursor
 */
export function getUserColor(userId: string): string {
  const colors = [
    '#ef4444', // red-500
    '#f97316', // orange-500
    '#f59e0b', // amber-500
    '#84cc16', // lime-500
    '#10b981', // emerald-500
    '#06b6d4', // cyan-500
    '#3b82f6', // blue-500
    '#6366f1', // indigo-500
    '#8b5cf6', // violet-500
    '#d946ef', // fuchsia-500
    '#f43f5e', // rose-500
  ];
  
  // Hash userId to get consistent color
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}
