/**
 * Normalize and extract code blocks for DOCX / print export.
 * Editor theme colors (light gray on white) and syntax-highlight spans must not
 * produce invisible text in Word.
 */

const CODE_SHADING_FILL = "F3F4F6"
const CODE_TEXT_COLOR = "111827"
const CODE_FONT = "Consolas"

const STYLE_PROPS_TO_STRIP = new Set([
  "color",
  "background",
  "background-color",
  "opacity",
  "visibility",
  "display",
  "font-size",
  "font-family",
])

function stripCodeStyles(el: HTMLElement): void {
  stripCodeStylesFromTree(el)
}

function stripCodeStylesFromTree(el: HTMLElement): void {
  stripStyleProps(el)
  for (const child of el.querySelectorAll("*")) {
    stripStyleProps(child as HTMLElement)
  }
}

function stripStyleProps(el: HTMLElement): void {
  if (!el.style) return
  for (const prop of STYLE_PROPS_TO_STRIP) {
    el.style.removeProperty(prop)
  }
  if (!el.getAttribute("style")?.trim()) {
    el.removeAttribute("style")
  }
}

/**
 * Remove theme/highlight colors from pre/code so DOCX uses explicit dark monospace text.
 */
export function normalizeCodeInExportHtml(html: string): string {
  if (!html?.trim()) return html

  if (typeof DOMParser === "undefined") {
    return html
  }

  const doc = new DOMParser().parseFromString(
    `<div id="notes9-export-code-root">${html}</div>`,
    "text/html"
  )
  const root = doc.getElementById("notes9-export-code-root")
  if (!root) return html

  for (const el of root.querySelectorAll("pre, code")) {
    stripCodeStyles(el as HTMLElement)
  }

  return root.innerHTML
}

/** Walk a code/pre subtree and preserve line breaks from <br>. */
export function extractCodePlainText(root: Element): string {
  const code = root.querySelector(":scope > code") ?? root.querySelector("code")
  const target = (code as Element | null) ?? root

  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? ""
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return ""
    }
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    if (tag === "br") {
      return "\n"
    }
    let out = ""
    for (const child of el.childNodes) {
      out += walk(child)
    }
    return out
  }

  return walk(target).replace(/\r\n/g, "\n")
}

export const EXPORT_CODE_TEXT_COLOR = CODE_TEXT_COLOR
export const EXPORT_CODE_SHADING_FILL = CODE_SHADING_FILL
export const EXPORT_CODE_FONT = CODE_FONT

export function isLightHexColor(hex: string): boolean {
  const h = hex.replace("#", "").trim()
  if (h.length !== 6 && h.length !== 3) return false
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return false
  return 0.299 * r + 0.587 * g + 0.114 * b > 200
}
