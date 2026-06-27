/**
 * Page layout — the Word-like "Page view" configuration for the TipTap editor:
 * margins, orientation, header/footer text + alignment, and page-number
 * placement. This is the single source of truth shared by:
 *   - the editor (local state ⇄ persisted layout),
 *   - cloud persistence (stored as a JSONB blob per host, e.g. lab_notes.metadata),
 *   - the exporters (PDF / Print / HTML / DOCX) so a document prints the way it
 *     looks on screen.
 *
 * Margins are kept in CSS px at 96dpi (matching the on-screen page geometry).
 */

export type PageOrientation = "portrait" | "landscape"
export type TextAlign = "left" | "center" | "right"
export type PageNumberPlacement = "header" | "footer" | "none"

export type PageMargins = {
  top: number
  right: number
  bottom: number
  left: number
}

export type HeaderFooterSpec = {
  text: string
  align: TextAlign
}

export type PageLayout = {
  orientation: PageOrientation
  /** Word-like paginated "Page view" is on. */
  pageView: boolean
  /** Rulers are shown in Page view. */
  rulers: boolean
  margins: PageMargins
  header: HeaderFooterSpec
  footer: HeaderFooterSpec
  /** Where the auto page number is rendered (or "none"). */
  pageNumbers: PageNumberPlacement
}

/** Default US-Letter, 1-inch margins, Page view on. */
export const DEFAULT_PAGE_LAYOUT: PageLayout = {
  orientation: "portrait",
  pageView: true,
  rulers: true,
  margins: { top: 96, right: 96, bottom: 96, left: 96 },
  header: { text: "", align: "left" },
  footer: { text: "", align: "center" },
  pageNumbers: "footer",
}

const DPI = 96
const MM_PER_INCH = 25.4

export function pxToMm(px: number): number {
  return (px / DPI) * MM_PER_INCH
}

export type MarginsMm = { top: number; right: number; bottom: number; left: number }

export function marginsPxToMm(m: PageMargins): MarginsMm {
  return {
    top: pxToMm(m.top),
    right: pxToMm(m.right),
    bottom: pxToMm(m.bottom),
    left: pxToMm(m.left),
  }
}

// ── Persistence: tolerant parse + normalize ────────────────────────────────
// Layout is stored as plain JSON in a JSONB column. Parsing is defensive so an
// older/partial/garbage blob can never break the editor — anything missing or
// malformed falls back to the default.

function clampMargin(n: unknown, fallback: number): number {
  const v = typeof n === "number" && isFinite(n) ? n : fallback
  // Keep margins in a sane on-screen range (0.1in .. 3in).
  return Math.min(288, Math.max(9.6, v))
}

function asAlign(v: unknown, fallback: TextAlign): TextAlign {
  return v === "left" || v === "center" || v === "right" ? v : fallback
}

/** Parse a persisted layout blob (object or JSON string) into a full PageLayout. */
export function normalizePageLayout(raw: unknown): PageLayout {
  let obj: Record<string, unknown> = {}
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return { ...DEFAULT_PAGE_LAYOUT }
    }
  } else if (raw && typeof raw === "object") {
    obj = raw as Record<string, unknown>
  } else {
    return { ...DEFAULT_PAGE_LAYOUT }
  }

  const d = DEFAULT_PAGE_LAYOUT
  const m = (obj.margins ?? {}) as Record<string, unknown>
  const header = (obj.header ?? {}) as Record<string, unknown>
  const footer = (obj.footer ?? {}) as Record<string, unknown>

  return {
    orientation: obj.orientation === "landscape" ? "landscape" : "portrait",
    pageView: typeof obj.pageView === "boolean" ? obj.pageView : d.pageView,
    rulers: typeof obj.rulers === "boolean" ? obj.rulers : d.rulers,
    margins: {
      top: clampMargin(m.top, d.margins.top),
      right: clampMargin(m.right, d.margins.right),
      bottom: clampMargin(m.bottom, d.margins.bottom),
      left: clampMargin(m.left, d.margins.left),
    },
    header: {
      text: typeof header.text === "string" ? header.text : d.header.text,
      align: asAlign(header.align, d.header.align),
    },
    footer: {
      text: typeof footer.text === "string" ? footer.text : d.footer.text,
      align: asAlign(footer.align, d.footer.align),
    },
    pageNumbers:
      obj.pageNumbers === "header" || obj.pageNumbers === "footer" || obj.pageNumbers === "none"
        ? obj.pageNumbers
        : d.pageNumbers,
  }
}

