"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";

export type CollaborationConnectionStatus = "connecting" | "connected" | "disconnected";

export interface CollaborationUser {
  id: string;
  name: string;
  color: string;
}

export interface CollaborationAwarenessState {
  clientId: number;
  user?: CollaborationUser;
  cursor?: unknown;
  [key: string]: unknown;
}

export interface CollaborativeProviderLike {
  awareness: {
    getStates: () => Map<number, Record<string, unknown>>;
  };
  setAwarenessField: (key: string, value: unknown) => void;
}

export interface UseCollaborativeEditorOptions {
  documentId: string | null;
  websocketUrl: string;
  token: string | null;
  user: CollaborationUser | null;
  enabled?: boolean;
  onYDocUpdate?: (update: Uint8Array, origin: unknown, doc: Y.Doc) => void;
}

export interface UseCollaborativeEditorReturn {
  ydoc: Y.Doc | null;
  provider: CollaborativeProviderLike | null;
  status: CollaborationConnectionStatus;
  isSynced: boolean;
  awareness: CollaborationAwarenessState[];
  lastUpdateAt: number | null;
}

type ServerMessage =
  | {
      type: "auth_success";
      payload?: {
        initialState?: number[];
      };
    }
  | {
      type: "sync_update";
      payload?: number[] | { update?: number[] };
    }
  | {
      type: "awareness_update";
      payload?: unknown;
    }
  | {
      type: "permission_revoked";
    }
  | {
      type: "error";
      payload?: {
        code?: string;
        message?: string;
      };
    };

const DISCONNECTED: CollaborationConnectionStatus = "disconnected";
const CONNECTING: CollaborationConnectionStatus = "connecting";
const CONNECTED: CollaborationConnectionStatus = "connected";
const REMOTE_ORIGIN = "remote-sync";

function normalizeCollabUrl(rawUrl: string): string {
  const input = rawUrl.trim();
  if (!input) return input;

  try {
    const parsed = new URL(input);

    if (parsed.protocol === "http:") parsed.protocol = "ws:";
    if (parsed.protocol === "https:") parsed.protocol = "wss:";
    if (!parsed.pathname || parsed.pathname === "/") parsed.pathname = "/collab";

    return parsed.toString();
  } catch {
    return input;
  }
}

function toAwarenessStates(
  states: Map<number, Record<string, unknown>>
): CollaborationAwarenessState[] {
  return Array.from(states.entries()).map(([clientId, state]) => ({
    clientId,
    ...(state as Record<string, unknown>),
  }));
}

function toUpdateArray(
  payload: number[] | { update?: number[] } | undefined
): number[] | null {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.update)) return payload.update;
  return null;
}

function toAwarenessEntries(
  payload: unknown
): Array<[number, Record<string, unknown>]> | null {
  const rawEntries = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { states?: unknown }).states)
      ? (payload as { states: unknown[] }).states
      : null;

  if (!rawEntries) return null;

  const entries: Array<[number, Record<string, unknown>]> = [];
  for (const item of rawEntries) {
    if (!Array.isArray(item) || item.length !== 2) continue;
    const [clientId, state] = item;
    if (typeof clientId !== "number") continue;
    if (!state || typeof state !== "object") continue;
    entries.push([clientId, state as Record<string, unknown>]);
  }

  return entries;
}

