/**
 * HTML-to-LaTeX converter for research paper export.
 *
 * Converts Tiptap editor HTML output into a compilable .tex file
 * with proper \documentclass, packages, sections, math, tables,
 * figures, and citation placeholders.
 */

import { getTemplate, type JournalTemplate } from "./latex-templates"
import { generateKey } from "./bibtex"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LaTeXExportOptions {
  /** Paper title (used in \title{}) */
  title: string
  /** Optional author line */
  authors?: string
  /** Optional abstract (extracted from content if not provided) */
  abstract?: string
  /** Journal template id — defaults to "generic" */
  templateId?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape characters that are special in LaTeX */
function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    // Undo double-escaping of backslash commands we intentionally produce
    // (this is handled by converting nodes *before* escaping their text)
}

/** Trim and collapse whitespace */
function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

// ---------------------------------------------------------------------------
// Node converters
// ---------------------------------------------------------------------------

function convertNode(node: ChildNode, template?: JournalTemplate): string {
  // Text node
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeLatex(node.textContent || "")
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return ""

  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  const inner = () => Array.from(el.childNodes).map((n) => convertNode(n, template)).join("")

  // Section command from template (e.g. \section or \section*)
  const sec = template?.sectionCommand || "\\section"

  switch (tag) {
    // ------ Block elements ------
    case "h1":
      return `${sec}*{${clean(inner())}}\n\n`
    case "h2":
      return `${sec}{${clean(inner())}}\n\n`
    case "h3":
      return `\\subsection{${clean(inner())}}\n\n`
    case "h4":
      return `\\subsubsection{${clean(inner())}}\n\n`

    case "p": {
      const content = inner().trim()
      if (!content) return "\n"
      return `${content}\n\n`
    }

    case "blockquote":
      return `\\begin{quote}\n${inner()}\\end{quote}\n\n`

    case "pre": {
      // Code block
      const code = el.querySelector("code")
      const lang = code?.className?.match(/language-(\w+)/)?.[1] || ""
      const text = code?.textContent || el.textContent || ""
      return `\\begin{verbatim}\n${text}\n\\end{verbatim}\n\n`
    }

    case "code":
      // Inline code (block code is handled by <pre>)
      return `\\texttt{${escapeLatex(el.textContent || "")}}`

    // ------ Inline formatting ------
    case "strong":
    case "b":
      return `\\textbf{${inner()}}`

    case "em":
    case "i":
      return `\\textit{${inner()}}`

    case "u":
      return `\\underline{${inner()}}`

    case "s":
    case "del":
    case "strike":
      return `\\sout{${inner()}}`

    case "sub":
      return `\\textsubscript{${inner()}}`

    case "sup":
      return `\\textsuperscript{${inner()}}`

    case "mark":
      // Highlight — no direct LaTeX equivalent, just pass through
      return inner()

    case "a": {
      const href = el.getAttribute("href") || ""
      const text = inner()
      // Check if it's a citation link (has paper metadata)
      const paperId = el.getAttribute("data-paper-id")
      if (paperId) {
        // Generate a proper BibTeX key from author + year
        const authorsAttr = el.getAttribute("data-paper-authors")
        const yearAttr = el.getAttribute("data-paper-year")
        let authors: string[] = []
        try {
          if (authorsAttr) authors = JSON.parse(authorsAttr.replace(/&quot;/g, '"'))
        } catch { /* ignore */ }
        const key = generateKey(authors, yearAttr || "")
        return `\\cite{${key}}`
      }
      return `\\href{${href}}{${text}}`
    }

    // ------ Lists ------
    case "ul":
      return `\\begin{itemize}\n${inner()}\\end{itemize}\n\n`

    case "ol":
      return `\\begin{enumerate}\n${inner()}\\end{enumerate}\n\n`

    case "li": {
      // Handle task list items
      const checkbox = el.querySelector('input[type="checkbox"]')
      if (checkbox) {
        const checked = (checkbox as HTMLInputElement).checked
        return `  \\item[${checked ? "$\\boxtimes$" : "$\\square$"}] ${inner().replace(/^\s*/, "")}\n`
      }
      return `  \\item ${inner().trim()}\n`
    }

    // ------ Tables ------
    case "table":
      return convertTable(el)

    case "thead":
    case "tbody":
    case "tfoot":
      return inner()

    case "tr":
    case "td":
    case "th":
      // Handled by convertTable
      return inner()

    // ------ Images ------
    case "img": {
      const src = el.getAttribute("src") || "image"
      const alt = el.getAttribute("alt") || ""
      return [
        "\\begin{figure}[h]",
        "  \\centering",
        `  \\includegraphics[width=0.8\\textwidth]{${src}}`,
        alt ? `  \\caption{${escapeLatex(alt)}}` : "",
        "\\end{figure}",
        "",
      ]
        .filter(Boolean)
        .join("\n") + "\n"
    }

    // ------ Math nodes (from @tiptap/extension-mathematics) ------
    case "span": {
      // Inline math node
      const mathType = el.getAttribute("data-type")
      if (mathType === "inline-math") {
        const latex = el.getAttribute("data-latex") || ""
        return `$${latex}$`
      }
      if (mathType === "block-math") {
        const latex = el.getAttribute("data-latex") || ""
        return `\n\\[\n${latex}\n\\]\n\n`
      }
      // Chemical formula or other spans — pass through
      return inner()
    }

    case "div": {
      // Block math might be wrapped in a div
      const mathType = el.getAttribute("data-type")
      if (mathType === "block-math") {
        const latex = el.getAttribute("data-latex") || ""
        return `\n\\[\n${latex}\n\\]\n\n`
      }
      return inner()
    }

    // ------ Horizontal rule ------
    case "hr":
      return "\\noindent\\rule{\\textwidth}{0.4pt}\n\n"

    case "br":
      return "\\\\\n"

    default:
      return inner()
  }
}

