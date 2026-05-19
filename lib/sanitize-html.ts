// Plain `dompurify` runs in the browser only. All callers of `sanitizeHtml`
// in this codebase are client components (TipTap previews, protocol design
// mode, PDF annotation sidebar). Avoid `isomorphic-dompurify` here — it pulls
// in `jsdom` → `undici` → `node:worker_threads`, which breaks Turbopack's
// NFT tracer during `next build`. The API route imports only `escapeHtml`,
// which is a pure string-replace function and doesn't touch DOMPurify.
import DOMPurify from "dompurify"

/**
 * Allow-list-based HTML sanitizer for user-authored content rendered via
 * `dangerouslySetInnerHTML`. Built on top of DOMPurify with a Tiptap-friendly
 * profile: keeps tables, code blocks, math (KaTeX-rendered span/svg), and
 * inline formatting; strips <script>, event handlers, javascript: URLs, and
 * dangerous CSS.
 */
const ALLOWED_TAGS = [
  "a", "p", "br", "hr", "span", "div",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "strong", "em", "b", "i", "u", "s", "sub", "sup", "code", "kbd", "mark", "small",
  "blockquote", "pre",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "img", "figure", "figcaption",
  // KaTeX renders math as <span class="katex">…</span> with internal svg/path/annotation nodes
  "svg", "path", "g", "rect", "line", "circle", "ellipse", "polyline", "polygon",
  "math", "annotation", "semantics", "mrow", "mi", "mo", "mn", "msup", "msub", "mfrac", "msqrt", "mroot",
  // Citation anchors with data-* attrs (Tiptap citation extension)
]

const ALLOWED_ATTR = [
  "href", "src", "alt", "title", "target", "rel",
  "class", "id", "style",
  "width", "height", "align",
  "colspan", "rowspan",
  // Tiptap math + citation extensions store payload in data-*
  "data-paper-title", "data-paper-authors", "data-paper-year",
  "data-paper-journal", "data-paper-doi", "data-paper-url",
  "data-citation-id", "data-citation-number",
  "data-katex", "data-latex", "data-math-type",
  // Common chart/embed attrs
  "loading", "decoding", "referrerpolicy",
]

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return ""
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Enforce safe URL schemes for href/src
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|data:image\/(?:png|jpe?g|gif|webp|svg\+xml);|#|\/)/i,
    // Open external links in new tab safely
    ADD_ATTR: ["target", "rel"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "formaction"],
    KEEP_CONTENT: true,
  })
}

/**
 * HTML-escape a plain string for safe interpolation into HTML payloads
 * (e.g. server-built `content` snippets stored in lab notes). Use this any
 * time user-controlled text is concatenated into an HTML string that will
 * later be rendered via `dangerouslySetInnerHTML`.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
