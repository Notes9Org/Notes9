/**
 * Normalize clipboard HTML/plain text into TipTap-ready HTML using the same
 * markdown pipeline as .md file import (see markdown-to-editor-html.ts).
 */

import { looksLikeMarkdown, markdownToHtml } from "@/lib/markdown-to-editor-html"

/** Markers for content copied from within the Notes9 editor — skip round-trip. */
const EDITOR_NATIVE_MARKERS = [
  'data-type="taskitem"',
  'data-type="tasklist"',
  "spreadsheetembed",
  "data-latex",
  "data-katex",
  "data-comment",
]

export function isEditorNativeClipboardHtml(html: string): boolean {
  const lower = html.toLowerCase()
  return EDITOR_NATIVE_MARKERS.some((marker) => lower.includes(marker))
}

/** Strip clipboard HTML wrappers (Word, browsers, ChatGPT fragment comments). */
export function stripClipboardHtmlWrapper(html: string): string {
  let s = html.trim()
  if (!s) return ""

  const fragmentMatch = s.match(/<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/i)
  if (fragmentMatch?.[1]) {
    s = fragmentMatch[1].trim()
  }

  if (typeof DOMParser !== "undefined") {
    try {
      const doc = new DOMParser().parseFromString(s, "text/html")
      const bodyHtml = doc.body?.innerHTML?.trim()
      if (bodyHtml) return bodyHtml
    } catch {
      /* fall through to regex cleanup */
    }
  }

  return s
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<\/?html[^>]*>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<\/?body[^>]*>/gi, "")
    .trim()
}

let turndownPromise: Promise<(html: string) => string> | null = null

async function getHtmlToMarkdown(): Promise<(html: string) => string> {
  if (!turndownPromise) {
    turndownPromise = (async () => {
      // @ts-expect-error — turndown ships without bundled types
      const TurndownService = (await import("turndown")).default
      // @ts-expect-error — plugin ships without types
      const { gfm } = await import("turndown-plugin-gfm")

      const service = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
        bulletListMarker: "-",
      })
      service.use(gfm)
      return (html: string) => service.turndown(html)
    })()
  }
  return turndownPromise
}

/** Convert foreign HTML to markdown (turndown + GFM), then to editor HTML. */
export async function htmlToMarkdown(html: string): Promise<string> {
  const stripped = stripClipboardHtmlWrapper(html)
  if (!stripped) return ""
  const turndown = await getHtmlToMarkdown()
  return turndown(stripped).trim()
}

export type ClipboardPasteInput = {
  html?: string | null
  plain?: string | null
}

/**
 * Resolve clipboard data to HTML for `insertContent`, or null to use TipTap default paste.
 */
export async function resolveClipboardPaste(
  input: ClipboardPasteInput,
): Promise<string | null> {
  const html = input.html?.trim() ?? ""
  const plain = input.plain ?? ""

  if (html && isEditorNativeClipboardHtml(html)) {
    return null
  }

  if (looksLikeMarkdown(plain)) {
    return markdownToHtml(plain)
  }

  if (html) {
    const markdown = await htmlToMarkdown(html)
    if (markdown) {
      return markdownToHtml(markdown)
    }
  }

  if (plain.trim()) {
    return markdownToHtml(plain)
  }

  return null
}