/** True when two layouts are functionally identical (avoids redundant saves). */
export function pageLayoutsEqual(a: PageLayout, b: PageLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// ── Embedded persistence marker ────────────────────────────────────────────
// The layout rides along inside the document's saved HTML as a single hidden,
// empty <div data-n9-layout="…base64 json…">. This persists to the cloud through
// every host's existing `content` save with no schema change. The marker is
// always stripped before the HTML enters the editor and re-appended on the way
// out, so it never becomes part of the actual document.

const LAYOUT_MARKER_RE = /<div[^>]*\sdata-n9-layout="([^"]*)"[^>]*><\/div>/i

function encodeLayout(json: string): string {
  try {
    if (typeof btoa !== "undefined") return btoa(unescape(encodeURIComponent(json)))
    return Buffer.from(json, "utf-8").toString("base64")
  } catch {
    return ""
  }
}

function decodeLayout(b64: string): string {
  try {
    if (typeof atob !== "undefined") return decodeURIComponent(escape(atob(b64)))
    return Buffer.from(b64, "base64").toString("utf-8")
  } catch {
    return ""
  }
}

/** The hidden marker element for a layout (empty string if encoding fails). */
export function serializeLayoutMarker(layout: PageLayout): string {
  const encoded = encodeLayout(JSON.stringify(layout))
  return encoded ? `<div data-n9-layout="${encoded}" style="display:none" aria-hidden="true"></div>` : ""
}

/** Pull the layout out of saved HTML and return the cleaned HTML (marker removed). */
export function extractLayoutMarker(html: string): { layout: PageLayout | null; html: string } {
  if (!html) return { layout: null, html: html ?? "" }
  const m = html.match(LAYOUT_MARKER_RE)
  if (!m) return { layout: null, html }
  const cleaned = html.replace(LAYOUT_MARKER_RE, "")
  const json = decodeLayout(m[1])
  let layout: PageLayout | null = null
  if (json) {
    try {
      layout = normalizePageLayout(JSON.parse(json))
    } catch {
      layout = null
    }
  }
  return { layout, html: cleaned }
}

/** Append the current layout marker to HTML (removing any existing one first). */
export function appendLayoutMarker(html: string, layout: PageLayout): string {
  const clean = (html ?? "").replace(LAYOUT_MARKER_RE, "")
  return clean + serializeLayoutMarker(layout)
}

/** Strip any layout marker from HTML (for exports / previews). */
export function stripLayoutMarker(html: string): string {
  return (html ?? "").replace(LAYOUT_MARKER_RE, "")
}

// ── Export helpers ─────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Build the `[data-type="docHeader"]` / `[data-type="docFooter"]` elements the
 * exporters consume (print's `splitHeaderFooter`, the DOCX header/footer parser).
 * Injecting these into the export body means a header/footer that lives only in
 * editor state still shows up — repeated on every page — in the output. Text
 * only: live page numbers are added per-format (CSS counters for print, fields
 * for DOCX), driven separately by `layout.pageNumbers`.
 */
export function buildExportHeaderFooterHtml(layout: PageLayout): { header: string; footer: string } {
  const make = (spec: HeaderFooterSpec, type: "docHeader" | "docFooter"): string => {
    if (spec.text.trim().length === 0) return ""
    return `<div data-type="${type}" style="text-align:${spec.align}">${escapeHtml(spec.text)}</div>`
  }
  return {
    header: make(layout.header, "docHeader"),
    footer: make(layout.footer, "docFooter"),
  }
}

/**
 * Prepend/append the layout's header/footer elements to a content HTML body so
 * the exporters pick them up. Existing `[data-type="docHeader"]`/`docFooter` in
 * the body (if any) are left as-is and take precedence.
 */
export function injectHeaderFooterForExport(bodyHtml: string, layout: PageLayout): string {
  if (/data-type=["']doc(Header|Footer)["']/.test(bodyHtml)) return bodyHtml
  const { header, footer } = buildExportHeaderFooterHtml(layout)
  return `${header}${bodyHtml}${footer}`
}
