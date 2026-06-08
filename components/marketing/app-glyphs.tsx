"use client"

/**
 * Legal-safe, stylized representations of the everyday tools researchers juggle.
 * These are deliberately GENERIC category glyphs — not the trademarked logos of
 * Excel / Word / Notion / Zotero / ChatGPT / etc. They read instantly as "your
 * scattered stack" without implying any endorsement or infringing a mark.
 */

import {
  Calendar,
  Code2,
  FileSpreadsheet,
  FileText,
  FileType2,
  FolderOpen,
  Image as ImageIcon,
  Mail,
  MessageSquareText,
  Presentation,
  StickyNote,
} from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

export type AppKind =
  | "spreadsheet"
  | "doc"
  | "pdf"
  | "note"
  | "chat"
  | "slides"
  | "image"
  | "email"
  | "calendar"
  | "drive"
  | "code"

const APP_META: Record<AppKind, { color: string; name: string; Icon: typeof FileText }> = {
  spreadsheet: { color: "#15803d", name: "plate_map.xlsx", Icon: FileSpreadsheet },
  doc: { color: "#2563eb", name: "protocol.docx", Icon: FileText },
  pdf: { color: "#dc2626", name: "paper.pdf", Icon: FileType2 },
  note: { color: "#d97706", name: "notes", Icon: StickyNote },
  chat: { color: "#7c3aed", name: "ai-chat", Icon: MessageSquareText },
  slides: { color: "#ea580c", name: "slides.pptx", Icon: Presentation },
  image: { color: "#0d9488", name: "figure.png", Icon: ImageIcon },
  email: { color: "#0284c7", name: "inbox", Icon: Mail },
  calendar: { color: "#e11d48", name: "calendar", Icon: Calendar },
  drive: { color: "#ca8a04", name: "drive", Icon: FolderOpen },
  code: { color: "#475569", name: "analysis.py", Icon: Code2 },
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
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-card shadow-[0_10px_26px_-12px_rgba(20,18,16,0.3)]"
        style={{ color: m.color }}
      >
        <Icon className="h-6 w-6" />
      </div>
      {withLabel ? (
        <span className="text-[14px] font-medium text-muted-foreground/80">{m.name}</span>
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
    { kind: "slides", rot: 4 },
    { kind: "email", rot: -6 },
    { kind: "image", rot: 3 },
    { kind: "calendar", rot: -4 },
    { kind: "drive", rot: 6 },
    { kind: "code", rot: -3 },
  ]
  return (
    <div className={cn("flex flex-wrap items-end gap-3.5", className)}>
      {items.map((it, i) => (
        <motion.div
          key={it.kind}
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ delay: i * 0.05 }}
          style={{ rotate: it.rot }}
          whileHover={{ rotate: 0, y: -3 }}
        >
          <AppGlyph kind={it.kind} withLabel />
        </motion.div>
      ))}
    </div>
  )
}
