"use client"

/**
 * Legal-safe, stylized representations of the everyday tools researchers juggle.
 * These are deliberately GENERIC category glyphs (a spreadsheet, a doc, a PDF, a
 * sticky note, an AI chat) — not the trademarked logos of Excel / Word / Notion /
 * Zotero / ChatGPT. They read instantly as "your scattered stack" without
 * implying any endorsement or infringing a third party's mark. Swap for real
 * SVG logos only with permission.
 */

import { FileSpreadsheet, FileText, MessageSquareText, StickyNote, FileType2 } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

export type AppKind = "spreadsheet" | "doc" | "pdf" | "note" | "chat"

const APP_META: Record<AppKind, { color: string; name: string; Icon: typeof FileText }> = {
  spreadsheet: { color: "#15803d", name: "plate_map.xlsx", Icon: FileSpreadsheet },
  doc: { color: "#2563eb", name: "protocol.docx", Icon: FileText },
  pdf: { color: "#dc2626", name: "paper.pdf", Icon: FileType2 },
  note: { color: "#d97706", name: "notes", Icon: StickyNote },
  chat: { color: "#7c3aed", name: "ai-chat", Icon: MessageSquareText },
}

export function AppGlyph({
  kind,
  withLabel = false,
  className,
}: {
  kind: AppKind
  withLabel?: boolean
  className?: string
}) {
  const m = APP_META[kind]
  const Icon = m.Icon
  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 bg-card shadow-[0_8px_24px_-12px_rgba(20,18,16,0.25)]"
        style={{ color: m.color }}
      >
        <Icon className="h-5 w-5" />
      </div>
      {withLabel ? (
        <span className="text-xs font-medium text-muted-foreground/80">{m.name}</span>
      ) : null}
    </div>
  )
}

/** A loose, slightly-rotated cluster of glyphs — "today: scattered". */
export function ScatteredStack({ className }: { className?: string }) {
  const items: { kind: AppKind; rot: number }[] = [
    { kind: "pdf", rot: -7 },
    { kind: "spreadsheet", rot: 5 },
    { kind: "note", rot: -3 },
    { kind: "doc", rot: 6 },
    { kind: "chat", rot: -5 },
  ]
  return (
    <div className={cn("flex flex-wrap items-end gap-3", className)}>
      {items.map((it, i) => (
        <motion.div
          key={it.kind}
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ delay: i * 0.06 }}
          style={{ rotate: it.rot }}
          whileHover={{ rotate: 0, y: -3 }}
        >
          <AppGlyph kind={it.kind} withLabel />
        </motion.div>
      ))}
    </div>
  )
}
