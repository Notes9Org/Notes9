/**
 * Shared typography helpers for lab-note / protocol / report exports.
 * Preserves inline font family, size, color, and spacing from TipTap HTML.
 */

import { DEFAULT_TEXT_STYLE_FONT_STACK } from "@/components/text-editor/font-menu-data"
import { isLightHexColor } from "@/lib/export-code-blocks"

/** Platform default when the editor has no explicit textStyle mark on a run. */
export const EXPORT_DEFAULT_FONT_FAMILY = "Calibri"
export const EXPORT_DEFAULT_FONT_STACK = DEFAULT_TEXT_STYLE_FONT_STACK
/** 16px body text in the editor toolbar default. */
export const EXPORT_DEFAULT_FONT_SIZE_PX = 16

export interface ExportInlineStyle {
  font?: string
  /** DOCX half-points (e.g. 24 = 12pt). */
  size?: number
  color?: string
  bold?: boolean
  italics?: boolean
  underline?: boolean
  strike?: boolean
  subScript?: boolean
  superScript?: boolean
  highlight?: string
  shading?: { fill: string; color: string }
}

export function parseCssFontSizeToHalfPoints(fontSize: string): number | undefined {
  if (!fontSize?.trim()) return undefined
  const s = fontSize.trim().toLowerCase()
  const pxMatch = s.match(/^([\d.]+)px$/)
  if (pxMatch) {
    const px = parseFloat(pxMatch[1])
    if (!Number.isNaN(px)) return Math.max(8, Math.round((px * 72) / 96 * 2))
  }
  const ptMatch = s.match(/^([\d.]+)pt$/)
  if (ptMatch) {
    const pt = parseFloat(ptMatch[1])
    if (!Number.isNaN(pt)) return Math.max(8, Math.round(pt * 2))
  }
  const emMatch = s.match(/^([\d.]+)em$/)
  if (emMatch) {
    const em = parseFloat(emMatch[1])
    if (!Number.isNaN(em)) {
      return Math.max(8, Math.round(EXPORT_DEFAULT_FONT_SIZE_PX * em * 1.5))
    }
  }
  return undefined
}

