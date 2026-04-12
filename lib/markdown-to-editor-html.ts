/**
 * Markdown → HTML for TipTap `insertContent`, matching paste / “Insert markdown”
 * behavior in `components/text-editor/tiptap-editor.tsx`.
 */

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const parseInlineMarkdown = (value: string) => {
  let html = escapeHtml(value)
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>")
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>")
  html = html.replace(/___([^_]+)___/g, "<strong><em>$1</em></strong>")
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>")
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
  html = html.replace(/_([^_\n]+)_/g, "<em>$1</em>")
  html = html.replace(/~~([^~]+)~~/g, "<s>$1</s>")
  return html
}

export const looksLikeMarkdown = (value: string) => {
  const text = value.trim()
  if (!text) return false

  return [
    /^#{1,6}\s/m,
    /^>\s/m,
    /^[-*+]\s/m,
    /^\d+\.\s/m,
    /```/,
    /\[([^\]]+)\]\((https?:\/\/|mailto:)[^)]+\)/,
    /\*\*[^*]+\*\*/,
    /__[^_]+__/,
    /\|.+\|/,
    /^-{3,}$|^\*{3,}$/m,
  ].some((pattern) => pattern.test(text))
}

const basicMarkdownToHtml = (markdown: string) => {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const blocks: string[] = []
  let i = 0

  while (i < lines.length) {
    const rawLine = lines[i]
    const line = rawLine.trimEnd()

    if (!line.trim()) {
      i += 1
      continue
    }

    const fence = line.match(/^```([\w-]*)\s*$/)
    if (fence) {
      const codeLines: string[] = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i])
        i += 1
      }
      if (i < lines.length) i += 1
      const languageClass = fence[1] ? ` class="language-${escapeHtml(fence[1])}"` : ""
      blocks.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`)
      continue
    }

    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      blocks.push("<hr>")
      i += 1
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      blocks.push(`<h${level}>${parseInlineMarkdown(heading[2].trim())}</h${level}>`)
      i += 1
      continue
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""))
        i += 1
      }
      blocks.push(`<blockquote><p>${parseInlineMarkdown(quoteLines.join("<br>"))}</p></blockquote>`)
      continue
    }

    if (/^(\s*)([-*+]|\d+\.)\s+/.test(line)) {
      const isOrdered = /^\s*\d+\.\s+/.test(line)
      const listTag = isOrdered ? "ol" : "ul"
      const items: string[] = []

      while (i < lines.length && /^(\s*)([-*+]|\d+\.)\s+/.test(lines[i].trimEnd())) {
        const itemLine = lines[i].trim().replace(/^([-*+]|\d+\.)\s+/, "")
        const task = itemLine.match(/^\[( |x|X)\]\s+(.*)$/)
        if (task && !isOrdered) {
          items.push(
            `<li data-type="taskItem" data-checked="${task[1].toLowerCase() === "x" ? "true" : "false"}"><p>${parseInlineMarkdown(task[2])}</p></li>`
          )
        } else {
          items.push(`<li><p>${parseInlineMarkdown(itemLine)}</p></li>`)
        }
        i += 1
      }

      if (items.some((item) => item.includes('data-type="taskItem"'))) {
        blocks.push(`<ul data-type="taskList">${items.join("")}</ul>`)
      } else {
        blocks.push(`<${listTag}>${items.join("")}</${listTag}>`)
      }
      continue
    }

    if (/^\|(.+)\|\s*$/.test(line) && i + 1 < lines.length && /^\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1].trim())) {
      const headerCells = line
        .trim()
        .slice(1, -1)
        .split("|")
        .map((cell) => `<th>${parseInlineMarkdown(cell.trim())}</th>`)
      const rows: string[] = []
      i += 2
      while (i < lines.length && /^\|(.+)\|\s*$/.test(lines[i].trim())) {
        const rowCells = lines[i]
          .trim()
          .slice(1, -1)
          .split("|")
          .map((cell) => `<td>${parseInlineMarkdown(cell.trim())}</td>`)
        rows.push(`<tr>${rowCells.join("")}</tr>`)
        i += 1
      }
      blocks.push(`<table><thead><tr>${headerCells.join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`)
      continue
    }

    const paragraphLines: string[] = []
    while (i < lines.length && lines[i].trim()) {
      if (
        /^#{1,6}\s/.test(lines[i]) ||
        /^>\s?/.test(lines[i]) ||
        /^(\s*)([-*+]|\d+\.)\s+/.test(lines[i]) ||
        /^```/.test(lines[i]) ||
        /^\|(.+)\|\s*$/.test(lines[i].trim())
      ) {
        break
      }
      paragraphLines.push(lines[i].trim())
      i += 1
    }
    blocks.push(`<p>${parseInlineMarkdown(paragraphLines.join(" "))}</p>`)
  }

  return blocks.join("")
}

/** Async: prefers `marked` (GFM); falls back to the same basic parser as paste. */
export async function markdownToHtml(markdown: string): Promise<string> {
  try {
    const markedModule = await (new Function('return import("marked")')() as Promise<{
      marked: { parse: (value: string, options?: Record<string, unknown>) => string | Promise<string> }
    }>)
    const parsed = await markedModule.marked.parse(markdown, {
      gfm: true,
      breaks: true,
    })
    return typeof parsed === "string" ? parsed : String(parsed)
  } catch {
    return basicMarkdownToHtml(markdown)
  }
}