// ---------------------------------------------------------------------------
// Table converter
// ---------------------------------------------------------------------------

function convertTable(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll("tr"))
  if (rows.length === 0) return ""

  // Determine column count from first row
  const firstRow = rows[0]
  const firstCells = Array.from(firstRow.querySelectorAll("td, th"))
  const colCount = firstCells.length
  if (colCount === 0) return ""

  const colSpec = "|" + Array(colCount).fill("l").join("|") + "|"

  const lines: string[] = [
    "\\begin{table}[h]",
    "  \\centering",
    `  \\begin{tabular}{${colSpec}}`,
    "    \\hline",
  ]

  rows.forEach((row, rowIdx) => {
    const cells = Array.from(row.querySelectorAll("td, th"))
    const isHeader = cells[0]?.tagName.toLowerCase() === "th"

    const cellTexts = cells.map((cell) => {
      const text = Array.from(cell.childNodes).map(convertNode).join("").trim()
      return isHeader ? `\\textbf{${text}}` : text
    })

    lines.push(`    ${cellTexts.join(" & ")} \\\\`)
    lines.push("    \\hline")
  })

  lines.push("  \\end{tabular}")
  lines.push("\\end{table}")
  lines.push("")

  return lines.join("\n") + "\n"
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

export function htmlToLatex(html: string, options: LaTeXExportOptions): string {
  const template = getTemplate(options.templateId || "generic")

  // Parse HTML
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")

  // Convert all body children (pass template for section command)
  const bodyContent = Array.from(doc.body.childNodes)
    .map((n) => convertNode(n, template))
    .join("")

  // Build packages list
  const basePackages = [
    "[utf8]{inputenc}",
    "[T1]{fontenc}",
    "{amsmath,amssymb,amsfonts}",
    "{graphicx}",
    "{hyperref}",
    "[normalem]{ulem}  % for \\sout (strikethrough)",
    "{booktabs}",
    "{geometry}",
  ]
  const allPackages = [
    ...basePackages,
    ...template.extraPackages.map((p) => `{${p}}`),
  ]

  const classOpts =
    template.classOptions.length > 0
      ? `[${template.classOptions.join(",")}]`
      : ""

  const preamble = [
    `% ${template.notes}`,
    `\\documentclass${classOpts}{${template.documentClass}}`,
    "",
    "% Packages",
    ...allPackages.map((p) => `\\usepackage${p}`),
    "",
    ...template.extraPreamble,
    "",
    "% Macros (matching editor KaTeX macros)",
    "\\newcommand{\\RR}{\\mathbb{R}}",
    "\\newcommand{\\ZZ}{\\mathbb{Z}}",
    "\\newcommand{\\NN}{\\mathbb{N}}",
    "\\newcommand{\\QQ}{\\mathbb{Q}}",
    "\\newcommand{\\CC}{\\mathbb{C}}",
    "",
    `\\title{${escapeLatex(options.title)}}`,
    options.authors ? `\\author{${escapeLatex(options.authors)}}` : "\\author{}",
    "\\date{\\today}",
    "",
  ].join("\n")

  const parts = [preamble, "\\begin{document}", ""]

  if (template.useMaketitle) {
    parts.push("\\maketitle", "")
  }

  parts.push(bodyContent, "\\end{document}", "")

  return parts.join("\n")
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

export function downloadLatex(html: string, options: LaTeXExportOptions): void {
  const tex = htmlToLatex(html, options)
  const blob = new Blob([tex], { type: "application/x-tex" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${options.title || "paper"}.tex`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
