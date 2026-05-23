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
    async fetch({ documentName }) {
      const paperId = documentName;

      // Try to load existing Yjs state
      const yjsResponse = await supabaseRequest(
        `paper_yjs_documents?paper_id=eq.${paperId}&select=yjs_state`,
        { headers: { Accept: "application/json" } }
      );

      const yjsRows = (await yjsResponse.json()) as Array<{ yjs_state: string | null }>;

      if (yjsRows.length > 0 && yjsRows[0].yjs_state) {
        // yjs_state is stored as base64 in the REST API response (bytea → base64)
        const base64 = yjsRows[0].yjs_state;
        const binary = Buffer.from(base64, "base64");
        return new Uint8Array(binary);
      }

      // No Yjs state found — check if there's HTML content to migrate
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

        // Persist the migrated state (upsert)
        await supabaseRequest("paper_yjs_documents", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates" },
          body: {
            paper_id: paperId,
            yjs_state: `\\x${Buffer.from(state).toString("hex")}`,
          },
        });

        return state;
      }

      // No existing content at all — return null (Hocuspocus creates empty doc)
      return null;
    },

    async store({ documentName, state }) {
      const paperId = documentName;

      // Upsert Yjs binary state (send as hex-encoded bytea)
      await supabaseRequest("paper_yjs_documents", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: {
          paper_id: paperId,
          yjs_state: `\\x${Buffer.from(state).toString("hex")}`,
          updated_at: new Date().toISOString(),
        },
      });

      // Render Yjs doc to HTML and update papers.content
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, state);
      const html = yDocToHtml(ydoc);
      ydoc.destroy();

      await supabaseRequest(`papers?id=eq.${paperId}`, {
        method: "PATCH",
        body: {
          content: html,
          updated_at: new Date().toISOString(),
        },
      });
    },
  });
}
