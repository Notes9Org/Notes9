'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  localProtocolClearMessages,
  localProtocolCreateSession,
  localProtocolDeleteSession,
  localProtocolListSessions,
  localProtocolLoadMessages,
  localProtocolSaveMessage,
  localProtocolUpdateSessionTitle,
} from '@/lib/protocol-chat-local';

/** PostgREST errors are plain objects; `console.error(err)` often prints `{}`. */
function formatSupabaseErr(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const o = error as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code].filter(
      (x): x is string => typeof x === 'string' && x.length > 0
    );
    if (parts.length > 0) return parts.join(' | ');
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** DB missing `protocol_id` column or PostgREST schema cache out of date. */
function isProtocolIdSchemaError(error: unknown): boolean {
  const s = formatSupabaseErr(error).toLowerCase();
  return (
    s.includes('protocol_id') ||
    s.includes('pgrst204') ||
    s.includes('42703') ||
    s.includes('schema cache')
  );
}

export interface ChatSession {
  id: string;
  user_id: string;
  title: string | null;
  protocol_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

/**
 * @param protocolId - When set, loads/creates sessions for Protocol AI (scoped to that protocol).
 *                     When omitted, only Catalyst chats (`protocol_id` IS NULL).
 */
export function useChatSessions(protocolId?: string) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  /** Protocol AI: persist in localStorage when `protocol_id` column is not migrated. */
  const protocolUseLocalRef = useRef(false);
  /** Catalyst: omit `protocol_id` in queries when the column does not exist. */
  const catalystOmitProtocolIdRef = useRef(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (protocolId && protocolUseLocalRef.current) {
        setSessions(localProtocolListSessions(protocolId, user.id) as ChatSession[]);
        return;
      }

      let q = supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', user.id);

      if (protocolId) {
        q = q.eq('protocol_id', protocolId);
      } else if (!catalystOmitProtocolIdRef.current) {
        q = q.is('protocol_id', null);
      }

      const { data, error } = await q.order('updated_at', { ascending: false });

      if (error) {
        if (protocolId && isProtocolIdSchemaError(error)) {
          protocolUseLocalRef.current = true;
          setSessions(localProtocolListSessions(protocolId, user.id) as ChatSession[]);
          return;
        }
        if (!protocolId && isProtocolIdSchemaError(error)) {
          catalystOmitProtocolIdRef.current = true;
          const r2 = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });
          if (r2.error) throw r2.error;
          setSessions(r2.data || []);
          return;
        }
        throw error;
      }
      setSessions(data || []);
    } catch (error) {
      console.error('Error loading sessions:', formatSupabaseErr(error));
    } finally {
      setLoading(false);
    }
  }, [supabase, protocolId]);

  const createSession = useCallback(async (title?: string): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      if (protocolId && protocolUseLocalRef.current) {
        const row = localProtocolCreateSession(protocolId, user.id, title);
        setSessions((prev) => [row as ChatSession, ...prev]);
        setCurrentSessionId(row.id);
        return row.id;
      }

      const buildInsert = (): Record<string, unknown> => {
        const base: Record<string, unknown> = {
          user_id: user.id,
          title: title || null,
        };
        if (protocolId) {
          base.protocol_id = protocolId;
        } else if (!catalystOmitProtocolIdRef.current) {
          base.protocol_id = null;
        }
        return base;
      };

      let { data, error } = await supabase
        .from('chat_sessions')
        .insert(buildInsert())
        .select()
        .single();

      if (error && protocolId && isProtocolIdSchemaError(error)) {
        protocolUseLocalRef.current = true;
        const row = localProtocolCreateSession(protocolId, user.id, title);
        setSessions((prev) => [row as ChatSession, ...prev]);
        setCurrentSessionId(row.id);
        return row.id;
      }

      if (error && !protocolId && isProtocolIdSchemaError(error)) {
        catalystOmitProtocolIdRef.current = true;
        const r2 = await supabase
          .from('chat_sessions')
          .insert({ user_id: user.id, title: title || null })
          .select()
          .single();
        if (r2.error) throw r2.error;
        data = r2.data;
        error = null;
      }

      if (error) throw error;

      setSessions((prev) => [data as ChatSession, ...prev]);
      setCurrentSessionId((data as ChatSession).id);
      return (data as ChatSession).id;
    } catch (error) {
      console.error(
        'Error creating session:',
        formatSupabaseErr(error),
        '| For server-side chat + RLS, apply scripts/037 and 038 on Supabase.'
      );
      return null;
    }
  }, [supabase, protocolId]);

  const updateSessionTitle = useCallback(async (sessionId: string, title: string) => {
    try {
      if (protocolId && protocolUseLocalRef.current) {
        localProtocolUpdateSessionTitle(protocolId, sessionId, title);
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, title } : s))
        );
        return;
      }

      const { error } = await supabase
        .from('chat_sessions')
        .update({ title })
        .eq('id', sessionId);

      if (error) throw error;

      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, title } : s))
      );
    } catch (error) {
      console.error('Error updating session title:', formatSupabaseErr(error));
    }
  }, [supabase, protocolId]);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      if (protocolId && protocolUseLocalRef.current) {
        localProtocolDeleteSession(protocolId, sessionId);
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        return;
      }

      const { error } = await supabase
        .from('chat_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;

      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (error) {
      console.error('Error deleting session:', formatSupabaseErr(error));
    }
  }, [supabase, protocolId]);

  /** If the active session was deleted or missing from the list, fall back to the first session (or null). */
  useEffect(() => {
    if (!currentSessionId) return;
    if (sessions.length === 0) {
      setCurrentSessionId(null);
      return;
    }
    if (!sessions.some((s) => s.id === currentSessionId)) {
      setCurrentSessionId(sessions[0]!.id);
    }
  }, [sessions, currentSessionId]);

  const clearSessionMessages = useCallback(async (sessionId: string) => {
    try {
      if (protocolId && protocolUseLocalRef.current) {
        localProtocolClearMessages(protocolId, sessionId);
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? { ...s, title: null, updated_at: new Date().toISOString() }
              : s
          )
        );
        return;
      }

      const { error } = await supabase
        .from('chat_messages')
        .delete()
        .eq('session_id', sessionId);

      if (error) throw error;

      await supabase
        .from('chat_sessions')
        .update({ title: null, updated_at: new Date().toISOString() })
        .eq('id', sessionId);

      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, title: null, updated_at: new Date().toISOString() } : s
        )
      );
    } catch (error) {
      console.error('Error clearing session messages:', formatSupabaseErr(error));
    }
  }, [supabase, protocolId]);

  const loadMessages = useCallback(async (sessionId: string): Promise<ChatMessage[]> => {
    try {
      if (protocolId && protocolUseLocalRef.current) {
        return localProtocolLoadMessages(protocolId, sessionId) as ChatMessage[];
      }

      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error loading messages:', formatSupabaseErr(error));
      return [];
    }
  }, [supabase, protocolId]);

  const saveMessage = useCallback(async (
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<ChatMessage | null> => {
    try {
      if (protocolId && protocolUseLocalRef.current) {
        return localProtocolSaveMessage(protocolId, sessionId, role, content, metadata) as ChatMessage | null;
      }

      const { data: existing } = await supabase
        .from('chat_messages')
        .select('id')
        .eq('session_id', sessionId)
        .eq('role', role)
        .eq('content', content)
        .gte('created_at', new Date(Date.now() - 5000).toISOString())
        .limit(1);

      if (existing && existing.length > 0) {
        return null;
      }

      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          session_id: sessionId,
          role,
          content,
          metadata: metadata ?? {},
        })
        .select()
        .single();

      if (error) throw error;

      await supabase
        .from('chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionId);

      return data;
    } catch (error) {
      console.error('Error saving message:', formatSupabaseErr(error));
      return null;
    }
  }, [supabase, protocolId]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  return {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    loading,
    loadSessions,
    createSession,
    updateSessionTitle,
    deleteSession,
    clearSessionMessages,
    loadMessages,
    saveMessage,
  };
}
