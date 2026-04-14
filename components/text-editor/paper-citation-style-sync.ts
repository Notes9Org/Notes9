/**
 * Keeps TipTap paper toolbar citation style and Writing AI sidebar in sync via localStorage + window events.
 */

import { CITATION_STYLE_OPTIONS } from "@/components/text-editor/citation-utils"
import { ALL_CITATION_STYLES, getCitationStyle } from "@/lib/citation-styles"

export const PAPER_CITATION_STYLE_STORAGE_KEY = "notes9-paper-citation-style-tiptap"
const LEGACY_PAPER_AI_STYLE_KEY = "paper-ai-citation-style"

/** TipTap `CitationState.style` values (e.g. APA, Vancouver). */
export function isValidTiptapCitationStyle(value: string): boolean {
  return CITATION_STYLE_OPTIONS.some((o) => o.value === value)
}

/** Legacy slug keys from the old AI-only picker → TipTap values. */
const LEGACY_SLUG_TO_TIPTAP: Record<string, string> = {
  vancouver: "Vancouver",
  apa: "APA",
  nature: "Nature",
  ieee: "IEEE",
  harvard: "Harvard",
  "chicago-notes": "Chicago (Notes & Bib)",
}

export const PAPER_CITATION_STYLE_EVENT = "notes9-paper-citation-style"

export function readPaperCitationStyle(): string | null {
  if (typeof window === "undefined") return null
  try {
    const unified = localStorage.getItem(PAPER_CITATION_STYLE_STORAGE_KEY)
    if (unified && isValidTiptapCitationStyle(unified)) return unified

    const legacy = localStorage.getItem(LEGACY_PAPER_AI_STYLE_KEY)
    if (legacy && LEGACY_SLUG_TO_TIPTAP[legacy]) {
      const mapped = LEGACY_SLUG_TO_TIPTAP[legacy]
      localStorage.setItem(PAPER_CITATION_STYLE_STORAGE_KEY, mapped)
      return mapped
    }
  } catch {
    /* ignore */
  }
  return null
}

export function writePaperCitationStyle(
  style: string,
  options?: { silent?: boolean }
): void {
  if (typeof window === "undefined" || !isValidTiptapCitationStyle(style)) return
  try {
    localStorage.setItem(PAPER_CITATION_STYLE_STORAGE_KEY, style)
    if (!options?.silent) {
      window.dispatchEvent(
        new CustomEvent<string>(PAPER_CITATION_STYLE_EVENT, { detail: style })
      )
    }
  } catch {
    /* ignore */
  }
}

/** Map TipTap toolbar values to `lib/citation-styles` ids when we have rich prompts. */
const TIPTAP_TO_STYLE_SLUG: Partial<Record<string, string>> = {
  APA: "apa",
  "APA (6th Ed.)": "apa",
  Vancouver: "vancouver",
  Nature: "nature",
  IEEE: "ieee",
  Harvard: "harvard",
  "Chicago (Notes & Bib)": "chicago-notes",
  "Chicago (Author-Date)": "apa",
}

/**
 * Prompt text for `/api/ai/paper-chat` — prefers curated prompts from citation-styles when mappable.
 */
export function getPaperAiCitationPrompt(tiptapStyle: string): string {
  const slug = TIPTAP_TO_STYLE_SLUG[tiptapStyle]
  if (slug) {
    const s = getCitationStyle(slug)
    if (s) return s.promptInstructions
  }
  const opt = CITATION_STYLE_OPTIONS.find((o) => o.value === tiptapStyle)
  const label = opt?.longLabel ?? tiptapStyle
  const fallback = ALL_CITATION_STYLES[0]
  return `${fallback.promptInstructions.split("\n")[0]}

Use ${label} conventions for inline citations and the reference list: match the formatting expectations of that style (author–date, numbered, notes, etc.).`
}
