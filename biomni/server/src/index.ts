/**
 * Biomni Server — Main Entry Point
 *
 * Standalone Node.js HTTP server that bridges the Next.js app to the
 * locally-cloned Biomni Python agent (biomni_e1 conda env).
 *
 * Run alongside the Next.js dev server:
 *   cd biomni/server && pnpm dev   →  http://localhost:3002
 *
 * Required environment variables (see .env.example):
 *   BIOMNI_PYTHON_PATH   — path to conda env Python binary
 *   BIOMNI_DATA_PATH     — path to Biomni data lake (~11GB)
 *   GROQ_API_KEY         — (recommended) or ANTHROPIC_API_KEY
 *
 * Optional:
 *   PORT                 — default 3002
 *   BIOMNI_API_KEY       — bearer token to protect the API
 *   BIOMNI_TIMEOUT_SECONDS
 */

import 'dotenv/config';
import { validateConfig, serverConfig } from './config.js';
import { createBiomniServer } from './http/server.js';
import { evictStale } from './agent/task-store.js';

// Validate config and print warnings
validateConfig();

// Create and start the HTTP server
const server = createBiomniServer();

server.listen(serverConfig.port, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              Biomni Agent — HTTP Gateway Server               ║
╠══════════════════════════════════════════════════════════════╣
║  Port:        ${serverConfig.port.toString().padEnd(52)}║
║  Environment: ${serverConfig.nodeEnv.padEnd(52)}║
║  Agent run:   POST http://localhost:${serverConfig.port}/agent/run${''.padEnd(20)}║
║  Sync run:    POST http://localhost:${serverConfig.port}/agent/run/sync${''.padEnd(15)}║
║  Health:      GET  http://localhost:${serverConfig.port}/health${''.padEnd(22)}║
╠══════════════════════════════════════════════════════════════╣
║  Python:      ${(process.env.BIOMNI_PYTHON_PATH ?? 'python (system)').padEnd(52)}║
║  Data path:   ${serverConfig.biomniDataPath.padEnd(52)}║
║  LLM source:  ${serverConfig.reasoningLlmSource.padEnd(52)}║
╚══════════════════════════════════════════════════════════════╝
  `);
});

// Evict stale completed/failed tasks once per hour
setInterval(() => {
  const evicted = evictStale();
  if (evicted > 0) {
    console.log(`[TaskStore] Evicted ${evicted} stale task(s)`);
  }
}, 1000 * 60 * 60);

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function gracefulShutdown(signal: string): void {
  console.log(`\n[Server] Received ${signal}, shutting down...`);
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason);
});
