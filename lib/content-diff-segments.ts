import { diffWords } from "diff"
import { htmlToDiffPlainText } from "@/lib/content-diff-plain-text"
import type { ContentDiff, ContentDiffSegment } from "@/lib/db/schema"

/** Max unchanged run stored inline (longer runs use character count only). */
const MAX_UNCHANGED_INLINE = 200

/** Build compact JSON for DB: +/- word fragments and `_` placeholders for unchanged runs. */
export function buildStoredSegments(prevText: string, nextText: string): ContentDiffSegment[] {
  const parts = diffWords(prevText, nextText)
  const out: ContentDiffSegment[] = []
  for (const p of parts) {
    if (p.added) {
      out.push({ k: "+", v: p.value })
    } else if (p.removed) {
      out.push({ k: "-", v: p.value })
    } else {
      const n = p.value.length
      if (n === 0) continue
      if (n <= MAX_UNCHANGED_INLINE) {
        out.push({ k: "_", v: p.value })
      } else {
        out.push({ k: "_", n })
      }
    }
  }
  return out
}

function isSegmentArray(raw: unknown): raw is ContentDiffSegment[] {
  if (!Array.isArray(raw)) return false
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return false
    const o = item as { k?: string; v?: unknown; n?: unknown }
    if (o.k === "+" || o.k === "-") {
      if (typeof o.v !== "string") return false
    } else if (o.k === "_") {
      const hasV = typeof o.v === "string"
      const hasN = typeof o.n === "number" && o.n >= 0
      if (!hasV && !hasN) return false
      if (hasV && hasN) return false
    } else return false
  }
  return true
}

/** Prefer stored segments; fall back to legacy full snapshots when present (pre-migration rows). */
export function resolveDiffDisplay(diff: ContentDiff): {
  kind: "segments"
  segments: ContentDiffSegment[]
} | {
  kind: "legacy"
  prevPlain: string
  nextPlain: string
} | { kind: "none" } {
  const raw = diff.diff_segments
  if (isSegmentArray(raw) && raw.length > 0) {
    return { kind: "segments", segments: raw }
  }
  const prev = diff.previous_content ?? ""
  const next = diff.new_content ?? ""
  if (prev !== "" || next !== "") {
    return { kind: "legacy", prevPlain: htmlToDiffPlainText(prev), nextPlain: htmlToDiffPlainText(next) }
  }
  return { kind: "none" }
}

export function joinRemovedExcerpts(segments: ContentDiffSegment[]): string {
  return segments.filter((s): s is { k: "-"; v: string } => s.k === "-").map((s) => s.v).join("")
}

export function joinAddedExcerpts(segments: ContentDiffSegment[]): string {
  return segments.filter((s): s is { k: "+"; v: string } => s.k === "+").map((s) => s.v).join("")
}

export function formatUnchangedSegment(seg: { k: "_"; v?: string; n?: number }): string {
  if (typeof seg.v === "string") return seg.v
  if (typeof seg.n === "number") {
    if (seg.n <= 80) return "·".repeat(Math.min(seg.n, 40))
    return `(${seg.n} characters unchanged)`
  }
  return ""
}

export function exportSegmentsPlain(segments: ContentDiffSegment[]): string {
  const lines: string[] = []
  for (const s of segments) {
    if (s.k === "+") {
      if (s.v.trim()) lines.push(`+ ${s.v}`)
    } else if (s.k === "-") {
      if (s.v.trim()) lines.push(`- ${s.v}`)
    } else if (s.k === "_") {
      const text = formatUnchangedSegment(s)
      if (text && !text.startsWith("(")) lines.push(`  ${text}`)
      else if (text) lines.push(`  ${text}`)
    }
  }
  return lines.length > 0 ? lines.join("\n") : "(no textual change)"
}
