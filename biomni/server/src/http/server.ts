/**
 * Biomni HTTP Server
 *
 * A lightweight Node.js HTTP server (no Express/Fastify).
 * Routes inbound requests to the agent and task routers.
 *
 * Port 3002 (avoids collision with Next.js :3000 and collab server :3001).
 */

import { createServer } from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import { serverConfig } from '../config.js';
import { sendJson, sendError } from './utils.js';
import {
  handleAgentRun,
  handleAgentRunSync,
  handleAgentCancel,
} from '../routers/agent.js';
import { handleGetTask, handleListTasks } from '../routers/tasks.js';
import { getStoreStats } from '../agent/task-store.js';
import { checkBiomniReady } from '../agent/factory.js';

// ---------------------------------------------------------------------------
// Health state (lazily populated)
// ---------------------------------------------------------------------------

let biomniReady: boolean | null = null;

async function getBiomniReady(): Promise<boolean> {
  if (biomniReady === null) {
    biomniReady = await checkBiomniReady();
  }
  return biomniReady;
}

// Re-check every 60s so the health endpoint stays fresh
setInterval(async () => {
  biomniReady = await checkBiomniReady();
}, 60_000);

// ---------------------------------------------------------------------------
// Request dispatcher
// ---------------------------------------------------------------------------

function setCorsHeaders(res: ServerResponse, origin: string | undefined): void {
  const allowed = serverConfig.allowedOrigins;
  const allow =
    allowed.includes('*') || (origin && allowed.includes(origin)) ? origin ?? '*' : '';

  res.setHeader('Access-Control-Allow-Origin', allow || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const origin = req.headers['origin'];
  setCorsHeaders(res, origin);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  // ── GET /health ──────────────────────────────────────────────────────────
  if (method === 'GET' && url === '/health') {
    const ready = await getBiomniReady();
    const stats = getStoreStats();
    sendJson(res, ready ? 200 : 503, {
      status: ready ? 'healthy' : 'degraded',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      biomni_ready: ready,
      ...stats,
    });
    return;
  }

  // ── POST /agent/run/sync ─────────────────────────────────────────────────
  if (method === 'POST' && url === '/agent/run/sync') {
    await handleAgentRunSync(req, res);
    return;
  }

  // ── POST /agent/run ──────────────────────────────────────────────────────
  if (method === 'POST' && url === '/agent/run') {
    await handleAgentRun(req, res);
    return;
  }

  // ── DELETE /agent/:taskId/cancel ─────────────────────────────────────────
  const cancelMatch = url.match(/^\/agent\/([^/]+)\/cancel$/);
  if (method === 'DELETE' && cancelMatch) {
    handleAgentCancel(req, res, cancelMatch[1]!);
    return;
  }

  // ── GET /tasks ───────────────────────────────────────────────────────────
  if (method === 'GET' && url === '/tasks') {
    handleListTasks(req, res);
    return;
  }

  // ── GET /tasks/:taskId ───────────────────────────────────────────────────
  const taskMatch = url.match(/^\/tasks\/([^/]+)$/);
  if (method === 'GET' && taskMatch) {
    handleGetTask(req, res, taskMatch[1]!);
    return;
  }

  // ── 404 ──────────────────────────────────────────────────────────────────
  sendError(res, 404, `Cannot ${method} ${url}`);
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export function createBiomniServer() {
  const server = createServer((req, res) => {
    dispatch(req, res).catch((err: unknown) => {
      console.error('[Server] Unhandled error in request handler:', err);
      if (!res.headersSent) {
        sendError(res, 500, 'Internal server error');
      }
    });
  });

  return server;
}

export { serverConfig };
