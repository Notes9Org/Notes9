import { z } from "zod"

import { stripNoteHtmlToPlain } from "@/lib/marketing/preview-note-content"

export const previewAiIntents = [
  "summarize_note",
  "suggest_next_experiment",
  "list_risks",
  "what_to_log_next",
] as const

export type PreviewAiIntent = (typeof previewAiIntents)[number]

const labels: Record<PreviewAiIntent, string> = {
  summarize_note: "Summarize my note",
  suggest_next_experiment: "Suggest a next experiment",
  list_risks: "List risks or blockers",
  what_to_log_next: "What should I log next visit?",
}

export function intentLabel(i: PreviewAiIntent): string {
  return labels[i]
}

function excerpt(s: string, max = 220): string {
  const t = stripNoteHtmlToPlain(s)
  if (!t) return "(No note text yet—add a few words in the note above.)"
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

/** Deterministic, client-only preview responses (no network). */
export function getPreviewAiReply(intent: PreviewAiIntent, noteBody: string): string {
  const ex = excerpt(noteBody, 400)
  switch (intent) {
    case "summarize_note":
      return `Preview summary (from your text):\n\n• Focus: ${ex}\n\nIn the full product, the assistant can use your full workspace context—not just this note.`
    case "suggest_next_experiment":
      return `Preview suggestion: consider a follow-up that varies one factor from your logged conditions, with a clear success criterion. Your note mentions: ${ex}\n\nIn the full app, suggestions can be grounded in project protocols and past runs.`
    case "list_risks": {
      const base =
        "• Confounding variables not held constant\n• Sample handling windows\n• Instrument calibration drift"
      if (!stripNoteHtmlToPlain(noteBody)) {
        return `Example risks in this preview (add note text for a tailored stub):\n${base}\n\nFull Notes9 links risks to samples, equipment, and protocols.`
      }
      return `From your text, watch for: replication of conditions, and traceability of reagents. Also consider:\n${base}\n\n(Full app ties this to your data.)`
    }
    case "what_to_log_next":
      return `Next-visit log (preview): date/time, operator, deviations from SOP, raw measurements, and any sample IDs touched. You wrote: ${ex}\n\nIn production, this rolls into your ELN and audit trail.`
    default:
      return "Preview only—sign in for the full assistant."
  }
}

export const previewAiRequestSchema = z.object({
  intent: z.enum([
    "summarize_note",
    "suggest_next_experiment",
    "list_risks",
    "what_to_log_next",
  ]),
  noteExcerpt: z.string().max(8000),
})

export type PreviewAiRequest = z.infer<typeof previewAiRequestSchema>
