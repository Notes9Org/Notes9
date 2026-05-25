'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { createClient } from '@/lib/supabase/client';
import { getCollaboratorColor } from './colors';

export interface UseCollaborationOptions {
  paperId: string;
  enabled: boolean;
}

export interface CollaboratorInfo {
  userId: string;
  name: string;
  color: string;
  cursor: { anchor: number; head: number } | null;
}

export interface UseCollaborationReturn {
  provider: HocuspocusProvider | null;
  ydoc: Y.Doc | null;
  status: 'connecting' | 'connected' | 'disconnected';
  collaborators: CollaboratorInfo[];
  error: string | null;
}

/**
 * Hook that manages the Hocuspocus collaboration provider and Yjs document
 * for real-time collaborative editing.
 *
 * When enabled, creates a Y.Doc and HocuspocusProvider connected to the
 * collaboration server using the paper ID as the document name and the
 * Supabase JWT as the authentication token.
 */
export function useCollaboration({
  paperId,
  enabled,
}: UseCollaborationOptions): UseCollaborationReturn {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [collaborators, setCollaborators] = useState<CollaboratorInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const providerRef = useRef<HocuspocusProvider | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);

  /**
   * Gets a fresh Supabase session token for authentication.
   * Used both on initial connection and on reconnect to ensure the token is valid.
   */
  const getToken = useCallback(async (): Promise<string> => {
    const supabase = createClient();
    const { data, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !data.session) {
      throw new Error('Failed to get authentication session');
    }

    return data.session.access_token;
  }, []);

  /**
   * Handles awareness state changes to build the collaborators list.
   * Extracts user info and cursor positions from awareness states.
   */
  const handleAwarenessChange = useCallback(() => {
    const provider = providerRef.current;
    if (!provider) return;

    const awareness = provider.awareness;
    if (!awareness) return;

    const states = awareness.getStates();
    const localClientId = awareness.clientID;
    const collabs: CollaboratorInfo[] = [];

    states.forEach((state, clientId) => {
      // Skip the local user
      if (clientId === localClientId) return;

      // Only include states that have user info
      if (state.user) {
        const userId = state.user.userId || state.user.id || String(clientId);
        collabs.push({
          userId,
          name: state.user.name || 'Anonymous',
          color: state.user.color || getCollaboratorColor(userId),
          cursor: state.cursor || null,
        });
      }
    });

    setCollaborators(collabs);
  }, []);

  useEffect(() => {
    if (!enabled || !paperId) {
      // Clean up if disabled
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
      if (ydocRef.current) {
        ydocRef.current.destroy();
        ydocRef.current = null;
      }
      setStatus('disconnected');
      setCollaborators([]);
      setError(null);
      return;
    }

    const collaborationUrl = process.env.NEXT_PUBLIC_COLLABORATION_URL;
    if (!collaborationUrl) {
      setStatus('disconnected');
      setError('Collaboration URL not configured');
      return;
    }

    // Create Y.Doc instance
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Set initial status
    setStatus('connecting');
    setError(null);

    // Create HocuspocusProvider
    const provider = new HocuspocusProvider({
      url: collaborationUrl,
      name: paperId,
      document: ydoc,
      // Token is fetched asynchronously for initial connection and reconnects
      token: getToken,
      // Reconnection is handled automatically by HocuspocusProvider with exponential backoff
      onConnect() {
        setStatus('connected');
        setError(null);
      },
      onDisconnect() {
        setStatus('disconnected');
      },
      onClose() {
        setStatus('disconnected');
      },
      onAuthenticationFailed({ reason }) {
        setError(`Authentication failed: ${reason}`);
        setStatus('disconnected');
      },
      onAwarenessChange() {
        handleAwarenessChange();
      },
      onStatus({ status: providerStatus }) {
        if (providerStatus === 'connecting') {
          setStatus('connecting');
        } else if (providerStatus === 'connected') {
          setStatus('connected');
          setError(null);
        } else if (providerStatus === 'disconnected') {
          setStatus('disconnected');
        }
      },
    });

    providerRef.current = provider;

    // Cleanup on unmount or when dependencies change
    return () => {
      provider.destroy();
      providerRef.current = null;
      ydoc.destroy();
      ydocRef.current = null;
      setStatus('disconnected');
      setCollaborators([]);
    };
  }, [paperId, enabled, getToken, handleAwarenessChange]);

  return {
    provider: providerRef.current,
    ydoc: ydocRef.current,
    status,
    collaborators,
    error,
  };
}
