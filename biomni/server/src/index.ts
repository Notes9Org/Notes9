import 'dotenv/config';
import { validateConfig, serverConfig } from './config.js';
import { createBiomniServer } from './http/server.js';
import { evictStale } from './agent/task-store.js';

validateConfig();

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
║  LLM source:  ${serverConfig.llmSource.padEnd(52)}║
║  Gemini:      ${serverConfig.geminiReasoningModel.padEnd(52)}║
╚══════════════════════════════════════════════════════════════╝
  `);
});

setInterval(() => {
  const evicted = evictStale();
  if (evicted > 0) {
    console.log(`[TaskStore] Evicted ${evicted} stale task(s)`);
  }
}, 1000 * 60 * 60);

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

process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason);
});
