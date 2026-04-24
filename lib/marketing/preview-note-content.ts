/**
 * Lab notes in the marketing preview are stored as HTML (TipTap), same as the app.
 * Helpers for length checks, AI excerpts, and migration from pre-HTML session strings.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Visible/plain length for tour steps and AI (strips tags). */
export function previewNotePlainTextLength(s: string): number {
  if (!s) return 0
  return stripNoteHtmlToPlain(s).length
}

export function stripNoteHtmlToPlain(s: string): string {
  const t = s.trim()
  if (!t) return ""
  if (!t.includes("<")) return t
  return t
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Heuristic: user applied rich structure (tour + feature parity with formatted notes). */
export function hasFormattedRichText(html: string): boolean {
  const t = html.trim()
  if (!t) return false
  if (/<(strong|b|em|i|u|s|code|pre|h[1-6]|ul|ol|li|blockquote|table|th|td)/i.test(t)) {
    return true
  }
  if (/font-weight:\s*(bold|600|700)/i.test(t)) return true
  return false
}

/** If session storage still has plain text from an older preview, convert to a minimal HTML doc. */
export function coerceLegacyNoteBodyToHtml(raw: string): string {
  const s = raw ?? ""
  if (!s.trim()) return ""
  if (/^\s*</.test(s) && /<(p|div|ul|ol|h[1-6]|strong|em|br|span)\b/i.test(s)) {
    return s
  }
  return `<p>${escapeHtml(s).replace(/\r\n/g, "\n").replace(/\n/g, "<br>")}</p>`
}