export function parseCssFontFamily(fontFamily: string): string | undefined {
  if (!fontFamily?.trim()) return undefined
  const first = fontFamily.split(",")[0].replace(/['"]/g, "").trim()
  return first || undefined
}

export function rgbToHex(rgb: string): string {
  if (!rgb) return ""
  if (rgb.startsWith("#")) return rgb
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (match) {
    const r = parseInt(match[1], 10)
    const g = parseInt(match[2], 10)
    const b = parseInt(match[3], 10)
    return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`
  }
  return rgb
}

export function isValidHex(color: string): boolean {
  return /^#([0-9A-F]{3}){1,2}$/i.test(color)
}

/** Parse a CSS style attribute into partial inline style (does not apply tag semantics). */
export function parseStyleAttr(styleAttr: string | null | undefined): Partial<ExportInlineStyle> {
  const out: Partial<ExportInlineStyle> = {}
  if (!styleAttr?.trim()) return out

  for (const decl of styleAttr.split(";")) {
    const trimmed = decl.trim()
    if (!trimmed) continue
    const colon = trimmed.indexOf(":")
    if (colon < 0) continue
    const prop = trimmed.slice(0, colon).trim().toLowerCase()
    const val = trimmed.slice(colon + 1).trim()

    if (prop === "font-family") {
      const font = parseCssFontFamily(val)
      if (font) out.font = font
    } else if (prop === "font-size") {
      const size = parseCssFontSizeToHalfPoints(val)
      if (size) out.size = size
    } else if (prop === "color") {
      const hex = rgbToHex(val)
      if (hex && isValidHex(hex) && !isLightHexColor(hex)) {
        out.color = hex.replace("#", "")
      }
    } else if (prop === "background-color" || prop === "background") {
      const hex = rgbToHex(val)
      if (hex && isValidHex(hex)) {
        const h = hex.replace("#", "")
        out.shading = { fill: h, color: h }
      }
    } else if (prop === "font-weight" && (val === "bold" || parseInt(val, 10) >= 600)) {
      out.bold = true
    } else if (prop === "font-style" && val === "italic") {
      out.italics = true
    } else if (prop === "text-decoration") {
      if (val.includes("underline")) out.underline = true
      if (val.includes("line-through")) out.strike = true
    }
  }

  return out
}

export function mergeExportInlineStyles(
  base: ExportInlineStyle,
  patch: Partial<ExportInlineStyle>
): ExportInlineStyle {
  return {
    ...base,
    ...patch,
    shading: patch.shading ?? base.shading,
  }
}

export function stylesFromElement(el: Element, inherited: ExportInlineStyle): ExportInlineStyle {
  let next = mergeExportInlineStyles(inherited, parseStyleAttr((el as HTMLElement).getAttribute("style")))

  const tag = el.tagName.toLowerCase()
  if (tag === "strong" || tag === "b") next = mergeExportInlineStyles(next, { bold: true })
  if (tag === "em" || tag === "i") next = mergeExportInlineStyles(next, { italics: true })
  if (tag === "u") next = mergeExportInlineStyles(next, { underline: true })
  if (tag === "s" || tag === "strike" || tag === "del") next = mergeExportInlineStyles(next, { strike: true })
  if (tag === "sub") next = mergeExportInlineStyles(next, { subScript: true })
  if (tag === "sup") next = mergeExportInlineStyles(next, { superScript: true })
  if (tag === "mark") next = mergeExportInlineStyles(next, { highlight: "yellow" })

  return next
}

export const DEFAULT_EXPORT_INLINE_STYLE: ExportInlineStyle = {
  font: EXPORT_DEFAULT_FONT_FAMILY,
  size: parseCssFontSizeToHalfPoints(`${EXPORT_DEFAULT_FONT_SIZE_PX}px`),
}

/** DOCX line value: 240 = single spacing; scales with unitless line-height. */
export function parseLineHeightToDocx(
  lineHeight: string,
  fontSizeHalfPoints = 22
): number | undefined {
  const s = lineHeight.trim().toLowerCase()
  if (!s || s === "normal") return undefined

  const unitless = parseFloat(s)
  if (!Number.isNaN(unitless) && !s.endsWith("px") && !s.endsWith("%") && !s.endsWith("pt")) {
    return Math.round(240 * unitless)
  }

  if (s.endsWith("%")) {
    const pct = parseFloat(s)
    if (!Number.isNaN(pct)) return Math.round(240 * (pct / 100))
  }

  if (s.endsWith("px")) {
    const px = parseFloat(s)
    if (!Number.isNaN(px) && fontSizeHalfPoints > 0) {
      const pt = fontSizeHalfPoints / 2
      const pxPerPt = 96 / 72
      const fontPx = pt * pxPerPt
      if (fontPx > 0) return Math.round(240 * (px / fontPx))
    }
  }

  return undefined
}

export function parseBlockParagraphSpacing(el: HTMLElement): {
  before: number
  after: number
  line?: number
} {
  const spacing = { before: 120, after: 120 } as { before: number; after: number; line?: number }
  const line = parseLineHeightToDocx(el.style.lineHeight || "")
  if (line) spacing.line = line

  const marginTop = el.style.marginTop
  const marginBottom = el.style.marginBottom
  if (marginTop.endsWith("px")) {
    const px = parseFloat(marginTop)
    if (!Number.isNaN(px)) spacing.before = Math.max(0, Math.round(px * 15))
  }
  if (marginBottom.endsWith("px")) {
    const px = parseFloat(marginBottom)
    if (!Number.isNaN(px)) spacing.after = Math.max(0, Math.round(px * 15))
  }

  return spacing
}

/** Merge nested span styles (same approach as @tiptap/extension-text-style). */
export function mergeNestedSpanStylesForExport(html: string): string {
  if (!html?.trim() || typeof DOMParser === "undefined") return html

  const doc = new DOMParser().parseFromString(
    `<div id="notes9-export-fmt-root">${html}</div>`,
    "text/html"
  )
  const root = doc.getElementById("notes9-export-fmt-root")
  if (!root) return html

  const mergeOnElement = (element: Element) => {
    const spans: HTMLElement[] = []
    const walk = (el: Element, depth: number) => {
      if (depth > 20) return
      for (const child of Array.from(el.children)) {
        if (child.tagName === "SPAN") spans.push(child as HTMLElement)
        walk(child, depth + 1)
      }
    }
    walk(element, 0)

    for (const childSpan of spans) {
      const childStyle = childSpan.getAttribute("style") || ""
      const parentSpan = childSpan.parentElement?.closest("span")
      const parentStyle = parentSpan?.getAttribute("style") || ""
      if (parentStyle || childStyle) {
        const merged = [parentStyle, childStyle].filter(Boolean).join(";").replace(/;;+/g, ";")
        childSpan.setAttribute("style", merged)
      }
    }
  }

  mergeOnElement(root)
  return root.innerHTML
}

const BLOCK_TAGS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "TD", "TH"])

/** Wrap bare text nodes in blocks with default font/size so exports match the editor default. */
export function applyDefaultTypographyToBareTextNodes(html: string): string {
  if (!html?.trim() || typeof DOMParser === "undefined") return html

  const doc = new DOMParser().parseFromString(
    `<div id="notes9-export-fmt-root">${html}</div>`,
    "text/html"
  )
  const root = doc.getElementById("notes9-export-fmt-root")
  if (!root) return html

  const defaultStyle = `font-family: ${EXPORT_DEFAULT_FONT_STACK}; font-size: ${EXPORT_DEFAULT_FONT_SIZE_PX}px`

  for (const block of root.querySelectorAll(Array.from(BLOCK_TAGS).join(","))) {
    const el = block as HTMLElement
    const nodes = [...el.childNodes]
    for (const node of nodes) {
      if (node.nodeType !== Node.TEXT_NODE) continue
      const text = node.textContent ?? ""
      if (!text.trim()) continue
      const span = doc.createElement("span")
      span.setAttribute("style", defaultStyle)
      span.textContent = text
      el.replaceChild(span, node)
    }
  }

  return root.innerHTML
}

/** Google Fonts families used in the font menu that need a stylesheet for PDF/HTML. */
const GOOGLE_FONT_SPECS: Record<string, string> = {
  Inter: "Inter:wght@400;500;600;700",
  "IBM Plex Sans": "IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700",
  "IBM Plex Serif": "IBM+Plex+Serif:wght@400;600;700",
  "IBM Plex Mono": "IBM+Plex+Mono:wght@400;500;600",
  Roboto: "Roboto:ital,wght@0,400;0,500;0,700",
  "Roboto Condensed": "Roboto+Condensed:wght@400;700",
  "Roboto Slab": "Roboto+Slab:wght@400;600;700",
  "Roboto Mono": "Roboto+Mono:wght@400;500;700",
  "Open Sans": "Open+Sans:wght@400;600;700",
  Lato: "Lato:wght@400;700",
  Merriweather: "Merriweather:wght@400;700",
  "Noto Sans": "Noto+Sans:wght@400;600;700",
  "Noto Serif": "Noto+Serif:wght@400;600;700",
  Montserrat: "Montserrat:wght@400;600;700",
  Nunito: "Nunito:wght@400;600;700",
  Raleway: "Raleway:wght@400;600;700",
  Rubik: "Rubik:wght@400;600;700",
  Ubuntu: "Ubuntu:wght@400;500;700",
  "Ubuntu Mono": "Ubuntu+Mono:wght@400;700",
  "Fira Sans": "Fira+Sans:wght@400;600;700",
  "Fira Code": "Fira+Code:wght@400;500;600",
  "Source Sans 3": "Source+Sans+3:wght@400;600;700",
  "Source Serif 4": "Source+Serif+4:wght@400;600;700",
  "Source Code Pro": "Source+Code+Pro:wght@400;600",
  "PT Sans": "PT+Sans:wght@400;700",
  "PT Serif": "PT+Serif:wght@400;700",
  "Libre Baskerville": "Libre+Baskerville:wght@400;700",
  "Crimson Text": "Crimson+Text:wght@400;600;700",
  Lora: "Lora:wght@400;600;700",
  "Familjen Grotesk": "Familjen+Grotesk:wght@400;500;600;700",
}

export function collectFontFamiliesFromExportHtml(html: string): Set<string> {
  const found = new Set<string>()
  if (!html?.trim() || typeof DOMParser === "undefined") return found

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html")
  for (const el of doc.querySelectorAll("[style]")) {
    const font = parseCssFontFamily((el as HTMLElement).style.fontFamily || "")
    if (font) found.add(font)
  }
  return found
}

export function buildExportGoogleFontsLink(html: string): string {
  const families = collectFontFamiliesFromExportHtml(html)
  const specs: string[] = []
  for (const name of families) {
    const spec = GOOGLE_FONT_SPECS[name]
    if (spec) specs.push(spec)
  }
  if (specs.length === 0) return ""
  const href = `https://fonts.googleapis.com/css2?family=${specs.join("&family=")}&display=swap`
  return `<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link href="${href}" rel="stylesheet" />`
}

export function prepareTypographyForExport(html: string): string {
  return applyDefaultTypographyToBareTextNodes(mergeNestedSpanStylesForExport(html))
}
