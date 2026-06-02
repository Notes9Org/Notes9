import { Database } from "@hocuspocus/extension-database";
import * as Y from "yjs";
import { htmlToYDoc, yDocToHtml } from "./html-renderer.js";

/**
 * Get Supabase config from environment variables.
 */
function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required"
    );
  }

  return { url, key };
}

/**
 * Helper to make authenticated requests to the Supabase REST API.
 */
async function supabaseRequest(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Promise<Response> {
  const { url, key } = getSupabaseConfig();
  const { method = "GET", body, headers = {} } = options;

  return fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "resolution=merge-duplicates" : "",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const RETRY_DELAYS_MS = [500, 1000, 2000];

function jitter(ms: number): number {
  // ±20% jitter (0.8–1.2x) to desynchronize retries across clients and avoid
  // a thundering herd hitting Supabase in lockstep after a transient failure.
  return ms * (0.8 + Math.random() * 0.4);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  op: "fetch" | "store",
  documentId: string,
  fn: () => Promise<T>
): Promise<T> {
  let lastError: Error = new Error("withRetry failed before first attempt");
  for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // Normalize to an Error so .message/.stack are always safe to access,
      // even when a non-Error value (string, null, etc.) is thrown.
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt <= RETRY_DELAYS_MS.length) {
        const delay = jitter(RETRY_DELAYS_MS[attempt - 1]);
        console.warn(
          JSON.stringify({
            event: "hocuspocus_db_retry",
            op,
            documentId,
            attempt,
            error: lastError.message,
            stack: lastError.stack,
            timestamp: new Date().toISOString(),
          })
        );
        await sleep(delay);
      }
    }
  }
  console.error(
    JSON.stringify({
      event: "hocuspocus_db_retry",
      op,
      documentId,
      attempt: RETRY_DELAYS_MS.length + 1,
      final: true,
      error: lastError.message,
      stack: lastError.stack,
      timestamp: new Date().toISOString(),
    })
  );
  throw lastError;
}

/**
 * Creates and returns a configured Hocuspocus Database extension instance.
 *
 * - `fetch`: Loads HTML from `papers.content` and converts to Yjs state on first connection.
 * - `store`: Renders Yjs doc to HTML and saves back to `papers.content`.
 *
 * Note: We intentionally do NOT persist to the paper_yjs_documents table.
 * Supabase's PostgREST REST API cannot round-trip the binary (bytea) Yjs state
 * cleanly, so HTML in papers.content is the durable persistence layer and the
 * Yjs state lives in memory only while the server is running. This is a
 * deliberate design decision, not a temporary workaround; revisit only if we
 * move Yjs persistence off the REST API (e.g. to a direct Postgres connection).
 */
export function createDatabaseExtension(): Database {
  return new Database({
    async fetch({ documentName }) {
      const paperId = documentName;

      return withRetry("fetch", paperId, async () => {
        // Load HTML content from papers table
        const paperResponse = await supabaseRequest(
          `papers?id=eq.${paperId}&select=content`,
          { headers: { Accept: "application/json" } }
        );

        const paperRows = (await paperResponse.json()) as Array<{ content: string | null }>;

        if (paperRows.length > 0 && paperRows[0].content) {
          const html = paperRows[0].content;
          const ydoc = htmlToYDoc(html);
          const state = Y.encodeStateAsUpdate(ydoc);
          ydoc.destroy();
          return state;
        }

        // No content found — return null (Hocuspocus creates empty doc)
        return null;
      });
    },

    async store({ documentName, state }) {
      const paperId = documentName;

      await withRetry("store", paperId, async () => {
        // Render Yjs doc to HTML and save to papers.content
        const ydoc = new Y.Doc();
        Y.applyUpdate(ydoc, state);
        const html = yDocToHtml(ydoc);
        ydoc.destroy();

        if (html) {
          await supabaseRequest(`papers?id=eq.${paperId}`, {
            method: "PATCH",
            body: {
              content: html,
              updated_at: new Date().toISOString(),
            },
          });
        }
      });
    },
  });
}
