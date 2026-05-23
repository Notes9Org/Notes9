import { Database } from "@hocuspocus/extension-database";
import pg from "pg";
import * as Y from "yjs";
import { htmlToYDoc, yDocToHtml } from "./html-renderer.js";

const { Pool } = pg;

/**
 * PostgreSQL connection pool, initialized lazily from DATABASE_URL.
 */
let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not configured");
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

/**
 * Creates and returns a configured Hocuspocus Database extension instance.
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
      const db = getPool();
      const paperId = documentName;

      // Try to load existing Yjs state
      const result = await db.query<{ yjs_state: Buffer }>(
        "SELECT yjs_state FROM paper_yjs_documents WHERE paper_id = $1",
        [paperId]
      );

      if (result.rows.length > 0) {
        const buffer = result.rows[0].yjs_state;
        return new Uint8Array(buffer);
      }

      // No Yjs state found — check if there's HTML content to migrate
      const paperResult = await db.query<{ content: string | null }>(
        "SELECT content FROM papers WHERE id = $1",
        [paperId]
      );

      if (paperResult.rows.length > 0 && paperResult.rows[0].content) {
        const html = paperResult.rows[0].content;
        const ydoc = htmlToYDoc(html);
        const state = Y.encodeStateAsUpdate(ydoc);
        ydoc.destroy();

        // Persist the migrated state so future loads are fast
        await db.query(
          `INSERT INTO paper_yjs_documents (paper_id, yjs_state)
           VALUES ($1, $2)
           ON CONFLICT (paper_id) DO UPDATE SET yjs_state = $2, updated_at = NOW()`,
          [paperId, Buffer.from(state)]
        );

        return state;
      }

      // No existing content at all — return null (Hocuspocus creates empty doc)
      return null;
    },

    async store({ documentName, state }) {
      const db = getPool();
      const paperId = documentName;

      // Upsert Yjs binary state
      await db.query(
        `INSERT INTO paper_yjs_documents (paper_id, yjs_state)
         VALUES ($1, $2)
         ON CONFLICT (paper_id) DO UPDATE SET yjs_state = $2, updated_at = NOW()`,
        [paperId, Buffer.from(state)]
      );

      // Render Yjs doc to HTML and update papers.content
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, state);
      const html = yDocToHtml(ydoc);
      ydoc.destroy();

      await db.query(
        "UPDATE papers SET content = $1, updated_at = NOW() WHERE id = $2",
        [html, paperId]
      );
    },
  });
}
