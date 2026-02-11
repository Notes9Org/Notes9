/**
 * PostgreSQL Persistence Layer
 * 
 * Handles CRDT state persistence to Supabase Postgres.
 * Uses binary storage for Yjs updates.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { serverConfig } from '../config.js';
import type { DocumentMetadata } from '../shared/types/index.js';

let supabaseAdmin: SupabaseClient | null = null;

export function initPersistence(): void {
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
  console.log('[Persistence] PostgreSQL persistence initialized');
}

/**
 * Load Yjs state from Postgres
 */
export async function loadYjsState(documentId: string): Promise<Uint8Array | null> {
  if (!supabaseAdmin) {
    throw new Error('Persistence not initialized');
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('yjs_states')
      .select('state')
      .eq('document_id', documentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No state found - new document
        return null;
      }
      console.error('[Persistence] Error loading state:', error);
      return null;
    }

    if (!data?.state) {
      return null;
    }

    // Convert from base64 or bytes depending on how Supabase returns it
    const state = data.state;
    if (typeof state === 'string') {
      // Base64 encoded
      return Uint8Array.from(atob(state), c => c.charCodeAt(0));
    } else if (Array.isArray(state)) {
      // Byte array
      return new Uint8Array(state);
    } else if (state instanceof Uint8Array) {
      return state;
    }
    
    return null;
  } catch (err) {
    console.error('[Persistence] Exception loading state:', err);
    return null;
  }
}

/**
 * Save Yjs state to Postgres
 * Uses upsert to handle both insert and update
 */
export async function saveYjsState(documentId: string, state: Uint8Array): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error('Persistence not initialized');
  }

  try {
    // Convert to base64 for storage
    const base64State = btoa(String.fromCharCode(...state));

    const { error } = await supabaseAdmin
      .from('yjs_states')
      .upsert(
        {
          document_id: documentId,
          state: base64State,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'document_id',
        }
      );

    if (error) {
      console.error('[Persistence] Error saving state:', error);
      throw new Error(`Failed to save document state: ${error.message}`);
    }
  } catch (err) {
    console.error('[Persistence] Exception saving state:', err);
    throw err;
  }
}

/**
 * Delete Yjs state (when document is deleted)
 */
export async function deleteYjsState(documentId: string): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error('Persistence not initialized');
  }

  try {
    const { error } = await supabaseAdmin
      .from('yjs_states')
      .delete()
      .eq('document_id', documentId);

    if (error) {
      console.error('[Persistence] Error deleting state:', error);
      throw new Error(`Failed to delete document state: ${error.message}`);
    }
  } catch (err) {
    console.error('[Persistence] Exception deleting state:', err);
    throw err;
  }
}

/**
 * Check if a document exists in the database
 */
export async function documentExists(documentId: string): Promise<boolean> {
  if (!supabaseAdmin) {
    throw new Error('Persistence not initialized');
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('id')
      .eq('id', documentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return false;
      }
      throw error;
    }

    return !!data;
  } catch (err) {
    console.error('[Persistence] Error checking document existence:', err);
    return false;
  }
}

/**
 * Get document metadata
 */

export async function getDocumentMetadata(documentId: string): Promise<DocumentMetadata | null> {
  if (!supabaseAdmin) {
    throw new Error('Persistence not initialized');
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data as DocumentMetadata;
  } catch (err) {
    console.error('[Persistence] Error getting document metadata:', err);
    return null;
  }
}
