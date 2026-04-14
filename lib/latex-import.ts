/**
 * Basic LaTeX (.tex) to HTML converter for importing papers into the editor.
 * Handles common LaTeX constructs: sections, formatting, math, lists, citations.
 */

export function latexToHtml(tex: string): string {
  let html = tex

  // Remove preamble (everything before \begin{document})
  const docStart = html.indexOf("\\begin{document}")
  if (docStart !== -1) {
    html = html.slice(docStart + "\\begin{document}".length)
  }
  // Remove \end{document}
  html = html.replace(/\\end\{document\}/g, "")

  // Remove \maketitle
  html = html.replace(/\\maketitle/g, "")

  // Extract title, author from preamble if present
  const titleMatch = tex.match(/\\title\{([^}]*)\}/)
  const authorMatch = tex.match(/\\author\{([^}]*)\}/)
  let prefix = ""
  if (titleMatch) prefix += `<h1>${cleanBraces(titleMatch[1])}</h1>\n`
  if (authorMatch) prefix += `<p><em>${cleanBraces(authorMatch[1])}</em></p>\n`

  // Sections
  html = html.replace(/\\section\*?\{([^}]*)\}/g, (_, t) => `<h2>${cleanBraces(t)}</h2>`)
  html = html.replace(/\\subsection\*?\{([^}]*)\}/g, (_, t) => `<h3>${cleanBraces(t)}</h3>`)
  html = html.replace(/\\subsubsection\*?\{([^}]*)\}/g, (_, t) => `<h4>${cleanBraces(t)}</h4>`)

  // Abstract
  html = html.replace(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/g, (_, body) =>
    `<h2>Abstract</h2>\n<p>${cleanBody(body)}</p>`)

  // Formatting
  html = html.replace(/\\textbf\{([^}]*)\}/g, "<strong>$1</strong>")
  html = html.replace(/\\textit\{([^}]*)\}/g, "<em>$1</em>")
  html = html.replace(/\\underline\{([^}]*)\}/g, "<u>$1</u>")
  html = html.replace(/\\emph\{([^}]*)\}/g, "<em>$1</em>")
  html = html.replace(/\\texttt\{([^}]*)\}/g, "<code>$1</code>")

  // Math: inline $...$ and display \[...\] or $$...$$
  // Convert to KaTeX-compatible spans
  html = html.replace(/\$\$([^$]+)\$\$/g, (_, math) =>
    `<span data-type="block-math" data-latex="${escapeAttr(math.trim())}">${math.trim()}</span>`)
  html = html.replace(/\\\[([^\]]*)\\\]/g, (_, math) =>
    `<span data-type="block-math" data-latex="${escapeAttr(math.trim())}">${math.trim()}</span>`)
  html = html.replace(/\$([^$]+)\$/g, (_, math) =>
    `<span data-type="inline-math" data-latex="${escapeAttr(math.trim())}">${math.trim()}</span>`)

  // Lists
  html = html.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_, body) => {
    const items = body.split(/\\item\s*/).filter((s: string) => s.trim())
    return "<ul>" + items.map((item: string) => `<li>${cleanBody(item)}</li>`).join("") + "</ul>"
  })
  html = html.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (_, body) => {
    const items = body.split(/\\item\s*/).filter((s: string) => s.trim())
    return "<ol>" + items.map((item: string) => `<li>${cleanBody(item)}</li>`).join("") + "</ol>"
  })

  // Citations: \cite{key} → [key]
  html = html.replace(/\\cite\{([^}]*)\}/g, (_, keys) => {
    return keys.split(",").map((k: string) => `[${k.trim()}]`).join("")
  })

  // Footnotes
  html = html.replace(/\\footnote\{([^}]*)\}/g, " ($1)")

  // References / bibliography
  html = html.replace(/\\begin\{thebibliography\}[\s\S]*?\\end\{thebibliography\}/g, (match) => {
    let refs = "<h2>References</h2>"
    const bibItems = match.match(/\\bibitem\{[^}]*\}[^\\]*/g) || []
    bibItems.forEach((item, i) => {
      const text = item.replace(/\\bibitem\{[^}]*\}/, "").trim()
      refs += `<p>[${i + 1}] ${cleanBody(text)}</p>`
    })
    return refs
  })

  // Remove remaining LaTeX commands we don't handle
  html = html.replace(/\\[a-zA-Z]+\{([^}]*)\}/g, "$1")
  html = html.replace(/\\[a-zA-Z]+/g, "")
  // Remove leftover braces
  html = html.replace(/[{}]/g, "")

  // Convert double newlines to paragraphs
  const blocks = html.split(/\n\s*\n/)
  html = blocks.map(block => {
    const trimmed = block.trim()
    if (!trimmed) return ""
    if (trimmed.startsWith("<h") || trimmed.startsWith("<ul") || trimmed.startsWith("<ol") || trimmed.startsWith("<span")) return trimmed
    return `<p>${trimmed.replace(/\n/g, " ")}</p>`
  }).filter(Boolean).join("\n")

  return prefix + html
}

function cleanBraces(s: string): string {
  return s.replace(/[{}]/g, "").trim()
}

function cleanBody(s: string): string {
  return s.replace(/\n/g, " ").replace(/\s+/g, " ").trim()
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
