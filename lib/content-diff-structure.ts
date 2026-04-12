import type { Change } from "diff"
import type { ContentDiffStructureHints } from "@/lib/db/schema"

/** Max distinct section labels (excluding document title). */
const MAX_HINTS_EACH = 6
/** Longest change hunks used to locate edits (few, high-signal). */
const MAX_CHANGE_HUNKS = 4
const MIN_SNIPPET_LEN = 4

type HeadingFrame = { level: number; text: string }

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"])

function normText(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase()
}

function wrapHtml(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(`<div id="cdiff-root">${html}</div>`, "text/html")
  const el = doc.getElementById("cdiff-root")
  if (!el) throw new Error("cdiff-root missing")
  return el
}

function isEmittedBlock(tag: string, el: Element): boolean {
  if (HEADING_TAGS.has(tag)) return true
  if (tag === "blockquote" || tag === "pre") return true
  if (tag === "td" || tag === "th") return true
  if (tag === "p") return true
  if (tag === "li") {
    return el.querySelector(":scope > p") === null
  }
  return false
}

function dfsBlocks(
  el: Element,
  root: Element,
  headingStack: HeadingFrame[],
  out: Array<{ trail: string[]; text: string }>
): void {
  const tag = el.tagName.toLowerCase()

  if (HEADING_TAGS.has(tag)) {
    const level = parseInt(tag[1]!, 10)
    while (headingStack.length && headingStack[headingStack.length - 1]!.level >= level) {
      headingStack.pop()
    }
    const text = (el.textContent || "").replace(/\s+/g, " ").trim()
    headingStack.push({ level, text })
  }

  if (isEmittedBlock(tag, el)) {
    const trail = headingStack.map((h) => h.text).filter(Boolean)
    out.push({
      trail,
      text: el.textContent || "",
    })
  }

  for (const child of Array.from(el.children)) {
    dfsBlocks(child, root, headingStack, out)
  }
}

function listBlocks(html: string): Array<{ trail: string[]; text: string }> {
  const out: Array<{ trail: string[]; text: string }> = []
  try {
    const root = wrapHtml(html)
    dfsBlocks(root, root, [], out)
  } catch {
    return []
  }
  return out
}

const TRAIL_SEP = " › "

function trailLabel(trail: string[]): string | null {
  if (trail.length === 0) return null
  return trail.join(TRAIL_SEP).slice(0, 200)
}

/**
 * Collapse redundant document titles into DB/UI shape: title once + section suffixes only.
 */
export function compactSectionTrails(fullLabels: string[]): ContentDiffStructureHints {
  const trimmed = fullLabels.map((s) => s.trim()).filter(Boolean)
  if (trimmed.length === 0) return { document_title: null, sections: [] }

  const splitAll = trimmed.map((t) =>
    t.split(TRAIL_SEP).map((s) => s.trim()).filter(Boolean)
  )
  if (splitAll.some((p) => p.length === 0)) {
    const flat = [...new Set(trimmed)].slice(0, MAX_HINTS_EACH)
    return { document_title: null, sections: flat }
  }

  const firstSegs = splitAll.map((p) => p[0]).filter(Boolean) as string[]
  const common = firstSegs[0]
  const allShareFirst =
    common !== undefined &&
    firstSegs.length === splitAll.length &&
    firstSegs.every((f) => f === common)

  if (allShareFirst && common) {
    const sections: string[] = []
    const seen = new Set<string>()
    for (const parts of splitAll) {
      if (parts.length <= 1) continue
      const rest = parts.slice(1).join(TRAIL_SEP)
      if (!rest || seen.has(rest)) continue
      seen.add(rest)
      sections.push(rest)
    }
    return {
      document_title: common,
      sections: sections.slice(0, MAX_HINTS_EACH),
    }
  }

  return {
    document_title: null,
    sections: [...new Set(trimmed)].slice(0, MAX_HINTS_EACH),
  }
}

/** Normalize DB JSON (new shape or legacy `section_trails` only). */
export function parseStructureHintsFromDb(raw: unknown): ContentDiffStructureHints {
  if (!raw || typeof raw !== "object") {
    return { document_title: null, sections: [] }
  }
  const o = raw as Record<string, unknown>

  if (Array.isArray(o.sections) && "document_title" in o) {
    const sections = o.sections.filter((x): x is string => typeof x === "string")
    const dt = o.document_title
    return {
      document_title: typeof dt === "string" && dt.trim() ? dt : null,
      sections,
    }
  }

  const legacy = o.section_trails
  if (Array.isArray(legacy)) {
    const list = legacy.filter((x): x is string => typeof x === "string")
    return compactSectionTrails(list)
  }

  return { document_title: null, sections: [] }
}

/** Single line for UI / export (title once, then sections). */
export function formatStructureHintsDisplay(h: ContentDiffStructureHints): string {
  const parts: string[] = []
  if (h.document_title?.trim()) parts.push(h.document_title.trim())
  for (const s of h.sections) {
    if (s?.trim()) parts.push(s.trim())
  }
  return parts.join(" · ")
}

/**
 * Longest added/removed runs first — these best indicate *where* the edit happened.
 * Deduped, capped, so we do not sweep every small word match across the document.
 */
function collectPrimaryChangeSnippets(parts: Change[]): string[] {
  const runs: { text: string; len: number }[] = []
  for (const p of parts) {
    if (!p.added && !p.removed) continue
    const t = (p.value || "").replace(/\s+/g, " ").trim()
    if (t.length < MIN_SNIPPET_LEN) continue
    const clipped = t.length > 140 ? t.slice(0, 140) : t
    runs.push({ text: clipped, len: clipped.length })
  }
  runs.sort((a, b) => b.len - a.len)

  const seen = new Set<string>()
  const out: string[] = []
  for (const r of runs) {
    const key = normText(r.text)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(r.text)
    if (out.length >= MAX_CHANGE_HUNKS) break
  }
  return out
}

/** First block in document order that contains the snippet (one location per hunk). */
function firstBlockMatchingSnippet(
  snippet: string,
  blocks: Array<{ trail: string[]; text: string }>
): { trail: string[] } | null {
  const n = normText(snippet)
  if (n.length < MIN_SNIPPET_LEN) return null
  for (const b of blocks) {
    const bt = normText(b.text)
    if (bt.includes(n)) {
      return { trail: b.trail }
    }
  }
  return null
}

/**
 * Section hints for blocks that contain the actual change text — persisted as
 * `{ document_title, sections }` (compact, no repeated title in sections).
 */
export function computeStructuralHints(
  previousHtml: string,
  newHtml: string,
  diffParts: Change[]
): ContentDiffStructureHints {
  const snippets = collectPrimaryChangeSnippets(diffParts)
  if (snippets.length === 0) {
    return { document_title: null, sections: [] }
  }

  const prevBlocks = listBlocks(previousHtml)
  const nextBlocks = listBlocks(newHtml)

  const trails = new Set<string>()

  for (const snip of snippets) {
    if (trails.size >= MAX_HINTS_EACH) break
    const hit =
      firstBlockMatchingSnippet(snip, nextBlocks) ?? firstBlockMatchingSnippet(snip, prevBlocks)
    if (!hit) continue
    const label = trailLabel(hit.trail)
    if (label) trails.add(label)
  }

  return compactSectionTrails([...trails])
}
