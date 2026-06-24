import { marked } from 'marked';

/** GFM markdown → HTML (same parser as reports / rich paste).
 * `breaks` (default false) maps single newlines to <br>; the chat renderer opts
 * in so each line break shows as its own spaced line. Other callers (editor,
 * reports, paste import) keep the stricter default. */
export function markdownToHtml(markdown: string, opts?: { breaks?: boolean }): string {
  const trimmed = markdown.trim();
  if (!trimmed) return '';

  const html = marked.parse(trimmed, {
    async: false,
    gfm: true,
    breaks: opts?.breaks ?? false,
  }) as string;
  return wrapTablesForScroll(html);
}

function wrapTablesForScroll(html: string): string {
  return html.replace(
    /<table\b[\s\S]*?<\/table>/gi,
    (table) =>
      '<div class="notes9-md-table-scroll not-prose my-3 w-full min-w-0 max-h-[60vh] overflow-x-auto">' +
      table +
      '</div>'
  );
}
