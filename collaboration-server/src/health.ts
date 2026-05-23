import type { IncomingMessage, ServerResponse } from "node:http";
import pg from "pg";

const { Pool } = pg;

/**
 * Creates a health check request handler for the Hocuspocus onRequest hook.
 *
 * Responds to HTTP GET /health with:
 * - 200 { status: "ok" } when the server is healthy
 * - 503 { status: "error", message: "..." } when the database is unreachable
 *
 * For non-health-check requests, resolves without writing a response
 * (allowing Hocuspocus default handling to proceed).
 */
export function createHealthCheckHandler() {
  let pool: pg.Pool | null = null;

  function getPool(): pg.Pool | null {
    if (!pool) {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        return null;
      }
      pool = new Pool({ connectionString, max: 2 });
    }
    return pool;
  }

  return async function handleHealthCheck(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const url = request.url ?? "";

    if (url !== "/health" || request.method !== "GET") {
      // Not a health check request — let Hocuspocus handle it
      return;
    }

    // Health check request — verify database connectivity
    try {
      const db = getPool();
      if (db) {
        await db.query("SELECT 1");
      }

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Database unreachable";
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "error", message }));
    }

    // Throw empty error to prevent Hocuspocus default response handler
    throw "";
  };
}
