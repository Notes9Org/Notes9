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

/**
 * Creates and returns a configured Hocuspocus Database extension instance.
 *
 * Uses the Supabase REST API (PostgREST) instead of a direct PostgreSQL connection.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.
 *
 * - `fetch`: Loads Yjs binary state from `paper_yjs_documents` by paper ID.
 *   If no Yjs state exists but `papers.content` has HTML, converts it to Yjs
 *   state (first-time migration).
 * - `store`: Upserts Yjs binary state into `paper_yjs_documents`, renders the
 *   Yjs document to HTML, and updates `papers.content` and `papers.updated_at`.
 */
export function createDatabaseExtension(): Database {
  return new Database({
    async fetch() {
      // Database persistence disabled temporarily — return null to use in-memory only
      return null;
    },

    async store() {
      // Database persistence disabled temporarily — edits stay in memory only
    },
  });
}
