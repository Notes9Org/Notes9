import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { serverConfig } from '../config.js';
import { sendJson, sendError } from './utils.js';
import { handleAgentRun, handleAgentRunSync, handleAgentCancel } from '../routers/agent.js';
import { handleGetTask, handleListTasks } from '../routers/tasks.js';
import { getStoreStats } from '../agent/task-store.js';
import { checkBiomniReady } from '../agent/factory.js';

let biomniReady: boolean | null = null;

async function getBiomniReady(): Promise<boolean> {
  if (biomniReady === null) {
    biomniReady = await checkBiomniReady();
  }
  return biomniReady;
}

setInterval(async () => {
  biomniReady = await checkBiomniReady();
}, 60_000);

function setCorsHeaders(res: ServerResponse, origin?: string): void {
  const allowed = serverConfig.allowedOrigins;
  if (allowed.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const origin = req.headers.origin;
  setCorsHeaders(res, origin);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

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

  if (method === 'POST' && url === '/agent/run/sync') {
    await handleAgentRunSync(req, res);
    return;
  }

  if (method === 'POST' && url === '/agent/run') {
    await handleAgentRun(req, res);
    return;
  }

  const cancelMatch = url.match(/^\/agent\/([^/]+)\/cancel$/);
  if (method === 'DELETE' && cancelMatch) {
    handleAgentCancel(req, res, cancelMatch[1]);
    return;
  }

  if (method === 'GET' && url === '/tasks') {
    handleListTasks(req, res);
    return;
  }

  const taskMatch = url.match(/^\/tasks\/([^/]+)$/);
  if (method === 'GET' && taskMatch) {
    handleGetTask(req, res, taskMatch[1]);
    return;
  }

  sendError(res, 404, `Cannot ${method} ${url}`);
}

export function createBiomniServer() {
  return createServer((req, res) => {
    dispatch(req, res).catch((error) => {
      console.error('[Server] Unhandled error in request handler:', error);
      if (!res.headersSent) {
        sendError(res, 500, 'Internal server error');
      }
    });
  });
}

export { serverConfig };
