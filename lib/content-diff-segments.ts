import { diffWords } from "diff"
import type { ContentDiff, ContentDiffSegment } from "@/lib/db/schema"

/** Build compact JSON for DB: +/- word fragments and `_` placeholders for unchanged run lengths (no full document text). */
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
      if (n > 0) out.push({ k: "_", n })
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
      if (typeof o.n !== "number" || o.n < 0) return false
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
    return { kind: "legacy", prevPlain: stripHtml(prev), nextPlain: stripHtml(next) }
  }
  return { kind: "none" }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

export function joinRemovedExcerpts(segments: ContentDiffSegment[]): string {
  return segments.filter((s): s is { k: "-"; v: string } => s.k === "-").map((s) => s.v).join("")
}

export function joinAddedExcerpts(segments: ContentDiffSegment[]): string {
  return segments.filter((s): s is { k: "+"; v: string } => s.k === "+").map((s) => s.v).join("")
}

export function exportSegmentsPlain(segments: ContentDiffSegment[]): string {
  const lines: string[] = []
  for (const s of segments) {
    if (s.k === "+") {
      const t = s.v.replace(/\s+/g, " ").trim()
      if (t) lines.push(`+ ${t}`)
    } else if (s.k === "-") {
      const t = s.v.replace(/\s+/g, " ").trim()
      if (t) lines.push(`- ${t}`)
    } else {
      lines.push(`  … (${s.n} characters unchanged) …`)
    }
  }
  return lines.length > 0 ? lines.join("\n") : "(no textual change)"
}
