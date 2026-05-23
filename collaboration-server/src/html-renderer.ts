import * as Y from "yjs";
import { generateHTML, generateJSON } from "@tiptap/html";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  prosemirrorJSONToYDoc,
  yDocToProsemirrorJSON,
} from "y-prosemirror";

/**
 * The TipTap extensions used for server-side HTML rendering.
 * This should mirror the core structural extensions used on the client side.
 * We use StarterKit which includes: Document, Paragraph, Text, Heading,
 * Bold, Italic, Strike, Code, CodeBlock, Blockquote, BulletList,
 * OrderedList, ListItem, HardBreak, HorizontalRule.
 */
const extensions = [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3],
    },
  }),
];

/**
 * The ProseMirror schema derived from the configured extensions.
 * Used by y-prosemirror to convert between ProseMirror JSON and Yjs documents.
 */
const schema = getSchema(extensions);

/**
 * The fragment name used by TipTap's Collaboration extension.
 * This must match the `field` option in `Collaboration.configure({ field: 'default' })`.
 */
const FRAGMENT_NAME = "default";

/**
 * Converts HTML content into a Yjs document using the TipTap schema.
 * Used for first-time migration of existing papers to collaborative editing.
 *
 * @param html - The HTML string to convert
 * @returns A new Y.Doc with the content stored in the 'default' XML fragment
 */
export function htmlToYDoc(html: string): Y.Doc {
  if (!html || html.trim() === "") {
    // Return an empty doc with a minimal document structure
    const emptyJson = {
      type: "doc",
      content: [{ type: "paragraph" }],
    };
    return prosemirrorJSONToYDoc(schema, emptyJson, FRAGMENT_NAME);
  }

  // Parse HTML into ProseMirror JSON using the server-side compatible @tiptap/html
  const json = generateJSON(html, extensions);

  // Convert ProseMirror JSON to a Y.Doc with the content in the 'default' fragment
  return prosemirrorJSONToYDoc(schema, json, FRAGMENT_NAME);
}

/**
 * Renders a Yjs document to HTML using the TipTap schema.
 * Used to keep papers.content in sync for non-collaborative features.
 *
 * @param ydoc - The Yjs document to render
 * @returns The HTML string representation of the document content
 */
export function yDocToHtml(ydoc: Y.Doc): string {
  // Convert Y.Doc to ProseMirror JSON (reads from the 'default' fragment)
  const json = yDocToProsemirrorJSON(ydoc, FRAGMENT_NAME);

  // If the document is empty or has no content, return empty string
  if (!json || !json.content || json.content.length === 0) {
    return "";
  }

  // Generate HTML from ProseMirror JSON using the server-side compatible @tiptap/html
  return generateHTML(json, extensions);
}
