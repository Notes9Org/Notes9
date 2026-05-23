/**
 * Normalize TipTap table HTML before export so editor pixel widths (narrow columns,
 * fixed table width) do not shrink tables in Word, PDF, HTML, Markdown, or TXT.
 */

const DIMENSION_PROPS = new Set([
  "width",
  "height",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
])

/** Usable content width for DOCX (letter 8.5" − 1" margins each side). */
export const DOCX_TABLE_CONTENT_WIDTH_INCHES = 6.5

export function stripInlineDimensionStyles(el: HTMLElement): void {
  if (!el.style) return
  for (const prop of DIMENSION_PROPS) {
    el.style.removeProperty(prop)
  }
  if (!el.getAttribute("style")?.trim()) {
    el.removeAttribute("style")
  }
}

/**
 * Remove editor-specific table/cell dimensions from HTML so exports use full page width.
 */
export function normalizeTablesInExportHtml(html: string): string {
  if (!html?.trim()) return html

  if (typeof DOMParser === "undefined") {
    return normalizeTablesInExportHtmlRegex(html)
  }

  const doc = new DOMParser().parseFromString(
    `<div id="notes9-export-root">${html}</div>`,
    "text/html"
  )
  const root = doc.getElementById("notes9-export-root")
  if (!root) return html

  for (const table of root.querySelectorAll("table")) {
    const el = table as HTMLTableElement
    el.removeAttribute("width")
    el.removeAttribute("height")
    stripInlineDimensionStyles(el)
    el.style.width = "100%"
    el.style.tableLayout = "auto"

    for (const cell of el.querySelectorAll("td, th, tr, col, colgroup")) {
      cell.removeAttribute("width")
      cell.removeAttribute("height")
      stripInlineDimensionStyles(cell as HTMLElement)
    }
  }

  return root.innerHTML
}

/** Regex fallback when DOMParser is unavailable (should be rare). */
function normalizeTablesInExportHtmlRegex(html: string): string {
  return html
    .replace(
      /<(table|td|th|tr)(\s[^>]*)>/gi,
      (_match, tag: string, attrs: string) => {
        let a = attrs
          .replace(/\s+width\s*=\s*["'][^"']*["']/gi, "")
          .replace(/\s+height\s*=\s*["'][^"']*["']/gi, "")
        a = a.replace(
          /\sstyle\s*=\s*["']([^"']*)["']/gi,
          (_s, style: string) => {
            const cleaned = style
              .split(";")
              .map((part: string) => part.trim())
              .filter((part: string) => {
                if (!part) return false
                const key = part.split(":")[0]?.trim().toLowerCase()
                return key && !DIMENSION_PROPS.has(key)
              })
              .join("; ")
            return cleaned ? ` style="${cleaned}"` : ""
          }
        )
        if (tag.toLowerCase() === "table") {
          const hasStyle = /\sstyle\s*=/i.test(a)
          if (hasStyle) {
            a = a.replace(
              /\sstyle\s*=\s*["']([^"']*)["']/i,
              (_m, style: string) =>
                ` style="${style}; width: 100%; table-layout: auto"`
            )
          } else {
            a += ` style="width: 100%; table-layout: auto"`
          }
        }
        return `<${tag}${a}>`
      }
    )
}

export function countTableColumns(tableEl: Element): number {
  const firstRow = tableEl.querySelector("tr")
  if (!firstRow) return 0
  let count = 0
  for (const cell of firstRow.querySelectorAll("th, td")) {
    const span = parseInt(cell.getAttribute("colspan") || "1", 10)
    count += Number.isNaN(span) ? 1 : Math.max(1, span)
  }
  return count
}
