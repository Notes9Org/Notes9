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
 * - `fetch`: Loads HTML from `papers.content` and converts to Yjs state on first connection.
 * - `store`: Renders Yjs doc to HTML and saves back to `papers.content`.
 *
 * Note: We skip the paper_yjs_documents table for now (bytea encoding issues with REST API).
 * The Yjs state lives in memory while the server is running. HTML is the persistence layer.
 */
export function createDatabaseExtension(): Database {
  return new Database({
    async fetch({ documentName }) {
      const paperId = documentName;

      try {
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
      } catch (error) {
        console.error("[fetch] Error loading document:", error);
      }

      // No content found — return null (Hocuspocus creates empty doc)
      return null;
    },

    async store({ documentName, state }) {
      const paperId = documentName;

      try {
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
      } catch (error) {
        console.error("[store] Error saving document:", error);
      }
    },
  });
}
