import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Creates a health check request handler for the Hocuspocus onRequest hook.
 *
 * Responds to HTTP GET /health with:
 * - 200 { status: "ok" } when the server is healthy and can reach Supabase
 * - 503 { status: "error", message: "..." } when Supabase is unreachable
 *
 * For non-health-check requests, resolves without writing a response
 * (allowing Hocuspocus default handling to proceed).
 */
export function createHealthCheckHandler() {
  return async function handleHealthCheck(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const url = request.url ?? "";

    if (url !== "/health" || request.method !== "GET") {
      // Not a health check request — let Hocuspocus handle it
      return;
    }

    try {
      // Verify Supabase connectivity by hitting the REST API
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && supabaseKey) {
        const res = await fetch(`${supabaseUrl}/rest/v1/`, {
          method: "HEAD",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
        });
        if (!res.ok && res.status !== 404) {
          throw new Error(`Supabase returned ${res.status}`);
        }
      }

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Supabase unreachable";
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "error", message }));
    }

    // Throw a FALSY value to suppress the Hocuspocus default response handler.
    // Hocuspocus's requestHandler only re-throws truthy errors (`if (error) throw error`);
    // a falsy throw signals "handled, stop processing" without surfacing an error.
    // This must stay falsy — throwing a real Error here would be re-thrown by
    // Hocuspocus and crash the request handler. The 200/503 response has already
    // been written above, so there is nothing left to report to error trackers.
    // eslint-disable-next-line no-throw-literal
    throw "";
  };
}
