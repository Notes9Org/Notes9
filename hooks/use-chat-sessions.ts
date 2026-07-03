'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthUser } from "@/components/auth/auth-provider"
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
    // JSON.stringify can throw on circular refs; String() can throw if the
    // value has a broken toString(). Guard both so logging never crashes.
    try {
      return String(error);
    } catch {
      return "[unserializable error]";
    }
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
  /** 'chat' (default) | 'literature' | other future kinds. */
  kind?: string | null;
  /** Arbitrary session-level metadata (e.g. { literature: LiteratureSessionContext }). */
  metadata?: Record<string, unknown> | null;
  /** Optional user folder (chat_folders.id). Undefined until 092 is applied. */
  folder_id?: string | null;
}

/** A user-defined folder for organising chats (scripts/092_chat_folders.sql). */
export interface ChatFolder {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  sort: number;
  created_at: string;
  updated_at: string;
}

/** chat_folders table / folder_id column not migrated yet (092 not applied). */
function isFolderSchemaError(error: unknown): boolean {
  const s = formatSupabaseErr(error).toLowerCase();
  return (
    s.includes('chat_folders') ||
    s.includes('folder_id') ||
    s.includes('42p01') || // undefined_table
    s.includes('42703') || // undefined_column
    s.includes('pgrst205') || // table not found in schema cache
    s.includes('pgrst204') || // column not found in schema cache
    s.includes('schema cache') ||
    s.includes('does not exist')
  );
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
  const user = useAuthUser();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  // User folders (Catalyst only). `foldersAvailable` flips false when the 092
  // migration hasn't been applied, so the UI can hide folder features cleanly.
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [foldersAvailable, setFoldersAvailable] = useState(true);
  const foldersUnavailableRef = useRef(false);

  /** Protocol AI: persist in localStorage when `protocol_id` column is not migrated. */
  const protocolUseLocalRef = useRef(false);
  /** Catalyst: omit `protocol_id` in queries when the column does not exist. */
  const catalystOmitProtocolIdRef = useRef(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
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

  const createSession = useCallback(async (
    title?: string,
    opts?: { kind?: string; metadata?: Record<string, unknown> },
  ): Promise<string | null> => {
    try {
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
        if (opts?.kind) base.kind = opts.kind;
        if (opts?.metadata) base.metadata = opts.metadata;
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

      const now = new Date().toISOString();
      const { error } = await supabase
        .from('chat_sessions')
        .update({ title, updated_at: now })
        .eq('id', sessionId);

      if (error) throw error;

      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, title, updated_at: now } : s))
      );
    } catch (error) {
      console.error('Error updating session title:', formatSupabaseErr(error));
    }
  }, [supabase, protocolId]);

  /** Persist arbitrary metadata on an existing session (e.g. literature context
   *  after it has been created). Fail-silent: callers can continue on error. */
  const updateSessionMetadata = useCallback(async (
    sessionId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> => {
    try {
      const { error } = await supabase
        .from('chat_sessions')
        .update({ metadata })
        .eq('id', sessionId);
      if (error) throw error;
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, metadata } : s))
      );
    } catch (error) {
      console.error('Error updating session metadata:', formatSupabaseErr(error));
    }
  }, [supabase]);

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

      // Compute a deterministic id as SHA-256(session_id|role|content|bucketed-minute)
      // so concurrent writes from multiple tabs are idempotent without a race.
      const bucketedMinute = Math.floor(Date.now() / 60_000);
      const idSeed = `${sessionId}|${role}|${content}|${bucketedMinute}`;
      let deterministicId: string | undefined;
      try {
        const hashBuf = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(idSeed)
        );
        deterministicId = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
          // A UUID is 32 hex digits (8-4-4-4-12). Must slice to 32 — not 36 —
          // or the anchored regex below never matches, leaving an un-dashed
          // 36-char string that Postgres rejects as invalid uuid (22P02).
          .slice(0, 32)
          // Format as UUID v4-ish for Postgres uuid column compatibility.
          .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
      } catch {
        console.warn('[saveMessage] crypto.subtle unavailable; falling back to random id');
      }

      const { data, error } = await supabase
        .from('chat_messages')
        .upsert(
          {
            ...(deterministicId ? { id: deterministicId } : {}),
            session_id: sessionId,
            role,
            content,
            metadata: metadata ?? {},
          },
          { onConflict: 'id', ignoreDuplicates: true }
        )
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

  // ── Folders (Catalyst only) ──────────────────────────────────────────
  const loadFolders = useCallback(async () => {
    if (!user || protocolId || foldersUnavailableRef.current) return;
    try {
      const { data, error } = await supabase
        .from('chat_folders')
        .select('*')
        .eq('user_id', user.id)
        .order('sort', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) {
        if (isFolderSchemaError(error)) {
          foldersUnavailableRef.current = true;
          setFoldersAvailable(false);
          return;
        }
        throw error;
      }
      setFolders((data as ChatFolder[]) || []);
    } catch (error) {
      console.error('Error loading chat folders:', formatSupabaseErr(error));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, protocolId]);

  const createFolder = useCallback(
    async (name: string, color?: string | null): Promise<ChatFolder | null> => {
      if (!user || protocolId) return null;
      try {
        const { data, error } = await supabase
          .from('chat_folders')
          .insert({ user_id: user.id, name, color: color ?? null, sort: 0 })
          .select()
          .single();
        if (error) {
          if (isFolderSchemaError(error)) {
            foldersUnavailableRef.current = true;
            setFoldersAvailable(false);
          }
          throw error;
        }
        setFolders((prev) => [...prev, data as ChatFolder]);
        return data as ChatFolder;
      } catch (error) {
        console.error('Error creating chat folder:', formatSupabaseErr(error));
        return null;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [supabase, protocolId],
  );

  const renameFolder = useCallback(
    async (folderId: string, name: string) => {
      try {
        const now = new Date().toISOString();
        const { error } = await supabase
          .from('chat_folders')
          .update({ name, updated_at: now })
          .eq('id', folderId);
        if (error) throw error;
        setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name, updated_at: now } : f)));
      } catch (error) {
        console.error('Error renaming chat folder:', formatSupabaseErr(error));
      }
    },
    [supabase],
  );

  const deleteFolder = useCallback(
    async (folderId: string) => {
      try {
        const { error } = await supabase.from('chat_folders').delete().eq('id', folderId);
        if (error) throw error;
        setFolders((prev) => prev.filter((f) => f.id !== folderId));
        // DB sets folder_id -> NULL (ON DELETE SET NULL); mirror it locally so the
        // chats immediately reappear as ungrouped.
        setSessions((prev) => prev.map((s) => (s.folder_id === folderId ? { ...s, folder_id: null } : s)));
      } catch (error) {
        console.error('Error deleting chat folder:', formatSupabaseErr(error));
      }
    },
    [supabase],
  );

  const moveSessionToFolder = useCallback(
    async (sessionId: string, folderId: string | null) => {
      // Optimistic — the row jumps groups immediately.
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, folder_id: folderId } : s)));
      try {
        const { error } = await supabase
          .from('chat_sessions')
          .update({ folder_id: folderId })
          .eq('id', sessionId);
        if (error) {
          if (isFolderSchemaError(error)) {
            foldersUnavailableRef.current = true;
            setFoldersAvailable(false);
          }
          throw error;
        }
      } catch (error) {
        console.error('Error moving chat to folder:', formatSupabaseErr(error));
      }
    },
    [supabase],
  );

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  return {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    loading,
    loadSessions,
    createSession,
    updateSessionTitle,
    updateSessionMetadata,
    deleteSession,
    clearSessionMessages,
    loadMessages,
    saveMessage,
    // Folders
    folders,
    foldersAvailable,
    loadFolders,
    createFolder,
    renameFolder,
    deleteFolder,
    moveSessionToFolder,
  };
}
