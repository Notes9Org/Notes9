/**
 * WebSocket Server
 * 
 * Handles WebSocket connections for real-time collaboration.
 * Protocol:
 * 1. Client connects
 * 2. Client sends auth message with JWT + documentId
 * 3. Server validates and sends document state
 * 4. Bi-directional sync begins
 * 5. Server monitors for permission revocations
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { validateToken, getUserInfo } from '../auth/jwt.js';
import { checkPermission } from '../permissions/store.js';
import { 
  connectToDocument, 
  disconnectFromDocument, 
  applyUpdate, 
  updateAwareness,
  getDocumentState,
  getDocument,
  ManagedDocument 
} from '../documents/manager.js';
import type { 
  WebSocketMessage,
  AuthMessagePayload,
  CollabError,
  CollabErrorCode,
  User
} from '../shared/types/index.js';

interface AuthenticatedSocket extends WebSocket {
  isAuthenticated: boolean;
  user?: User;
  documentId?: string;
  pingTimeout?: NodeJS.Timeout;
}

// Track authenticated connections per user for rate limiting
const connectionsByUser = new Map<string, Set<AuthenticatedSocket>>();

export function createWebSocketServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/collab',
    // Require clients to authenticate within 10 seconds
    clientTracking: true,
  });

  wss.on('connection', (socket: AuthenticatedSocket) => {
    console.log('[WebSocket] New connection');
    
    socket.isAuthenticated = false;
    
    // Set up authentication timeout
    const authTimeout = setTimeout(() => {
      if (!socket.isAuthenticated) {
        console.log('[WebSocket] Auth timeout, closing connection');
        socket.close(4401, 'Authentication timeout');
      }
    }, 10000);
    
    // Set up ping/pong for connection health
    setupHeartbeat(socket);
    
    socket.on('message', async (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        await handleMessage(socket, message, authTimeout);
      } catch (err) {
        console.error('[WebSocket] Error handling message:', err);
        sendError(socket, 'SERVER_ERROR', 'Failed to process message');
      }
    });
    
    socket.on('close', () => {
      clearTimeout(authTimeout);
      handleDisconnect(socket);
    });
    
    socket.on('error', (err) => {
      console.error('[WebSocket] Socket error:', err);
    });
  });

  wss.on('error', (err) => {
    console.error('[WebSocket] Server error:', err);
  });

  return wss;
}

/**
 * Handle incoming WebSocket message
 */
async function handleMessage(
  socket: AuthenticatedSocket,
  message: WebSocketMessage,
  authTimeout: NodeJS.Timeout
): Promise<void> {
  // Handle authentication
  if (message.type === 'auth') {
    await handleAuth(socket, message.payload as AuthMessagePayload, authTimeout);
    return;
  }
  
  // All other messages require authentication
  if (!socket.isAuthenticated) {
    sendError(socket, 'UNAUTHORIZED', 'Not authenticated');
    return;
  }
  
  switch (message.type) {
    case 'sync':
      await handleSync(socket, message.payload as { update: number[] });
      break;
      
    case 'awareness':
      await handleAwareness(socket, message.payload as { update: number[] });
      break;
      
    default:
      sendError(socket, 'SERVER_ERROR', `Unknown message type: ${message.type}`);
  }
}

/**
 * Handle authentication message
 */
async function handleAuth(
  socket: AuthenticatedSocket,
  payload: AuthMessagePayload,
  authTimeout: NodeJS.Timeout
): Promise<void> {
  if (!payload?.token || !payload?.documentId) {
    sendError(socket, 'INVALID_TOKEN', 'Missing token or documentId');
    socket.close(4401, 'Invalid auth payload');
    return;
  }
  
  // Validate JWT
  const validation = await validateToken(payload.token);
  if (!validation.valid || !validation.user) {
    sendError(socket, validation.error?.code || 'INVALID_TOKEN', 
              validation.error?.message || 'Invalid token');
    socket.close(4401, 'Authentication failed');
    return;
  }
  
  const user = validation.user;
  
  // Check rate limiting (max connections per user)
  const userConnections = connectionsByUser.get(user.id) || new Set();
  if (userConnections.size >= 10) { // Max 10 concurrent connections
    sendError(socket, 'RATE_LIMITED', 'Too many concurrent connections');
    socket.close(4408, 'Rate limited');
    return;
  }
  
  // Check permission to access document
  const permissionCheck = await checkPermission(payload.documentId, user.id);
  if (!permissionCheck.canRead) {
    sendError(socket, 'FORBIDDEN', 'Access denied to document');
    socket.close(4403, 'Access denied');
    return;
  }
  
  // Authentication successful
  clearTimeout(authTimeout);
  socket.isAuthenticated = true;
  socket.user = user;
  socket.documentId = payload.documentId;
  
  // Track connection
  userConnections.add(socket);
  connectionsByUser.set(user.id, userConnections);
  
  try {
    // Connect to document
    const { doc, permissionLevel } = await connectToDocument(socket, payload.documentId, user);
    
    // Send auth success with initial state
    const initialState = getDocumentState(doc);
    socket.send(JSON.stringify({
      type: 'auth_success',
      payload: {
        documentId: payload.documentId,
        permissionLevel,
        user: getUserInfo(user),
        initialState: Array.from(initialState),
      },
      timestamp: Date.now(),
    }));
    
    console.log(`[WebSocket] User ${user.id} authenticated for document ${payload.documentId}`);
  } catch (err) {
    console.error('[WebSocket] Error connecting to document:', err);
    sendError(socket, 'SERVER_ERROR', 'Failed to load document');
    socket.close(4401, 'Document load failed');
  }
}

