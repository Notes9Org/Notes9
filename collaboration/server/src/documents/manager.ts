/**
 * Document Manager
 * 
 * Manages Yjs documents in memory.
 * - Loads documents from persistence on first access
 * - Handles document lifecycle (load, update, save, unload)
 * - Manages awareness states for all connected users
 * - Enforces permission checks on all operations
 */

import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness.js';
import { serverConfig } from '../config.js';
import { checkPermission, onPermissionRevoked, PermissionDeniedError } from '../permissions/store.js';
import { loadYjsState, saveYjsState } from '../persistence/postgres.js';
import { getUserColor, getUserInfo } from '../auth/jwt.js';
import type { 
  PermissionLevel, 
  AwarenessState,
  User 
} from '../shared/types/index.js';
import type { WebSocket } from 'ws';

// Map of documentId -> ManagedDocument
const documents = new Map<string, ManagedDocument>();

// Map of socket -> documentId for cleanup
const socketToDocument = new WeakMap<WebSocket, string>();

interface ManagedDocument {
  id: string;
  ydoc: Y.Doc;
  awareness: Awareness;
  connections: Map<WebSocket, ConnectionInfo>;
  lastModified: number;
  persistTimer?: NodeJS.Timeout;
  isSaving: boolean;
  permissionUnsubscribe?: () => void;
}

interface ConnectionInfo {
  userId: string;
  email: string;
  name: string;
  permissionLevel: PermissionLevel;
  connectedAt: Date;
}

/**
 * Get or create a managed document
 */
export async function getDocument(documentId: string): Promise<ManagedDocument> {
  let doc = documents.get(documentId);
  
  if (!doc) {
    doc = await loadDocument(documentId);
    documents.set(documentId, doc);
  }
  
  return doc;
}

/**
 * Load document from persistence or create new
 */
async function loadDocument(documentId: string): Promise<ManagedDocument> {
  console.log(`[Document] Loading document: ${documentId}`);
  
  const ydoc = new Y.Doc();
  
  // Load existing state from Postgres
  const persistedState = await loadYjsState(documentId);
  if (persistedState) {
    Y.applyUpdate(ydoc, persistedState);
    console.log(`[Document] Loaded persisted state for: ${documentId}`);
  }
  
  const awareness = new Awareness(ydoc);
  const doc: ManagedDocument = {
    id: documentId,
    ydoc,
    awareness,
    connections: new Map(),
    lastModified: Date.now(),
    isSaving: false,
  };
  
  // Set up Yjs update handler
  ydoc.on('update', (update: Uint8Array, origin: unknown) => {
    doc.lastModified = Date.now();
    
    // Broadcast to all connected clients except origin
    broadcastUpdate(doc, update, origin as WebSocket | undefined);
    
    // Schedule persistence
    schedulePersistence(doc);
  });
  
  // Set up awareness change handler
  awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
    const changedClients = [...added, ...updated, ...removed];
    broadcastAwareness(doc, changedClients);
  });
  
  // Subscribe to permission revocations for this document
  doc.permissionUnsubscribe = onPermissionRevoked(documentId, (userId) => {
    handlePermissionRevoked(doc, userId);
  });
  
  return doc;
}

/**
 * Connect a user to a document
 */
export async function connectToDocument(
  socket: WebSocket,
  documentId: string,
  user: User
): Promise<{ doc: ManagedDocument; permissionLevel: PermissionLevel }> {
  // Check permissions
  const permissionCheck = await checkPermission(documentId, user.id);
  if (!permissionCheck.canRead) {
    throw new PermissionDeniedError(
      `Access denied to document ${documentId}`,
      permissionCheck.permissionLevel
    );
  }
  
  const doc = await getDocument(documentId);
  
  // Store connection info
  const userInfo = getUserInfo(user);
  const connectionInfo: ConnectionInfo = {
    userId: user.id,
    email: userInfo.email,
    name: userInfo.name,
    permissionLevel: permissionCheck.permissionLevel!,
    connectedAt: new Date(),
  };
  
  doc.connections.set(socket, connectionInfo);
  socketToDocument.set(socket, documentId);
  
  // Set up awareness for this client
  const clientId = Math.floor(Math.random() * 0xFFFFFFFF);
  const awarenessState: AwarenessState = {
    user: {
      id: user.id,
      name: userInfo.name,
      email: userInfo.email,
      color: getUserColor(user.id),
      avatar: userInfo.avatar,
    },
    lastActive: Date.now(),
  };
  
  doc.awareness.setLocalState(null); // Clear any previous state
  doc.awareness.setLocalState(awarenessState);
  
  console.log(`[Document] User ${user.id} connected to ${documentId} as ${permissionCheck.permissionLevel}`);
  
  return { doc, permissionLevel: permissionCheck.permissionLevel! };
}

/**
 * Disconnect a user from their document
 */
export function disconnectFromDocument(socket: WebSocket): void {
  const documentId = socketToDocument.get(socket);
  if (!documentId) return;
  
  const doc = documents.get(documentId);
  if (!doc) return;
  
  const connInfo = doc.connections.get(socket);
  if (connInfo) {
    console.log(`[Document] User ${connInfo.userId} disconnected from ${documentId}`);
  }
  
  doc.connections.delete(socket);
  
  // If no more connections, schedule document unload
  if (doc.connections.size === 0) {
    scheduleUnload(doc);
  }
}

/**
 * Apply an update from a client
 */
export function applyUpdate(
  doc: ManagedDocument,
  update: Uint8Array,
  origin: WebSocket
): void {
  // Verify sender has write permission
  const connInfo = doc.connections.get(origin);
  if (!connInfo) {
    throw new Error('Socket not registered with document');
  }
  
  if (connInfo.permissionLevel === 'viewer') {
    throw new PermissionDeniedError(
      'Viewers cannot edit documents',
      connInfo.permissionLevel
    );
  }
  
  // Apply the update (will trigger ydoc.on('update'))
  Y.applyUpdate(doc.ydoc, update, origin);
}