export function useCollaborativeEditor({
  documentId,
  websocketUrl,
  token,
  user,
  enabled = true,
  onYDocUpdate,
}: UseCollaborativeEditorOptions): UseCollaborativeEditorReturn {
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<CollaborativeProviderLike | null>(null);
  const [status, setStatus] = useState<CollaborationConnectionStatus>(DISCONNECTED);
  const [isSynced, setIsSynced] = useState(false);
  const [awareness, setAwareness] = useState<CollaborationAwarenessState[]>([]);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionUrl = useMemo(() => normalizeCollabUrl(websocketUrl), [websocketUrl]);

  useEffect(() => {
    if (!enabled || !documentId || !token || !user || !connectionUrl) {
      setYdoc(null);
      setProvider(null);
      setStatus(DISCONNECTED);
      setIsSynced(false);
      setAwareness([]);
      setLastUpdateAt(null);
      return;
    }

    const doc = new Y.Doc();
    const awarenessMap = new Map<number, Record<string, unknown>>();

    let stopped = false;
    let authenticated = false;

    const syncAwarenessState = () => {
      setAwareness(toAwarenessStates(awarenessMap));
    };

    const sendJson = (message: Record<string, unknown>) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(JSON.stringify(message));
    };

    const broadcastLocalAwareness = () => {
      const localState = awarenessMap.get(doc.clientID) ?? {};
      sendJson({
        type: "awareness",
        payload: {
          // Kept for server-side payload validation.
          update: [doc.clientID],
          states: [[doc.clientID, localState]],
        },
        timestamp: Date.now(),
      });
    };

    const providerLike: CollaborativeProviderLike = {
      awareness: {
        getStates: () => awarenessMap,
      },
      setAwarenessField: (key: string, value: unknown) => {
        const current = awarenessMap.get(doc.clientID) ?? {};
        awarenessMap.set(doc.clientID, {
          ...current,
          [key]: value,
        });
        broadcastLocalAwareness();
        syncAwarenessState();
      },
    };

    const handleDocUpdate = (update: Uint8Array, origin: unknown, yDocument: Y.Doc) => {
      setLastUpdateAt(Date.now());
      onYDocUpdate?.(update, origin, yDocument);

      if (!authenticated) return;
      if (origin === REMOTE_ORIGIN) return;

      sendJson({
        type: "sync",
        payload: {
          update: Array.from(update),
        },
        timestamp: Date.now(),
      });
    };

    const connect = () => {
      if (stopped) return;

      setStatus(CONNECTING);
      setIsSynced(false);

      const socket = new WebSocket(connectionUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        sendJson({
          type: "auth",
          payload: {
            token,
            documentId,
          },
          timestamp: Date.now(),
        });
      };

      socket.onmessage = (event) => {
        let message: ServerMessage | null = null;
        try {
          message = JSON.parse(event.data) as ServerMessage;
        } catch {
          return;
        }

        if (!message) return;

        if (message.type === "auth_success") {
          authenticated = true;
          setStatus(CONNECTED);

          const initialState = message.payload?.initialState;
          if (Array.isArray(initialState) && initialState.length > 0) {
            Y.applyUpdate(doc, new Uint8Array(initialState), REMOTE_ORIGIN);
          }

          awarenessMap.set(doc.clientID, { user });
          broadcastLocalAwareness();
          syncAwarenessState();
          setIsSynced(true);
          return;
        }

        if (message.type === "sync_update") {
          const remoteUpdate = toUpdateArray(message.payload);
          if (remoteUpdate && remoteUpdate.length > 0) {
            Y.applyUpdate(doc, new Uint8Array(remoteUpdate), REMOTE_ORIGIN);
          }
          return;
        }

        if (message.type === "awareness_update") {
          const payload = message.payload as unknown;
          const entries = toAwarenessEntries(payload);
          if (entries) {
            awarenessMap.clear();
            for (const [clientId, state] of entries) {
              awarenessMap.set(clientId, state);
            }
            if (!awarenessMap.has(doc.clientID)) {
              awarenessMap.set(doc.clientID, { user });
            }
            syncAwarenessState();
          }
          return;
        }

        if (message.type === "permission_revoked") {
          setStatus(DISCONNECTED);
          setIsSynced(false);
          socket.close();
          return;
        }

        if (message.type === "error") {
          if (process.env.NODE_ENV !== "production") {
            console.error("[collab] server error:", message.payload?.code, message.payload?.message);
          }
        }
      };

      socket.onclose = () => {
        authenticated = false;
        setStatus(DISCONNECTED);
        setIsSynced(false);

        if (!stopped) {
          reconnectTimerRef.current = setTimeout(connect, 1500);
        }
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    doc.on("update", handleDocUpdate);
    setYdoc(doc);
    setProvider(providerLike);
    syncAwarenessState();
    connect();

    return () => {
      stopped = true;
      authenticated = false;

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      awarenessMap.clear();
      doc.off("update", handleDocUpdate);

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      doc.destroy();
      setYdoc(null);
      setProvider(null);
      setStatus(DISCONNECTED);
      setIsSynced(false);
      setAwareness([]);
    };
  }, [documentId, connectionUrl, token, user?.id, user?.name, user?.color, enabled, onYDocUpdate]);

  useEffect(() => {
    if (!provider || !user) return;
    provider.setAwarenessField("user", user);
  }, [provider, user?.id, user?.name, user?.color]);

  const stableProvider = useMemo(() => provider, [provider]);

  return {
    ydoc,
    provider: stableProvider,
    status,
    isSynced,
    awareness,
    lastUpdateAt,
  };
}
