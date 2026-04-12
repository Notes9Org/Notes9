/**
 * Browser-local persistence for Protocol AI chat when `chat_sessions.protocol_id`
 * is not migrated yet. Keyed per protocol; cleared if user clears site data.
 */

const PREFIX = 'notes9-protocol-chat-v1';

/** Matches `ChatSession` from use-chat-sessions (avoids circular import). */
export type LocalChatSession = {
  id: string;
  user_id: string;
  title: string | null;
  protocol_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Matches `ChatMessage` from use-chat-sessions. */
export type LocalChatMessage = {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
};

function storeKey(protocolId: string) {
  return `${PREFIX}:${protocolId}`;
}

type LocalSessionRow = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

type LocalMessageRow = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

type LocalStore = {
  sessions: LocalSessionRow[];
  messagesBySessionId: Record<string, LocalMessageRow[]>;
};

function readStore(protocolId: string): LocalStore {
  if (typeof window === 'undefined') {
    return { sessions: [], messagesBySessionId: {} };
  }
  try {
    const raw = localStorage.getItem(storeKey(protocolId));
    if (!raw) return { sessions: [], messagesBySessionId: {} };
    const parsed = JSON.parse(raw) as LocalStore;
    if (!parsed.sessions || !parsed.messagesBySessionId) {
      return { sessions: [], messagesBySessionId: {} };
    }
    return parsed;
  } catch {
    return { sessions: [], messagesBySessionId: {} };
  }
}

function writeStore(protocolId: string, store: LocalStore) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storeKey(protocolId), JSON.stringify(store));
}

function toChatSession(row: LocalSessionRow, userId: string, protocolId: string): LocalChatSession {
  return {
    id: row.id,
    user_id: userId,
    title: row.title,
    protocol_id: protocolId,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function localProtocolListSessions(
  protocolId: string,
  userId: string
): LocalChatSession[] {
  const st = readStore(protocolId);
  return st.sessions
    .map((r) => toChatSession(r, userId, protocolId))
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
}

export function localProtocolCreateSession(
  protocolId: string,
  userId: string,
  title?: string | null
): ChatSession {
  const st = readStore(protocolId);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const row: LocalSessionRow = {
    id,
    title: title ?? null,
    created_at: now,
    updated_at: now,
  };
  st.sessions.unshift(row);
  st.messagesBySessionId[id] = [];
  writeStore(protocolId, st);
  return toChatSession(row, userId, protocolId);
}

export function localProtocolDeleteSession(protocolId: string, sessionId: string) {
  const st = readStore(protocolId);
  st.sessions = st.sessions.filter((s) => s.id !== sessionId);
  delete st.messagesBySessionId[sessionId];
  writeStore(protocolId, st);
}

export function localProtocolUpdateSessionTitle(
  protocolId: string,
  sessionId: string,
  title: string
) {
  const st = readStore(protocolId);
  const s = st.sessions.find((x) => x.id === sessionId);
  if (s) {
    s.title = title;
    s.updated_at = new Date().toISOString();
    writeStore(protocolId, st);
  }
}

export function localProtocolClearMessages(protocolId: string, sessionId: string) {
  const st = readStore(protocolId);
  st.messagesBySessionId[sessionId] = [];
  const s = st.sessions.find((x) => x.id === sessionId);
  if (s) {
    s.title = null;
    s.updated_at = new Date().toISOString();
    writeStore(protocolId, st);
  }
}

export function localProtocolLoadMessages(
  protocolId: string,
  sessionId: string
): LocalChatMessage[] {
  const st = readStore(protocolId);
  const rows = st.messagesBySessionId[sessionId] ?? [];
  return rows
    .slice()
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    .map((m) => ({
      id: m.id,
      session_id: sessionId,
      role: m.role,
      content: m.content,
      created_at: m.created_at,
    }));
}

export function localProtocolSaveMessage(
  protocolId: string,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): LocalChatMessage | null {
  const st = readStore(protocolId);
  const list = st.messagesBySessionId[sessionId] ?? [];
  const recent = list.filter(
    (m) =>
      m.role === role &&
      m.content === content &&
      Date.now() - new Date(m.created_at).getTime() < 5000
  );
  if (recent.length > 0) return null;

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const row: LocalMessageRow = { id, role, content, created_at: now };
  st.messagesBySessionId[sessionId] = [...list, row];
  const s = st.sessions.find((x) => x.id === sessionId);
  if (s) s.updated_at = now;
  writeStore(protocolId, st);
  return {
    id,
    session_id: sessionId,
    role,
    content,
    created_at: now,
  };
}
