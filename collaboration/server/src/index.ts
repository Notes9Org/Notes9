/**
 * Collaboration Server - Main Entry Point
 * 
 * Stateful WebSocket server for Yjs document collaboration.
 * Deploy this on a VPS (not serverless).
 * 
 * Required environment variables:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - PORT (default: 3001)
 */

import { createServer } from 'http';
import { validateConfig, serverConfig } from './config.js';
import { initAuth } from './auth/jwt.js';
import { initPermissionStore } from './permissions/store.js';
import { initPersistence } from './persistence/postgres.js';
import { createWebSocketServer } from './websocket/server.js';
import { getDocumentStats } from './documents/manager.js';

// Validate configuration before starting
validateConfig();

// Initialize subsystems
initAuth();
initPermissionStore();
initPersistence();

// Create HTTP server for health checks and metrics
const httpServer = createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check endpoint
  if (req.url === '/health') {
    const stats = getDocumentStats();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      documents: stats.documentCount,
      connections: stats.totalConnections,
    }));
    return;
  }

  // Metrics endpoint (basic)
  if (req.url === '/metrics') {
    const stats = getDocumentStats();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      documents_loaded: stats.documentCount,
      active_connections: stats.totalConnections,
      memory_usage: process.memoryUsage(),
    }));
    return;
  }

  // Default response
  res.writeHead(404);
  res.end('Not found');
});

// Create WebSocket server
const wss = createWebSocketServer(httpServer);

// Start server
httpServer.listen(serverConfig.port, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║          Collaborative Editor - WebSocket Server              ║
╠══════════════════════════════════════════════════════════════╣
║  Port:        ${serverConfig.port.toString().padEnd(52)}║
║  Environment: ${serverConfig.nodeEnv.padEnd(52)}║
║  WebSocket:   ws://localhost:${serverConfig.port}/collab${''.padEnd(28)}║
║  Health:      http://localhost:${serverConfig.port}/health${''.padEnd(25)}║
╚══════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown handling
function gracefulShutdown(signal: string): void {
  console.log(`\n[Server] Received ${signal}, starting graceful shutdown...`);
  
  // Stop accepting new connections
  httpServer.close(() => {
    console.log('[Server] HTTP server closed');
  });
  
  // Close all WebSocket connections
  wss.clients.forEach((client) => {
    client.close(1001, 'Server shutting down');
  });
  
  // Give connections 5 seconds to close gracefully
  setTimeout(() => {
    console.log('[Server] Forcing close of remaining connections');
    wss.clients.forEach((client) => {
      client.terminate();
    });
    
    // Exit process
    process.exit(0);
  }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled rejection at:', promise, 'reason:', reason);
});