/**
 * Handle sync update from client
 */
async function handleSync(
  socket: AuthenticatedSocket,
  payload: { update: number[] }
): Promise<void> {
  if (!socket.documentId || !socket.user) {
    sendError(socket, 'SERVER_ERROR', 'Invalid connection state');
    return;
  }
  
  if (!payload?.update || !Array.isArray(payload.update)) {
    sendError(socket, 'SERVER_ERROR', 'Invalid sync payload');
    return;
  }
  
  try {
    const doc = await getDocument(socket.documentId);
    const update = new Uint8Array(payload.update);
    applyUpdate(doc, update, socket);
  } catch (err) {
    if ((err as Error).message?.includes('Permission')) {
      sendError(socket, 'FORBIDDEN', (err as Error).message);
    } else {
      console.error('[WebSocket] Error applying update:', err);
      sendError(socket, 'SERVER_ERROR', 'Failed to apply update');
    }
  }
}

/**
 * Handle awareness update from client
 */
async function handleAwareness(
  socket: AuthenticatedSocket,
  payload: { update: number[] }
): Promise<void> {
  if (!socket.documentId) {
    return;
  }
  
  if (!payload?.update || !Array.isArray(payload.update)) {
    return;
  }
  
  try {
    const doc = await getDocument(socket.documentId);
    const update = new Uint8Array(payload.update);
    updateAwareness(doc, update, socket);
  } catch (err) {
    console.error('[WebSocket] Error handling awareness:', err);
  }
}

/**
 * Handle socket disconnect
 */
function handleDisconnect(socket: AuthenticatedSocket): void {
  console.log('[WebSocket] Connection closed');
  
  // Clear heartbeat
  if (socket.pingTimeout) {
    clearTimeout(socket.pingTimeout);
  }
  
  // Remove from document
  disconnectFromDocument(socket);
  
  // Remove from user connections tracking
  if (socket.user) {
    const userConnections = connectionsByUser.get(socket.user.id);
    if (userConnections) {
      userConnections.delete(socket);
      if (userConnections.size === 0) {
        connectionsByUser.delete(socket.user.id);
      }
    }
  }
}

/**
 * Setup ping/pong heartbeat
 */
function setupHeartbeat(socket: AuthenticatedSocket): void {
  // Expect pong within 30 seconds of ping
  const HEARTBEAT_INTERVAL = 30000;
  
  socket.on('ping', () => {
    socket.pong();
  });
  
  // Server-initiated ping to check client health
  const pingInterval = setInterval(() => {
    if (socket.readyState === 1) { // WebSocket.OPEN
      socket.ping();
      
      // Set timeout for pong response
      socket.pingTimeout = setTimeout(() => {
        console.log('[WebSocket] Pong timeout, terminating connection');
        socket.terminate();
        clearInterval(pingInterval);
      }, 10000);
    } else {
      clearInterval(pingInterval);
    }
  }, HEARTBEAT_INTERVAL);
  
  socket.on('pong', () => {
    if (socket.pingTimeout) {
      clearTimeout(socket.pingTimeout);
    }
  });
  
  socket.on('close', () => {
    clearInterval(pingInterval);
  });
}

/**
 * Send error message to client
 */
function sendError(
  socket: AuthenticatedSocket,
  code: CollabErrorCode,
  message: string
): void {
  if (socket.readyState === 1) { // WebSocket.OPEN
    socket.send(JSON.stringify({
      type: 'error',
      payload: { code, message },
      timestamp: Date.now(),
    }));
  }
}

/**
 * Broadcast message to all connected clients on a document
 */
export function broadcastToDocument(
  documentId: string,
  message: WebSocketMessage
): void {
  // This would be called by document manager for awareness updates
}