/**
 * Get document state as Uint8Array for syncing to client
 */
export function getDocumentState(doc: ManagedDocument): Uint8Array {
  return Y.encodeStateAsUpdate(doc.ydoc);
}

/**
 * Get awareness state for syncing to client
 */
export function getAwarenessState(doc: ManagedDocument): Uint8Array {
  // Encode awareness update for all clients
  const awarenessStates = Array.from(doc.awareness.getStates().entries());
  return new Uint8Array(); // Awareness protocol handles this separately
}

/**
 * Update awareness for a client
 */
export function updateAwareness(
  doc: ManagedDocument,
  update: Uint8Array,
  origin: WebSocket
): void {
  // Verify socket is connected to this document
  if (!doc.connections.has(origin)) {
    throw new Error('Socket not registered with document');
  }
  
  // Apply awareness update
  // This is handled by the awareness protocol
}

/**
 * Handle permission revocation - disconnect affected users
 */
function handlePermissionRevoked(doc: ManagedDocument, userId: string): void {
  console.log(`[Document] Permission revoked for user ${userId} on ${doc.id}`);
  
  // Find and disconnect all sockets for this user
  for (const [socket, connInfo] of doc.connections.entries()) {
    if (connInfo.userId === userId) {
      console.log(`[Document] Forcing disconnect for ${userId}`);
      
      // Send revocation notice before closing
      if (socket.readyState === 1) { // WebSocket.OPEN
        socket.send(JSON.stringify({
          type: 'permission_revoked',
          payload: { message: 'Your access to this document has been revoked' },
          timestamp: Date.now(),
        }));
      }
      
      // Close socket
      socket.close(4401, 'Permission revoked');
      doc.connections.delete(socket);
    }
  }
}

/**
 * Broadcast update to all connected clients except origin
 */
function broadcastUpdate(
  doc: ManagedDocument,
  update: Uint8Array,
  origin?: WebSocket
): void {
  const message = JSON.stringify({
    type: 'sync_update',
    payload: Array.from(update),
    timestamp: Date.now(),
  });
  
  for (const [socket] of doc.connections.entries()) {
    if (socket !== origin && socket.readyState === 1) { // WebSocket.OPEN
      socket.send(message);
    }
  }
}

/**
 * Broadcast awareness update to all connected clients
 */
function broadcastAwareness(doc: ManagedDocument, clientIds: number[]): void {
  // Get awareness states for changed clients
  const states = new Map();
  for (const clientId of clientIds) {
    const state = doc.awareness.getStates().get(clientId);
    if (state) {
      states.set(clientId, state);
    }
  }
  
  const message = JSON.stringify({
    type: 'awareness_update',
    payload: Array.from(states.entries()),
    timestamp: Date.now(),
  });
  
  for (const [socket] of doc.connections.entries()) {
    if (socket.readyState === 1) { // WebSocket.OPEN
      socket.send(message);
    }
  }
}

/**
 * Schedule document persistence
 */
function schedulePersistence(doc: ManagedDocument): void {
  if (doc.persistTimer) {
    clearTimeout(doc.persistTimer);
  }
  
  doc.persistTimer = setTimeout(() => {
    persistDocument(doc);
  }, serverConfig.persistInterval);
}

/**
 * Persist document to Postgres
 */
async function persistDocument(doc: ManagedDocument): Promise<void> {
  if (doc.isSaving) return;
  
  doc.isSaving = true;
  
  try {
    const state = Y.encodeStateAsUpdate(doc.ydoc);
    
    // Check document size
    if (state.length > serverConfig.maxDocumentSize) {
      console.error(`[Document] Document ${doc.id} exceeds max size`);
      return;
    }
    
    await saveYjsState(doc.id, state);
    console.log(`[Document] Persisted ${doc.id} (${state.length} bytes)`);
  } catch (err) {
    console.error(`[Document] Failed to persist ${doc.id}:`, err);
  } finally {
    doc.isSaving = false;
  }
}

/**
 * Schedule document unload after inactivity
 */
let unloadTimers = new Map<string, NodeJS.Timeout>();

function scheduleUnload(doc: ManagedDocument): void {
  // Clear existing timer
  const existing = unloadTimers.get(doc.id);
  if (existing) {
    clearTimeout(existing);
  }
  
  // Persist immediately before potential unload
  persistDocument(doc);
  
  // Schedule unload after 5 minutes of inactivity
  const timer = setTimeout(() => {
    unloadDocument(doc.id);
  }, 5 * 60 * 1000);
  
  unloadTimers.set(doc.id, timer);
}

/**
 * Unload document from memory
 */
async function unloadDocument(documentId: string): Promise<void> {
  const doc = documents.get(documentId);
  if (!doc) return;
  
  // Don't unload if connections reconnected
  if (doc.connections.size > 0) return;
  
  console.log(`[Document] Unloading document: ${documentId}`);
  
  // Final persistence
  await persistDocument(doc);
  
  // Clean up
  if (doc.permissionUnsubscribe) {
    doc.permissionUnsubscribe();
  }
  doc.ydoc.destroy();
  doc.awareness.destroy();
  documents.delete(documentId);
  unloadTimers.delete(documentId);
}

/**
 * Get document stats for monitoring
 */
export function getDocumentStats(): {
  documentCount: number;
  totalConnections: number;
} {
  let totalConnections = 0;
  for (const doc of documents.values()) {
    totalConnections += doc.connections.size;
  }
  
  return {
    documentCount: documents.size,
    totalConnections,
  };
}
